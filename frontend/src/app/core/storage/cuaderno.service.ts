import { Injectable, signal } from '@angular/core';
import { Backup, NoteInput, TripData } from '../domain/model';

@Injectable({ providedIn: 'root' })
export class CuadernoService {
  readonly data = signal<TripData | null>(null);
  readonly loading = signal(true);
  private readonly repository = import('./trip-repository').then(
    ({ TripRepository }) => new TripRepository(),
  );
  async load() {
    try {
      this.data.set((await (await this.repository).all())[0] ?? null);
    } finally {
      this.loading.set(false);
    }
  }
  async seedPreview(): Promise<Backup> {
    const response = await fetch('seed.json');
    if (!response.ok) throw new Error('No pudimos leer el plan de referencia.');
    const { validateBackup } = await import('../domain/validation');
    return validateBackup(await response.json());
  }
  async importSeed(backup: Backup) {
    this.data.set(await (await this.repository).importSeed(backup));
  }
  async save(input: NoteInput) {
    const data = this.data();
    if (!data) throw new Error('Importa primero tu plan.');
    this.data.set(await (await this.repository).saveNote(data.trip.id, input));
  }
  async restore(backup: Backup) {
    this.data.set(await (await this.repository).restore(backup));
  }
  export() {
    const data = this.data();
    if (!data) throw new Error('No hay cuaderno para respaldar.');
    const backup: Backup = {
      format: 'cuaderno-austral-backup',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = `bitacora-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
