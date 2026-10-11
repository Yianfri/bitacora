export interface SourceRef {
  snapshotId: string;
  path: string;
  sourceId: string;
}
export interface Entity {
  id: string;
  tripId: string;
  createdAt: string;
  updatedAt: string;
}
export interface Flight {
  id: string;
  date: string;
  origin: string;
  destination: string;
  departure_local: string;
  arrival_local: string;
  status: string;
  [key: string]: unknown;
}
export interface Trip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  currency: 'CLP';
  locale: 'es-CL';
  activePlanId: string;
  fixedFlights: Flight[];
  createdAt: string;
  updatedAt: string;
  returnStatus?: string;
  isDemo?: boolean;
}
export interface SourceFile {
  path: string;
  sha256: string;
  rawText: string;
}
export interface SourceSnapshot {
  id: string;
  importedAt: string;
  files: SourceFile[];
}
export interface Plan extends Entity {
  name: string;
  sourceSnapshotId: string;
  status: 'draft';
}
export interface Stage extends Entity {
  name: string;
  sourceRef: SourceRef | null;
}
export type DayKind =
  'arrival' | 'cycling' | 'ferry' | 'rest' | 'transfer' | 'buffer' | 'packing' | 'flight' | 'other';
export interface PlannedDay extends Entity {
  planId: string;
  date: string;
  kind: DayKind;
  segments: {
    id: string;
    stageId: string;
    cyclingKmEstimate: number | null;
    description?: string;
  }[];
  logistics: {
    lodgingCandidate: string;
    lodgingStatusText: string;
    transportNotes: string;
    transportStatusText: string;
    supplyNotes: string;
    alternativeNotes: string;
    difficultyText: string;
    surfaceText: string;
    referenceMapUrl: string | null;
  };
  budgetEstimateClp: {
    lodging: number | null;
    food: number | null;
    transport: number | null;
    other: number | null;
    total: number | null;
  };
  sourceRef: SourceRef | null;
}
export interface ActualDay extends Entity {
  date: string;
  cyclingKm: number | null;
  stageIds: string[];
}
export interface DiaryEntry extends Entity {
  actualDayId: string;
  text: string;
  stageIds: string[];
  placeIds: string[];
}
export interface Place extends Entity {
  name: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  coordinates_status: string;
  notes: string;
  contact: string | null;
  sourceRef: SourceRef | null;
  [key: string]: unknown;
}
export interface TripData {
  trip: Trip;
  sourceSnapshots: SourceSnapshot[];
  plans: Plan[];
  stages: Stage[];
  plannedDays: PlannedDay[];
  actualDays: ActualDay[];
  diaryEntries: DiaryEntry[];
  places: Place[];
}
export interface Backup {
  format: 'cuaderno-austral-backup';
  schemaVersion: 1;
  exportedAt: string;
  data: TripData;
}
export interface NoteInput {
  date: string;
  cyclingKm: number | null;
  text: string;
  stageIds: string[];
  entryId?: string;
}

export function dayKm(day: PlannedDay): number | null {
  return day.segments.some((s) => s.cyclingKmEstimate === null)
    ? null
    : day.segments.reduce((sum, s) => sum + (s.cyclingKmEstimate ?? 0), 0);
}
export function actualKm(data: TripData): number {
  return data.actualDays.reduce((sum, d) => sum + (d.cyclingKm ?? 0), 0);
}
export function plannedDays(data: TripData): PlannedDay[] {
  return data.plannedDays
    .filter((d) => d.planId === data.trip.activePlanId)
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function dayName(day: PlannedDay, data: TripData): string {
  return (
    day.segments
      .map((s) => data.stages.find((stage) => stage.id === s.stageId)?.name ?? 'Etapa')
      .join(' · ') || 'Sin etapa asignada'
  );
}
