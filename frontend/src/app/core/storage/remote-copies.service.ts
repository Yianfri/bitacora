import { computed, Injectable, signal } from '@angular/core';
import type { Backup } from '../domain/model';
import { CuadernoService } from './cuaderno.service';
import {
  RemoteAssociation,
  RemoteOperation,
  TripRepository,
  WorkspaceBinding,
} from './trip-repository';
import {
  MAX_REMOTE_BACKUP_BYTES,
  RemoteApiError,
  RemoteCopiesClient,
  RemoteNetworkError,
} from './remote-copies-client';
import type { ApiTripMetadata, ApiUser } from './remote-copies-client';

export type RemoteCopiesStatus =
  'loading' | 'signedOut' | 'unbound' | 'ready' | 'blocked' | 'unavailable' | 'error';

export type RemoteLocalStatus =
  'not-on-device' | 'not-linked' | 'current' | 'local-changes' | 'uncertain' | 'conflict';

export interface RemoteUser {
  username: string;
}

export interface RemoteCopySummary {
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
  localStatus: RemoteLocalStatus;
  remoteAvailable?: boolean;
}

export interface RemoteRestorePreview {
  reviewId: string;
  id: string;
  name: string;
  updatedAt: string;
  revision: number;
  etag: string;
  backup: Backup;
  localName: string | null;
  localTokenCaptured: string | null;
}

export interface RemoteSaveResult {
  status: 'saved' | 'already-current' | 'uncertain' | 'conflict';
  tripId: string;
  localToken: string;
  etag: string | null;
}

export interface WorkspaceBindingView {
  apiOrigin: string;
  username: string;
}

interface ReadRemoteCopy {
  backup: Backup;
  etag: string;
  revision: number;
}

interface InternalRemoteCopySummary extends RemoteCopySummary {
  localTokenAtList: string | null;
}

function getApiOrigin(): string {
  return globalThis.location?.origin ?? 'http://localhost';
}

function revisionFromEtag(etag: string): number {
  if (!/^"[1-9]\d*"$/.test(etag)) throw new Error('La revisión remota no es válida.');
  const revision = Number(etag.slice(1, -1));
  if (!Number.isSafeInteger(revision)) throw new Error('La revisión remota no es segura.');
  return revision;
}

function etagForRevision(revision: number): string {
  return `"${revision}"`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('La copia contiene un valor JSON no compatible.');
  return serialized;
}

async function semanticHash(backup: Backup): Promise<string> {
  const semantic = Object.fromEntries(
    Object.entries(backup).filter(([key]) => key !== 'exportedAt'),
  );
  const { sha256 } = await import('../domain/validation');
  return sha256(canonicalJson(semantic));
}

async function validateBackup(value: unknown): Promise<Backup> {
  const { validateBackup } = await import('../domain/validation');
  return validateBackup(value);
}

function userView(user: ApiUser | null): RemoteUser | null {
  return user ? { username: user.username } : null;
}

@Injectable({ providedIn: 'root' })
export class RemoteCopiesService {
  readonly user = signal<RemoteUser | null>(null);
  readonly status = signal<RemoteCopiesStatus>('loading');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  private readonly remoteCopies = signal<InternalRemoteCopySummary[]>([]);
  readonly copies = computed<RemoteCopySummary[]>(() => {
    const currentId = this.cuaderno.data()?.trip.id;
    const currentToken = this.cuaderno.localToken();
    return this.remoteCopies().map(({ localTokenAtList, ...copy }) =>
      copy.localStatus === 'current' && copy.id === currentId && currentToken !== localTokenAtList
        ? { ...copy, localStatus: 'local-changes' }
        : copy,
    );
  });
  readonly pending = signal<RemoteRestorePreview | null>(null);
  readonly workspaceBinding = signal<WorkspaceBindingView | null>(null);

  private readonly origin = getApiOrigin();
  private readonly client = new RemoteCopiesClient();
  private readonly repository = new TripRepository();

  constructor(private readonly cuaderno: CuadernoService) {}

  async initialize(): Promise<void> {
    await this.execute(async () => {
      this.status.set('loading');
      this.pending.set(null);
      const binding = await this.repository.getWorkspaceBinding(this.origin);
      this.setBinding(binding);
      const current = await this.client.initialize();
      this.user.set(userView(current));
      if (!current) {
        this.status.set('signedOut');
        this.remoteCopies.set([]);
        return;
      }
      if (!(await this.updateStatusFor(current))) return;
      await this.loadCopies(current);
    });
  }

