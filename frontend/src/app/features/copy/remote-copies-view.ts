import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Backup, TripData } from '../../core/domain/model';

export type RemoteSessionStatus =
  'loading' | 'signedOut' | 'unbound' | 'ready' | 'blocked' | 'error';
export type RemoteLocalStatus =
  'not-on-device' | 'not-linked' | 'current' | 'local-changes' | 'uncertain' | 'conflict';

export interface RemoteCopySummary {
  id: string;
  name: string;
  updatedAt: string;
  revision: number;
  localStatus: RemoteLocalStatus;
  remoteAvailable?: boolean;
}

export interface RemoteRestorePreview {
  id: string;
  name: string;
  updatedAt: string;
  revision: number;
  etag: string;
  backup: Backup;
  localName: string | null;
}

export interface RemoteLoginDetails {
  username: string;
  password: string;
}

@Component({
  imports: [FormsModule],
  selector: 'app-remote-copies-view',
  styleUrl: './remote-copies-view.css',
  templateUrl: './remote-copies-view.html',
})
export class RemoteCopiesView {
  readonly status = input.required<RemoteSessionStatus>();
  readonly userName = input<string | null>(null);
  readonly boundUserName = input<string | null>(null);
  readonly localTrip = input<TripData | null>(null);
  readonly copies = input<RemoteCopySummary[]>([]);
  readonly pending = input<RemoteRestorePreview | null>(null);
  readonly busy = input(false);
  readonly online = input(true);
  readonly error = input<string | null>(null);

  readonly login = output<RemoteLoginDetails>();
  readonly logout = output<void>();
  readonly bindWorkspace = output<void>();
  readonly retry = output<void>();
  readonly refresh = output<void>();
  readonly saveCurrent = output<string | null>();
  readonly review = output<string>();
  readonly confirmRestore = output<void>();
  readonly cancelRestore = output<void>();
  readonly exportCurrent = output<void>();

  usernameValue = '';
  passwordValue = '';
  bindingConfirmed = false;
  readonly reviewedConflictId = signal<string | null>(null);
  readonly reviewedConflictEtag = signal<string | null>(null);
  readonly reviewedConflictRevision = signal<number | null>(null);
  readonly currentRemoteCopy = computed(() => {
    const tripId = this.localTrip()?.trip.id;
    return tripId ? (this.copies().find((copy) => copy.id === tripId) ?? null) : null;
  });
  readonly saveBlockReason = computed(() => {
    const copy = this.currentRemoteCopy();
    const tripId = this.localTrip()?.trip.id;
    if (!copy || !tripId) return null;
    if (
      (copy.localStatus === 'conflict' ||
        (copy.localStatus === 'uncertain' && copy.remoteAvailable !== false)) &&
      (this.reviewedConflictId() !== tripId ||
        this.reviewedConflictRevision() !== copy.revision ||
        !this.reviewedConflictEtag())
    )
      return 'Revisa primero la copia de la cuenta antes de volver a guardar.';
    return null;
  });

  submitLogin(): void {
    const username = this.usernameValue.trim();
    const password = this.passwordValue;
    if (!username || !password) return;
    this.passwordValue = '';
    this.bindingConfirmed = false;
    this.login.emit({ username, password });
  }

  startBinding(): void {
    if (!this.bindingConfirmed) return;
    this.bindingConfirmed = false;
    this.bindWorkspace.emit();
  }

  refreshCopies(): void {
    this.clearConflictReview();
    this.refresh.emit();
  }

  reviewCopy(id: string): void {
    this.clearConflictReview();
    this.review.emit(id);
  }

  saveLocalCopy(): void {
    const copy = this.currentRemoteCopy();
    const reviewed =
      copy &&
      this.reviewedConflictId() === copy.id &&
      this.reviewedConflictRevision() === copy.revision;
    this.saveCurrent.emit(reviewed ? this.reviewedConflictEtag() : null);
  }

  cancelReview(): void {
    const pending = this.pending();
    if (pending && this.currentRemoteCopy()?.id === pending.id) {
      this.reviewedConflictId.set(pending.id);
      this.reviewedConflictEtag.set(pending.etag);
      this.reviewedConflictRevision.set(pending.revision);
    }
    this.cancelRestore.emit();
  }

  private clearConflictReview(): void {
    this.reviewedConflictId.set(null);
    this.reviewedConflictEtag.set(null);
    this.reviewedConflictRevision.set(null);
  }

  localStatusLabel(status: RemoteLocalStatus): string {
    switch (status) {
      case 'not-on-device':
        return 'Solo en la cuenta';
      case 'not-linked':
        return 'Sin vínculo con este cuaderno';
      case 'current':
        return 'La copia remota coincide con la versión guardada';
      case 'local-changes':
        return 'Hay cambios locales posteriores';
      case 'uncertain':
        return 'Resultado remoto por comprobar';
      case 'conflict':
        return 'La copia remota cambió desde la última revisión';
    }
  }

  localDateLabel(value: string): string {
    return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(
      new Date(`${value}T12:00:00`),
    );
  }

  remoteDateLabel(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'fecha no disponible';
    return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(
      date,
    );
  }

  visibleError(message: string): string {
    if (
      /\bAPI\b|\bHTTP\b|\bCSRF\b|antiforgery|ETag|condición de revisión|revisión remota/i.test(
        message,
      )
    ) {
      return 'No pudimos completar esta acción. Tu cuaderno local se conserva. Comprueba la conexión e inténtalo de nuevo.';
    }
    return message;
  }
}
