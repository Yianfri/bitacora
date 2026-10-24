import { Injectable, signal } from '@angular/core';
import { Backup, NoteInput, TripData } from '../domain/model';
import type { LocalTripSnapshot } from './trip-repository';

@Injectable({ providedIn: 'root' })
export class CuadernoService {
  readonly data = signal<TripData | null>(null);
  readonly localToken = signal<string | null>(null);
  readonly loading = signal(true);
  private readonly repository = import('./trip-repository').then(
    ({ TripRepository }) => new TripRepository(),
  );
  async load() {
    try {
      const first = (await (await this.repository).all())[0] ?? null;
      if (!first) {
        this.data.set(null);
        this.localToken.set(null);
        return;
      }
      const snapshot = await (await this.repository).snapshot(first.trip.id);
      this.data.set(snapshot?.data ?? first);
      this.localToken.set(snapshot?.token ?? null);
    } finally {
      this.loading.set(false);
    }
  }
  async seedPreview(): Promise<Backup> {
    const response = await fetch('seed.json');
    if (!response.ok) throw new Error('No pudimos leer el plan de referencia.');
    const { validateBackup } = await import('../domain/validation');
    const raw: unknown = await response.json();
    return validateBackup(raw);
  }
  async importSeed(backup: Backup) {
    const repository = await this.repository;
    const data = await repository.importSeed(backup);
    const snapshot = await repository.snapshot(data.trip.id);
    this.data.set(snapshot?.data ?? data);
    this.localToken.set(snapshot?.token ?? null);
  }
  async save(input: NoteInput) {
    const data = this.data();
    if (!data) throw new Error('Importa primero tu plan.');
    const repository = await this.repository;
    const saved = await repository.saveNote(data.trip.id, input);
    const snapshot = await repository.snapshot(data.trip.id);
    this.data.set(snapshot?.data ?? saved);
    this.localToken.set(snapshot?.token ?? null);
  }
  async restore(backup: Backup) {
    const repository = await this.repository;
    const restored = await repository.restore(backup);
    const snapshot = await repository.snapshot(restored.trip.id);
    this.data.set(snapshot?.data ?? restored);
    this.localToken.set(snapshot?.token ?? null);
  }
  async snapshot(tripId?: string): Promise<LocalTripSnapshot | null> {
    const displayedId = this.data()?.trip.id;
    const id = tripId ?? displayedId;
    const snapshot = await (await this.repository).snapshot(id);
    if (snapshot && (!displayedId || displayedId === snapshot.data.trip.id)) {
      this.data.set(snapshot.data);
      this.localToken.set(snapshot.token);
    }
    return snapshot;
  }
  async restoreCAS(backup: Backup, expectedToken: string | null): Promise<LocalTripSnapshot> {
    const restored = await (await this.repository).restoreCAS(backup, expectedToken);
    this.data.set(restored.data);
    this.localToken.set(restored.token);
    return restored;
  }
  async export(): Promise<void> {
    const snapshot = await this.snapshot();
    if (!snapshot) throw new Error('No hay cuaderno para respaldar.');
    const backup = snapshot.backup;
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = `routale-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
