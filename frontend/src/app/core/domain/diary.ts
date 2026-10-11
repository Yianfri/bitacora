import { NoteInput, TripData } from './model';
import { isLocalDate, validateData } from './validation';

export function addNote(
  current: TripData,
  input: NoteInput,
  now = new Date().toISOString(),
  newId = () => crypto.randomUUID(),
): TripData {
  if (
    !isLocalDate(input.date) ||
    !input.text.trim() ||
    input.text.trim().length > 1200 ||
    (input.cyclingKm !== null && (!Number.isFinite(input.cyclingKm) || input.cyclingKm < 0))
  )
    throw new Error('Revisa fecha, texto y kilómetros.');
  const data = structuredClone(current);
  const previous = input.entryId
    ? data.diaryEntries.find((n) => n.id === input.entryId)
    : undefined;
  if (input.entryId && !previous) throw new Error('La nota que intentas editar ya no existe.');
  if (previous && data.actualDays.find((d) => d.id === previous.actualDayId)?.date !== input.date)
    throw new Error('La edición de una nota conserva su fecha real.');
  let day = data.actualDays.find((d) => d.date === input.date);
  if (!day) {
    day = {
      id: newId(),
      tripId: data.trip.id,
      date: input.date,
      cyclingKm: input.cyclingKm,
      stageIds: [],
      createdAt: now,
      updatedAt: now,
    };
    data.actualDays.push(day);
  }
  day.cyclingKm = input.cyclingKm;
  day.updatedAt = now;
  day.stageIds = [...new Set([...day.stageIds, ...input.stageIds])];
  if (previous)
    Object.assign(previous, { text: input.text.trim(), stageIds: input.stageIds, updatedAt: now });
  else
    data.diaryEntries.push({
      id: newId(),
      tripId: data.trip.id,
      actualDayId: day.id,
      text: input.text.trim(),
      stageIds: input.stageIds,
      placeIds: [],
      createdAt: now,
      updatedAt: now,
    });
  data.trip.updatedAt = now;
  return validateData(data);
}