  async login(username: string, password: string): Promise<void> {
    await this.execute(async () => {
      const current = await this.client.login(username, password);
      this.user.set(userView(current));
      if (!(await this.updateStatusFor(current))) return;
      await this.loadCopies(current);
    });
  }

  async logout(): Promise<void> {
    await this.execute(async () => {
      await this.client.logout();
      this.user.set(null);
      this.status.set('signedOut');
      this.remoteCopies.set([]);
      this.pending.set(null);
      // Local trips and the persistent account binding deliberately remain.
    });
  }

  async bindWorkspace(confirmed: boolean): Promise<void> {
    await this.execute(async () => {
      if (!confirmed)
        throw new Error('Confirma la vinculación antes de asociar este perfil local.');
      const current = this.user();
      if (!current) throw new Error('Inicia sesión antes de vincular el perfil local.');
      const existing = await this.repository.getWorkspaceBinding(this.origin);
      if (existing && existing.username !== current.username) {
        this.setBinding(existing);
        this.status.set('blocked');
        throw this.accountMismatchError(existing.username);
      }
      const binding: WorkspaceBinding = existing ?? {
        apiOrigin: this.origin,
        username: current.username,
        boundAt: new Date().toISOString(),
      };
      await this.repository.bindWorkspace(binding);
      this.setBinding(binding);
      this.status.set('ready');
      await this.loadCopies({ username: current.username });
    });
  }

  async list(): Promise<RemoteCopySummary[]> {
    return this.execute(async () => {
      const current = await this.requireBoundUser();
      return this.loadCopies(current);
    });
  }

