import { createServer, request } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const proxyHeaders = new Set([
  'accept',
  'content-type',
  'content-length',
  'cookie',
  'origin',
  'x-csrf-token',
  'x-routale-account',
  'if-match',
  'if-none-match',
]);

export function createPreviewServer({ root = resolve('dist/routale/browser'), apiOrigin } = {}) {
  let api;
  if (apiOrigin) {
    api = new URL(apiOrigin);
    if (
      api.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(api.hostname) ||
      api.username ||
      api.password ||
      api.pathname !== '/' ||
      api.search ||
      api.hash
    ) {
      throw new Error(
        'El proxy local requiere una API HTTP en loopback, sin rutas ni credenciales.',
      );
    }
  }
  return createServer(async (req, res) => {
    try {
      const incoming = new URL(req.url, 'http://localhost');
      const path = decodeURIComponent(incoming.pathname);
      if (path === '/api' || path.startsWith('/api/')) {
        if (!api) {
          problem(res, 503, 'El servidor de copias no está conectado en este entorno.');
          return;
        }
        // Auth and revision headers only; forwarding headers from clients are discarded.
        const headers = Object.fromEntries(
          Object.entries(req.headers).filter(([name]) => proxyHeaders.has(name)),
        );
        const target = new URL(api.href);
        target.pathname = incoming.pathname;
        target.search = incoming.search;
        const upstream = request(target, { method: req.method, headers }, (response) => {
          res.writeHead(response.statusCode ?? 502, {
            ...response.headers,
            'cache-control': 'no-store',
          });
          response.on('error', () => res.destroy());
          response.pipe(res);
        });
        upstream.setTimeout(30000, () => upstream.destroy());
        upstream.on('error', () => {
          if (!res.headersSent) problem(res, 502, 'No se pudo contactar al servidor de copias.');
          else res.destroy();
        });
        req.on('aborted', () => upstream.destroy());
        req.pipe(upstream);
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method ?? '')) {
        res.writeHead(405);
        res.end();
        return;
      }
      const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
      if (!file.startsWith(root + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      if (!res.headersSent) res.writeHead(404);
      res.end('No encontrado');
    }
  });
}

function problem(res, status, title) {
  res.writeHead(status, {
    'content-type': 'application/problem+json',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify({ status, title }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4200);
  createPreviewServer({ apiOrigin: process.env.ROUTALE_API_ORIGIN }).listen(port, '127.0.0.1', () =>
    console.log('Routale: http://localhost:' + port),
  );
}
