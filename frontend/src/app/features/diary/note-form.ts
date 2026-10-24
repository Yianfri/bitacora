import { Component, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NoteInput } from '../../core/domain/model';

@Component({
  selector: 'app-note-form',
  imports: [FormsModule],
  template: `<section class="note-form" aria-labelledby="note-title">
    <button type="button" class="back-button" [disabled]="busy()" (click)="close.emit()">
      <span aria-hidden="true">←</span> Volver · se conserva el borrador
    </button>

    <header class="form-heading">
      <p class="eyebrow">Diario de ruta</p>
      <h1 id="note-title">{{ initial().entryId ? 'Editar mi nota' : 'Anotar este día' }}</h1>
      <p class="stage-name">{{ stageName() || 'Jornada seleccionada' }}</p>
      <p class="form-intro">
        El borrador se conserva en este dispositivo. La nota del diario se guarda o actualiza sólo
        después de completar el guardado.
      </p>
    </header>

    <form (ngSubmit)="submit()">
      <div class="form-grid">
        <label class="field" for="actual-date">
          <span id="actual-date-label">Fecha real</span>
          <input
            id="actual-date"
            name="date"
            type="date"
            required
            [disabled]="busy() || !!initial().entryId"
            [ngModel]="date"
            (ngModelChange)="changeDate($event)"
            aria-describedby="date-help"
            aria-labelledby="actual-date-label"
          />
          <small id="date-help">
            {{
              initial().entryId
                ? 'La fecha se conserva al editar esta nota.'
                : 'Usa la fecha local del día que registras.'
            }}
          </small>
        </label>

        <label class="field" for="actual-km">
          <span id="actual-km-label">Kilómetros reales del día</span>
          <input
            id="actual-km"
            name="km"
            type="number"
            [disabled]="busy()"
            min="0"
            step="0.1"
            [ngModel]="km"
            (ngModelChange)="km = $event; draft()"
            placeholder="Sin registrar"
            aria-describedby="km-help"
            aria-labelledby="actual-km-label"
          />
          <small id="km-help">
            Vacío = sin registrar; 0 = cero kilómetros. Se comparte entre todas las notas de esa
            fecha.
          </small>
        </label>
      </div>

      <label class="field note-field" for="note-text">
        <span id="note-text-label">Tu nota</span>
        <textarea
          id="note-text"
          name="text"
          [disabled]="busy()"
          rows="7"
          maxlength="1200"
          required
          [ngModel]="text"
          (ngModelChange)="text = $event; draft()"
          placeholder="Cómo estuvo el camino, qué descubriste, qué conviene recordar…"
          aria-describedby="note-help note-count"
          aria-labelledby="note-text-label"
        ></textarea>
        <small id="note-help"
          >Una nota adicional no completa la etapa ni duplica el kilometraje.</small
        >
        <small id="note-count">{{ text.length }} / 1200 · {{ draftStatus() }}</small>
      </label>

      @if (error()) {
        <p id="note-error" class="error-message" role="alert">{{ error() }}</p>
      }

      <div class="actions">
        <button class="primary save-button" type="submit" [disabled]="busy() || !text.trim()">
          {{ busy() ? 'Guardando…' : 'Guardar en este dispositivo' }}
        </button>
        <button class="return-button" type="button" [disabled]="busy()" (click)="close.emit()">
          Volver
        </button>
      </div>
    </form>
  </section>`,
  styles: `
    .note-form {
      width: min(100%, 720px);
      margin: clamp(16px, 4vw, 44px) auto;
      padding: clamp(20px, 4vw, 42px);
      color: var(--ink);
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }
    .back-button {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      min-height: 44px;
      margin: -8px 0 24px;
      padding: 6px 4px;
      border: 0;
      background: transparent;
      color: var(--accent);
      font-weight: 600;
      text-align: left;
    }
    .back-button:hover {
      background: transparent;
      color: var(--accent-hover);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .back-button span {
      font-size: 1.25rem;
    }
    .eyebrow {
      margin: 0;
      color: var(--brand);
      font-size: 0.76rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    h1 {
      margin: 6px 0 4px;
      font-family: inherit;
      font-size: clamp(1.85rem, 5vw, 2.5rem);
      font-weight: 700;
      letter-spacing: -0.04em;
      line-height: 1.15;
    }
    .stage-name {
      margin: 0;
      color: var(--muted);
      font-size: 1.08rem;
      font-weight: 600;
    }
    .form-intro {
      max-width: 60ch;
      margin: 14px 0 26px;
      color: var(--muted);
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
      padding: 20px 0 10px;
      border-top: 1px solid var(--line);
    }
    .field {
      display: grid;
      align-content: start;
      gap: 7px;
      min-width: 0;
      margin: 0 0 20px;
      font-weight: 600;
    }
    .field > span {
      line-height: 1.4;
    }
    input,
    textarea {
      display: block;
      width: 100%;
      margin: 0;
      min-height: 48px;
      padding: 11px 12px;
      border-color: var(--line);
      background: var(--paper);
      font-weight: 400;
    }
    textarea {
      min-height: 180px;
      resize: vertical;
      line-height: 1.6;
    }
    .field small {
      color: var(--muted);
      font-size: 0.84rem;
      font-weight: 400;
      line-height: 1.45;
    }
    .note-field {
      padding-top: 18px;
      border-top: 1px solid var(--line);
    }
    #note-count {
      padding-top: 2px;
    }
    .error-message {
      margin: 0 0 16px;
      padding: 12px 14px;
      border: 1px solid var(--error-ink);
      border-radius: 8px;
      color: var(--error-ink);
      background: var(--error-bg);
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      gap: 12px;
      align-items: center;
      padding-top: 18px;
      border-top: 1px solid var(--line);
    }
    .actions button {
      min-height: 48px;
    }
    .save-button {
      flex: 1 1 auto;
    }
    .return-button {
      min-width: 100px;
    }
    @media (max-width: 560px) {
      .note-form {
        margin: 12px 0;
        padding: 20px 16px;
        border-radius: var(--radius);
      }
      .form-grid {
        grid-template-columns: 1fr;
        gap: 0;
      }
      .form-intro {
        margin-bottom: 20px;
      }
    }
    @media (max-width: 380px) {
      .actions {
        align-items: stretch;
        flex-direction: column;
      }
      .return-button {
        width: 100%;
      }
    }
  `,
})
export class NoteForm implements OnInit {
  readonly initial = input.required<NoteInput>();
  readonly stageName = input.required<string>();
  readonly busy = input(false);
  readonly error = input('');
  readonly tripId = input.required<string>();
  readonly kilometersByDate = input.required<Record<string, number | null>>();
  readonly save = output<NoteInput>();
  readonly close = output<void>();
  date = '';
  km: number | null = null;
  text = '';
  readonly draftStatus = signal('Borrador sin guardar');
  private key() {
    return `cuaderno-austral:draft:${this.tripId()}:${this.initial().entryId ?? this.initial().stageIds.join(',')}`;
  }
  ngOnInit() {
    const input = this.initial();
    this.date = input.date;
    this.km = input.cyclingKm;
    this.text = input.text;
    if (input.entryId)
      this.draftStatus.set('La nota guardada no cambia hasta completar el guardado');
    try {
      const draft: unknown = JSON.parse(localStorage.getItem(this.key()) ?? 'null');
      if (
        draft &&
        typeof draft === 'object' &&
        'date' in draft &&
        'text' in draft &&
        'km' in draft &&
        typeof draft.date === 'string' &&
        typeof draft.text === 'string' &&
        (draft.km === null || typeof draft.km === 'number') &&
        (!input.entryId || draft.date === input.date)
      ) {
        this.date = draft.date;
        this.text = draft.text;
        this.km = draft.km;
        this.draftStatus.set(
          input.entryId
            ? 'Cambios recuperados como borrador; la nota guardada aún no cambia'
            : 'Borrador recuperado en este dispositivo',
        );
      }
    } catch {
      this.draftStatus.set('Borrador sólo en esta pantalla');
    }
  }
  changeDate(value: string) {
    this.date = value;
    this.km = this.kilometersByDate()[value] ?? null;
    this.draft();
  }
  draft() {
    try {
      localStorage.setItem(
        this.key(),
        JSON.stringify({ date: this.date, km: this.km, text: this.text }),
      );
      this.draftStatus.set(
        this.initial().entryId
          ? 'Cambios conservados como borrador; la nota guardada aún no cambia'
          : 'Borrador conservado; aún no es una nota guardada',
      );
    } catch {
      this.draftStatus.set('No pudimos conservar el borrador; mantén esta pantalla abierta');
    }
  }
  submit() {
    this.draft();
    this.save.emit({ ...this.initial(), date: this.date, cyclingKm: this.km, text: this.text });
  }
  clearDraft() {
    try {
      localStorage.removeItem(this.key());
    } catch {
      /* A saved note does not depend on draft storage. */
    }
  }
}
