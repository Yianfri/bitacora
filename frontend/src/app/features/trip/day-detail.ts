import { Component, computed, input, output } from '@angular/core';
import { PlannedDay, TripData, DiaryEntry } from '../../core/domain/model';
import { dateLabel, money, distance } from '../../shared/display';

@Component({
  selector: 'app-day-detail',
  template: `<div class="detail">
    <div class="logistics-grid">
      <section class="logistics-item" aria-labelledby="lodging-title">
        <span class="icon-disc" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M3 18V6m0 10h18v2M6 13h12a3 3 0 0 1 3 3v1H6v-4Zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"
            />
          </svg>
        </span>
        <div class="logistics-copy">
          <h2 id="lodging-title">Dónde dormir</h2>
          <p class="logistics-value">{{ day().logistics.lodgingCandidate || 'Por definir' }}</p>
          <p class="status-line">
            <span class="status-dot"></span
            >{{ day().logistics.lodgingStatusText || 'Sin confirmar' }}
          </p>
        </div>
      </section>

      <section class="logistics-item" aria-labelledby="supply-title">
        <span class="icon-disc" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M4 9h16l-1.4 10H5.4L4 9Zm4 0 3-5m5 5-3-5m-3 9v3m5-3v3" />
          </svg>
        </span>
        <div class="logistics-copy">
          <h2 id="supply-title">Abastecimiento</h2>
          <p class="logistics-value">{{ day().logistics.supplyNotes || 'Por definir' }}</p>
        </div>
      </section>
    </div>

    <div class="distance-summary" role="group" aria-label="Kilómetros reales por fecha">
      <div class="distance-item">
        <span>Kilómetros reales · {{ dateLabel(day().date) }}</span>
        <strong>
          @if (actualDay(); as recordedDay) {
            {{ recordedDay.cyclingKm === null ? 'Sin registrar' : distance(recordedDay.cyclingKm) }}
          } @else {
            Sin registrar
          }
        </strong>
      </div>
      <p class="distance-note">La distancia real se registra por fecha en el diario.</p>
    </div>

    <section class="transport-row" aria-labelledby="transport-title">
      <span class="icon-plain" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M5 17V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10M5 12h14M7 17v2m10-2v2M8 8h8" />
          <circle cx="8" cy="15" r="1" />
          <circle cx="16" cy="15" r="1" />
        </svg>
      </span>
      <div>
        <h2 id="transport-title">Traslados y cruces</h2>
        <p>{{ day().logistics.transportNotes || 'Por definir' }}</p>
        <p class="status-line">
          <span class="status-dot"></span
          >{{ day().logistics.transportStatusText || 'Estado sin registrar' }}
        </p>
      </div>
    </section>

    <dl class="conditions" aria-label="Condiciones de la jornada">
      <div>
        <dt>Superficie</dt>
        <dd>{{ day().logistics.surfaceText || 'Por definir' }}</dd>
      </div>
      <div>
        <dt>Dificultad</dt>
        <dd>{{ day().logistics.difficultyText || 'Por definir' }}</dd>
      </div>
    </dl>

    <details class="secondary-details">
      <summary>
        <span class="icon-plain" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M6 3.5h9l4 4V21H6a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
            <path d="M14 4v5h5M8 13h8m-8 4h8" />
          </svg>
        </span>
        Plan B, presupuesto y procedencia
      </summary>
      <div class="secondary-content">
        <section aria-labelledby="plan-b-title">
          <h2 id="plan-b-title">Plan B</h2>
          <p>{{ day().logistics.alternativeNotes || 'Sin registrar' }}</p>
        </section>
        <section aria-labelledby="budget-title">
          <h2 id="budget-title">Presupuesto estimado</h2>
          <p class="budget-total">{{ money(day().budgetEstimateClp.total) }}</p>
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
        </section>
        <section aria-labelledby="source-title">
          <h2 id="source-title">Procedencia</h2>
          @if (day().sourceRef) {
            <p>{{ day().sourceRef?.path }} · {{ day().sourceRef?.sourceId }}</p>
          } @else {
            <p>Sin registrar</p>
          }
          @if (day().logistics.referenceMapUrl) {
            <p>
              <a [href]="day().logistics.referenceMapUrl" target="_blank" rel="noopener noreferrer">
                Abrir referencia externa en Google Maps ↗
              </a>
            </p>
            <p class="hint">
              Es una referencia externa; no representa un trazado ni confirma una reserva.
            </p>
          }
        </section>
      </div>
    </details>

    <section class="diary" aria-labelledby="diary-title">
      <header class="diary-heading">
        <div class="diary-title">
          <span class="icon-plain" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M5 4.5h14A2.5 2.5 0 0 1 21.5 7v13H7a3 3 0 0 1-3-3V6.5a2 2 0 0 1 2-2Z" />
              <path d="M7 4.5v13m4-8h6m-6 4h6" />
            </svg>
          </span>
          <div>
            <p class="eyebrow">Tu diario</p>
            <h2 id="diary-title">Diario de esta jornada</h2>
          </div>
        </div>
      </header>

      @if (entries().length === 0) {
        <p class="empty-diary">Todavía no hay notas vinculadas a esta jornada.</p>
      }
      @for (entry of entries(); track entry.id) {
        <article class="entry">
          <p class="entry-date">{{ actualDate(entry) }}</p>
          <p class="note-text">{{ entry.text }}</p>
          <button class="text-button edit-button" type="button" (click)="edit.emit(entry)">
            Editar nota
          </button>
        </article>
      }
    </section>

    <button class="text-button close-button" type="button" (click)="close.emit()">
      Cerrar detalle ↑
    </button>
  </div>`,
  styles: `
    .detail {
      padding: clamp(20px, 3vw, 34px);
      border-top: 1px solid var(--line);
      background: var(--paper);
    }
    .eyebrow {
      margin: 0;
      color: var(--brand);
      font-size: 0.76rem;
      font-weight: 700;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }
    h2 {
      margin: 0;
      font-size: 1rem;
      line-height: 1.35;
    }
    p {
      margin: 7px 0 0;
    }
    .distance-item span,
    .conditions dt {
      color: var(--muted);
      font-size: 0.86rem;
    }
    .distance-summary {
      display: flex;
      align-items: center;
      gap: 22px;
      padding: 14px 0;
      border-bottom: 1px solid var(--line);
    }
    .distance-item {
      display: grid;
      gap: 2px;
      min-width: 180px;
    }
    .distance-item strong {
      font-size: 1rem;
      font-variant-numeric: tabular-nums;
    }
    .distance-note {
      color: var(--muted);
      font-size: 0.84rem;
    }
    .logistics-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border-bottom: 1px solid var(--line);
    }
    .logistics-item {
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr);
      align-items: start;
      gap: 14px;
      min-width: 0;
      padding: 20px 18px 20px 0;
    }
    .logistics-item + .logistics-item {
      border-left: 1px solid var(--line);
      padding-left: 20px;
    }
    .icon-disc {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      color: var(--ink);
      background: var(--tint);
    }
    .icon-disc svg,
    .icon-plain svg {
      width: 24px;
      height: 24px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .logistics-copy h2 {
      margin-top: 1px;
    }
    .logistics-value {
      font-size: 1.1rem;
      font-weight: 600;
      line-height: 1.45;
    }
    .status-line {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      color: var(--muted);
      font-size: 0.88rem;
      line-height: 1.45;
    }
    .status-dot {
      flex: 0 0 auto;
      width: 8px;
      height: 8px;
      margin-top: 0.42em;
      border-radius: 50%;
      background: var(--brand);
    }
    .transport-row {
      display: grid;
      grid-template-columns: 32px minmax(0, 1fr);
      gap: 14px;
      padding: 18px 0;
      border-bottom: 1px solid var(--line);
    }
    .transport-row p {
      line-height: 1.5;
    }
    .icon-plain {
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      color: var(--ink);
    }
    .conditions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin: 0;
      border-bottom: 1px solid var(--line);
    }
    .conditions div {
      padding: 14px 18px 16px 0;
    }
    .conditions div + div {
      padding-left: 20px;
      border-left: 1px solid var(--line);
    }
    .conditions dd {
      margin: 3px 0 0;
      font-weight: 600;
    }
    .secondary-details {
      border-bottom: 1px solid var(--line);
    }
    .secondary-details summary {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 52px;
      padding: 8px 0;
      color: var(--ink);
      font-weight: 600;
      list-style: none;
    }
    .secondary-details summary::-webkit-details-marker {
      display: none;
    }
    .secondary-details summary::after {
      content: '+';
      margin-left: auto;
      color: var(--brand);
      font-size: 1.4rem;
      font-weight: 400;
    }
    .secondary-details[open] summary::after {
      content: '−';
    }
    .secondary-content {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px 28px;
      padding: 4px 0 18px 38px;
    }
    .secondary-content section:last-child {
      grid-column: 1 / -1;
    }
    .secondary-content h2 {
      margin-bottom: 5px;
      font-size: 0.92rem;
    }
    .secondary-content p {
      color: var(--muted);
    }
    .budget-total {
      font-weight: 600;
      color: var(--ink) !important;
    }
    .budget {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px 18px;
      margin: 10px 0 0;
    }
    .budget div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      border-top: 1px solid var(--line);
      padding-top: 5px;
    }
    .budget dt,
    .budget dd {
      font-size: 0.82rem;
    }
    .budget dt {
      color: var(--muted);
    }
    .budget dd {
      margin: 0;
      text-align: right;
    }
    .hint {
      font-size: 0.84rem;
    }
    .diary {
      padding: 20px 0 12px;
      border-bottom: 1px solid var(--line);
    }
    .diary-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }
    .diary-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .diary-title .eyebrow {
      margin-bottom: 3px;
    }
    .diary-title h2 {
      font-size: 1.1rem;
    }
    .empty-diary {
      margin: 16px 0 2px 38px;
      color: var(--muted);
    }
    .entry {
      margin: 18px 0 0 38px;
      padding: 14px 0 8px;
      border-top: 1px solid var(--line);
    }
    .entry-date {
      color: var(--muted);
      font-size: 0.84rem;
    }
    .note-text {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 1rem;
      line-height: 1.7;
    }
    .edit-button {
      margin-top: 3px;
    }
    .close-button {
      margin-top: 12px;
      padding-inline: 0;
    }
    @media (max-width: 620px) {
      .detail {
        padding: 20px 16px;
      }
      .distance-summary {
        align-items: flex-start;
        flex-direction: column;
        gap: 3px;
      }
      .distance-item {
        min-width: 0;
      }
      .logistics-grid {
        grid-template-columns: 1fr;
      }
      .logistics-item {
        padding: 18px 0;
      }
      .logistics-item + .logistics-item {
        border-top: 1px solid var(--line);
        border-left: 0;
        padding-left: 0;
      }
      .conditions {
        grid-template-columns: 1fr;
      }
      .conditions div {
        padding: 12px 0;
      }
      .conditions div + div {
        border-top: 1px solid var(--line);
        border-left: 0;
        padding-left: 0;
      }
      .secondary-content {
        grid-template-columns: 1fr;
        padding-left: 0;
      }
      .secondary-content section:last-child {
        grid-column: auto;
      }
      .budget {
        grid-template-columns: 1fr;
      }
      .diary-heading {
        align-items: stretch;
        flex-direction: column;
      }
      .entry,
      .empty-diary {
        margin-left: 0;
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
  readonly actualDay = computed(
    () => this.data().actualDays.find((record) => record.date === this.day().date) ?? null,
  );
  readonly entries = computed(() =>
    this.data().diaryEntries.filter((entry) =>
      entry.stageIds.some((id) => this.day().segments.some((segment) => segment.stageId === id)),
    ),
  );
  readonly dateLabel = dateLabel;
  readonly money = money;
  readonly distance = distance;
  actualDate(entry: DiaryEntry) {
    const date = this.data().actualDays.find((record) => record.id === entry.actualDayId)?.date;
    return date ? dateLabel(date, true) : '';
  }
}
