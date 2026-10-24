import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-copy-view',
  styleUrl: './copy-view.css',
  templateUrl: './copy-view.html',
})
export class CopyView {
  readonly online = input.required<boolean>();
  readonly offlineReady = input.required<boolean>();
  readonly busy = input.required<boolean>();
  readonly isDemo = input.required<boolean>();
  readonly canInstall = input.required<boolean>();
  readonly isInstalled = input.required<boolean>();
  readonly isStandalone = input.required<boolean>();
  readonly installGuidance = input.required<string>();
  readonly exportBackup = output<void>();
  readonly restoreFile = output<Event>();
  readonly previewDemo = output<void>();
  readonly checkPreparation = output<void>();
  readonly installApp = output<void>();
}
