import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { startLocalStack, type LocalCredentials, type LocalStack } from '../tools/local-stack.mjs';

test.describe.configure({ mode: 'serial' });

const contexts = new Map<string, BrowserContext>();
let localStack: LocalStack | undefined;
let primaryAccount: LocalCredentials;
let tempDirectory: string | undefined;

function isOwnedTempDirectory(path: string): boolean {
  const resolved = resolve(path);
  return (
    dirname(resolved) === resolve(tmpdir()) && basename(resolved).startsWith('routale-browser-')
  );
}

test.beforeAll(async () => {
  tempDirectory = await mkdtemp(join(resolve(tmpdir()), 'routale-browser-'));
  if (!isOwnedTempDirectory(tempDirectory)) throw new Error('El directorio temporal no es válido.');
  try {
    localStack = await startLocalStack({
      directory: tempDirectory,
      port: 4300,
      apiPort: 5090,
      build: false,
    });
    primaryAccount = localStack.credentials;
  } catch (error) {
    await removeOwnedTempDirectory();
    throw error;
  }
});

test.afterAll(async () => {
  try {
    await localStack?.stop();
  } finally {
    for (const context of contexts.values()) await context.close();
    await removeOwnedTempDirectory();
  }
});

test('guarda una copia explícita y muestra Mi copia en móvil y escritorio', async ({
  browser,
}, testInfo) => {
  const page = await openProfile(browser, 'profile-a');
  try {
    await openWelcome(page);
    await importDemo(page);
    await openCopy(page);
    await signInAndBind(page, primaryAccount);
    await page.getByRole('button', { name: 'Guardar una copia en mi cuenta' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Copia guardada en tu cuenta.' }),
    ).toBeVisible();
    await expect(page.locator('.local-copy .copy-status[data-state="current"]')).toBeVisible();

    await page.addStyleTag({ content: '.account-strip strong { visibility: hidden; }' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('heading', { name: 'Copias en tu cuenta' }).scrollIntoViewIfNeeded();
    await testInfo.attach('mi-copia-390', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('heading', { name: 'Copias en tu cuenta' }).scrollIntoViewIfNeeded();
    await testInfo.attach('mi-copia-1440', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await page.setViewportSize({ width: 1280, height: 900 });
  } finally {
    await page.close();
  }
});

test('un perfil vacío puede listar, revisar y recuperar una copia', async ({ browser }) => {
  const page = await openProfile(browser, 'profile-b');
  try {
    await openWelcome(page);
    await signInAndBind(page, primaryAccount);
    const reviewButton = page.getByRole('button', { name: 'Revisar recuperación', exact: true });
    await expect(reviewButton).toBeVisible();
    await reviewButton.click();
    await expect(page.locator('.restore-review')).toBeVisible();
    await expect(page.locator('#restore-review-title')).toBeVisible();
    await expect(
      page.getByText('La copia se guardará en este perfil cuando confirmes.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar recuperación' }).click();
    await expect(page.getByRole('heading', { name: 'Mi itinerario' })).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Copia recuperada en este dispositivo.' }),
    ).toBeVisible();
  } finally {
    await page.close();
  }
});

test('reconcilia una respuesta perdida después de que la API confirme el guardado', async ({
  browser,
}) => {
  const page = await openProfile(browser, 'profile-a');
  const context = contexts.get('profile-a');
  if (!context) throw new Error('No se creó el perfil A.');
  let lostResponse = false;
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Mi itinerario' })).toBeVisible();
    await addNote(page, 'Nota de respuesta perdida');
    await openCopy(page);
    await context.route('**/api/**', async (route) => {
      if (route.request().method() === 'PUT' && !lostResponse) {
        lostResponse = true;
        const committedResponse = await route.fetch();
        await committedResponse.dispose();
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    await page.getByRole('button', { name: 'Guardar una copia en mi cuenta' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Copia guardada en tu cuenta.' }),
    ).toBeVisible();
    await expect(page.locator('.local-copy .copy-status[data-state="current"]')).toBeVisible();
    expect(lostResponse).toBe(true);
  } finally {
    await context.unrouteAll({ behavior: 'wait' });
    await page.close();
  }
});

test('muestra resultado incierto y rechaza recuperar tras una edición en otra pestaña', async ({
  browser,
}) => {
  const page = await openProfile(browser, 'profile-c');
  const context = contexts.get('profile-c');
  if (!context) throw new Error('No se creó el perfil de prueba.');
  let interrupted = false;
  let secondPage: Page | undefined;
  try {
    await openWelcome(page);
    await importDemo(page);
    await openCopy(page);
    await signInAndBind(page, primaryAccount);
    await openCopy(page);
    await page.getByRole('button', { name: 'Revisar recuperación', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar recuperación' }).click();
    await expect(page.getByRole('heading', { name: 'Mi itinerario' })).toBeVisible();
    await addNote(page, 'Nota local con resultado incierto');
    await openCopy(page);
    await context.route('**/api/**', async (route) => {
      if (route.request().method() === 'PUT' && !interrupted) {
        interrupted = true;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    await page.getByRole('button', { name: 'Guardar una copia en mi cuenta' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'La respuesta no confirmó el resultado.' }),
    ).toBeVisible();
    await expect(page.locator('.local-copy .copy-status[data-state="uncertain"]')).toBeVisible();
    expect(interrupted).toBe(true);

    await context.unrouteAll({ behavior: 'wait' });
    await page.getByRole('button', { name: 'Revisar recuperación', exact: true }).click();
    await expect(page.locator('.restore-review')).toBeVisible();
    secondPage = await context.newPage();
    await secondPage.goto('/');
    await expect(secondPage.getByRole('heading', { name: 'Mi itinerario' })).toBeVisible();
    await addNote(secondPage, 'Edición desde otra pestaña durante revisión');
    await page.getByRole('button', { name: 'Confirmar recuperación' }).click();
    await expect(page.locator('.remote-panel [role="alert"]')).toContainText(
      'El cuaderno cambió mientras revisabas la recuperación',
    );
    await page.reload();
    await clickSection(page, 'Diario');
    await expect(page.getByText('Edición desde otra pestaña durante revisión')).toBeVisible();
  } finally {
    await context.unrouteAll({ behavior: 'wait' });
    await secondPage?.close();
    await page.close();
  }
});

test('rechaza una escritura con If-Match obsoleto y conserva el remoto y el cuaderno local', async ({
  browser,
}) => {
  const pageA = await openProfile(browser, 'profile-a');
  const pageB = await openProfile(browser, 'profile-b');
  const contextA = contexts.get('profile-a');
  if (!contextA) throw new Error('No se creó el perfil A.');
  let raced = false;
  try {
    await pageA.goto('/');
    await expect(pageA.getByRole('heading', { name: 'Mi itinerario' })).toBeVisible();
    await openCopy(pageA);
    await pageA.getByRole('button', { name: 'Actualizar lista' }).click();
    await pageA.getByRole('button', { name: 'Revisar recuperación', exact: true }).click();
    await pageA.getByRole('button', { name: 'Confirmar recuperación' }).click();
    await expect(pageA.getByRole('heading', { name: 'Mi itinerario' })).toBeVisible();

    await pageB.goto('/');
    await expect(pageB.getByRole('heading', { name: 'Mi itinerario' })).toBeVisible();
    await openCopy(pageB);
    await pageB.getByRole('button', { name: 'Actualizar lista' }).click();
    await pageB.getByRole('button', { name: 'Revisar recuperación', exact: true }).click();
    await pageB.getByRole('button', { name: 'Confirmar recuperación' }).click();
    await expect(pageB.getByRole('heading', { name: 'Mi itinerario' })).toBeVisible();

    await addNote(pageA, 'Cambio local del cliente A');
    await addNote(pageB, 'Cambio local del cliente B');
    await openCopy(pageA);
    await openCopy(pageB);
    await contextA.route('**/api/**', async (route) => {
      if (route.request().method() === 'PUT' && !raced) {
        raced = true;
        await pageB.getByRole('button', { name: 'Guardar una copia en mi cuenta' }).click();
        await expect(
          pageB.getByRole('status').filter({ hasText: 'Copia guardada en tu cuenta.' }),
        ).toBeVisible();
      }
      await route.continue();
    });
    await pageA.getByRole('button', { name: 'Guardar una copia en mi cuenta' }).click();
    await expect(
      pageA.getByRole('status').filter({ hasText: 'La copia de tu cuenta cambió.' }),
    ).toBeVisible();
    await expect(pageA.locator('.local-copy .copy-status[data-state="conflict"]')).toBeVisible();
    expect(raced).toBe(true);

    await clickSection(pageA, 'Diario');
    await expect(pageA.getByText('Cambio local del cliente A')).toBeVisible();
    await clickSection(pageB, 'Diario');
    await expect(pageB.getByText('Cambio local del cliente B')).toBeVisible();
  } finally {
    await contextA.unrouteAll({ behavior: 'wait' });
    await pageA.close();
    await pageB.close();
  }
});

test('mantiene el uso local sin API y recupera la sesión y las copias tras reiniciarla', async ({
  browser,
}) => {
  const page = await openProfile(browser, 'profile-d');
  const context = page.context();
  const outageAccount = await localStack?.createUser();
  if (!outageAccount) throw new Error('No se creó la cuenta para probar la caída del servidor.');
  let recoveryPage: Page | undefined;
  let apiStopped = false;
  let remoteWrites = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname.startsWith('/api/trips/'))
      remoteWrites += 1;
  });
  try {
    await test.step('Preparar una copia confirmada en una cuenta independiente', async () => {
      await openWelcome(page);
      await importDemo(page);
      await openCopy(page);
      await signInAndBind(page, outageAccount);
      await page.getByRole('button', { name: 'Guardar una copia en mi cuenta' }).click();
      await expect(page.locator('.local-copy .copy-status[data-state="current"]')).toBeVisible();
    });
    const writesBeforeOutage = remoteWrites;
    await test.step('Detener la API y conservar la edición local', async () => {
      await localStack?.stopApi();
      apiStopped = true;
      await clickSection(page, 'Jornada');
      await addNote(page, 'Nota guardada mientras la API estaba detenida');
      await clickSection(page, 'Diario');
      await expect(page.getByText('Nota guardada mientras la API estaba detenida')).toBeVisible();
      await openCopy(page);
      await page.getByRole('button', { name: 'Actualizar lista' }).click();
      await expect(page.getByRole('heading', { name: 'Servidor no disponible' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Volver a comprobar' })).toBeEnabled();
    });
    await test.step('Desconectar el dispositivo y descargar el cuaderno local', async () => {
      await context.setOffline(true);
      await expect(page.getByRole('heading', { name: 'Sin conexión', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Volver a comprobar' })).toBeDisabled();
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Descargar copia local', exact: true }).click();
      const download = await downloaded;
      expect(download.suggestedFilename()).toMatch(/^routale-\d{4}-\d{2}-\d{2}\.json$/);
      await context.setOffline(false);
    });
    await test.step('Reiniciar la API y volver a comprobar sin recargar', async () => {
      await localStack?.restartApi();
      apiStopped = false;
      await page.getByRole('button', { name: 'Volver a comprobar' }).click();
    });
    await expect(
      page.getByRole('button', { name: 'Revisar recuperación', exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.local-copy .copy-status[data-state="local-changes"]'),
    ).toBeVisible();
    expect(remoteWrites).toBe(writesBeforeOutage);
    await clickSection(page, 'Diario');
    await expect(page.getByText('Nota guardada mientras la API estaba detenida')).toBeVisible();

    recoveryPage = await openProfile(browser, 'profile-f');
    await openWelcome(recoveryPage);
    await signInAndBind(recoveryPage, outageAccount);
    await recoveryPage.getByRole('button', { name: 'Revisar recuperación', exact: true }).click();
    await recoveryPage.getByRole('button', { name: 'Confirmar recuperación' }).click();
    await expect(recoveryPage.getByRole('heading', { name: 'Mi itinerario' })).toBeVisible();
    await clickSection(recoveryPage, 'Diario');
    await expect(
      recoveryPage.getByText('Nota guardada mientras la API estaba detenida'),
    ).toHaveCount(0);
  } finally {
    await context.setOffline(false);
    if (apiStopped) await localStack?.restartApi();
    await recoveryPage?.close();
    await page.close();
  }
});

test('bloquea otra cuenta en el mismo perfil y conserva el cuaderno local', async ({ browser }) => {
  const page = await openProfile(browser, 'profile-e');
  const otherAccount = await localStack?.createUser();
  if (!otherAccount) throw new Error('No se creó la segunda cuenta local de prueba.');
  try {
    await openWelcome(page);
    await importDemo(page);
    await openCopy(page);
    await signInAndBind(page, primaryAccount);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('textbox', { name: 'Cuenta', exact: true })).toBeVisible();
    await signIn(page, otherAccount);
    await expect(page.getByText(/este perfil solo puede usar la cuenta/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Revisar recuperación', exact: true }),
    ).toHaveCount(0);
    await clickSection(page, 'Jornada');
    await expect(page.getByRole('heading', { name: 'Mi itinerario' })).toBeVisible();
  } finally {
    await page.close();
  }
});

async function openProfile(browser: Browser, name: string): Promise<Page> {
  let context = contexts.get(name);
  if (!context) {
    context = await browser.newContext();
    contexts.set(name, context);
  }
  return context.newPage();
}

async function openWelcome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Planifica tu viaje' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
}

async function importDemo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Revisar viaje de ejemplo' }).click();
  await expect(page.getByRole('heading', { name: 'Viaje de ejemplo' })).toBeVisible();
  await page.getByRole('button', { name: 'Importar este plan' }).click();
  await expect(page.getByRole('heading', { name: 'Mi itinerario' })).toBeVisible();
}

async function openCopy(page: Page): Promise<void> {
  const copyButtons = page.getByRole('button', { name: 'Mi copia', exact: true });
  let clicked = false;
  for (const button of await copyButtons.all()) {
    if (await button.isVisible()) {
      await button.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) await page.getByRole('button', { name: 'Abrir Mi copia' }).click();
  await expect(page.getByRole('heading', { name: 'Mi copia', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Copias en tu cuenta' })).toBeVisible();
}

async function signInAndBind(page: Page, account: LocalCredentials): Promise<void> {
  await signIn(page, account);
  await expect(page.getByRole('heading', { name: 'Vincular este perfil' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Vincular este perfil a la cuenta/ }).check();
  await page.getByRole('button', { name: 'Vincular este perfil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Guardar el cuaderno actual' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actualizar lista' })).toBeEnabled();
  const reviewButton = page.getByRole('button', { name: 'Revisar recuperación', exact: true });
  const emptyState = page.getByText(/No hay copias para mostrar/);
  await expect
    .poll(async () => (await reviewButton.count()) > 0 || (await emptyState.isVisible()))
    .toBe(true);
}

async function signIn(page: Page, account: LocalCredentials): Promise<void> {
  await page.getByRole('textbox', { name: 'Cuenta', exact: true }).fill(account.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
}

async function addNote(page: Page, text: string): Promise<void> {
  await page.getByRole('button', { name: 'Anotar este día', exact: true }).click();
  await page.getByRole('textbox', { name: 'Tu nota' }).fill(text);
  await page.getByRole('button', { name: 'Guardar en este dispositivo' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Guardado en este dispositivo' }),
  ).toBeVisible();
}

async function clickSection(page: Page, label: 'Diario' | 'Jornada'): Promise<void> {
  const buttons = page.getByRole('button', { name: label, exact: true });
  for (const button of await buttons.all()) {
    if (await button.isVisible()) {
      await button.click();
      return;
    }
  }
  throw new Error(`No se encontró la sección ${label}.`);
}

async function removeOwnedTempDirectory(): Promise<void> {
  const path = tempDirectory;
  if (path && isOwnedTempDirectory(path)) {
    await rm(path, { recursive: true, force: true });
    tempDirectory = undefined;
  }
}
