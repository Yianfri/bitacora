import { Component, computed, inject, signal, viewChild, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SwUpdate } from '@angular/service-worker';
import { CuadernoService } from './core/storage/cuaderno.service';
import {
  Backup,
  DiaryEntry,
  NoteInput,
  PlannedDay,
  dayKm,
  dayName,
  plannedDays,
} from './core/domain/model';
import { NoteForm } from './features/diary/note-form';
import { DiaryGroup, DiaryView } from './features/diary/diary-view';
import { CopyView } from './features/copy/copy-view';
import { DayDetail } from './features/trip/day-detail';
import { dateLabel, distance } from './shared/display';
import { PwaInstallService, PWA_INSTALL_GUIDANCE } from './shared/pwa-install';

type Section = 'day' | 'itinerary' | 'diary' | 'copy';

@Component({
  imports: [FormsModule, NoteForm, DayDetail, DiaryView, CopyView],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnInit, OnDestroy {
  readonly cuaderno = inject(CuadernoService);
  readonly pwaInstall = inject(PwaInstallService);
  private readonly updates = inject(SwUpdate);
  readonly form = viewChild(NoteForm);
  readonly error = signal('');
  readonly message = signal('');
  readonly busy = signal(false);
  readonly pending = signal<Backup | null>(null);
  readonly pendingType = signal<'seed' | 'restore'>('seed');
  readonly block = signal(0);
  readonly openId = signal<string | null>(null);
  readonly section = signal<Section>('day');
  readonly returnSection = signal<Section>('day');
  readonly note = signal<NoteInput | null>(null);
  readonly online = signal(navigator.onLine);
  readonly offlineReady = signal(false);
  readonly updateReady = signal(false);
  readonly coverUnavailable = signal(false);
  readonly installGuidance = PWA_INSTALL_GUIDANCE;
  readonly days = computed(() => {
    const data = this.cuaderno.data();
    return data ? plannedDays(data) : [];
  });
  readonly blocks = computed(() =>
    Array.from({ length: Math.ceil(this.days().length / 7) }, (_, i) => i),
  );
  readonly visible = computed(() => this.days().slice(this.block() * 7, this.block() * 7 + 7));
  readonly selectedDay = computed(
    () => this.days().find((day) => day.id === this.openId()) ?? null,
  );
  readonly selectedIndex = computed(() => this.days().findIndex((day) => day.id === this.openId()));
  readonly selectedOrdinal = computed(() => this.selectedIndex() + 1);
  readonly byDate = computed(() =>
    Object.fromEntries(
      (this.cuaderno.data()?.actualDays ?? []).map((day) => [day.date, day.cyclingKm]),
    ),
  );
  readonly diaryGroups = computed<DiaryGroup[]>(() => {
    const data = this.cuaderno.data();
    if (!data) return [];
    const groups = new Map<string, DiaryGroup>();
    for (const entry of data.diaryEntries) {
      const actual = data.actualDays.find((day) => day.id === entry.actualDayId);
      if (!actual) continue;
      const group = groups.get(actual.date) ?? {
        date: actual.date,
        cyclingKm: actual.cyclingKm,
        entries: [],
      };
      group.entries.push(entry);
      groups.set(actual.date, group);
    }
    return [...groups.values()].sort((left, right) => right.date.localeCompare(left.date));
  });
  readonly noteStageName = computed(
    () =>
      this.note()
        ?.stageIds.map((id) => this.cuaderno.data()?.stages.find((stage) => stage.id === id)?.name)
        .filter((name): name is string => !!name)
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
    this.updates.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') this.updateReady.set(true);
    });
    this.updates.unrecoverable.subscribe(() =>
      this.error.set(
        'La aplicación necesita recargarse. Exporta tu copia si puedes; los datos locales no se borran.',
      ),
    );
    try {
      await this.cuaderno.load();
      this.selectInitialDay();
      await this.checkOffline();
    } catch (error) {
      this.fail(error);
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.network);
    window.removeEventListener('offline', this.network);
  }

  private selectInitialDay(): void {
    const first = this.days()[0];
    if (first && !this.openId()) this.openId.set(first.id);
  }

  private fail(error: unknown): void {
    this.error.set(
      error instanceof Error
        ? error.message
        : 'No pudimos completar la operación. Intenta nuevamente.',
    );
  }

  async action(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await work();
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(false);
    }
  }

  previewSeed(): Promise<void> {
    return this.action(async () => {
      this.pendingType.set('seed');
      this.pending.set(await this.cuaderno.seedPreview());
    });
  }

  async readBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
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

  confirm(): Promise<void> {
    return this.action(async () => {
      const backup = this.pending();
      if (!backup) return;
      if (this.pendingType() === 'seed') await this.cuaderno.importSeed(backup);
      else await this.cuaderno.restore(backup);
      this.pending.set(null);
      this.block.set(0);
      this.openId.set(this.days()[0]?.id ?? null);
      this.section.set('day');
      this.message.set('Guardado en este dispositivo');
      window.scrollTo({ top: 0, behavior: 'instant' });
      await this.checkOffline();
    });
  }

  export(): void {
    try {
      this.cuaderno.export();
      this.error.set('');
      this.message.set('Respaldo descargado. Guárdalo en un lugar privado.');
    } catch (error) {
      this.fail(error);
    }
  }

  async installApp(): Promise<void> {
    const result = await this.pwaInstall.install();
    if (result === 'accepted') this.message.set('Instalación iniciada en este dispositivo.');
    else if (result === 'dismissed')
      this.message.set('La instalación quedó pendiente. Puedes probar de nuevo desde Mi copia.');
    else this.message.set(this.installGuidance);
  }

  goTo(section: Section): void {
    this.section.set(section);
    this.error.set('');
    this.message.set('');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  checkPreparation(): void {
    void this.action(() => this.checkOffline());
  }

  setBlock(value: number): void {
    const lastBlock = Math.max(0, this.blocks().length - 1);
    this.block.set(Math.min(Math.max(value, 0), lastBlock));
  }

  selectDate(value: string): void {
    const day = this.days().find((candidate) => candidate.date === value);
    if (day) this.selectDay(day.id);
  }

  selectDay(id: string): void {
    const index = this.days().findIndex((day) => day.id === id);
    if (index < 0) return;
    this.block.set(Math.floor(index / 7));
    this.openId.set(id);
    this.message.set('');
    if (window.matchMedia('(max-width: 799px)').matches) {
      this.section.set('day');
      window.requestAnimationFrame(() => document.getElementById('selected-day-title')?.focus());
    }
  }

  toggle(id: string): void {
    this.selectDay(id);
  }

  moveDay(offset: -1 | 1): void {
    const days = this.days();
    if (!days.length) return;
    const current = this.selectedIndex();
    const next = current < 0 ? (offset > 0 ? 0 : days.length - 1) : current + offset;
    if (next >= 0 && next < days.length) this.selectDay(days[next].id);
  }

  closeDetail(): void {
    this.openId.set(null);
    if (window.matchMedia('(max-width: 799px)').matches) this.section.set('itinerary');
  }

  startNote(day: PlannedDay, entry?: DiaryEntry): void {
    const actual = entry
      ? this.cuaderno.data()?.actualDays.find((candidate) => candidate.id === entry.actualDayId)
      : this.cuaderno.data()?.actualDays.find((candidate) => candidate.date === day.date);
    this.returnSection.set(this.section());
    this.note.set({
      date: actual?.date ?? day.date,
      cyclingKm: actual?.cyclingKm ?? null,
      text: entry?.text ?? '',
      stageIds: entry?.stageIds ?? day.segments.map((segment) => segment.stageId),
      ...(entry ? { entryId: entry.id } : {}),
    });
    this.error.set('');
    this.message.set('');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  editEntry(entry: DiaryEntry): void {
    const data = this.cuaderno.data();
    const actual = data?.actualDays.find((day) => day.id === entry.actualDayId);
    if (!data || !actual) {
      this.error.set('No encontramos la jornada real de esta nota. Tu copia no cambió.');
      return;
    }
    this.returnSection.set(this.section());
    this.note.set({
      date: actual.date,
      cyclingKm: actual.cyclingKm,
      text: entry.text,
      stageIds: entry.stageIds,
      entryId: entry.id,
    });
    this.error.set('');
    this.message.set('');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  closeNote(): void {
    this.note.set(null);
    this.error.set('');
    this.section.set(this.returnSection());
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  save(input: NoteInput): Promise<void> {
    return this.action(async () => {
      await this.cuaderno.save(input);
      this.form()?.clearDraft();
      this.note.set(null);
      this.section.set(this.returnSection());
      this.message.set('Guardado en este dispositivo');
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  async checkOffline(): Promise<void> {
    if (!this.updates.isEnabled || !this.cuaderno.data() || !('serviceWorker' in navigator)) return;
    const cacheNames = await caches.keys();
    this.offlineReady.set(
      !!navigator.serviceWorker.controller &&
        cacheNames.some((name) => name.includes('ngsw') && name.includes('app')),
    );
  }

  refresh(): void {
    if (!this.note()) location.reload();
  }
}
