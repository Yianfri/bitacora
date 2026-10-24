import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = resolve(root, '.data/docker-local');
const file = resolve(directory, 'access.json');
let exists = true;
try {
  await access(file);
} catch {
  exists = false;
}
if (exists) {
  console.log('El acceso de prueba ya existe en .data/docker-local/access.json.');
} else {
  const credentials = {
    username: 'routale.local',
    password: randomBytes(32).toString('base64url'),
  };
  await new Promise((done, reject) => {
    const child = spawn(
      'docker',
      [
        'compose',
        '-f',
        'deploy/compose.local.yaml',
        'exec',
        '-T',
        'api',
        'dotnet',
        'Bitacora.Api.dll',
        'create-user',
      ],
      {
        cwd: root,
        stdio: ['pipe', 'ignore', 'ignore'],
        windowsHide: true,
      },
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? done()
        : reject(
            new Error(
              'No se pudo crear el acceso local. Comprueba el stack; no se modificó ningún archivo de acceso.',
            ),
          ),
    );
    child.stdin.end(`${credentials.username}\n${credentials.password}\n${credentials.password}\n`);
  });
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify(credentials, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(
    'Acceso de prueba guardado en .data/docker-local/access.json. No lo publiques ni lo reutilices en producción.',
  );
}
