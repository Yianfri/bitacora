import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Backup, NoteInput, TripData } from '../domain/model';

interface LocalDatabase extends DBSchema {
  trips: { key: string; value: TripData };
  localTripStates: { key: string; value: LocalTripState };
  backupMetadata: { key: string; value: BackupMetadata };
  workspaceBindings: { key: string; value: WorkspaceBinding };
  remoteAssociations: { key: [string, string, string]; value: RemoteAssociation };
  remoteOperations: { key: [string, string, string]; value: RemoteOperation };
  backupArchives: { key: string; value: BackupArchive };
}

export interface LocalTripState {
  tripId: string;
  revision: number;
  token: string;
}

export interface LocalTripSnapshot {
  backup: Backup;
  data: TripData;
  token: string;
  revision: number;
}

export interface WorkspaceBinding {
  apiOrigin: string;
  username: string;
  boundAt: string;
}

export interface RemoteAssociation {
  apiOrigin: string;
  username: string;
  tripId: string;
  etag: string;
  localToken: string;
  contentHash: string;
  remoteRevision: number;
}

export interface RemoteOperation {
  apiOrigin: string;
  username: string;
  tripId: string;
  localToken: string;
  contentHash: string;
  condition: { kind: 'create' } | { kind: 'match'; etag: string };
  startedAt: string;
}

interface BackupMetadata {
  tripId: string;
  fields: Record<string, unknown>;
}

export interface BackupArchive {
  id: string;
  tripId: string;
  archivedAt: string;
  reason: 'restore' | 'remote-restore';
  backup: Backup;
}

export class LocalRestoreConflictError extends Error {
  constructor() {
    super('El cuaderno cambió mientras revisabas la recuperación. No se reemplazó la copia local.');
    this.name = 'LocalRestoreConflictError';
  }
}

function randomToken(): string {
  return crypto.randomUUID();
}

function nextState(tripId: string, current: LocalTripState | undefined): LocalTripState {
  const revision = (current?.revision ?? 0) + 1;
  if (!Number.isSafeInteger(revision)) throw new Error('La revisión local ya no es segura.');
  return { tripId, revision, token: randomToken() };
}

function backupFields(backup: Backup): Record<string, unknown> {
  const reserved = new Set(['format', 'schemaVersion', 'exportedAt', 'data']);
  return Object.fromEntries(Object.entries(backup).filter(([key]) => !reserved.has(key)));
}

