import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { demoBackup } from './demo-data.mjs';

const output = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
await mkdir(output, { recursive: true });
const allowed = new Set(['seed.json', 'brand.png', 'favicon.ico', 'manifest.webmanifest']);
if ((await readdir(output)).some((file) => !allowed.has(file))) {
  throw new Error(
    'Hay archivos no previstos en public/. Retíralos del contenido servido antes de compilar.',
  );
}
await writeFile(resolve(output, 'seed.json'), JSON.stringify(demoBackup(), null, 2) + '\n');
console.log('Demo ficticia generada. La compilación no lee fuentes ni archivos personales.');
