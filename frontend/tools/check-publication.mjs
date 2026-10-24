import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { demoBackup } from './demo-data.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const expected = demoBackup();
const fixture = JSON.parse(await readFile(resolve(root, 'frontend/public/seed.json'), 'utf8'));
assert.deepEqual(fixture, expected, 'La semilla pública debe ser exactamente la demo ficticia.');
if (process.argv.includes('--build')) {
  const built = JSON.parse(
    await readFile(resolve(root, 'frontend/dist/routale/browser/seed.json'), 'utf8'),
  );
  assert.deepEqual(built, expected, 'La compilación contiene una semilla distinta de la demo.');
}

// An allowlist prevents accidental publication of local planning folders or exports.
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
assert(files.length > 0, 'Revisar archivos preparados para Git antes de publicar.');
const rootFiles = new Set([
  '.dockerignore',
  '.editorconfig',
  '.gitignore',
  '.gitattributes',
  'AGENTS.md',
  'README.md',
  'Dockerfile',
  'global.json',
  'dotnet-tools.json',
]);
const publicFiles = new Set([
  'frontend/public/brand.png',
  'frontend/public/routale-icon.svg',
  'frontend/public/routale-icon-192.png',
  'frontend/public/routale-icon-512.png',
  'frontend/public/favicon.ico',
  'frontend/public/manifest.webmanifest',
  'frontend/public/route-cover.png',
]);
const allowed = (path) =>
  rootFiles.has(path) ||
  publicFiles.has(path) ||
  /^frontend\/(?:src|tools|tests)\//.test(path) ||
  /^frontend\/(\.editorconfig|\.gitignore|\.prettierignore|\.prettierrc|\.vscode\/(extensions|launch|tasks)\.json)$/.test(
    path,
  ) ||
  /^frontend\/(AGENTS\.md|README\.md|[\w.-]+\.(json|ts|mjs))$/.test(path) ||
  /^docs\/public\/[\w-]+\.md$/.test(path) ||
  /^backend\/(AGENTS\.md|README\.md|\.editorconfig|Bitacora\.slnx|package\.json|tests\/api\.test\.mjs)$/.test(
    path,
  ) ||
  /^backend\/tests\/Bitacora\.Api\.Tests\/(?:(?:Domain|Persistence)\/)?[\w.-]+\.(?:cs|csproj|json)$/.test(
    path,
  ) ||
  /^backend\/src\/Bitacora\.Api\/(?:(?:Domain|Storage|Features\/(?:Authentication|Trips)(?:\/Dtos)?|Persistence(?:\/(?:Entities|Migrations))?)\/)?[\w.-]+\.(?:cs|csproj)$/.test(
    path,
  ) ||
  path === 'backend/src/Bitacora.Api/packages.lock.json' ||
  /^deploy\/(compose(\.local)?\.ya?ml|nginx\.conf|update\.sh|\.env\.example)$/.test(path) ||
  /^\.github\/workflows\/(ci|deploy)\.yml$/.test(path);
for (const path of files) {
  assert(allowed(path), `Archivo fuera del alcance público: ${path}`);
  assert(
    !(path !== 'deploy/compose.local.yaml' && /\.local\./.test(path)) &&
      !/\.env$|backup|test-results|node_modules|\.angular|seed\.json/.test(path),
    `Archivo privado o generado: ${path}`,
  );
  if (/\.(png|ico)$/.test(path)) continue;
  const text = await readFile(resolve(root, path), 'utf8');
  assert(
    !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]{30,}/.test(
      text,
    ),
    `Posible credencial: ${path}`,
  );
  assert(
    !/20(?:[0-2]\d|[4-9]\d)-\d{2}-\d{2}|[A-Z]:[\\/]+Users[\\/]+[^\\/\s]+/i.test(text),
    `Referencia personal en ${path}`,
  );
}
if (process.argv.includes('--build')) {
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await inspect(path);
      else if (/\.(js|json|html|css|webmanifest)$/.test(path)) {
        const text = await readFile(path, 'utf8');
        assert(
          !/20(?:[0-2]\d|[4-9]\d)-\d{2}-\d{2}|[A-Z]:[\\/]+Users[\\/]+[^\\/\s]+/i.test(text),
          'Se encontró información personal en la compilación.',
        );
      }
    }
  }
  await inspect(resolve(root, 'frontend/dist/routale/browser'));
}
console.log(
  `Revisión de publicación: ${files.length} archivos permitidos y demo ficticia verificada.`,
);
