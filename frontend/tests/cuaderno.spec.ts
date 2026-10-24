import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { validateBackup } from '../src/app/core/domain/validation';

async function importPlan(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Revisar viaje de ejemplo', exact: true }).click();
  await expect(page.getByText(/16 jornadas · 0 notas/)).toBeVisible();
  await page.getByRole('button', { name: 'Importar este plan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Jornada', exact: true })).toBeVisible();
}
async function openThird(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Itinerario', exact: true }).click();
  await page.getByRole('button', { name: /Pueblo B → Pueblo C/ }).click();
  await expect(page.getByRole('button', { name: 'Anotar este día' })).toBeVisible();
}
async function openCopy(page: import('@playwright/test').Page) {
  await page
    .getByRole('button', { name: /^(Mi copia|Abrir Mi copia)$/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Mi copia', exact: true })).toBeVisible();
}

test('nota, borrador, edición, reimportación y restauración con revisión', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await importPlan(page);
  await openThird(page);
  await page.getByRole('button', { name: 'Anotar este día' }).click();
  const literal = 'Lluvia en Pueblo C. <img src=x onerror=alert(1)> Café y ñ.';
  await page.getByRole('textbox', { name: 'Tu nota', exact: true }).fill(literal);
  await page.getByRole('spinbutton', { name: 'Kilómetros reales del día' }).fill('43.2');
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await page.getByRole('button', { name: 'Anotar este día' }).click();
  await expect(page.getByRole('textbox', { name: 'Tu nota', exact: true })).toHaveValue(literal);
  await page.getByRole('button', { name: 'Guardar en este dispositivo' }).click();
  await expect(page.getByText(literal, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Anotar este día' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Kilómetros reales del día' })).toHaveValue(
    '43.2',
  );
  await page
    .getByRole('textbox', { name: 'Tu nota', exact: true })
    .fill('Segunda nota de la fecha');
  await page.getByRole('button', { name: 'Guardar en este dispositivo' }).click();
  await openCopy(page);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar respaldo', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^routale-\d{4}-\d{2}-\d{2}\.json$/);
  const backupInput: unknown = JSON.parse(await readFile(await download.path(), 'utf8'));
  const backup = await validateBackup(backupInput);
  expect(backup.format).toBe('cuaderno-austral-backup');
  expect(backup.data.actualDays).toHaveLength(1);
  expect(backup.data.actualDays[0].cyclingKm).toBe(43.2);
  expect(backup.data.diaryEntries).toHaveLength(2);
  await page.reload();
  await openThird(page);
  await expect(page.getByText(literal, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar nota' }).first().click();
  await page.getByRole('textbox', { name: 'Tu nota', exact: true }).fill('Nota editada y guardada');
  await page.getByRole('button', { name: 'Guardar en este dispositivo' }).click();
  await expect(page.getByText('Nota editada y guardada', { exact: true })).toBeVisible();
  await openCopy(page);
  await page.getByRole('button', { name: 'Revisar viaje de ejemplo' }).click();
  await page.getByRole('button', { name: 'Importar este plan' }).click();
  await openThird(page);
  await expect(page.getByText('Nota editada y guardada', { exact: true })).toBeVisible();
  const fresh = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const other = await fresh.newPage();
  await other.goto('/');
  const upload = {
    name: 'respaldo.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  };
  await other.locator('input[type=file]').setInputFiles(upload);
  await other.getByRole('button', { name: 'Restaurar esta copia', exact: true }).click();
  await openThird(other);
  await expect(other.getByText(literal, { exact: true })).toBeVisible();
  await openCopy(other);
  await other.locator('input[type=file]').setInputFiles(upload);
  await expect(other.getByText(/Se reemplazará tu copia/)).toBeVisible();
  await expect(other.getByRole('button', { name: 'Exportar mi copia actual' })).toBeVisible();
  await other.getByRole('button', { name: 'Restaurar esta copia', exact: true }).click();
  await openThird(other);
  await expect(other.locator('.entry')).toHaveCount(2);
  await openCopy(other);
  await other.locator('input[type=file]').setInputFiles({
    name: 'futuro.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...backup, schemaVersion: 99 })),
  });
  await expect(other.getByRole('alert')).toContainText('no compatible');
  await openThird(other);
  await expect(other.locator('.entry')).toHaveCount(2);
  expect(errors).toEqual([]);
  await fresh.close();
});

test('PWA: recarga y guardado sin red', async ({ page, context }) => {
  await importPlan(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Jornada', exact: true })).toBeVisible();
  await expect(page.locator('.route-cover')).toBeVisible();
  expect(
    await page.locator('.route-cover').evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0);
  expect(await page.evaluate(async () => (await fetch('/routale-icon-512.png')).ok)).toBe(true);
  await openThird(page);
  await page.getByRole('button', { name: 'Anotar este día' }).click();
  await page.getByRole('textbox', { name: 'Tu nota', exact: true }).fill('Nota escrita sin red');
  await page.getByRole('button', { name: 'Guardar en este dispositivo' }).click();
  await expect(page.getByRole('status')).toContainText('Guardado en este dispositivo');
  await page.reload();
  await openThird(page);
  await expect(page.getByText('Nota escrita sin red', { exact: true })).toBeVisible();
  const newPage = await context.newPage();
  await page.close();
  await newPage.goto('/');
  await openThird(newPage);
  await expect(newPage.getByText('Nota escrita sin red', { exact: true })).toBeVisible();
});

for (const width of [320, 390, 736, 1024, 1440])
  test('bloques, teclado y presentación a ' + width + ' px', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await importPlan(page);
    await page.getByRole('button', { name: 'Itinerario', exact: true }).click();
    expect(await page.locator('.day-button').count()).toBe(7);
    await page.getByRole('button', { name: 'Bloque siguiente' }).click();
    await expect(page.getByText('Mostrando 8–14 de 16 jornadas', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Ir a una fecha' }).selectOption('2030-06-03');
    await expect(page.locator('.day.open')).toHaveCount(1);
    await expect(page.locator('#selected-day-title')).toHaveText('Pueblo B → Pueblo C');
    if (width < 800) {
      await expect(page.locator('#selected-day-title')).toBeFocused();
      await page.getByRole('button', { name: 'Itinerario', exact: true }).click();
    }
    const fourth = page.getByRole('button', { name: /Etapa de ejemplo 4/ });
    await fourth.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#selected-day-title')).toHaveText('Etapa de ejemplo 4');
    await expect(
      page.getByRole('combobox', { name: 'Ir a una fecha', includeHidden: true }),
    ).toHaveValue('2030-06-04');
    await expect(page.locator('.day.open')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: 'test-results/cuaderno-claro-' + width + '.png',
      fullPage: true,
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: 'test-results/cuaderno-' + width + '.png', fullPage: true });
    await page.getByRole('button', { name: 'Anotar este día', exact: true }).click();
    await page.getByRole('textbox', { name: 'Tu nota', exact: true }).fill('Camino '.repeat(120));
    await expect(page.getByRole('button', { name: 'Guardar en este dispositivo' })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: 'test-results/formulario-' + width + '.png', fullPage: true });
  });

test('navegación por jornada cruza bloques y el diario conserva la edición', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await importPlan(page);
  await page.getByRole('button', { name: 'Itinerario', exact: true }).click();
  await page.getByRole('combobox', { name: 'Ir a una fecha' }).selectOption('2030-06-07');
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.locator('#selected-day-title')).toHaveText('Etapa de ejemplo 8');
  await page.getByRole('button', { name: 'Itinerario', exact: true }).click();
  await expect(page.getByText('Mostrando 8–14 de 16 jornadas', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Jornada', exact: true }).click();
  await page.getByRole('button', { name: 'Anotar este día', exact: true }).click();
  await page.getByRole('textbox', { name: 'Tu nota', exact: true }).fill('Borrador del día ocho');
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('button', { name: 'Diario', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Aún no hay entradas' })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: 'Jornada', exact: true }).click();
  await page.getByRole('button', { name: 'Anotar este día', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Tu nota', exact: true })).toHaveValue(
    'Borrador del día ocho',
  );
  await page.getByRole('button', { name: 'Guardar en este dispositivo', exact: true }).click();
  await page.getByRole('button', { name: 'Diario', exact: true }).click();
  await expect(page.getByText('Borrador del día ocho', { exact: true })).toBeVisible();
  await expect(page.getByText('Kilómetros sin registrar', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar nota', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Tu nota', exact: true })
    .fill('Entrada editada desde el diario');
  await page.getByRole('spinbutton', { name: 'Kilómetros reales del día' }).fill('0');
  await page.getByRole('button', { name: 'Guardar en este dispositivo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mi diario', exact: true })).toBeVisible();
  await expect(page.getByText('Entrada editada desde el diario', { exact: true })).toBeVisible();
  await expect(page.getByText('0 km reales', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/diario-390.png', fullPage: true });
});

test('PWA: manifiesto e iconos reales y respuestas de instalación simuladas', async ({ page }) => {
  await importPlan(page);
  await expect(page).toHaveTitle('Routale');
  const manifestResponse = await page.request.get('/manifest.webmanifest');
  const manifest = z
    .object({
      name: z.literal('Routale'),
      short_name: z.literal('Routale'),
      id: z.literal('/'),
      start_url: z.literal('/'),
      scope: z.literal('/'),
      display: z.literal('standalone'),
      icons: z.array(z.object({ src: z.string(), sizes: z.string(), type: z.string() })),
    })
    .parse(await manifestResponse.json());
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((item) => item.sizes === `${size}x${size}`);
    expect(icon).toBeDefined();
    const response = await page.request.get('/' + icon!.src);
    expect(response.ok()).toBe(true);
    const png = await response.body();
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  }
  await openCopy(page);
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(event, {
      prompt: { value: () => Promise.resolve() },
      userChoice: { value: Promise.resolve({ outcome: 'dismissed' }) },
    });
    window.dispatchEvent(event);
  });
  await page.getByRole('button', { name: 'Instalar aplicación', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'La instalación quedó pendiente' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Instalar aplicación', exact: true })).toHaveCount(
    0,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(
    page.getByText('Routale ya está instalada o abierta como aplicación en este dispositivo.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/mi-copia.png', fullPage: true });
});
