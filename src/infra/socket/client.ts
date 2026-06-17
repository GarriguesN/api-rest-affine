/**
 * AFFiNE Socket.IO client infrastructure.
 *
 * Manages Socket.IO connections to the AFFiNE server with session-token auth.
 * Supports two protocols:
 * - RealtimeGateway: live query subscriptions (realtime:request, realtime:subscribe)
 * - SpaceSyncGateway: Yjs doc sync (space:join, space:load-doc, space:push-doc-update)
 *
 * Auth: Session token (affine_session) passed via Socket.IO handshake auth.
 * On self-hosted instances, use the session token directly — the /native/exchange
 * endpoint is cloud-only. Auth header format: Authorization: Bearer <sessionToken>
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

// ---------------------------------------------------------------------------
// Socket event interfaces (server → client)
// ---------------------------------------------------------------------------

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

export interface SocketOptions {
  /**
   * Session token for Socket.IO handshake auth.
   * On self-hosted: use the affine_session cookie value.
   * The session token is returned by /auth/login as `sessionCookie`.
   * Authorization header format for sync routes: Bearer <sessionToken>
   */
  sessionToken: string;
  /** CSRF token for extraHeaders (optional but recommended) */
  csrfToken?: string;
  /** Auto-connect on creation (default: true) */
  autoConnect?: boolean;
  /** Transport: prefer polling for self-hosted (default: ['polling']) */
  transports?: ('polling' | 'websocket')[];
  /** Reconnection attempts (default: 5) */
  reconnectionAttempts?: number;
  /** Reconnection delay base in ms (default: 1000) */
  reconnectionDelay?: number;
}

// ---------------------------------------------------------------------------
// Socket factory
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS: Required<Omit<SocketOptions, 'sessionToken' | 'csrfToken'>> = {
  autoConnect: true,
  transports: ['polling'], // self-hosted may not support websocket well
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
};

/**
 * Create a new AFFiNE Socket.IO socket instance with session-token auth.
 * Each call creates a fresh socket — caller manages lifecycle (connect/disconnect).
 */
export function createAffineSocket(options: SocketOptions): AffineSocket {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const socketUrl = `${env.AFFINE_BASE_URL}`;

  const socket = io(socketUrl, {
    // Auth: session token with tokenType 'session' (self-hosted compatible)
    auth: {
      token: options.sessionToken,
      tokenType: 'session',
    },
    // Transport: polling preferred for self-hosted; websocket optional
    transports: opts.transports,
    // Reconnection
    autoConnect: opts.autoConnect,
    reconnection: true,
    reconnectionAttempts: opts.reconnectionAttempts,
    reconnectionDelay: opts.reconnectionDelay,
    reconnectionDelayMax: 30_000,
    // Version header + CSRF token when provided
    extraHeaders: {
      'x-affine-client-version': CLIENT_VERSION,
      ...(options.csrfToken && { 'x-affine-csrf-token': options.csrfToken }),
    },
  } as Parameters<typeof io>[1]) as AffineSocket;

  return socket;
}

// ---------------------------------------------------------------------------
// AffineSocketClient — convenience wrapper with connect/disconnect lifecycle
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper that manages connect/disconnect lifecycle for a socket.
 * Use this for one-off requests or when you want automatic lifecycle management.
 */
export class AffineSocketClient extends EventEmitter {
  private socket: AffineSocket | null = null;
  private readonly options: SocketOptions;

  constructor(options: SocketOptions) {
    super();
    this.options = options;
  }

