import { createServer } from 'node:http';
import { handleRequest } from './core/http.mjs';

const port = Number(process.env.PORT || 7821);
const host = process.env.HOST || '0.0.0.0';

const server = createServer(async (req, res) => {
  const origin = `http://${req.headers.host || `${host}:${port}`}`;
  const request = new Request(new URL(req.url || '/', origin), {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
    duplex: 'half'
  });

  const response = await handleRequest(request, { fetch: globalThis.fetch, signal: request.signal });
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const body = response.body ? Buffer.from(await response.arrayBuffer()) : Buffer.alloc(0);
  res.end(body);
});

server.listen(port, host, () => {
  const local = host === '0.0.0.0' ? '127.0.0.1' : host;
  console.log(`ddys-stremio listening on http://${local}:${port}`);
  console.log(`manifest: http://${local}:${port}/manifest.json`);
  console.log(`configure: http://${local}:${port}/configure`);
});