function makeBackup(data: TripData, fields: Record<string, unknown> = {}): Backup {
  return {
    ...fields,
    format: 'cuaderno-austral-backup',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

async function validateBackup(value: unknown): Promise<Backup> {
  const { validateBackup } = await import('../domain/validation');
  return validateBackup(value);
}

export class TripRepository {
  private database?: Promise<IDBPDatabase<LocalDatabase>>;
  constructor(private readonly databaseName = 'cuaderno-austral-v1') {}
  private db() {
    return (this.database ??= openDB<LocalDatabase>(this.databaseName, 2, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) db.createObjectStore('trips', { keyPath: 'trip.id' });
        if (oldVersion < 2) {
          const states = db.createObjectStore('localTripStates', { keyPath: 'tripId' });
          db.createObjectStore('backupMetadata', { keyPath: 'tripId' });
          db.createObjectStore('workspaceBindings', { keyPath: 'apiOrigin' });
          db.createObjectStore('remoteAssociations', {
            keyPath: ['apiOrigin', 'username', 'tripId'],
          });
          db.createObjectStore('remoteOperations', {
            keyPath: ['apiOrigin', 'username', 'tripId'],
          });
          db.createObjectStore('backupArchives', { keyPath: 'id' });

          // Keep trip IDs and the original trips store untouched. Backfill a
          // token for every v1 record in the version-change transaction.
          const backfill = async (): Promise<void> => {
            let cursor = await transaction.objectStore('trips').openCursor();
            while (cursor) {
              const trip = cursor.value;
              await states.put({ tripId: trip.trip.id, revision: 0, token: randomToken() });
              cursor = await cursor.continue();
            }
          };
          void backfill();
        }
      },
    }));
  }
  async all() {
    return (await this.db()).getAll('trips');
  }

  async snapshot(tripId?: string): Promise<LocalTripSnapshot | null> {
    const db = await this.db();
    const tx = db.transaction(['trips', 'localTripStates', 'backupMetadata'], 'readwrite');
    const trips = tx.objectStore('trips');
    const data = tripId ? await trips.get(tripId) : (await trips.getAll())[0];
    if (!data) {
      await tx.done;
      return null;
    }
    const id = data.trip.id;
    let state = await tx.objectStore('localTripStates').get(id);
    if (!state) {
      state = { tripId: id, revision: 0, token: randomToken() };
      await tx.objectStore('localTripStates').put(state);
    }
    const metadata = await tx.objectStore('backupMetadata').get(id);
    const backup = makeBackup(data, metadata?.fields);
    await tx.done;
    return { backup, data, token: state.token, revision: state.revision };
  }

  async importSeed(backup: Backup): Promise<TripData> {
    const checked = await validateBackup(backup);
    const db = await this.db(),
      tx = db.transaction(['trips', 'localTripStates', 'backupMetadata'], 'readwrite');
    const trips = tx.objectStore('trips');
    const existing = await trips.get(checked.data.trip.id);
    if (existing) {
      const state = await tx.objectStore('localTripStates').get(existing.trip.id);
      if (!state) {
        await tx.objectStore('localTripStates').put({
          tripId: existing.trip.id,
          revision: 0,
          token: randomToken(),
        });
      }
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
    await trips.put(checked.data);
    await tx.objectStore('localTripStates').put(nextState(checked.data.trip.id, undefined));
    await tx.objectStore('backupMetadata').put({
      tripId: checked.data.trip.id,
      fields: backupFields(checked),
    });
    await tx.done;
    return checked.data;
  }
  async saveNote(tripId: string, input: NoteInput): Promise<TripData> {
    const { addNote } = await import('../domain/diary');
    const db = await this.db(),
      tx = db.transaction(['trips', 'localTripStates'], 'readwrite');
    try {
      const trips = tx.objectStore('trips');
      const current = await trips.get(tripId);
      if (!current) throw new Error('No se encontró el cuaderno.');
      const next = addNote(current, input);
      await trips.put(next);
      const state = await tx.objectStore('localTripStates').get(tripId);
      await tx.objectStore('localTripStates').put(nextState(tripId, state));
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
    const restored = await this.writeBackup(checked, null, false, 'restore');
    return restored.data;
  }

  async restoreCAS(backup: Backup, expectedToken: string | null): Promise<LocalTripSnapshot> {
    const checked = await validateBackup(backup);
    return this.writeBackup(checked, expectedToken, true, 'remote-restore');
  }

  private async writeBackup(
    checked: Backup,
    expectedToken: string | null,
    compareToken: boolean,
    reason: BackupArchive['reason'],
  ): Promise<LocalTripSnapshot> {
    const id = checked.data.trip.id;
    const db = await this.db();
    const tx = db.transaction(
      ['trips', 'localTripStates', 'backupMetadata', 'backupArchives'],
      'readwrite',
    );
    try {
      const trips = tx.objectStore('trips');
      const states = tx.objectStore('localTripStates');
      const metadataStore = tx.objectStore('backupMetadata');
      const current = await trips.get(id);
      const currentState = await states.get(id);
      const actualToken = current ? (currentState?.token ?? null) : null;
      if (compareToken && actualToken !== expectedToken) throw new LocalRestoreConflictError();

      if (current) {
        const oldMetadata = await metadataStore.get(id);
        const archive = makeBackup(current, oldMetadata?.fields);
        await tx.objectStore('backupArchives').put({
          id: randomToken(),
          tripId: id,
          archivedAt: new Date().toISOString(),
          reason,
          backup: archive,
        });
      }

      const state = nextState(id, currentState);
      await trips.put(checked.data);
      await metadataStore.put({ tripId: id, fields: backupFields(checked) });
      await states.put(state);
      await tx.done;
      return {
        backup: makeBackup(checked.data, backupFields(checked)),
        data: checked.data,
        token: state.token,
        revision: state.revision,
      };
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

  async getWorkspaceBinding(apiOrigin: string): Promise<WorkspaceBinding | undefined> {
    return (await this.db()).get('workspaceBindings', apiOrigin);
  }

  async bindWorkspace(binding: WorkspaceBinding): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('workspaceBindings', 'readwrite');
    const current = await tx.store.get(binding.apiOrigin);
    if (current && current.username !== binding.username) {
      tx.abort();
      await tx.done.catch(() => {});
      throw new Error(
        `Este perfil local ya está vinculado a ${current.username}. Usa un perfil de navegador separado para otra cuenta.`,
      );
    }
    if (!current) await tx.store.put(binding);
    await tx.done;
  }

  async getRemoteAssociation(
    apiOrigin: string,
    username: string,
    tripId: string,
  ): Promise<RemoteAssociation | undefined> {
    return (await this.db()).get('remoteAssociations', [apiOrigin, username, tripId]);
  }

  async putRemoteAssociation(association: RemoteAssociation): Promise<void> {
    await (await this.db()).put('remoteAssociations', association);
  }

  async getRemoteOperation(
    apiOrigin: string,
    username: string,
    tripId: string,
  ): Promise<RemoteOperation | undefined> {
    return (await this.db()).get('remoteOperations', [apiOrigin, username, tripId]);
  }

  async listRemoteOperations(apiOrigin: string, username: string): Promise<RemoteOperation[]> {
    const operations = await (await this.db()).getAll('remoteOperations');
    return operations.filter(
      (operation) => operation.apiOrigin === apiOrigin && operation.username === username,
    );
  }

  async putRemoteOperation(operation: RemoteOperation): Promise<void> {
    await (await this.db()).put('remoteOperations', operation);
  }

  async clearRemoteOperation(apiOrigin: string, username: string, tripId: string): Promise<void> {
    await (await this.db()).delete('remoteOperations', [apiOrigin, username, tripId]);
  }

  async listRestoreArchives(tripId: string): Promise<BackupArchive[]> {
    return (await this.db())
      .getAll('backupArchives')
      .then((archives) =>
        archives
          .filter((archive) => archive.tripId === tripId)
          .sort((left, right) => right.archivedAt.localeCompare(left.archivedAt)),
      );
  }
  async close() {
    if (this.database) (await this.database).close();
    this.database = undefined;
  }
}
