import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { createPreviewServer } from './serve.mjs';

async function listen(server) {
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}

test('local proxy keeps its fixed target and strips forwarding headers', async () => {
  let received;
  const upstream = createServer((req, res) => {
    received = { url: req.url, headers: req.headers };
    res.setHeader('content-type', 'application/json');
    res.end('{"ok":true}');
  });
  const apiOrigin = await listen(upstream);
  const proxy = createPreviewServer({ apiOrigin });
  const proxyOrigin = await listen(proxy);
  try {
    const status = await new Promise((done, reject) => {
      const req = request(
        proxyOrigin,
        {
          path: 'http://outside.invalid/api/trips?check=1',
          headers: {
            'X-Forwarded-For': '203.0.113.9',
            'X-Forwarded-Proto': 'https',
            'X-Routale-Account': 'test.user',
            'If-Match': '"1"',
          },
        },
        (res) => {
          res.resume();
          res.once('end', () => done(res.statusCode));
        },
      );
      req.once('error', reject);
      req.end();
    });
    assert.equal(status, 200);
    assert.equal(received.url, '/api/trips?check=1');
    assert.equal(received.headers['x-forwarded-for'], undefined);
    assert.equal(received.headers['x-forwarded-proto'], undefined);
    assert.equal(received.headers['x-routale-account'], 'test.user');
    assert.equal(received.headers['if-match'], '"1"');
  } finally {
    await close(proxy);
    await close(upstream);
  }
});

test('preview without an API gives a non-cacheable unavailable response', async () => {
  const proxy = createPreviewServer();
  const origin = await listen(proxy);
  try {
    const response = await fetch(origin + '/api/auth/me');
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    await close(proxy);
  }
});

test('local proxy rejects remote targets and embedded credentials', () => {
  for (const apiOrigin of [
    'https://127.0.0.1',
    'http://outside.invalid',
    'http://user:secret@127.0.0.1',
    'http://127.0.0.1/api',
  ]) {
    assert.throws(() => createPreviewServer({ apiOrigin }));
  }
});
