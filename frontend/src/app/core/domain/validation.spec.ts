import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { Backup } from './model';
import { addNote } from './diary';
import { sha256, validateBackup, validateData } from './validation';
import { TripRepository } from '../storage/trip-repository';

const seedInput: unknown = JSON.parse(readFileSync('public/seed.json', 'utf8'));
const seed: Backup = await validateBackup(seedInput);
const source = (backup: Backup) => backup.data.sourceSnapshots[0].files[0];

describe('Recursos y procedencia de respaldos', () => {
  it('revisa una fuente una vez aunque miles de registros la compartan, también al guardar notas', async () => {
    const backup = structuredClone(seed);
    const file = source(backup);
    const original: unknown = JSON.parse(file.rawText);
    file.rawText = JSON.stringify({ schema_version: 1, padding: Array(20000).fill(0), original });
    file.sha256 = await sha256(file.rawText);
    const template = backup.data.stages[0];
    for (let i = 0; i < 1000; i++)
      backup.data.stages.push({ ...template, id: `repeated-ref-${i}` });
    const parse = vi.spyOn(JSON, 'parse');
    try {
      expect((await validateBackup(backup)).data).toEqual(backup.data);
      expect(parse.mock.calls.filter(([text]) => text === file.rawText)).toHaveLength(1);
      parse.mockClear();
      const saved = addNote(backup.data, {
        date: '2030-06-03',
        cyclingKm: null,
        text: 'Control legítimo',
        stageIds: [],
      });
      expect(saved.diaryEntries).toHaveLength(1);
      expect(parse.mock.calls.filter(([text]) => text === file.rawText)).toHaveLength(1);
    } finally {
      parse.mockRestore();
    }
  });

  it('conserva BOM, texto y campos desconocidos; reconoce IDs anidados, no texto ni números', async () => {
    const backup = structuredClone(seed);
    const ids = backup.data.stages
      .map((r) => r.sourceRef?.sourceId)
      .concat(backup.data.plannedDays.map((r) => r.sourceRef?.sourceId));
    const file = source(backup);
    file.rawText =
      '\uFEFF' +
      JSON.stringify({ schema_version: 1, future: { items: ids.map((id) => ({ id })) } }) +
      '  ';
    file.sha256 = await sha256(file.rawText);
    expect(source(await validateBackup(backup))).toEqual(file);
    for (const fake of [{ text: ids[0] }, { id: 123 }]) {
      file.rawText = JSON.stringify({ schema_version: 1, future: fake });
      expect(() => validateData(backup.data)).toThrow('ID de procedencia');
    }
  });

  it('aísla snapshots con la misma ruta y vuelve a revisar cambios de texto', async () => {
    const backup = structuredClone(seed);
    const other = structuredClone(backup.data.sourceSnapshots[0]);
    other.id = 'another-snapshot';
    backup.data.sourceSnapshots.push(other);
    backup.data.stages[0].sourceRef!.snapshotId = other.id;
    other.files[0].rawText = JSON.stringify({ schema_version: 1, id: 'only-other' });
    expect(() => validateData(backup.data)).toThrow('ID de procedencia');
    other.files[0].rawText = source(backup).rawText;
    other.files[0].sha256 = await sha256(other.files[0].rawText);
    await expect(validateBackup(backup)).resolves.toEqual(backup);
    other.files[0].rawText = JSON.stringify({ schema_version: 1, id: 'only-other' });
    expect(() => validateData(backup.data)).toThrow('ID de procedencia');
  });

  it.each(['depth', 'nodes', 'bytes'])(
    'rechaza fuentes con exceso de %s sin reemplazar datos',
    async (kind) => {
      const repository = new TripRepository('security-' + crypto.randomUUID());
      try {
        await repository.restore(seed);
        const backup = structuredClone(seed);
        const file = source(backup);
        const original: unknown = JSON.parse(file.rawText);
        let nested: unknown = { id: backup.data.stages[0].sourceRef?.sourceId };
        for (let i = 0; i < 70; i++) nested = { child: nested };
        file.rawText =
          kind === 'bytes'
            ? ' '.repeat(10 * 1024 * 1024 + 1)
            : JSON.stringify({
                schema_version: 1,
                original,
                value: kind === 'nodes' ? Array(1000001).fill(0) : nested,
              });
        file.sha256 = await sha256(file.rawText);
        await expect(repository.restore(backup)).rejects.toThrow(/límite|complejidad/);
        expect((await repository.all())[0]).toEqual(seed.data);
      } finally {
        await repository.close();
      }
    },
  );
});
