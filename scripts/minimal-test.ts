/**
 * Minimal test - just try ONE realtime op with verbose logging.
 */
import { AffineSocketClient } from '../src/infra/socket/client.js';

const SESSION = 'dd372e2b-0965-4c8f-8c9a-0d889514051d';

const client = new AffineSocketClient({ sessionToken: SESSION });

client.on('connect', () => console.error('CONNECTED'));
client.on('connect_error', (e: Error) => console.error('CONNECT ERROR:', e.message));
client.on('disconnect', (r: string) => console.error('DISCONNECTED:', r));

await client.connect();
console.error('connect() returned');

// Try the simplest op
try {
  console.error('Trying user.profile.get...');
  const result = await client.realtimeRequest('user.profile.get', {});
  console.log('user.profile.get:', JSON.stringify(result));
} catch(e: any) {
  console.error('user.profile.get error:', e.message);
}

client.disconnect();
console.error('Done');
