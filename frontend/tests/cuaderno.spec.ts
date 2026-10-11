import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { validateBackup } from '../src/app/core/domain/validation';

async function importPlan(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Revisar viaje de ejemplo', exact: true }).click();
  await expect(page.getByText(/16 jornadas · 0 notas/)).toBeVisible();
  await page.getByRole('button', { name: 'Importar este plan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mi itinerario' })).toBeVisible();
}
async function openThird(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Pueblo B → Pueblo C/ }).click();
  await expect(page.getByRole('button', { name: 'Anotar este día' })).toBeVisible();
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
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar respaldo', exact: true }).click();
  const backupInput: unknown = JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
  const backup = await validateBackup(backupInput);
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
  await page.getByText('Plan y disponibilidad', { exact: true }).click();
  await page.getByRole('button', { name: 'Revisar viaje de ejemplo' }).click();
  await page.getByRole('button', { name: 'Importar este plan' }).click();
  await openThird(page);
  await expect(page.getByText('Nota editada y guardada', { exact: true })).toBeVisible();
  const fresh = await browser.newContext();
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
  await other.locator('input[type=file]').setInputFiles(upload);
  await expect(other.getByText(/Se reemplazará tu copia/)).toBeVisible();
  await expect(other.getByRole('button', { name: 'Exportar mi copia actual' })).toBeVisible();
  await other.getByRole('button', { name: 'Restaurar esta copia', exact: true }).click();
  await openThird(other);
  await expect(other.locator('.entry')).toHaveCount(2);
  await other.locator('input[type=file]').setInputFiles({
    name: 'futuro.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...backup, schemaVersion: 99 })),
  });
  await expect(other.getByRole('alert')).toContainText('no compatible');
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
  await expect(page.getByRole('heading', { name: 'Mi itinerario' })).toBeVisible();
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

for (const width of [320, 390, 736, 1024])
  test('bloques, teclado y presentación a ' + width + ' px', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await importPlan(page);
    expect(await page.locator('.day-button').count()).toBe(7);
    await page.getByRole('button', { name: 'Bloque siguiente' }).click();
    await expect(page.getByText('Mostrando 8–14 de 16 jornadas', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Ir a una fecha' }).selectOption('2030-06-03');
    await expect(page.locator('.day.open')).toHaveCount(1);
    await page.getByRole('button', { name: /Pueblo B → Pueblo C/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.day.open')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(page.locator('.day.open')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: 'test-results/cuaderno-' + width + '.png', fullPage: true });
  });