  async saveCurrent(tripId?: string, reviewedRemoteEtag?: string): Promise<RemoteSaveResult> {
    return this.execute(async () => {
      const current = await this.requireBoundUser();
      const currentData = this.cuaderno.data();
      const id = tripId ?? currentData?.trip.id;
      if (!id) throw new Error('No hay un viaje local seleccionado para guardar.');
      const snapshot = await this.cuaderno.snapshot(id);
      if (!snapshot) throw new Error('No encontramos ese viaje en este dispositivo.');

      const backup = await validateBackup(snapshot.backup);
      if (backup.data.trip.id !== id)
        throw new Error('El respaldo no coincide con el ID del viaje.');
      const body = JSON.stringify(backup);
      if (new TextEncoder().encode(body).byteLength > MAX_REMOTE_BACKUP_BYTES) {
        throw new Error('La copia supera el límite remoto de 5 MiB. No se cambió tu cuaderno.');
      }
      const contentHash = await semanticHash(backup);
      const operation = await this.repository.getRemoteOperation(this.origin, current.username, id);
      let retryObservedEtag: string | undefined;
      if (operation) {
        const resolved = await this.resolveOperation(operation);
        if (!resolved) {
          const remote = await this.tryReadRemote(id, current.username);
          const originalConditionStillHolds =
            remote === null ||
            (operation.condition.kind === 'match' && remote?.etag === operation.condition.etag);
          const userReviewedObservedRevision =
            remote !== null && remote.etag === reviewedRemoteEtag;
          if (!originalConditionStillHolds && !userReviewedObservedRevision) {
            return {
              status: 'uncertain',
              tripId: id,
              localToken: snapshot.token,
              etag: remote?.etag ?? null,
            };
          }
          // A fresh 404 permits another create guarded by If-None-Match: *.
          // An unchanged ETag permits repeating the original If-Match. A
          // different observed ETag is usable only after the user reviewed it.
          // In every case, the pending operation is replaced only immediately
          // before the next conditional PUT, so a crash cannot erase uncertainty.
          if (remote) retryObservedEtag = remote.etag;
        } else if (
          operation.localToken === snapshot.token &&
          operation.contentHash === contentHash
        ) {
          return {
            status: 'already-current',
            tripId: id,
            localToken: snapshot.token,
            etag: resolved.etag,
          };
        }
      }

      const association = await this.repository.getRemoteAssociation(
        this.origin,
        current.username,
        id,
      );
      const remote = await this.tryReadRemote(id, current.username);
      let condition: RemoteOperation['condition'];
      if (!remote) {
        condition = { kind: 'create' };
      } else if ((await semanticHash(remote.backup)) === contentHash) {
        await this.saveAssociation(current.username, id, snapshot.token, contentHash, remote);
        await this.repository.clearRemoteOperation(this.origin, current.username, id);
        await this.refreshSummaryAfterSave(id, current.username, remote.revision);
        return {
          status: 'already-current',
          tripId: id,
          localToken: snapshot.token,
          etag: remote.etag,
        };
      } else if (association && association.etag === remote.etag) {
        condition = { kind: 'match', etag: remote.etag };
      } else if (reviewedRemoteEtag === remote.etag || retryObservedEtag === remote.etag) {
        condition = { kind: 'match', etag: remote.etag };
      } else {
        return {
          status: 'conflict',
          tripId: id,
          localToken: snapshot.token,
          etag: remote.etag,
        };
      }

      const newOperation: RemoteOperation = {
        apiOrigin: this.origin,
        username: current.username,
        tripId: id,
        localToken: snapshot.token,
        contentHash,
        condition,
        startedAt: new Date().toISOString(),
      };
      // Persist uncertainty before the network write. If the tab closes while
      // awaiting the response, the next list/save can reconcile with a GET.
      await this.repository.putRemoteOperation(newOperation);
      try {
        const saved = await this.client.putTrip(id, body, condition, current.username);
        const readBack: ReadRemoteCopy = {
          backup,
          etag: saved.etag,
          revision: saved.metadata.revision,
        };
        await this.saveAssociation(current.username, id, snapshot.token, contentHash, readBack);
        await this.repository.clearRemoteOperation(this.origin, current.username, id);
        await this.refreshSummaryAfterSave(
          id,
          current.username,
          saved.metadata.revision,
          saved.metadata,
        );
        return {
          status: 'saved',
          tripId: id,
          localToken: snapshot.token,
          etag: saved.etag,
        };
      } catch (error) {
        if (error instanceof RemoteApiError && error.status === 412) {
          let observed: ReadRemoteCopy | null = null;
          try {
            observed = await this.tryReadRemote(id, current.username);
          } catch {
            // A 412 is already a definitive conflict; a failed follow-up read
            // does not turn it into a retry or discard either copy.
          }
          if (observed && (await semanticHash(observed.backup)) === contentHash) {
            // Another delivery of this exact operation may have won the race.
            await this.saveAssociation(current.username, id, snapshot.token, contentHash, observed);
            await this.repository.clearRemoteOperation(this.origin, current.username, id);
            await this.refreshSummaryAfterSave(id, current.username, observed.revision);
            return {
              status: 'saved',
              tripId: id,
              localToken: snapshot.token,
              etag: observed.etag,
            };
          }
          await this.repository.clearRemoteOperation(this.origin, current.username, id);
          return {
            status: 'conflict',
            tripId: id,
            localToken: snapshot.token,
            etag: observed?.etag ?? null,
          };
        }
        if (error instanceof RemoteApiError && error.status < 500) {
          await this.repository.clearRemoteOperation(this.origin, current.username, id);
          throw error;
        }
        // A network failure, timeout, server error, or malformed success
        // response may follow a commit. Keep the operation and inspect by GET.
        let reconciled: ReadRemoteCopy | null = null;
        try {
          reconciled = await this.resolveOperation(newOperation);
        } catch {
          // Retain the durable uncertain operation if verification is offline.
        }
        if (reconciled) {
          await this.refreshSummaryAfterSave(id, current.username, reconciled.revision);
          return {
            status: 'saved',
            tripId: id,
            localToken: snapshot.token,
            etag: reconciled.etag,
          };
        }
        let observed: ReadRemoteCopy | null = null;
        try {
          observed = await this.tryReadRemote(id, current.username);
        } catch {
          // Keep the uncertainty visible when the confirming GET is unavailable.
        }
        return {
          status: 'uncertain',
          tripId: id,
          localToken: snapshot.token,
          etag: observed?.etag ?? null,
        };
      }
    });
  }

  async previewRemote(tripId: string): Promise<RemoteRestorePreview> {
    return this.execute(async () => {
      const current = await this.requireBoundUser();
      const items = await this.client.listTrips(current.username);
      const metadata = items.find((item) => item.id === tripId);
      if (!metadata)
        throw new RemoteApiError(404, 'No encontramos esa copia remota en esta cuenta.');
      const remote = await this.readRemote(tripId, current.username);
      if (metadata.revision !== remote.revision) {
        throw new Error('La copia cambió durante la revisión. Vuelve a abrir la vista previa.');
      }
      const local = await this.cuaderno.snapshot(tripId);
      const preview: RemoteRestorePreview = {
        reviewId: crypto.randomUUID(),
        id: tripId,
        name: remote.backup.data.trip.name,
        updatedAt: metadata.updatedAt,
        revision: remote.revision,
        etag: remote.etag,
        backup: remote.backup,
        localName: local?.data.trip.name ?? null,
        localTokenCaptured: local?.token ?? null,
      };
      this.pending.set(preview);
      return preview;
    });
  }

