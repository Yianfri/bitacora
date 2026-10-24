import { Component, input, output } from '@angular/core';
import { DiaryEntry, Stage } from '../../core/domain/model';
import { dateLabel, distance } from '../../shared/display';

export interface DiaryGroup {
  date: string;
  cyclingKm: number | null;
  entries: DiaryEntry[];
}

@Component({
  selector: 'app-diary-view',
  styleUrl: './diary-view.css',
  templateUrl: './diary-view.html',
})
export class DiaryView {
  readonly groups = input.required<DiaryGroup[]>();
  readonly stages = input.required<Stage[]>();
  readonly editEntry = output<DiaryEntry>();
  readonly openDay = output<void>();
  readonly dateLabel = dateLabel;
  readonly distance = distance;

  stageName(entry: DiaryEntry): string {
    return (
      entry.stageIds
        .map((id) => this.stages().find((stage) => stage.id === id)?.name)
        .filter((name): name is string => !!name)
        .join(' · ') ?? ''
    );
  }
}
