import { Component, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NoteInput } from '../../core/domain/model';

@Component({
  selector: 'app-note-form',
  imports: [FormsModule],
  template: ` <section class="card note-form" aria-labelledby="note-title">
    <button type="button" class="text-button" (click)="close.emit()">
      ← Volver al día · se conserva el borrador
    </button>
    <p class="eyebrow">Diario de ruta</p>
    <h1 id="note-title">{{ initial().entryId ? 'Editar mi nota' : 'Anotar este día' }}</h1>
    <p class="muted">{{ stageName() }}</p>
    <form (ngSubmit)="submit()">
      <div class="form-grid">
        <label
          >Fecha real<input
            name="date"
            type="date"
            required
            [disabled]="!!initial().entryId"
            [ngModel]="date"
            (ngModelChange)="changeDate($event)"
        /></label>
        <label
          >Kilómetros reales del día<input
            name="km"
            type="number"
            min="0"
            step="0.1"
            [ngModel]="km"
            (ngModelChange)="km = $event; draft()"
            placeholder="Sin registrar"
        /></label>
      </div>
      <p class="hint">
        Este kilometraje lo comparten todas las notas de esa fecha. Vacío = sin registrar; 0 = cero
        kilómetros.
      </p>
      <label
        >Tu nota<textarea
          name="text"
          rows="7"
          maxlength="1200"
          required
          [ngModel]="text"
          (ngModelChange)="text = $event; draft()"
          placeholder="Cómo estuvo el camino, qué descubriste, qué conviene recordar…"
        ></textarea>
      </label>
      <p class="hint">{{ text.length }} / 1200 · {{ draftStatus() }}</p>
      @if (error()) {
        <p role="alert" class="error">{{ error() }}</p>
      }
      <div class="actions">
        <button class="primary" type="submit" [disabled]="busy() || !text.trim()">
          {{ busy() ? 'Guardando…' : 'Guardar en este dispositivo' }}</button
        ><button type="button" (click)="close.emit()">Volver</button>
      </div>
    </form>
  </section>`,
  styles: `
    .note-form {
      max-width: 720px;
      margin: 0 auto;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .hint {
      font-size: 0.85rem;
      color: var(--muted);
    }
    label {
      display: block;
      margin: 16px 0;
      font-weight: 600;
    }
    input,
    textarea {
      display: block;
      width: 100%;
      margin-top: 8px;
    }
    textarea {
      resize: vertical;
    }
    @media (max-width: 480px) {
      .form-grid {
        grid-template-columns: 1fr;
        gap: 0;
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
    try {
      const draft = JSON.parse(localStorage.getItem(this.key()) ?? 'null');
      if (
        draft &&
        typeof draft.date === 'string' &&
        typeof draft.text === 'string' &&
        (draft.km === null || typeof draft.km === 'number') &&
        (!input.entryId || draft.date === input.date)
      ) {
        this.date = draft.date;
        this.text = draft.text;
        this.km = draft.km;
        this.draftStatus.set('Borrador recuperado en este dispositivo');
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
      this.draftStatus.set('Borrador conservado · aún no es una nota guardada');
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
