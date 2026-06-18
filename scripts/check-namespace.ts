/**
 * Check Socket.IO namespaces - default and realtime.
 */
import { io } from 'socket.io-client';

const SESSION = 'dd372e2b-0965-4c8f-8c9a-0d889514051d';

// Try different namespaces
const namespaces = ['/', '/realtime', '/space', ''];

for (const ns of namespaces) {
  console.error(`\n=== Trying namespace: "${ns}" ===`);
  const socket = io('https://notes.nglab.es' + ns, {
    auth: { token: SESSION, tokenType: 'session' },
    transports: ['polling'],
    reconnection: false,
    timeout: 5000,
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.disconnect();
        reject(new Error('timeout'));
      }, 5000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        console.error(`  Connected! id=${socket.id}`);
        socket.disconnect();
        resolve();
      });
      socket.on('connect_error', (err: Error) => {
        clearTimeout(timeout);
        console.error(`  Error: ${err.message}`);
        socket.disconnect();
        reject(err);
      });
    });
  } catch(e: any) {
    console.error(`  Failed: ${e.message}`);
  }
}

console.error('\nDone');