  /**
   * Connect the socket. Idempotent — no-op if already connected.
   */
  async connect(): Promise<void> {
    if (this.socket?.connected) return;

    this.socket = createAffineSocket(this.options);
    this.setupSocket(this.socket);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Socket.IO connection timeout after 30s'));
      }, 30_000);

      this.socket!.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket!.once('connect_error', (err: Error) => {
        clearTimeout(timeout);
        reject(new Error(`Socket.IO connection failed: ${err.message}`));
      });

      // Trigger connection if autoConnect is false
      if (!this.options.autoConnect) {
        this.socket!.connect();
      }
    });
  }

  /**
   * Disconnect the socket.
   */
  disconnect(): void {
    if (!this.socket) return;
    this.socket.disconnect();
    this.socket = null;
  }

  /**
   * Whether the socket is currently connected.
   */
  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // -------------------------------------------------------------------------
  // Internal setup
  // -------------------------------------------------------------------------

  private setupSocket(socket: AffineSocket): void {
    socket.on('realtime:event', (event: RealtimeEvent) => {
      this.emit('realtime:event', event);
    });

    socket.on('space:broadcast-doc-update', (msg) => {
      this.emit('space:broadcast-doc-update', msg);
    });

    socket.on('space:broadcast-doc-updates', (msg) => {
      this.emit('space:broadcast-doc-updates', msg);
    });

    socket.on('disconnect', (reason: string) => {
      this.emit('disconnect', reason);
    });

    socket.on('connect_error', (err: Error) => {
      this.emit('connect_error', err);
    });
  }

  // -------------------------------------------------------------------------
  // Generic emit-with-ack
  // -------------------------------------------------------------------------

  private emitWithAck<T>(event: string, data: unknown, timeoutMs = 15_000): Promise<T> {
    if (!this.socket?.connected) {
      return Promise.reject(new Error('Socket.IO not connected'));
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Socket.IO ack timeout for event: ${event}`));
      }, timeoutMs);

      (this.socket! as unknown as { emit: (event: string, data: unknown, ack: (res: unknown) => void) => void })
        .emit(event, data, (response: unknown) => {
        clearTimeout(timeout);
        const ack = response as RealtimeAck<T>;
        if ('error' in ack) {
          const err = ack.error as RealtimeError;
          reject(new Error(`[${err.name}] ${err.message}`));
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
   * Subscribe to a realtime topic. Returns the subscription ID.
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

  /** Join a workspace or userspace room. */
  async spaceJoin(
    spaceType: 'workspace' | 'userspace',
    spaceId: string,
  ): Promise<string> {
    const result = await this.emitWithAck<{ clientId: string; success: boolean }>(
      'space:join',
      { spaceType, spaceId, clientVersion: CLIENT_VERSION },
    );
    return result.clientId;
  }

  /** Leave a workspace or userspace room. */
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
   * Returns binary data as Uint8Array.
   */
  async spaceLoadDoc(
    spaceType: 'workspace' | 'userspace',
    spaceId: string,
    docId: string,
    stateVector?: string,
  ): Promise<{ missing: Uint8Array; state: Uint8Array; timestamp: number }> {
    const result = await this.emitWithAck<{
      missing: string;
      state: string;
      timestamp: number;
    }>('space:load-doc', { spaceType, spaceId, docId, stateVector });

    return {
      missing: base64ToUint8Array(result.missing),
      state: base64ToUint8Array(result.state),
      timestamp: result.timestamp,
    };
  }

  /** Load timestamps for all docs in a space. */
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
   * Returns server-side timestamp.
   */
  async spacePushDocUpdate(
    spaceType: 'workspace' | 'userspace',
    spaceId: string,
    docId: string,
    update: Uint8Array,
  ): Promise<number> {
    const result = await this.emitWithAck<{
      accepted: true;
      timestamp?: number;
    }>('space:push-doc-update', {
      spaceType,
      spaceId,
      docId,
      update: uint8ArrayToBase64(update),
    });
    return result.timestamp ?? Date.now();
  }

  /** Delete a doc from the space. */
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
// Convenience: one-shot request helpers
// ---------------------------------------------------------------------------

export interface OneShotOptions {
  sessionToken: string;
  csrfToken?: string;
  timeoutMs?: number;
}

/**
 * Execute a one-shot realtime request — connect, request, disconnect.
 * Use for simple RPC calls where you don't need a persistent connection.
 */
export async function realtimeRequest<Op extends RealtimeRequestName>(
  op: Op,
  input: RealtimeRequestInputOf<Op>,
  options: OneShotOptions,
): Promise<RealtimeRequestOutputOf<Op>> {
  const client = new AffineSocketClient({
    sessionToken: options.sessionToken,
    ...(options.csrfToken ? { csrfToken: options.csrfToken } : {}),
  });
  await client.connect();
  try {
    return await client.realtimeRequest(op, input);
  } finally {
    client.disconnect();
  }
}
