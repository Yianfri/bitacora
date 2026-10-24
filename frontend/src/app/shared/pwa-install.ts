import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

export type PwaInstallResult = 'accepted' | 'dismissed' | 'unavailable';

export const PWA_INSTALL_GUIDANCE =
  'Si el navegador no ofrece el botón de instalación, abre su menú de aplicaciones. En iPhone o iPad, usa Compartir y luego Añadir a pantalla de inicio.';

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: PromiseLike<unknown>;
  prompt(): unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  const candidate: unknown = event;
  if (!isRecord(candidate)) return false;
  return typeof candidate['prompt'] === 'function' && isPromiseLike(candidate['userChoice']);
}

function readInstallResult(value: unknown): PwaInstallResult | null {
  if (!isRecord(value)) return null;
  const outcome = value['outcome'];
  return outcome === 'accepted' || outcome === 'dismissed' ? outcome : null;
}

@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly canPromptInstallState = signal(false);
  private readonly installedState = signal(false);
  private readonly standaloneState = signal(false);
  private promptEvent: BeforeInstallPromptEvent | null = null;

  readonly canPromptInstall = this.canPromptInstallState.asReadonly();
  readonly isInstalled = this.installedState.asReadonly();
  readonly isStandalone = this.standaloneState.asReadonly();

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    const pageWindow = this.document.defaultView;
    if (!pageWindow) return;

    const displayMode = pageWindow.matchMedia('(display-mode: standalone)');
    const updateDisplayMode = (): void => {
      const standalone = displayMode.matches;
      this.standaloneState.set(standalone);
      if (standalone) this.installedState.set(true);
    };
    const onBeforeInstallPrompt = (event: Event): void => {
      if (!isBeforeInstallPromptEvent(event)) return;
      event.preventDefault();
      this.promptEvent = event;
      this.canPromptInstallState.set(true);
    };
    const onAppInstalled = (): void => {
      this.promptEvent = null;
      this.canPromptInstallState.set(false);
      this.installedState.set(true);
    };

    updateDisplayMode();
    displayMode.addEventListener('change', updateDisplayMode);
    pageWindow.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    pageWindow.addEventListener('appinstalled', onAppInstalled);

    this.destroyRef.onDestroy(() => {
      displayMode.removeEventListener('change', updateDisplayMode);
      pageWindow.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      pageWindow.removeEventListener('appinstalled', onAppInstalled);
      this.promptEvent = null;
    });
  }

  async install(): Promise<PwaInstallResult> {
    const event = this.promptEvent;
    if (!event) return 'unavailable';

    this.promptEvent = null;
    this.canPromptInstallState.set(false);

    try {
      await event.prompt();
      const result = readInstallResult(await event.userChoice);
      return result ?? 'unavailable';
    } catch {
      return 'unavailable';
    }
  }
}
