import { describe, expect, it, vi } from 'vitest';
import { RemoteApiError, RemoteCopiesClient, RemoteNetworkError } from './remote-copies-client';

function jsonResponse(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', ...Object.fromEntries(new Headers(headers)) },
  });
}

describe('RemoteCopiesClient', () => {
  it('mantiene el límite de tiempo mientras lee el cuerpo, no sólo hasta recibir cabeceras', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"username":'));
          init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')), {
            once: true,
          });
        },
      });
      return Promise.resolve(
        new Response(body, { headers: { 'Content-Type': 'application/json' } }),
      );
    });
    await expect(new RemoteCopiesClient(fetcher, 20).currentUser()).rejects.toBeInstanceOf(
      RemoteNetworkError,
    );
  });
  it('obtiene CSRF antes de login y lo renueva con la identidad; usa fetch sin caché', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ token: 'anonymous-csrf' }))
      .mockResolvedValueOnce(jsonResponse({ username: 'traveler.one' }))
      .mockResolvedValueOnce(jsonResponse({ token: 'account-csrf' }))
      .mockResolvedValueOnce(
        jsonResponse(
          { id: 'demo-trip', name: 'Demo', revision: 2, updatedAt: '2030-01-02T00:00:00Z' },
          200,
          { ETag: '"2"' },
        ),
      );
    const client = new RemoteCopiesClient(fetcher);

    await expect(client.login('traveler.one', 'example-password')).resolves.toEqual({
      username: 'traveler.one',
    });
    const saved = await client.putTrip(
      'demo-trip',
      '{"data":{}}',
      { kind: 'match', etag: '"1"' },
      'traveler.one',
    );

    expect(saved.etag).toBe('"2"');
    expect(fetcher).toHaveBeenCalledTimes(4);
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.credentials).toBe('include');
      expect(init?.cache).toBe('no-store');
      expect(init?.redirect).toBe('error');
    }
    const loginHeaders = new Headers(fetcher.mock.calls[1][1]?.headers);
    expect(loginHeaders.get('X-CSRF-TOKEN')).toBe('anonymous-csrf');
    const putHeaders = new Headers(fetcher.mock.calls[3][1]?.headers);
    expect(putHeaders.get('X-CSRF-TOKEN')).toBe('account-csrf');
    expect(putHeaders.get('If-Match')).toBe('"1"');
    expect(putHeaders.get('X-Routale-Account')).toBe('traveler.one');
    expect(fetcher.mock.calls[3][0]).toBe('/api/trips/demo-trip');
  });

  it('envía la cuenta esperada en cada lectura/listado y valida la respuesta externa', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 'demo-trip', name: 'Demo', revision: 3, updatedAt: '2030-01-03T00:00:00Z' },
        ]),
      )
      .mockResolvedValueOnce(
        new Response('{"format":"cuaderno-austral-backup"}', {
          status: 200,
          headers: { 'Content-Type': 'application/json', ETag: '"3"' },
        }),
      );
    const client = new RemoteCopiesClient(fetcher);

    const list = await client.listTrips('traveler.one');
    const trip = await client.readTrip('demo-trip', 'traveler.one');
    expect(list[0].revision).toBe(3);
    expect(trip.etag).toBe('"3"');
    for (const [, init] of fetcher.mock.calls) {
      expect(new Headers(init?.headers).get('X-Routale-Account')).toBe('traveler.one');
      expect(init?.cache).toBe('no-store');
    }

    const invalid = new RemoteCopiesClient(
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ trips: [] })),
    );
    await expect(invalid.listTrips('traveler.one')).rejects.toThrow(/formato válido/);
  });

  it('valida el código de mismatch de cuenta y no convierte un 412 en reintento', async () => {
    const mismatch = new RemoteCopiesClient(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ code: 'workspace_account_mismatch' }, 409)),
    );
    await expect(mismatch.listTrips('cuenta-a')).rejects.toMatchObject({
      status: 409,
      code: 'workspace_account_mismatch',
    } satisfies Partial<RemoteApiError>);

    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf' }))
      .mockResolvedValueOnce(jsonResponse({ title: 'stale' }, 412));
    const client = new RemoteCopiesClient(fetcher);
    await expect(
      client.putTrip('demo-trip', '{"data":{}}', { kind: 'create' }, 'traveler.one'),
    ).rejects.toMatchObject({ status: 412 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('mide el límite en bytes UTF-8 y representa fallos de red sin reintentos', async () => {
    const oversized = new RemoteCopiesClient(vi.fn<typeof fetch>());
    const multibyteBody = 'ñ'.repeat(2_621_441);
    await expect(
      oversized.putTrip('demo-trip', multibyteBody, { kind: 'create' }, 'traveler.one'),
    ).rejects.toThrow(/5 MiB/);

    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
    const offline = new RemoteCopiesClient(fetcher);
    await expect(offline.listTrips('traveler.one')).rejects.toBeInstanceOf(RemoteNetworkError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