  cancelRestore(): void {
    this.pending.set(null);
  }

  async confirmRestore(): Promise<void> {
    await this.execute(async () => {
      const current = await this.requireBoundUser();
      const preview = this.pending();
      if (!preview) throw new Error('Abre y revisa una copia remota antes de recuperarla.');
      const remote = await this.readRemote(preview.id, current.username);
      if (
        remote.etag !== preview.etag ||
        (await semanticHash(remote.backup)) !== (await semanticHash(preview.backup))
      ) {
        throw new Error(
          'La copia remota cambió desde la vista previa. Revísala de nuevo antes de recuperar.',
        );
      }
      const restored = await this.cuaderno.restoreCAS(preview.backup, preview.localTokenCaptured);
      await this.saveAssociation(
        current.username,
        preview.id,
        restored.token,
        await semanticHash(preview.backup),
        remote,
      );
      await this.repository.clearRemoteOperation(this.origin, current.username, preview.id);
      this.pending.set(null);
      await this.loadCopies(current);
    });
  }

  async refreshUncertain(): Promise<RemoteCopySummary[]> {
    return this.list();
  }

  private async loadCopies(current: ApiUser): Promise<RemoteCopySummary[]> {
    const operations = await this.repository.listRemoteOperations(this.origin, current.username);
    for (const operation of operations) {
      try {
        await this.resolveOperation(operation);
      } catch {
        // Preserve the uncertain operation and still allow the user to list copies.
      }
    }
    const remoteItems = await this.client.listTrips(current.username);
    const summaries: InternalRemoteCopySummary[] = [];
    for (const item of remoteItems) summaries.push(await this.toSummary(item, current.username));
    const visibleIds = new Set(remoteItems.map((item) => item.id));
    const unresolved = await this.repository.listRemoteOperations(this.origin, current.username);
    for (const operation of unresolved) {
      if (visibleIds.has(operation.tripId)) continue;
      const local = await this.cuaderno.snapshot(operation.tripId);
      const revision =
        operation.condition.kind === 'match' && /^"[1-9]\d*"$/.test(operation.condition.etag)
          ? Number(operation.condition.etag.slice(1, -1))
          : 0;
      summaries.push({
        id: operation.tripId,
        name: local?.data.trip.name ?? 'Copia pendiente de verificación',
        revision: Number.isSafeInteger(revision) ? revision : 0,
        updatedAt: operation.startedAt,
        localStatus: 'uncertain',
        remoteAvailable: false,
        localTokenAtList: local?.token ?? null,
      });
    }
    this.remoteCopies.set(summaries);
    return this.copies();
  }

  private async toSummary(
    item: ApiTripMetadata,
    username: string,
  ): Promise<InternalRemoteCopySummary> {
    const operation = await this.repository.getRemoteOperation(this.origin, username, item.id);
    if (operation) {
      return { ...item, localStatus: 'uncertain', localTokenAtList: null };
    }
    const local = await this.cuaderno.snapshot(item.id);
    if (!local) return { ...item, localStatus: 'not-on-device', localTokenAtList: null };
    const association = await this.repository.getRemoteAssociation(this.origin, username, item.id);
    if (!association) return { ...item, localStatus: 'not-linked', localTokenAtList: local.token };
    if (association.etag !== etagForRevision(item.revision)) {
      return { ...item, localStatus: 'conflict', localTokenAtList: local.token };
    }
    return {
      ...item,
      localStatus: association.localToken === local.token ? 'current' : 'local-changes',
      localTokenAtList: local.token,
    };
  }

  private async readRemote(tripId: string, expectedAccount: string): Promise<ReadRemoteCopy> {
    const response = await this.client.readTrip(tripId, expectedAccount);
    const backup = await validateBackup(response.body);
    if (backup.data.trip.id !== tripId) {
      throw new Error('La copia remota contiene un ID distinto al solicitado.');
    }
    return { backup, etag: response.etag, revision: revisionFromEtag(response.etag) };
  }

  private async tryReadRemote(
    tripId: string,
    expectedAccount: string,
  ): Promise<ReadRemoteCopy | null> {
    try {
      return await this.readRemote(tripId, expectedAccount);
    } catch (error) {
      if (error instanceof RemoteApiError && error.status === 404) return null;
      throw error;
    }
  }

  private async resolveOperation(operation: RemoteOperation): Promise<ReadRemoteCopy | null> {
    const remote = await this.tryReadRemote(operation.tripId, operation.username);
    if (!remote || (await semanticHash(remote.backup)) !== operation.contentHash) return null;
    await this.saveAssociation(
      operation.username,
      operation.tripId,
      operation.localToken,
      operation.contentHash,
      remote,
    );
    await this.repository.clearRemoteOperation(
      operation.apiOrigin,
      operation.username,
      operation.tripId,
    );
    return remote;
  }

