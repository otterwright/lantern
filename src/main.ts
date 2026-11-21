import { createAdaptorServer } from '@hono/node-server';
import server from './server';

// Node's HTTP server has no idle timeout on an open response, so long-lived SSE
// scan-progress streams survive quiet stretches between L2 batches; the stream's
// 10s heartbeat (routes/runs.ts) keeps intermediaries from closing it either.
const listen = (host: string) => createAdaptorServer(server).listen(server.port, host);

// Node binds 'localhost' to a single address family, so both loopbacks are bound
// explicitly: ::1 is missing on IPv6-less machines, hence its errors are ignored.
listen('127.0.0.1').once('listening', () => console.log(`lantern running at http://localhost:${server.port}`));
listen('::1').on('error', () => {});
