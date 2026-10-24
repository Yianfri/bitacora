import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoBackup } from './demo-data.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'http://localhost:8088';
const restart = process.argv.slice(2);
if (restart.some((argument) => argument !== '--restart') || restart.length > 1) {
  console.error('Uso: node frontend/tools/check-stack.mjs [--restart]');
  process.exit(2);
}

let stage = 'inicio';
class CheckFailure extends Error {}

function ensure(condition, message) {
  if (!condition) throw new CheckFailure(message);
}

class LocalClient {
  cookies = new Map();
  csrfToken = '';

  async request(path, { method = 'GET', body, headers = {} } = {}) {
    const url = new URL(path, origin);
    ensure(url.origin === origin, 'La solicitud salió del origen local permitido.');
    const requestHeaders = new Headers(headers);
    if (this.cookies.size) {
      requestHeaders.set(
        'Cookie',
        [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
      );
    }
    if (body !== undefined) {
      requestHeaders.set('Content-Type', 'application/json');
    }
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      redirect: 'manual',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const separator = pair.indexOf('=');
      if (separator < 0) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    return response;
  }

  async refreshCsrf() {
    const response = await this.request('/api/auth/csrf');
    ensure(response.status === 200, 'La API no entregó el token CSRF.');
    const result = await response.json();
    ensure(typeof result.token === 'string' && result.token.length > 0, 'Token CSRF inválido.');
    this.csrfToken = result.token;
  }

  async login(username, password) {
    await this.refreshCsrf();
    const response = await this.request('/api/auth/login', {
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': this.csrfToken },
      body: { username, password },
    });
    ensure(
      response.status === 200,
      `El inicio de sesión local fue rechazado (${response.status}).`,
    );
    const user = await response.json();
    ensure(user.username === username.toUpperCase(), 'La API autenticó una cuenta distinta.');
    await this.refreshCsrf();
    return user.username;
  }

  accountHeaders(username) {
    return { 'X-Routale-Account': username };
  }

  async putTrip(id, backup, condition, username) {
    return this.request(`/api/trips/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        ...this.accountHeaders(username),
        'X-CSRF-TOKEN': this.csrfToken,
        ...(condition.kind === 'create'
          ? { 'If-None-Match': '*' }
          : { 'If-Match': condition.etag }),
      },
      body: backup,
    });
  }
}

function copyWithUniqueId(id) {
  const backup = structuredClone(demoBackup());
  backup.data.trip.id = id;
  const replaceTripIds = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) replaceTripIds(item);
    } else if (value && typeof value === 'object') {
      if (Object.hasOwn(value, 'tripId')) value.tripId = id;
      for (const item of Object.values(value)) replaceTripIds(item);
    }
  };
  replaceTripIds(backup.data);
  backup.stackSmokeExtension = {
    kind: 'local-container-check',
    fictional: true,
    nullable: null,
    text: 'extensión de ejemplo · ñ',
  };
  backup.data.trip.stackSmokeExtension = { retained: true, value: 'demo' };
  return backup;
}

async function readExactBackup(client, id, expected, expectedEtag, username) {
  const response = await client.request(`/api/trips/${encodeURIComponent(id)}`, {
    headers: client.accountHeaders(username),
  });
  ensure(response.status === 200, 'La copia de humo no se pudo leer.');
  ensure(response.headers.get('etag') === expectedEtag, 'La revisión leída no coincide.');
  const raw = await response.text();
  ensure(raw === JSON.stringify(expected), 'El contenido de la copia o sus extensiones cambió.');
  const parsed = JSON.parse(raw);
  ensure(
    parsed.stackSmokeExtension?.text === 'extensión de ejemplo · ñ' &&
      parsed.data?.trip?.stackSmokeExtension?.retained === true,
    'No se conservaron las extensiones de la demo.',
  );
}

function restartApi() {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      'docker',
      ['compose', '-f', 'deploy/compose.local.yaml', 'restart', 'api'],
      { cwd: root, stdio: 'ignore', windowsHide: true },
    );
    child.once('error', rejectPromise);
    child.once('exit', (code) =>
      code === 0 ? resolvePromise() : rejectPromise(new Error('restart failed')),
    );
  });
}

async function waitForApi() {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(new URL('/api/health', origin), {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status === 200) return;
    } catch {
      // El contenedor puede tardar en volver a estar listo después del reinicio.
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error('La API no recuperó salud a través del proxy local.');
}

async function main() {
  const credentialsPath = resolve(root, '.data/docker-local/access.json');
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
  ensure(
    typeof credentials.username === 'string' &&
      credentials.username.length > 0 &&
      typeof credentials.password === 'string' &&
      credentials.password.length > 0,
    'El archivo privado de acceso local no tiene el formato esperado.',
  );

  const client = new LocalClient();
  stage = 'salud inicial';
  const health = await client.request('/api/health');
  ensure(health.status === 200, 'La API del contenedor no está saludable.');
  const healthBody = await health.json();
  ensure(healthBody.status === 'ok', 'La API informó una salud inesperada.');

  stage = 'autenticación y CSRF';
  credentials.username = await client.login(credentials.username, credentials.password);
  const sessionCookie = client.cookies.get('.Bitacora.Session');
  ensure(
    typeof sessionCookie === 'string' && sessionCookie.length > 0,
    'Falta la cookie de sesión.',
  );
  const me = await client.request('/api/auth/me');
  ensure(me.status === 200, 'La sesión local no quedó activa.');
  ensure((await me.json()).username === credentials.username, 'La sesión pertenece a otra cuenta.');

  stage = 'alta de copia ficticia';
  const listBefore = await client.request('/api/trips', {
    headers: client.accountHeaders(credentials.username),
  });
  ensure(listBefore.status === 200, 'No se pudo consultar la lista privada de copias.');
  const priorCopies = await listBefore.json();
  ensure(Array.isArray(priorCopies), 'La API devolvió una lista de copias inválida.');
  const id = `docker-smoke-${randomBytes(16).toString('hex')}`;
  ensure(!priorCopies.some((item) => item?.id === id), 'El ID de prueba ya existe.');

  const firstBackup = copyWithUniqueId(id);
  const create = await client.putTrip(id, firstBackup, { kind: 'create' }, credentials.username);
  ensure(create.status === 201, 'No se pudo crear la copia ficticia con condición de alta.');
  const etagOne = create.headers.get('etag');
  ensure(etagOne === '"1"', 'La copia no inició en revisión 1.');
  await readExactBackup(client, id, firstBackup, etagOne, credentials.username);

  stage = 'actualización y conflicto ETag';
  const secondBackup = structuredClone(firstBackup);
  secondBackup.stackSmokeExtension.revision = 'second';
  const update = await client.putTrip(
    id,
    secondBackup,
    { kind: 'match', etag: etagOne },
    credentials.username,
  );
  ensure(update.status === 200, 'No se pudo actualizar la copia con su ETag vigente.');
  const etagTwo = update.headers.get('etag');
  ensure(etagTwo === '"2"', 'La actualización no avanzó a revisión 2.');
  const staleBackup = structuredClone(secondBackup);
  staleBackup.stackSmokeExtension.revision = 'stale';
  const stale = await client.putTrip(
    id,
    staleBackup,
    { kind: 'match', etag: etagOne },
    credentials.username,
  );
  ensure(stale.status === 412, 'La API no rechazó el ETag obsoleto.');
  await readExactBackup(client, id, secondBackup, etagTwo, credentials.username);

  if (restart.length === 1) {
    stage = 'reinicio del contenedor API';
    await restartApi();
    await waitForApi();

    stage = 'persistencia de sesión, SQLite y claves';
    const sameSession = await client.request('/api/auth/me');
    ensure(sameSession.status === 200, 'La sesión no sobrevivió al reinicio de API.');
    ensure(
      (await sameSession.json()).username === credentials.username,
      'La sesión cambió de cuenta después del reinicio.',
    );
    ensure(
      client.cookies.get('.Bitacora.Session') === sessionCookie,
      'La cookie de sesión cambió después del reinicio.',
    );
    await readExactBackup(client, id, secondBackup, etagTwo, credentials.username);

    const thirdBackup = structuredClone(secondBackup);
    thirdBackup.stackSmokeExtension.revision = 'after-restart';
    const afterRestart = await client.putTrip(
      id,
      thirdBackup,
      { kind: 'match', etag: etagTwo },
      credentials.username,
    );
    ensure(afterRestart.status === 200, 'La sesión no pudo guardar tras reiniciar la API.');
    const etagThree = afterRestart.headers.get('etag');
    ensure(etagThree === '"3"', 'La revisión no avanzó después del reinicio.');
    await readExactBackup(client, id, thirdBackup, etagThree, credentials.username);
  }

  console.log(
    restart.length === 1
      ? 'Smoke local aprobado: API, sesión, CSRF, SQLite y claves persistieron tras restart; 1 copia ficticia creada.'
      : 'Smoke HTTP local aprobado: API, sesión, CSRF, SQLite y ETags; 1 copia ficticia creada.',
  );
}

main().catch((error) => {
  console.error(`Smoke local falló durante: ${stage}. Se omitieron credenciales y respuestas.`);
  if (error instanceof CheckFailure) console.error(error.message);
  process.exitCode = 1;
});
