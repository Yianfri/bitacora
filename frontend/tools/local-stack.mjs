import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPreviewServer } from './serve.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dll = resolve(root, 'backend/src/Bitacora.Api/bin/Debug/net10.0/Bitacora.Api.dll');

// Local test installation only: no external bind address or production credentials.
export async function startLocalStack({
  directory = resolve(root, '.data/local-stack'),
  port = 4200,
  apiPort = 5080,
  build = true,
} = {}) {
  if (build) {
    await command(['restore', 'backend/Bitacora.slnx', '--locked-mode']);
    await command(['build', 'backend/Bitacora.slnx', '--no-restore']);
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const marker = resolve(directory, 'local-stack.marker');
  try {
    if ((await readFile(marker, 'utf8')) !== 'routale-local-v1')
      throw new Error('Marca de instalación inválida.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if ((await readdir(directory)).length !== 0)
      throw new Error('El directorio contiene archivos ajenos a esta instalación local.', {
        cause: error,
      });
    await writeFile(marker, 'routale-local-v1', { flag: 'wx', mode: 0o600 });
  }
  const env = {
    ...process.env,
    ASPNETCORE_ENVIRONMENT: 'Development',
    DOTNET_ENVIRONMENT: 'Development',
    ReverseProxy__KnownProxies: '',
    ASPNETCORE_URLS: `http://127.0.0.1:${apiPort}`,
    Storage__Directory: directory,
  };
  await command([dll, 'migrate'], env);
  const accessFile = resolve(directory, 'access.json');
  let credentials;
  try {
    credentials = JSON.parse(await readFile(accessFile, 'utf8'));
    if (typeof credentials.username !== 'string' || typeof credentials.password !== 'string')
      throw new Error('Archivo de acceso local inválido.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    credentials = { username: 'routale.local', password: randomBytes(32).toString('base64url') };
    await command(
      [dll, 'create-user'],
      env,
      `${credentials.username}\n${credentials.password}\n${credentials.password}\n`,
    );
    await writeFile(accessFile, JSON.stringify(credentials, null, 2), { flag: 'wx', mode: 0o600 });
  }
  let apiProcess;
  let web;
  async function startApi() {
    apiProcess = spawn('dotnet', [dll], { cwd: root, env, stdio: 'ignore', windowsHide: true });
    apiProcess.on('error', () => {});
    for (let attempt = 0; attempt < 100; attempt++) {
      if (apiProcess.exitCode !== null)
        throw new Error('La API local terminó antes de estar lista.');
      try {
        if (
          (await fetch(`http://127.0.0.1:${apiPort}/health`, { signal: AbortSignal.timeout(500) }))
            .ok
        )
          return;
      } catch {
        /* Readiness check, no request data is logged. */
      }
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error('La API local no respondió a la comprobación de salud.');
  }
  async function stopApi() {
    if (!apiProcess || apiProcess.exitCode !== null || apiProcess.signalCode !== null) return;
    const stopping = apiProcess;
    stopping.kill();
    for (let attempt = 0; attempt < 30; attempt++) {
      if (stopping.exitCode !== null || stopping.signalCode !== null) {
        apiProcess = undefined;
        return;
      }
      try {
        await fetch(`http://127.0.0.1:${apiPort}/health`, { signal: AbortSignal.timeout(200) });
      } catch {
        stopping.unref();
        apiProcess = undefined;
        return;
      }
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error('No se pudo confirmar la detención de la API de prueba.');
  }
  try {
    await startApi();
    web = createPreviewServer({
      root: resolve(root, 'frontend/dist/routale/browser'),
      apiOrigin: `http://127.0.0.1:${apiPort}`,
    });
    await new Promise((done, reject) => {
      web.once('error', reject);
      web.listen(port, '127.0.0.1', done);
    });
  } catch (error) {
    await stopApi();
    throw error;
  }
  return {
    url: `http://localhost:${port}`,
    directory,
    credentials,
    accessFile,
    async createUser() {
      const next = {
        username: 'test.' + randomBytes(8).toString('hex'),
        password: randomBytes(32).toString('base64url'),
      };
      await command(
        [dll, 'create-user'],
        env,
        `${next.username}\n${next.password}\n${next.password}\n`,
      );
      return next;
    },
    stopApi,
    async restartApi() {
      await stopApi();
      await startApi();
    },
    async stop() {
      web.closeAllConnections();
      await new Promise((done) => web.close(done));
      await stopApi();
    },
  };
}

function command(args, env = process.env, input) {
  return new Promise((done, reject) => {
    const child = spawn('dotnet', args, {
      cwd: root,
      env,
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? done()
        : reject(
            new Error('No se pudo preparar la API local. Revisa restauración y compilación .NET.'),
          ),
    );
    child.stdin.end(input);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stack = await startLocalStack();
  console.log(`Routale local: ${stack.url}`);
  console.log('SQLite y claves están en el directorio privado .data/local-stack.');
  console.log(
    'Acceso de prueba en .data/local-stack/access.json; no lo publiques ni lo reutilices fuera de loopback.',
  );
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      void stack.stop().then(() => process.exit(0));
    });
}
