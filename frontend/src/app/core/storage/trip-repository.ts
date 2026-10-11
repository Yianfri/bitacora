import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Backup, NoteInput, TripData } from '../domain/model';
import { addNote } from '../domain/diary';
import { validateBackup } from '../domain/validation';

interface LocalDatabase extends DBSchema {
  trips: { key: string; value: TripData };
}
export class TripRepository {
  private database?: Promise<IDBPDatabase<LocalDatabase>>;
  constructor(private readonly databaseName = 'cuaderno-austral-v1') {}
  private db() {
    return (this.database ??= openDB<LocalDatabase>(this.databaseName, 1, {
      upgrade(db) {
        db.createObjectStore('trips', { keyPath: 'trip.id' });
      },
    }));
  }
  async all() {
    return (await this.db()).getAll('trips');
  }
  async importSeed(backup: Backup): Promise<TripData> {
    const checked = await validateBackup(backup);
    const db = await this.db(),
      tx = db.transaction('trips', 'readwrite');
    const existing = await tx.store.get(checked.data.trip.id);
    if (existing) {
      const source = checked.data.sourceSnapshots[0];
      const same = existing.sourceSnapshots.find((s) => s.id === source.id);
      if (!same || JSON.stringify(same.files) !== JSON.stringify(source.files)) {
        tx.abort();
        await tx.done.catch(() => {});
        throw new Error(
          'El paquete cambió. Tu copia se conserva; revisa la nueva versión antes de reemplazarla.',
        );
      }
      await tx.done;
      return existing;
    }
    await tx.store.put(checked.data);
    await tx.done;
    return checked.data;
  }
  async saveNote(tripId: string, input: NoteInput): Promise<TripData> {
    const db = await this.db(),
      tx = db.transaction('trips', 'readwrite');
    try {
      const current = await tx.store.get(tripId);
      if (!current) throw new Error('No se encontró el cuaderno.');
      const next = addNote(current, input);
      await tx.store.put(next);
      await tx.done;
      return next;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The transaction may already be aborted. */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async restore(backup: Backup) {
    const checked = await validateBackup(backup);
    const db = await this.db(),
      tx = db.transaction('trips', 'readwrite');
    await tx.store.put(checked.data);
    await tx.done;
    return checked.data;
  }
  async close() {
    if (this.database) (await this.database).close();
    this.database = undefined;
  }
}