  private async saveAssociation(
    username: string,
    tripId: string,
    localToken: string,
    contentHash: string,
    remote: ReadRemoteCopy,
  ): Promise<void> {
    const association: RemoteAssociation = {
      apiOrigin: this.origin,
      username,
      tripId,
      etag: remote.etag,
      localToken,
      contentHash,
      remoteRevision: remote.revision,
    };
    await this.repository.putRemoteAssociation(association);
  }

  private async refreshSummaryAfterSave(
    tripId: string,
    username: string,
    remoteRevision: number,
    metadata?: ApiTripMetadata,
  ): Promise<void> {
    const local = await this.cuaderno.snapshot(tripId);
    const association = await this.repository.getRemoteAssociation(this.origin, username, tripId);
    const operation = await this.repository.getRemoteOperation(this.origin, username, tripId);
    this.remoteCopies.update((copies) => {
      const existing = copies.find((copy) => copy.id === tripId);
      if (!existing && !metadata) return copies;
      const base = metadata ?? existing;
      if (!base) return copies;
      const localStatus: RemoteLocalStatus = operation
        ? 'uncertain'
        : !local
          ? 'not-on-device'
          : !association
            ? 'not-linked'
            : association.etag !== etagForRevision(remoteRevision)
              ? 'conflict'
              : association.localToken === local.token
                ? 'current'
                : 'local-changes';
      const refreshed: InternalRemoteCopySummary = {
        ...base,
        revision: remoteRevision,
        localStatus,
        remoteAvailable: undefined,
        localTokenAtList: local?.token ?? null,
      };
      return existing
        ? copies.map((copy) => (copy.id === tripId ? refreshed : copy))
        : [...copies, refreshed];
    });
  }

  private async updateStatusFor(current: ApiUser): Promise<boolean> {
    const binding = await this.repository.getWorkspaceBinding(this.origin);
    this.setBinding(binding);
    if (!binding) {
      this.status.set('unbound');
      this.remoteCopies.set([]);
      return false;
    }
    if (binding.username !== current.username) {
      this.status.set('blocked');
      this.remoteCopies.set([]);
      this.error.set(this.accountMismatchError(binding.username).message);
      return false;
    }
    this.status.set('ready');
    return true;
  }

  private async requireBoundUser(): Promise<ApiUser> {
    const user = this.user();
    if (!user) {
      this.status.set('signedOut');
      throw new Error('Inicia sesión para usar las copias remotas.');
    }
    const binding = await this.repository.getWorkspaceBinding(this.origin);
    this.setBinding(binding);
    if (!binding) {
      this.status.set('unbound');
      throw new Error(
        'Vincula este perfil local a la cuenta antes de listar, guardar o recuperar.',
      );
    }
    if (binding.username !== user.username) {
      this.status.set('blocked');
      this.remoteCopies.set([]);
      throw this.accountMismatchError(binding.username);
    }
    this.status.set('ready');
    return { username: user.username };
  }

  private accountMismatchError(boundUsername: string): Error {
    return new Error(
      `Este perfil local está vinculado a ${boundUsername}. Para usar otra cuenta, abre un perfil de navegador separado.`,
    );
  }

  private setBinding(binding: WorkspaceBinding | undefined): void {
    this.workspaceBinding.set(
      binding ? { apiOrigin: binding.apiOrigin, username: binding.username } : null,
    );
  }

  private async execute<T>(work: () => Promise<T>): Promise<T> {
    this.busy.set(true);
    this.error.set(null);
    try {
      return await work();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No pudimos completar la operación. Tu cuaderno local se conserva.';
      this.error.set(message);
      if (error instanceof RemoteApiError && error.status === 401) {
        this.user.set(null);
        this.status.set('signedOut');
        this.remoteCopies.set([]);
      }
      if (
        error instanceof RemoteApiError &&
        error.status === 409 &&
        error.code === 'workspace_account_mismatch'
      ) {
        this.user.set(null);
        this.status.set('blocked');
        this.remoteCopies.set([]);
        this.pending.set(null);
      }
      if (
        error instanceof RemoteNetworkError ||
        (error instanceof RemoteApiError && error.status >= 500)
      ) {
        this.status.set('unavailable');
      } else if (this.status() === 'loading') {
        this.status.set('error');
      }
      throw error;
    } finally {
      this.busy.set(false);
    }
  }
}
