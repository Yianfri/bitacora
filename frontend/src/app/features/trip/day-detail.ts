import { Component, computed, input, output } from '@angular/core';
import { PlannedDay, TripData, DiaryEntry, dayKm, dayName } from '../../core/domain/model';
import { dateLabel, money, distance } from '../../shared/display';

@Component({
  selector: 'app-day-detail',
  template: ` <div class="detail">
    <div class="section-top">
      <div>
        <p class="eyebrow">{{ dateLabel(day().date, true) }}</p>
        <h3>{{ name() }}</h3>
      </div>
      <span class="km">{{ distance(dayKm(day())) }}</span>
    </div>
    <p class="muted">{{ day().logistics.difficultyText }} · {{ day().logistics.surfaceText }}</p>
    <div class="logistics-grid">
      <section>
        <h4>Dónde dormir</h4>
        <p>{{ day().logistics.lodgingCandidate || 'Por definir' }}</p>
        <p class="status-tag">{{ day().logistics.lodgingStatusText || 'Sin confirmar' }}</p>
      </section>
      <section>
        <h4>Traslados y cruces</h4>
        <p>{{ day().logistics.transportNotes || 'Sin información' }}</p>
        <p class="status-tag">{{ day().logistics.transportStatusText || 'Sin confirmar' }}</p>
      </section>
    </div>
    <section>
      <h4>Abastecimiento</h4>
      <p>{{ day().logistics.supplyNotes || 'Por definir' }}</p>
    </section>
    <details>
      <summary>Plan B y presupuesto estimado · {{ money(day().budgetEstimateClp.total) }}</summary>
      <p>{{ day().logistics.alternativeNotes }}</p>
      <dl class="budget">
        <div>
          <dt>Alojamiento</dt>
          <dd>{{ money(day().budgetEstimateClp.lodging) }}</dd>
        </div>
        <div>
          <dt>Comida</dt>
          <dd>{{ money(day().budgetEstimateClp.food) }}</dd>
        </div>
        <div>
          <dt>Transporte</dt>
          <dd>{{ money(day().budgetEstimateClp.transport) }}</dd>
        </div>
        <div>
          <dt>Otros</dt>
          <dd>{{ money(day().budgetEstimateClp.other) }}</dd>
        </div>
      </dl>
    </details>
    <details>
      <summary>Mapa y procedencia</summary>
      <p class="muted">
        Mapa integrado pendiente. Las localidades y pernoctas aún no tienen coordenadas verificadas.
      </p>
      @if (day().logistics.referenceMapUrl) {
        <a [href]="day().logistics.referenceMapUrl" target="_blank" rel="noopener noreferrer"
          >Abrir referencia en Google Maps ↗</a
        >
      }
      <p class="hint">
        Referencia entre localidades; no representa un trazado ciclable ni una pernocta confirmada.
      </p>
      <p class="hint">Origen: {{ day().sourceRef?.path }} · {{ day().sourceRef?.sourceId }}</p>
    </details>
    <section class="diary">
      <div class="section-top">
        <h4>Mi diario</h4>
        <button class="primary" (click)="note.emit()">Anotar este día</button>
      </div>
      @if (entries().length === 0) {
        <p class="muted">Todavía no hay notas vinculadas a esta etapa.</p>
      }
      @for (entry of entries(); track entry.id) {
        <article class="entry">
          <p class="hint">{{ actualDate(entry) }}</p>
          <p class="note-text">{{ entry.text }}</p>
          <button class="text-button" (click)="edit.emit(entry)">Editar nota</button>
        </article>
      }
    </section>
    <button class="text-button" (click)="close.emit()">Cerrar detalle ↑</button>
  </div>`,
  styles: `
    .detail {
      padding: 24px;
      border-top: 1px solid var(--line);
      background: var(--tint);
    }
    h3 {
      font-size: 1.3rem;
      margin: 8px 0;
    }
    h4 {
      margin: 12px 0;
      font-size: 1rem;
    }
    .logistics-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .logistics-grid section {
      background: var(--paper);
      padding: 16px;
      border-radius: var(--radius);
    }
    .status-tag {
      color: var(--warning-ink);
      font-size: 0.85rem;
    }
    details {
      border-top: 1px solid var(--line);
      padding: 14px 0;
    }
    summary {
      cursor: pointer;
      min-height: 28px;
    }
    .budget {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .budget div {
      display: flex;
      justify-content: space-between;
      gap: 10px;
    }
    dd {
      margin: 0;
    }
    .entry {
      padding: 12px 0;
      border-bottom: 1px solid var(--line);
    }
    .note-text {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .hint {
      font-size: 0.85rem;
      color: var(--muted);
    }
    .km {
      font-size: 1.1rem;
      font-weight: 700;
      white-space: nowrap;
    }
    .diary {
      padding: 10px 0;
    }
    @media (max-width: 620px) {
      .detail {
        padding: 16px;
      }
      .logistics-grid,
      .budget {
        grid-template-columns: 1fr;
      }
      .section-top {
        flex-wrap: wrap;
      }
    }
  `,
})
export class DayDetail {
  readonly day = input.required<PlannedDay>();
  readonly data = input.required<TripData>();
  readonly note = output<void>();
  readonly edit = output<DiaryEntry>();
  readonly close = output<void>();
  readonly name = computed(() => dayName(this.day(), this.data()));
  readonly entries = computed(() =>
    this.data().diaryEntries.filter((n) =>
      n.stageIds.some((id) => this.day().segments.some((s) => s.stageId === id)),
    ),
  );
  readonly dateLabel = dateLabel;
  readonly money = money;
  readonly distance = distance;
  readonly dayKm = dayKm;
  actualDate(entry: DiaryEntry) {
    const date = this.data().actualDays.find((d) => d.id === entry.actualDayId)?.date;
    return date ? dateLabel(date, true) : '';
  }
}
