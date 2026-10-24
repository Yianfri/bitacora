import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { Backup } from '../domain/model';
import { validateBackup } from '../domain/validation';
import { CuadernoService } from './cuaderno.service';
import { RemoteCopiesService } from './remote-copies.service';
import { TripRepository } from './trip-repository';

interface CopyRecord {
  backup: Backup;
  revision: number;
  updatedAt: string;
}

interface RequestRecord {
  path: string;
  method: string;
  headers: Headers;
}

const rawSeed: unknown = JSON.parse(readFileSync('public/seed.json', 'utf8'));
const seed: Backup = await validateBackup(rawSeed);

function jsonResponse(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(value), { status, headers: responseHeaders });
}

describe('RemoteCopiesService', () => {
  it.each([500, 502, 503, 504])(
    'conserva el cuaderno y ofrece reconectar ante una respuesta %i',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response('<html>Unavailable</html>', { status })),
      );
      const unavailable = new RemoteCopiesService(cuaderno);
      await expect(unavailable.initialize()).rejects.toThrow();
      expect(unavailable.status()).toBe('unavailable');
      expect(unavailable.busy()).toBe(false);
      expect(cuaderno.data()?.trip.id).toBe(seed.data.trip.id);
    },
  );
  let cuaderno: CuadernoService;
  let localRepository: TripRepository;
  let service: RemoteCopiesService;
  let apiOrigin: string;
  let sessionUser: string | null;
  let remoteCopies: Map<string, CopyRecord>;
  let requests: RequestRecord[];
  let loseNextPutResponse: boolean;
  let failNextPutBeforeCommit: boolean;
  let serverUnavailable: boolean;
  let serverFetch: typeof fetch;

  beforeEach(async () => {
    apiOrigin = `https://routale-${crypto.randomUUID()}.example`;
    sessionUser = null;
    remoteCopies = new Map();
    requests = [];
    loseNextPutResponse = false;
    failNextPutBeforeCommit = false;
    serverUnavailable = false;
    cuaderno = new CuadernoService();
    localRepository = new TripRepository();
    const localBackup = structuredClone(seed);
    localBackup['customMetadata'] = { keep: ['root', 'extension'], enabled: true };
    await cuaderno.restore(localBackup);
    await cuaderno.load();

    serverFetch = async (input, init = {}) => {
      const path =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.pathname
            : new URL(input.url).pathname;
      const method = init.method ?? 'GET';
      const headers = new Headers(init.headers);
      requests.push({ path, method, headers });
      if (serverUnavailable) return new Response('<html>Bad Gateway</html>', { status: 502 });

      if (path === '/api/auth/csrf') {
        return jsonResponse({ token: sessionUser ? `csrf-${sessionUser}` : 'csrf-anonymous' });
      }
      if (path === '/api/auth/login' && method === 'POST') {
        if (headers.get('X-CSRF-TOKEN') !== 'csrf-anonymous') return jsonResponse({}, 403);
        if (typeof init.body !== 'string') return jsonResponse({}, 400);
        const body: unknown = JSON.parse(init.body);
        if (!body || typeof body !== 'object' || !('username' in body))
          return jsonResponse({}, 400);
        if (typeof body.username !== 'string' || body.username.length === 0)
          return jsonResponse({}, 401);
        sessionUser = body.username;
        return jsonResponse({ username: sessionUser });
      }
      if (path === '/api/auth/me') {
        return sessionUser ? jsonResponse({ username: sessionUser }) : jsonResponse({}, 401);
      }
      if (path === '/api/auth/logout' && method === 'POST') {
        if (headers.get('X-CSRF-TOKEN') !== `csrf-${sessionUser}`) return jsonResponse({}, 403);
        sessionUser = null;
        return new Response(null, { status: 204 });
      }
      if (path === '/api/trips' || path.startsWith('/api/trips/')) {
        if (!sessionUser) return jsonResponse({}, 401);
        if (headers.get('X-Routale-Account') !== sessionUser)
          return jsonResponse({ code: 'workspace_account_mismatch' }, 409);
        if (path === '/api/trips' && method === 'GET') {
          return jsonResponse(
            [...remoteCopies.entries()].map(([id, copy]) => ({
              id,
              name: copy.backup.data.trip.name,
              revision: copy.revision,
              updatedAt: copy.updatedAt,
            })),
          );
        }

        const tripId = decodeURIComponent(path.slice('/api/trips/'.length));
        const remote = remoteCopies.get(tripId);
        if (method === 'GET') {
          if (!remote) return jsonResponse({}, 404);
          return new Response(JSON.stringify(remote.backup), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ETag: `"${remote.revision}"` },
          });
        }
        if (method === 'PUT') {
          if (headers.get('X-CSRF-TOKEN') !== `csrf-${sessionUser}`) return jsonResponse({}, 403);
          const ifNoneMatch = headers.get('If-None-Match');
          const ifMatch = headers.get('If-Match');
          if ((ifNoneMatch === '*') === (ifMatch !== null)) return jsonResponse({}, 428);
          if (ifNoneMatch === '*' && remote) return jsonResponse({}, 412);
          if (ifMatch !== null && (!remote || ifMatch !== `"${remote.revision}"`))
            return jsonResponse({}, 412);
          if (typeof init.body !== 'string') return jsonResponse({}, 400);
          const body: unknown = JSON.parse(init.body);
          const backup = await validateBackup(body);
          if (backup.data.trip.id !== tripId) return jsonResponse({}, 400);
          if (failNextPutBeforeCommit) {
            failNextPutBeforeCommit = false;
            throw new TypeError('simulated connection loss before commit');
          }
          const revision = (remote?.revision ?? 0) + 1;
          const updatedAt = `2030-01-0${revision}T00:00:00.000Z`;
          remoteCopies.set(tripId, { backup, revision, updatedAt });
          if (loseNextPutResponse) {
            loseNextPutResponse = false;
            throw new TypeError('simulated response loss after commit');
          }
          return jsonResponse(
            { id: tripId, name: backup.data.trip.name, revision, updatedAt },
            remote ? 200 : 201,
            { ETag: `"${revision}"` },
          );
        }
      }
      return jsonResponse({}, 404);
    };

    vi.stubGlobal('location', { origin: apiOrigin });
    vi.stubGlobal('fetch', serverFetch);
    service = new RemoteCopiesService(cuaderno);
  });

  afterEach(async () => {
    await localRepository.close();
    vi.unstubAllGlobals();
  });

  it('reconecta sin subir cambios locales ni perder la vinculación tras una caída', async () => {
    await service.initialize();
    await service.login('traveler.one', 'example-password');
    await service.bindWorkspace(true);
    await service.saveCurrent();
    await service.previewRemote(seed.data.trip.id);
    expect(service.pending()).not.toBeNull();
    const writesBeforeOutage = requests.filter((request) => request.method === 'PUT').length;

    serverUnavailable = true;
    await expect(service.list()).rejects.toThrow();
    expect(service.status()).toBe('unavailable');
    await cuaderno.save({
      date: '2030-06-04',
      cyclingKm: null,
      text: 'Nota local mientras el servidor estaba apagado',
      stageIds: [],
    });
    expect(service.workspaceBinding()?.username).toBe('traveler.one');

    serverUnavailable = false;
    await service.initialize();
    expect(service.status()).toBe('ready');
    expect(service.error()).toBeNull();
    expect(service.pending()).toBeNull();
    expect(service.copies()[0].localStatus).toBe('local-changes');
    expect(requests.filter((request) => request.method === 'PUT')).toHaveLength(writesBeforeOutage);
    expect(remoteCopies.get(seed.data.trip.id)?.backup.data.diaryEntries).toHaveLength(0);
    expect(cuaderno.data()?.diaryEntries[0].text).toBe(
      'Nota local mientras el servidor estaba apagado',
    );

    await service.saveCurrent();
    expect(remoteCopies.get(seed.data.trip.id)?.backup.data.diaryEntries[0].text).toBe(
      'Nota local mientras el servidor estaba apagado',
    );
  });

  it('vincula explícitamente, guarda una vez y reconoce un commit con respuesta perdida', async () => {
    await service.initialize();
    expect(service.status()).toBe('signedOut');
    await service.login('traveler.one', 'example-password');
    expect(service.status()).toBe('unbound');
    await service.bindWorkspace(true);
    expect(service.workspaceBinding()?.username).toBe('traveler.one');

    const firstSave = await service.saveCurrent();
    expect(firstSave.status).toBe('saved');
    expect(firstSave.etag).toBe('"1"');
    expect((await service.list())[0].localStatus).toBe('current');

    await cuaderno.save({
      date: '2030-06-03',
      cyclingKm: null,
      text: 'Edición posterior al respaldo',
      stageIds: [],
    });
    await vi.waitFor(() => expect(service.copies()[0].localStatus).toBe('local-changes'));

    loseNextPutResponse = true;
    const putCountBefore = requests.filter((request) => request.method === 'PUT').length;
    const reconciled = await service.saveCurrent();
    const putCountAfter = requests.filter((request) => request.method === 'PUT').length;
    expect(reconciled.status).toBe('saved');
    expect(reconciled.etag).toBe('"2"');
    expect(putCountAfter - putCountBefore).toBe(1);
    expect((await service.list())[0].localStatus).toBe('current');
    expect(remoteCopies.get(seed.data.trip.id)?.backup['customMetadata']).toEqual({
      keep: ['root', 'extension'],
      enabled: true,
    });
  });

  it('rechaza reemplazar cambios locales posteriores a la vista previa y archiva al confirmar CAS', async () => {
    await service.initialize();
    await service.login('traveler.one', 'example-password');
    await service.bindWorkspace(true);
    await service.saveCurrent();
    await cuaderno.save({
      date: '2030-06-03',
      cyclingKm: null,
      text: 'Primera nota local',
      stageIds: [],
    });

    const preview = await service.previewRemote(seed.data.trip.id);
    expect(preview.localTokenCaptured).not.toBeNull();
    await cuaderno.save({
      date: '2030-06-03',
      cyclingKm: null,
      text: 'Nota escrita mientras se revisa',
      stageIds: [],
    });
    await expect(service.confirmRestore()).rejects.toThrow(/cambió mientras revisabas/);
    expect(cuaderno.data()?.diaryEntries).toHaveLength(2);

    const freshPreview = await service.previewRemote(seed.data.trip.id);
    await service.confirmRestore();
    expect(service.pending()).toBeNull();
    expect(cuaderno.data()?.diaryEntries).toHaveLength(0);
    const archives = await localRepository.listRestoreArchives(seed.data.trip.id);
    expect(archives.some((archive) => archive.backup.data.diaryEntries.length === 2)).toBe(true);
    expect((await cuaderno.snapshot(seed.data.trip.id))?.backup['customMetadata']).toEqual(
      freshPreview.backup['customMetadata'],
    );
  });

  it('bloquea lecturas cuando otra pestaña cambia la cuenta autenticada', async () => {
    await service.initialize();
    await service.login('traveler.one', 'example-password');
    await service.bindWorkspace(true);
    sessionUser = 'otra-cuenta';

    await expect(service.list()).rejects.toMatchObject({
      status: 409,
      code: 'workspace_account_mismatch',
    });
    expect(service.status()).toBe('blocked');
    expect(service.copies()).toEqual([]);
    const tripRequests = requests.filter((request) => request.path.startsWith('/api/trips'));
    expect(
      tripRequests.every((request) => request.headers.get('X-Routale-Account') === 'traveler.one'),
    ).toBe(true);
  });

  it('reintenta tras un 404 solo con condición de creación y conserva cambios locales posteriores', async () => {
    await service.initialize();
    await service.login('traveler.one', 'example-password');
    await service.bindWorkspace(true);

    failNextPutBeforeCommit = true;
    const firstAttempt = await service.saveCurrent();
    expect(firstAttempt.status).toBe('uncertain');
    expect(remoteCopies.has(seed.data.trip.id)).toBe(false);

    await cuaderno.save({
      date: '2030-06-04',
      cyclingKm: null,
      text: 'Cambio local posterior al fallo',
      stageIds: [],
    });
    const pendingList = await service.list();
    expect(pendingList).toContainEqual(
      expect.objectContaining({
        id: seed.data.trip.id,
        localStatus: 'uncertain',
      }),
    );

    const beforeRetry = requests.filter((request) => request.method === 'PUT').length;
    const retry = await service.saveCurrent(seed.data.trip.id);
    const writes = requests.filter((request) => request.method === 'PUT').slice(beforeRetry);
    expect(retry.status).toBe('saved');
    expect(writes).toHaveLength(1);
    expect(writes[0].headers.get('If-None-Match')).toBe('*');
    expect(writes[0].headers.has('If-Match')).toBe(false);
    expect(
      remoteCopies
        .get(seed.data.trip.id)
        ?.backup.data.diaryEntries.some(
          (entry) => entry.text === 'Cambio local posterior al fallo',
        ),
    ).toBe(true);
    expect((await service.list()).find((copy) => copy.id === seed.data.trip.id)?.localStatus).toBe(
      'current',
    );
  });
});
