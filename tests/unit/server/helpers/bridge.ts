// A minimal Postgres wire bridge for tests: a TCP server on 127.0.0.1 that forwards protocol
// messages to an in-memory PGlite. The production driver (postgres.js, src/server/db/postgres.ts)
// can then run against the same schema and data as the local driver, with no database server.
// It answers an SSL request with "N" (no TLS), which postgres.js never sends to 127.0.0.1.
import net from 'node:net';
import type { PGlite } from '@electric-sql/pglite';

export function startBridge(db: PGlite): Promise<{ port: number; close: () => void }> {
  let queue: Promise<unknown> = Promise.resolve();
  const server = net.createServer((socket) => {
    let buf = Buffer.alloc(0);
    let started = false;
    socket.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (!started) {
          if (buf.length < 8) return;
          const len = buf.readInt32BE(0);
          if (buf.length < len) return;
          const code = buf.readInt32BE(4);
          const msg = buf.subarray(0, len);
          buf = buf.subarray(len);
          if (code === 80877103) {
            socket.write('N');
            continue;
          }
          started = true;
          const m = new Uint8Array(msg);
          queue = queue.then(async () => {
            const out = await db.execProtocolRaw(m);
            socket.write(Buffer.from(out));
          });
          continue;
        }
        if (buf.length < 5) return;
        const len = buf.readInt32BE(1);
        if (buf.length < len + 1) return;
        const msg = buf.subarray(0, len + 1);
        buf = buf.subarray(len + 1);
        if (msg[0] === 0x58) {
          socket.end();
          return;
        }
        const m = new Uint8Array(msg);
        queue = queue.then(async () => {
          const out = await db.execProtocolRaw(m);
          if (out.length) socket.write(Buffer.from(out));
        });
      }
    });
    socket.on('error', () => undefined);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ port, close: () => server.close() });
    });
  });
}
