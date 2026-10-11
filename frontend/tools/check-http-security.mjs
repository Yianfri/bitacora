import assert from 'node:assert/strict';

// Run against the built Nginx image, never the development preview server.
const base = process.argv[2];
assert(base, 'Indicar URL de la imagen Nginx bajo prueba.');
for (const path of [
  '/',
  '/index.html',
  '/ruta-de-ejemplo',
  '/ngsw.json',
  '/ngsw-worker.js',
  '/health',
]) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get('x-frame-options'), 'DENY', path);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', path);
  assert.equal(response.headers.get('content-security-policy'), "frame-ancestors 'none'", path);
  if (path !== '/health') assert.equal(response.headers.get('cache-control'), 'no-cache', path);
  await response.arrayBuffer();
}
const denied = await fetch(new URL('/index.html', base), { method: 'POST' });
assert.equal(denied.status, 405);
assert.equal(denied.headers.get('x-frame-options'), 'DENY');
assert.equal(denied.headers.get('x-content-type-options'), 'nosniff');
assert.equal(denied.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
assert.equal(denied.headers.get('content-security-policy'), "frame-ancestors 'none'");
await denied.arrayBuffer();
console.log('Cabeceras verificadas en HTML, navegación, PWA, salud y errores Nginx.');
