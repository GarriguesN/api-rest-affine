/**
 * AFFiNE Socket.IO client infrastructure.
 *
 * Manages the Socket.IO connection to the AFFiNE server.
 * Supports two protocols:
 * - RealtimeGateway: live query subscriptions (realtime:request, realtime:subscribe)
 * - SpaceSyncGateway: Yjs doc sync (space:join, space:load-doc, space:push-doc-update)
 *
 * Auth is handled via handshake auth — the session token is passed
 * as part of the Socket.IO connection handshake.
 */

import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'node:events';
import { env } from '../../config/env.js';
import {
  type RealtimeRequestEnvelope,
  type RealtimeSubscribeEnvelope,
  type RealtimeTopicName,
  type RealtimeTopicEvent,
  type SpaceSyncRequestMap,
  type SpaceSyncInputOf,
  type SpaceSyncOutputOf,
  type RealtimeRequestName,
  type RealtimeRequestOutputOf,
  type RealtimeRequestInputOf,
  type RealtimeAck,
  type RealtimeError,
  type RealtimeEvent,
} from '../../types/realtime.js';

const CLIENT_VERSION = '0.26.0';

interface ServerToClientEvents {
  'realtime:event': (event: RealtimeEvent) => void;
  'space:broadcast-doc-update': (msg: {
    spaceType: string;
    spaceId: string;
    docId: string;
    update: string;
    timestamp: number;
    editor: string;
  }) => void;
  'space:broadcast-doc-updates': (msg: {
    spaceType: string;
    spaceId: string;
    docId: string;
    updates: string[];
    timestamp: number;
    editor?: string;
    compressed?: boolean;
  }) => void;
  'space:collect-awareness': (msg: {
    spaceType: string;
    spaceId: string;
    docId: string;
  }) => void;
  'space:broadcast-awareness-update': (msg: {
    spaceType: string;
    spaceId: string;
    docId: string;
    awarenessUpdate: string;
  }) => void;
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (err: Error) => void;
}

interface ClientToServerEvents {
  'realtime:request': (
    envelope: RealtimeRequestEnvelope,
    ack: (res: RealtimeAck<unknown>) => void,
  ) => void;
  'realtime:subscribe': (
    envelope: RealtimeSubscribeEnvelope,
    ack: (res: { data: { subscriptionId: string } }) => void,
  ) => void;
  'realtime:unsubscribe': (
    envelope: { subscriptionId?: string },
    ack: (res: { data: { ok: boolean } }) => void,
  ) => void;
  'space:join': (
    msg: { spaceType: string; spaceId: string; clientVersion: string },
    ack: (res: { data: { clientId: string; success: boolean } }) => void,
  ) => void;
  'space:leave': (
    msg: { spaceType: string; spaceId: string },
    ack: (res: { data: { clientId: string; success: true } }) => void,
  ) => void;
  'space:load-doc': (
    msg: { spaceType: string; spaceId: string; docId: string; stateVector?: string },
    ack: (res: { data: { missing: string; state: string; timestamp: number } }) => void,
  ) => void;
  'space:load-doc-timestamps': (
    msg: { spaceType: string; spaceId: string; timestamp?: number },
    ack: (res: { data: Record<string, number> }) => void,
  ) => void;
  'space:push-doc-update': (
    msg: { spaceType: string; spaceId: string; docId: string; update: string },
    ack: (res: { data: { accepted: true; timestamp?: number } }) => void,
  ) => void;
  'space:delete-doc': (
    msg: { spaceType: string; spaceId: string; docId: string },
    ack: (res: { data: { success: true } }) => void,
  ) => void;
}

export type AffineSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type SocketIORequest<Input, Output> = {
  input: Input;
  output: Output;
};

/**
 * AFFiNE Socket.IO client.
 *
 * Manages a single Socket.IO connection with:
 * - Automatic reconnection
 * - Auth via session token (from Affine auth cookies)
 * - Typed request/ack wrappers for all operations
 * - Event emitter for subscriptions
 */
export class AffineSocketClient extends EventEmitter {
  private socket: AffineSocket | null = null;
  private sessionToken: string | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseDelayMs = 1000;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private subscriptionCounter = 0;

  constructor(
    private readonly sessionTokenProvider: () => string | null,
  ) {
    super();
  }

