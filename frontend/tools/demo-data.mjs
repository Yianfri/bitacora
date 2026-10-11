import { createHash } from 'node:crypto';

// Entirely fictional fixture. Personal files must never enter the build process.
export function demoBackup() {
  const stamp = '2030-01-01T00:00:00Z';
  const tripId = 'demo-trip';
  const planId = 'demo-plan';
  const routes = ['Llegada a Pueblo A', 'Pueblo A → Pueblo B', 'Pueblo B → Pueblo C'];
  const sourceDays = Array.from({ length: 16 }, (_, index) => ({
    id: `example-${index + 1}`,
    date: `2030-06-${String(index + 1).padStart(2, '0')}`,
    name: routes[index] ?? `Etapa de ejemplo ${index + 1}`,
    kind: index === 0 ? 'arrival' : index === 6 || index === 13 ? 'rest' : 'cycling',
    km: index === 0 || index === 6 || index === 13 ? 0 : 40,
  }));
  const rawText = JSON.stringify({ schema_version: 1, fictional: true, days: sourceDays });
  const digest = createHash('sha256').update(rawText).digest('hex');
  const snapshotId = `demo-source-${digest}`;
  const base = (id) => ({ id, tripId, createdAt: stamp, updatedAt: stamp });
  const ref = (id) => ({ snapshotId, path: 'fictional-example.json', sourceId: id });
  return {
    format: 'cuaderno-austral-backup',
    schemaVersion: 1,
    exportedAt: stamp,
    data: {
      trip: {
        id: tripId,
        name: 'Viaje de ejemplo · datos ficticios',
        isDemo: true,
        startDate: sourceDays[0].date,
        endDate: sourceDays.at(-1).date,
        currency: 'CLP',
        locale: 'es-CL',
        activePlanId: planId,
        fixedFlights: [],
        createdAt: stamp,
        updatedAt: stamp,
      },
      sourceSnapshots: [
        {
          id: snapshotId,
          importedAt: stamp,
          files: [{ path: 'fictional-example.json', sha256: digest, rawText }],
        },
      ],
      plans: [
        { ...base(planId), name: 'Plan de ejemplo', sourceSnapshotId: snapshotId, status: 'draft' },
      ],
      stages: sourceDays.map((d) => ({
        ...base(`stage-${d.id}`),
        name: d.name,
        sourceRef: ref(d.id),
      })),
      plannedDays: sourceDays.map((d) => ({
        ...base(`day-${d.id}`),
        planId,
        date: d.date,
        kind: d.kind,
        sourceRef: ref(d.id),
        segments: [{ id: `segment-${d.id}`, stageId: `stage-${d.id}`, cyclingKmEstimate: d.km }],
        logistics: {
          lodgingCandidate: 'Alojamiento de ejemplo',
          lodgingStatusText: 'Sin reservar',
          transportNotes: 'Revisar transporte',
          transportStatusText: 'Por confirmar',
          supplyNotes: 'Comprar provisiones',
          alternativeNotes: 'Descansar si cambia el clima',
          difficultyText: 'Media',
          surfaceText: 'Superficie de ejemplo',
          referenceMapUrl: null,
        },
        budgetEstimateClp: { lodging: 10000, food: 5000, transport: 0, other: null, total: null },
      })),
      places: [],
      actualDays: [],
      diaryEntries: [],
    },
  };
}
