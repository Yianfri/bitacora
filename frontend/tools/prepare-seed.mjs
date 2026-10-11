import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { demoBackup } from './demo-data.mjs';

const output = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'seed.json'), JSON.stringify(demoBackup(), null, 2) + '\n');
console.log('Demo ficticia generada. La compilación no lee fuentes ni archivos personales.');