  /**
   * Connect to the AFFiNE Socket.IO server.
   * Returns a promise that resolves when connected.
   */
  async connect(): Promise<void> {
    if (this.socket?.connected) return;

    this.sessionToken = this.sessionTokenProvider();
    if (!this.sessionToken) {
      throw new Error('No session token available for Socket.IO connection');
    }

    const socketUrl = `${env.AFFINE_BASE_URL}/socket.io/`;

    this.socket = io(socketUrl, {
      transports: ['polling', 'websocket'], // self-hosted may not support websocket
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.baseDelayMs,
      reconnectionDelayMax: 30_000,
      // Auth is passed via handshake — see below
      auth: {},
      // Pass client version
      query: {
        clientVersion: CLIENT_VERSION,
      },
      extraHeaders: {
        'x-affine-client-version': CLIENT_VERSION,
      },
    }) as AffineSocket;

    // Set up auth callback (called during handshake)
    // The socket.io-client uses auth as either an object or a callback
    // We pass the token via the auth callback
    this.setupSocket(this.socket);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Socket.IO connection timeout after 30s'));
      }, 30_000);

      this.socket!.once('connect', () => {
        clearTimeout(timeout);
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket!.once('connect_error', (err: Error) => {
        clearTimeout(timeout);
        reject(new Error(`Socket.IO connection failed: ${err.message}`));
      });
    });
  }

  /**
   * Disconnect from the Socket.IO server.
   */
  disconnect(): void {
    if (!this.socket) return;
    this.socket.disconnect();
    this.socket = null;
    this.pendingRequests.forEach(req => {
      clearTimeout(req.timeout);
      req.reject(new Error('Socket.IO disconnected'));
    });
    this.pendingRequests.clear();
  }

  /**
   * Check if connected.
   */
  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // -------------------------------------------------------------------------
  // Auth / session management
  // -------------------------------------------------------------------------

  private setupSocket(socket: AffineSocket): void {
    // Auth: pass session token in handshake
    // @ts-expect-error — socket.io-client allows overriding auth via the auth setter
    socket.auth = {
      token: this.sessionToken,
    };

    // Listen for realtime events
    socket.on('realtime:event', (event: RealtimeEvent) => {
      this.emit('realtime:event', event);
    });

    // Listen for doc sync events
    socket.on('space:broadcast-doc-update', (msg) => {
      this.emit('space:broadcast-doc-update', msg);
    });

    socket.on('space:broadcast-doc-updates', (msg) => {
      this.emit('space:broadcast-doc-updates', msg);
    });

    // Handle disconnect with reconnect logic
    socket.on('disconnect', (reason: string) => {
      this.emit('disconnect', reason);
      if (reason !== 'io client disconnect') {
        this.handleDisconnect();
      }
    });

    socket.on('connect_error', (err: Error) => {
      this.emit('connect_error', err);
      this.reconnectAttempts++;
    });
  }

  private handleDisconnect(): void {
    // Refresh session token on reconnect
    this.sessionToken = this.sessionTokenProvider();
    if (this.socket && this.sessionToken) {
      // @ts-expect-error
      this.socket.auth = { token: this.sessionToken };
    }
  }

  // -------------------------------------------------------------------------
  // Generic emit-with-ack
  // -------------------------------------------------------------------------

  /**
   * Emit a message and wait for acknowledgment.
   */
  private emitWithAck<T>(event: string, data: unknown): Promise<T> {
    if (!this.socket?.connected) {
      return Promise.reject(new Error('Socket.IO not connected'));
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(event);
        reject(new Error(`Socket.IO ack timeout for event: ${event}`));
      }, 15_000);

      this.socket!.emit(event as never, data, (response: unknown) => {
        clearTimeout(timeout);
        const ack = response as RealtimeAck<T>;
        if ('error' in ack) {
          const err = ack.error as RealtimeError;
          reject(new Error(`Socket.IO error [${err.name}]: ${err.message}`));
        } else {
          resolve((ack as { data: T }).data);
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // Realtime Gateway — request / response
  // -------------------------------------------------------------------------

  /**
   * Execute a realtime request (one-shot RPC).
   */
  async realtimeRequest<Op extends RealtimeRequestName>(
    op: Op,
    input: RealtimeRequestInputOf<Op>,
  ): Promise<RealtimeRequestOutputOf<Op>> {
    const envelope: RealtimeRequestEnvelope<Op> = {
      op,
      input,
      clientVersion: CLIENT_VERSION,
    };

    return this.emitWithAck<RealtimeRequestOutputOf<Op>>(
      'realtime:request',
      envelope,
    );
  }

  // -------------------------------------------------------------------------
  // Realtime Gateway — subscriptions
  // -------------------------------------------------------------------------

  /**
   * Subscribe to a realtime topic.
   * Returns the subscription ID.
   */
  async realtimeSubscribe<Topic extends RealtimeTopicName>(
    topic: Topic,
    input: Parameters<typeof this['realtimeRequest']>[1],
  ): Promise<string> {
    const envelope: RealtimeSubscribeEnvelope<Topic> = {
      topic,
      input: input as never,
      clientVersion: CLIENT_VERSION,
    };

    const result = await this.emitWithAck<{ subscriptionId: string }>(
      'realtime:subscribe',
      envelope,
    );
    return result.subscriptionId;
  }

  /**
   * Unsubscribe from a realtime topic.
   */
  async realtimeUnsubscribe(subscriptionId: string): Promise<void> {
    await this.emitWithAck<{ ok: boolean }>('realtime:unsubscribe', {
      subscriptionId,
    });
  }

  // -------------------------------------------------------------------------
  // Space Sync Gateway
  // -------------------------------------------------------------------------

  /**
   * Join a workspace or userspace room.
   */
  async spaceJoin(
    spaceType: 'workspace' | 'userspace',
    spaceId: string,
  ): Promise<void> {
    await this.emitWithAck<{ clientId: string; success: boolean }>('space:join', {
      spaceType,
      spaceId,
      clientVersion: CLIENT_VERSION,
    });
  }

  /**
   * Leave a workspace or userspace room.
   */
  async spaceLeave(
    spaceType: 'workspace' | 'userspace',
    spaceId: string,
  ): Promise<void> {
    await this.emitWithAck<{ clientId: string; success: true }>('space:leave', {
      spaceType,
      spaceId,
    });
  }

  /**
   * Load a doc (full snapshot or diff from state vector).
   * Returns base64-encoded Yjs binary.
   */
  async spaceLoadDoc(
    spaceType: 'workspace' | 'userspace',
    spaceId: string,
    docId: string,
    stateVector?: string,
  ): Promise<{ missing: Uint8Array; state: Uint8Array; timestamp: number }> {
    const result = await this.emitWithAck<{ missing: string; state: string; timestamp: number }>(
      'space:load-doc',
      { spaceType, spaceId, docId, stateVector },
    );

    return {
      missing: base64ToUint8Array(result.missing),
      state: base64ToUint8Array(result.state),
      timestamp: result.timestamp,
    };
  }

  /**
   * Load timestamps for all docs in a space.
   */
  async spaceLoadDocTimestamps(
    spaceType: 'workspace' | 'userspace',
    spaceId: string,
    afterTimestamp?: number,
  ): Promise<Record<string, number>> {
    return this.emitWithAck<Record<string, number>>('space:load-doc-timestamps', {
      spaceType,
      spaceId,
      timestamp: afterTimestamp,
    });
  }

  /**
   * Push a Yjs update to a doc (create or update).
   */
  async spacePushDocUpdate(
    spaceType: 'workspace' | 'userspace',
    spaceId: string,
    docId: string,
    update: Uint8Array,
  ): Promise<number> {
    const result = await this.emitWithAck<{ accepted: true; timestamp?: number }>(
      'space:push-doc-update',
      {
        spaceType,
        spaceId,
        docId,
        update: uint8ArrayToBase64(update),
      },
    );
    return result.timestamp ?? Date.now();
  }

  /**
   * Delete a doc.
   */
  async spaceDeleteDoc(
    spaceType: 'workspace' | 'userspace',
    spaceId: string,
    docId: string,
  ): Promise<void> {
    await this.emitWithAck<{ success: true }>('space:delete-doc', {
      spaceType,
      spaceId,
      docId,
    });
  }
}

// ---------------------------------------------------------------------------
// Utility: base64 <-> Uint8Array
// ---------------------------------------------------------------------------

function uint8ArrayToBase64(array: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(array).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]!);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Singleton socket manager
// ---------------------------------------------------------------------------

let socketInstance: AffineSocketClient | null = null;

/**
 * Get or create the singleton Socket.IO client.
 * The session token is automatically fetched from the current cookies.
 */
export function getAffineSocket(
  sessionTokenProvider: () => string | null,
): AffineSocketClient {
  if (!socketInstance) {
    socketInstance = new AffineSocketClient(sessionTokenProvider);
  }
  return socketInstance;
}

/**
 * Close the singleton socket and reset.
 */
export function closeAffineSocket(): void {
  socketInstance?.disconnect();
  socketInstance = null;
}
