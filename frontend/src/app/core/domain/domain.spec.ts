import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { Backup, actualKm, dayKm, plannedDays } from './model';
import { addNote } from './diary';
import { validateBackup } from './validation';
import { TripRepository } from '../storage/trip-repository';

const seedInput: unknown = JSON.parse(readFileSync('public/seed.json', 'utf8'));
const seed: Backup = await validateBackup(seedInput);
const note = {
  date: '2030-06-03',
  cyclingKm: 43.2,
  text: 'Lluvia, café y camino. <b>texto literal</b>',
  stageIds: [seed.data.stages[2].id],
};
describe('Importación, diario y respaldo', () => {
  let repository: TripRepository;
  beforeEach(() => {
    repository = new TripRepository('test-' + crypto.randomUUID());
  });
  afterEach(async () => {
    await repository.close();
  });
  it('valida el ejemplo ficticio con procedencia y diario vacío', async () => {
    const checked = await validateBackup(seed);
    expect(checked.data.sourceSnapshots[0].files).toHaveLength(1);
    expect(plannedDays(checked.data)).toHaveLength(16);
    expect(checked.data.plannedDays.reduce((s, d) => s + (dayKm(d) ?? 0), 0)).toBe(520);
    expect(checked.data.plannedDays.filter((d) => (dayKm(d) ?? 0) > 0)).toHaveLength(13);
    expect(checked.data.diaryEntries).toHaveLength(0);
  });
  it('guarda varias notas y suma los kilómetros diarios una sola vez', async () => {
    await repository.importSeed(seed);
    await repository.saveNote(seed.data.trip.id, note);
    const data = await repository.saveNote(seed.data.trip.id, { ...note, text: 'Segunda nota' });
    expect(data.actualDays).toHaveLength(1);
    expect(data.diaryEntries).toHaveLength(2);
    expect(actualKm(data)).toBe(43.2);
    await repository.close();
    expect((await repository.all())[0].diaryEntries).toHaveLength(2);
  });
  it('reimportar no reemplaza diario ni la copia propia', async () => {
    await repository.importSeed(seed);
    await repository.saveNote(seed.data.trip.id, note);
    const data = await repository.importSeed(seed);
    expect(data.diaryEntries).toHaveLength(1);
    expect(actualKm(data)).toBe(43.2);
  });
  it('edita una nota manteniendo su identidad y el kilometraje compartido', () => {
    const first = addNote(seed.data, note);
    const updated = addNote(first, {
      ...note,
      entryId: first.diaryEntries[0].id,
      cyclingKm: 0,
      text: 'Edición',
    });
    expect(updated.diaryEntries).toHaveLength(1);
    expect(updated.diaryEntries[0].id).toBe(first.diaryEntries[0].id);
    expect(updated.actualDays[0].cyclingKm).toBe(0);
    expect(() =>
      addNote(first, { ...note, entryId: first.diaryEntries[0].id, date: '2030-06-04' }),
    ).toThrow();
  });
  it('conserva desconocido y una fecha real fuera del plan sin cambiar el calendario', () => {
    const data = addNote(seed.data, { ...note, date: '2030-07-01', cyclingKm: null });
    expect(data.actualDays[0].cyclingKm).toBeNull();
    expect(data.plannedDays).toEqual(seed.data.plannedDays);
  });
  it('restaura dos veces sin duplicar; conserva campos de futuras extensiones', async () => {
    const backup = structuredClone(seed);
    backup.data = addNote(backup.data, note);
    Object.assign(backup.data.trip, {
      extraContext: { accents: 'ñ, á, ruta de ejemplo', unknown: null },
    });
    await repository.restore(backup);
    await repository.restore(backup);
    expect((await repository.all())[0]).toEqual(backup.data);
  });
  it.each([
    'date',
    'duplicate',
    'foreign',
    'hash',
    'schema',
    'negative',
    'shape',
    'source-id',
    'map-url',
  ])('rechaza %s antes de cambiar los datos existentes', async (scenario) => {
    await repository.importSeed(seed);
    const bad = structuredClone(seed);
    if (scenario === 'date') bad.data.plannedDays[0].date = '2030-02-30';
    if (scenario === 'duplicate') bad.data.plannedDays.push(bad.data.plannedDays[0]);
    if (scenario === 'foreign') bad.data.plannedDays[0].segments[0].stageId = 'inexistente';
    if (scenario === 'hash') bad.data.sourceSnapshots[0].files[0].rawText += ' ';
    if (scenario === 'schema') Object.assign(bad, { schemaVersion: 2 });
    if (scenario === 'negative') bad.data.plannedDays[0].segments[0].cyclingKmEstimate = -1;
    if (scenario === 'shape') Object.assign(bad.data.plannedDays[0], { logistics: {} });
    if (scenario === 'source-id') bad.data.stages[0].sourceRef!.sourceId = 'inventado';
    if (scenario === 'map-url')
      bad.data.plannedDays[0].logistics.referenceMapUrl = 'javascript:alert(1)';
    await expect(repository.restore(bad)).rejects.toThrow();
    expect((await repository.all())[0]).toEqual(seed.data);
  });
  it('una nota inválida no escribe la jornada real parcialmente', async () => {
    await repository.importSeed(seed);
    await expect(
      repository.saveNote(seed.data.trip.id, { ...note, stageIds: ['inventado'] }),
    ).rejects.toThrow();
    const data = (await repository.all())[0];
    expect(data.actualDays).toHaveLength(0);
    expect(data.diaryEntries).toHaveLength(0);
  });
  it('serializa dos guardados concurrentes sin perder notas', async () => {
    await repository.importSeed(seed);
    await Promise.all([
      repository.saveNote(seed.data.trip.id, note),
      repository.saveNote(seed.data.trip.id, { ...note, text: 'Nota concurrente' }),
    ]);
    const data = (await repository.all())[0];
    expect(data.diaryEntries).toHaveLength(2);
    expect(actualKm(data)).toBe(43.2);
  });
});
