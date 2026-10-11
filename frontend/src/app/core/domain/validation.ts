import { z } from 'zod';
import { Backup, TripData } from './model';

export function isLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return (
    year >= 1900 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
const id = z.string().min(1).max(200);
const date = z.string().refine(isLocalDate, 'Fecha inválida');
const instant = z.iso.datetime({ offset: true });
const km = z.number().finite().nonnegative().nullable();
const money = z.number().int().nonnegative().nullable();
const base = { id, tripId: id, createdAt: instant, updatedAt: instant };
const ref = z.looseObject({ snapshotId: id, path: z.string(), sourceId: id }).nullable();
const uniqueStrings = z.array(id).refine((a) => new Set(a).size === a.length, 'Vínculos repetidos');
const hour = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schema = z.looseObject({
  format: z.literal('cuaderno-austral-backup'),
  schemaVersion: z.literal(1),
  exportedAt: instant,
  data: z.looseObject({
    trip: z.looseObject({
      id,
      name: z.string().min(1),
      startDate: date,
      endDate: date,
      currency: z.literal('CLP'),
      locale: z.literal('es-CL'),
      activePlanId: id,
      createdAt: instant,
      updatedAt: instant,
      returnStatus: z.string().optional(),
      isDemo: z.boolean().optional(),
      fixedFlights: z.array(
        z.looseObject({
          id,
          date,
          origin: z.string(),
          destination: z.string(),
          departure_local: hour,
          arrival_local: hour,
          status: z.string(),
        }),
      ),
    }),
    sourceSnapshots: z.array(
      z.looseObject({
        id,
        importedAt: instant,
        files: z.array(
          z.looseObject({
            path: z.string().regex(/^(?!.*\.\.)(?!\/)[a-zA-Z0-9_/-]+\.json$/),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            rawText: z.string(),
          }),
        ),
      }),
    ),
    plans: z.array(
      z.looseObject({
        ...base,
        name: z.string(),
        sourceSnapshotId: id,
        status: z.literal('draft'),
      }),
    ),
    stages: z.array(z.looseObject({ ...base, name: z.string(), sourceRef: ref })),
    plannedDays: z.array(
      z.looseObject({
        ...base,
        planId: id,
        date,
        kind: z.enum([
          'arrival',
          'cycling',
          'ferry',
          'rest',
          'transfer',
          'buffer',
          'packing',
          'flight',
          'other',
        ]),
        sourceRef: ref,
        segments: z.array(
          z.looseObject({
            id,
            stageId: id,
            cyclingKmEstimate: km,
            description: z.string().optional(),
          }),
        ),
        logistics: z.looseObject({
          lodgingCandidate: z.string(),
          lodgingStatusText: z.string(),
          transportNotes: z.string(),
          transportStatusText: z.string(),
          supplyNotes: z.string(),
          alternativeNotes: z.string(),
          difficultyText: z.string(),
          surfaceText: z.string(),
          referenceMapUrl: z
            .string()
            .refine((v) => {
              try {
                const u = new URL(v);
                return (
                  u.protocol === 'https:' &&
                  u.hostname === 'www.google.com' &&
                  u.pathname.startsWith('/maps/')
                );
              } catch {
                return false;
              }
            }, 'Referencia de mapa inválida')
            .nullable(),
        }),
        budgetEstimateClp: z.looseObject({
          lodging: money,
          food: money,
          transport: money,
          other: money,
          total: money,
        }),
      }),
    ),
    actualDays: z.array(z.looseObject({ ...base, date, cyclingKm: km, stageIds: uniqueStrings })),
    diaryEntries: z.array(
      z.looseObject({
        ...base,
        actualDayId: id,
        text: z
          .string()
          .min(1)
          .max(1200)
          .refine((t) => t.trim().length > 0),
        stageIds: uniqueStrings,
        placeIds: uniqueStrings,
      }),
    ),
    places: z.array(
      z.looseObject({
        ...base,
        name: z.string(),
        category: z.string(),
        latitude: z.number().finite().min(-90).max(90).nullable(),
        longitude: z.number().finite().min(-180).max(180).nullable(),
        coordinates_status: z.string(),
        notes: z.string(),
        contact: z.string().nullable(),
        sourceRef: ref,
      }),
    ),
  }),
});
function ensure(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function unique(values: string[], label: string) {
  ensure(new Set(values).size === values.length, `${label}: identificador o fecha repetida.`);
}

// Per-call indexes: never trust a cache after source text changes.
function sourceIndexes(data: TripData): Map<string, Map<string, Set<string>>> {
  const indexes = new Map<string, Map<string, Set<string>>>();
  let bytes = 0,
    nodes = 0;
  for (const snapshot of data.sourceSnapshots) {
    const files = new Map<string, Set<string>>();
    indexes.set(snapshot.id, files);
    for (const file of snapshot.files) {
      bytes += new TextEncoder().encode(file.rawText).byteLength;
      ensure(bytes <= 10 * 1024 * 1024, 'Las fuentes superan el límite de 10 MiB.');
      let raw: unknown;
      try {
        raw = JSON.parse(file.rawText.replace(/^\uFEFF/, ''));
      } catch {
        throw new Error('JSON de origen inválido.');
      }
      ensure(
        !!raw && typeof raw === 'object' && 'schema_version' in raw && raw.schema_version === 1,
        'Versión de origen desconocida.',
      );
      const ids = new Set<string>();
      files.set(file.path, ids);
      const pending: Iterator<unknown>[] = [[raw].values()];
      while (pending.length) {
        const next = pending[pending.length - 1].next();
        if (next.done) {
          pending.pop();
          continue;
        }
        ensure(
          ++nodes <= 1000000 && pending.length <= 64,
          'Las fuentes superan el límite de complejidad (64 niveles o 1000000 valores).',
        );
        const current: unknown = next.value;
        if (Array.isArray(current)) pending.push(current.values());
        else if (current && typeof current === 'object') {
          if ('id' in current && typeof current.id === 'string') ids.add(current.id);
          pending.push(Object.values(current).values());
        }
      }
    }
  }
  return indexes;
}

export function validateData(value: unknown): TripData {
  const result = schema.shape.data.safeParse(value);
  if (!result.success)
    throw new Error(
      `Datos inválidos: ${result.error.issues[0]?.path.join('.')} · ${result.error.issues[0]?.message}`,
    );
  const d: TripData = result.data;
  const collections = [d.plans, d.stages, d.plannedDays, d.actualDays, d.diaryEntries, d.places];
  collections.forEach((rows) => {
    unique(
      rows.map((r) => r.id),
      'Datos',
    );
    rows.forEach((r) => ensure(r.tripId === d.trip.id, 'Un registro pertenece a otro viaje.'));
  });
  ensure(d.trip.startDate <= d.trip.endDate, 'La ventana del viaje es inválida.');
  unique(
    d.sourceSnapshots.map((s) => s.id),
    'Fuentes',
  );
  unique(
    d.trip.fixedFlights.map((f) => f.id),
    'Vuelos',
  );
  const snapshots = new Map(d.sourceSnapshots.map((s) => [s.id, s]));
  const plans = new Set(d.plans.map((p) => p.id)),
    stages = new Set(d.stages.map((s) => s.id)),
    actual = new Set(d.actualDays.map((a) => a.id)),
    places = new Set(d.places.map((p) => p.id));
  ensure(plans.has(d.trip.activePlanId), 'El plan activo no existe.');
  d.plans.forEach((p) =>
    ensure(snapshots.has(p.sourceSnapshotId), 'La fuente del plan no existe.'),
  );
  unique(
    d.plannedDays.map((p) => `${p.planId}/${p.date}`),
    'Calendario',
  );
  unique(
    d.actualDays.map((a) => a.date),
    'Diario',
  );
  unique(
    d.plannedDays.flatMap((p) => p.segments.map((s) => s.id)),
    'Segmentos',
  );
  for (const s of d.sourceSnapshots)
    unique(
      s.files.map((f) => f.path),
      'Archivos de origen',
    );
  const sources = sourceIndexes(d);
  for (const r of [...d.stages, ...d.plannedDays, ...d.places])
    if (r.sourceRef) {
      const ids = sources.get(r.sourceRef.snapshotId)?.get(r.sourceRef.path);
      ensure(!!ids, 'Referencia de fuente inexistente.');
      ensure(ids.has(r.sourceRef.sourceId), 'El ID de procedencia no existe en la fuente.');
    }
  for (const p of d.plannedDays) {
    ensure(plans.has(p.planId), 'Plan inexistente.');
    p.segments.forEach((s) => ensure(stages.has(s.stageId), 'Etapa inexistente.'));
  }
  d.actualDays.forEach((a) =>
    a.stageIds.forEach((s) => ensure(stages.has(s), 'Etapa real inexistente.')),
  );
  d.diaryEntries.forEach((n) => {
    ensure(actual.has(n.actualDayId), 'Jornada real inexistente.');
    n.stageIds.forEach((s) => ensure(stages.has(s), 'Etapa de nota inexistente.'));
    n.placeIds.forEach((p) => ensure(places.has(p), 'Lugar de nota inexistente.'));
  });
  d.places.forEach((p) =>
    ensure((p.latitude === null) === (p.longitude === null), 'Coordenadas incompletas.'),
  );
  return d;
}
export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function validateBackup(value: unknown): Promise<Backup> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new Error(
      `Respaldo no compatible o inválido: ${result.error.issues[0]?.path.join('.')} · ${result.error.issues[0]?.message}`,
    );
  const backup: Backup = result.data;
  backup.data = validateData(backup.data);
  for (const s of backup.data.sourceSnapshots)
    for (const f of s.files) {
      ensure(
        (await sha256(f.rawText)) === f.sha256,
        'La integridad de un archivo de origen no coincide.',
      );
    }
  return backup;
}
