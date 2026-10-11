import { Component, computed, inject, signal, viewChild, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SwUpdate } from '@angular/service-worker';
import { CuadernoService } from './core/storage/cuaderno.service';
import {
  Backup,
  DiaryEntry,
  NoteInput,
  PlannedDay,
  actualKm,
  dayKm,
  dayName,
  plannedDays,
} from './core/domain/model';
import { NoteForm } from './features/diary/note-form';
import { DayDetail } from './features/trip/day-detail';
import { dateLabel, distance } from './shared/display';

@Component({
  imports: [FormsModule, NoteForm, DayDetail],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnInit, OnDestroy {
  readonly cuaderno = inject(CuadernoService);
  private readonly updates = inject(SwUpdate);
  readonly form = viewChild(NoteForm);
  readonly error = signal('');
  readonly message = signal('');
  readonly busy = signal(false);
  readonly pending = signal<Backup | null>(null);
  readonly pendingType = signal<'seed' | 'restore'>('seed');
  readonly block = signal(0);
  readonly openId = signal<string | null>(null);
  readonly note = signal<NoteInput | null>(null);
  readonly online = signal(navigator.onLine);
  readonly offlineReady = signal(false);
  readonly updateReady = signal(false);
  readonly days = computed(() => (this.cuaderno.data() ? plannedDays(this.cuaderno.data()!) : []));
  readonly blocks = computed(() =>
    Array.from({ length: Math.ceil(this.days().length / 7) }, (_, i) => i),
  );
  readonly visible = computed(() => this.days().slice(this.block() * 7, this.block() * 7 + 7));
  readonly estimated = computed(() =>
    this.days().some((d) => dayKm(d) === null)
      ? null
      : this.days().reduce((s, d) => s + (dayKm(d) ?? 0), 0),
  );
  readonly real = computed(() => (this.cuaderno.data() ? actualKm(this.cuaderno.data()!) : 0));
  readonly byDate = computed(() =>
    Object.fromEntries((this.cuaderno.data()?.actualDays ?? []).map((d) => [d.date, d.cyclingKm])),
  );
  readonly noteStageName = computed(
    () =>
      this.note()
        ?.stageIds.map((id) => this.cuaderno.data()?.stages.find((s) => s.id === id)?.name)
        .join(' · ') ?? '',
  );
  readonly dateLabel = dateLabel;
  readonly distance = distance;
  readonly dayKm = dayKm;
  readonly dayName = dayName;
  readonly Math = Math;
  readonly kinds = {
    arrival: 'Llegada',
    cycling: 'Pedaleo',
    ferry: 'Cruce y pedaleo',
    rest: 'Descanso',
    transfer: 'Traslado',
    buffer: 'Margen',
    packing: 'Embalaje',
    flight: 'Vuelo',
    other: 'Actividad',
  };
  private network = () => this.online.set(navigator.onLine);
  ngOnInit(): void {
    void this.initialize();
  }
  private async initialize(): Promise<void> {
    window.addEventListener('online', this.network);
    window.addEventListener('offline', this.network);
    this.updates.versionUpdates.subscribe((e) => {
      if (e.type === 'VERSION_READY') this.updateReady.set(true);
    });
    this.updates.unrecoverable.subscribe(() =>
      this.error.set(
        'La aplicación necesita recargarse. Exporta tu copia si puedes; los datos locales no se borran.',
      ),
    );
    try {
      await this.cuaderno.load();
      await this.checkOffline();
    } catch (e) {
      this.fail(e);
    }
  }
  ngOnDestroy() {
    window.removeEventListener('online', this.network);
    window.removeEventListener('offline', this.network);
  }
  private fail(error: unknown) {
    this.error.set(
      error instanceof Error
        ? error.message
        : 'No pudimos completar la operación. Intenta nuevamente.',
    );
  }
  async action(work: () => Promise<void>) {
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await work();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }
  previewSeed() {
    return this.action(async () => {
      this.pendingType.set('seed');
      this.pending.set(await this.cuaderno.seedPreview());
    });
  }
  async readBackup(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.action(async () => {
      if (file.size > 10 * 1024 * 1024)
        throw new Error('El respaldo supera 10 MB. No se cambió tu copia.');
      const parsed: unknown = JSON.parse(await file.text());
      const { validateBackup } = await import('./core/domain/validation');
      this.pendingType.set('restore');
      this.pending.set(await validateBackup(parsed));
    });
  }
  confirm() {
    return this.action(async () => {
      const backup = this.pending();
      if (!backup) return;
      if (this.pendingType() === 'seed') await this.cuaderno.importSeed(backup);
      else await this.cuaderno.restore(backup);
      this.pending.set(null);
      this.block.set(0);
      this.openId.set(null);
      this.message.set('Guardado en este dispositivo');
      await this.checkOffline();
    });
  }
  export() {
    try {
      this.cuaderno.export();
      this.error.set('');
      this.message.set('Respaldo descargado. Guárdalo en un lugar privado.');
    } catch (e) {
      this.fail(e);
    }
  }
  setBlock(value: number) {
    this.block.set(value);
    this.openId.set(null);
  }
  selectDate(value: string) {
    const i = this.days().findIndex((d) => d.date === value);
    if (i >= 0) {
      this.block.set(Math.floor(i / 7));
      this.openId.set(this.days()[i].id);
    }
  }
  toggle(id: string) {
    this.openId.update((current) => (current === id ? null : id));
  }
  startNote(day: PlannedDay, entry?: DiaryEntry) {
    const actual = entry
      ? this.cuaderno.data()?.actualDays.find((d) => d.id === entry.actualDayId)
      : this.cuaderno.data()?.actualDays.find((d) => d.date === day.date);
    this.note.set({
      date: actual?.date ?? day.date,
      cyclingKm: actual?.cyclingKm ?? null,
      text: entry?.text ?? '',
      stageIds: entry?.stageIds ?? day.segments.map((s) => s.stageId),
      ...(entry ? { entryId: entry.id } : {}),
    });
    this.error.set('');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  save(input: NoteInput) {
    return this.action(async () => {
      await this.cuaderno.save(input);
      this.form()?.clearDraft();
      this.note.set(null);
      this.message.set('Guardado en este dispositivo');
    });
  }
  async checkOffline() {
    if (!this.updates.isEnabled || !this.cuaderno.data() || !('serviceWorker' in navigator)) return;
    const cacheNames = await caches.keys();
    this.offlineReady.set(
      !!navigator.serviceWorker.controller &&
        cacheNames.some((n) => n.includes('ngsw') && n.includes('app')),
    );
  }
  refresh() {
    if (!this.note()) location.reload();
  }
}
