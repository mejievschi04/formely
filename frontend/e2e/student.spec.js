import { test, expect } from '@playwright/test';
import { login, studentEmail } from './helpers.js';

// Fluxul principal al cursantului: cursul atribuit → lecțiile → testul final → rezultatul.
// Testele depind unele de altele (testul final la sfârșit), deci rulează în ordine.
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }, testInfo) => {
	await login(page, studentEmail(testInfo));
});

test('cursantul ajunge la cursurile lui după autentificare', async ({ page }) => {
	await expect(page).toHaveURL(/\/courses$/);
	// Cursul apare și în cardul „Continuă”, și în listă (nu e în nicio mapă, deci stă în afara mapelor).
	const resume = page.getByRole('region', { name: 'Continuă învățarea' });
	await expect(resume.getByRole('heading', { name: 'Curs E2E' })).toBeVisible();
	await expect(resume.getByRole('button', { name: 'Continuă lecția' })).toBeVisible();
});

test('cursantul deschide cursul și trece la lecția următoare', async ({ page }) => {
	await page.goto('/courses/1');
	await expect(page.getByRole('heading', { name: 'Lecția 1' })).toBeVisible();
	await expect(page.getByText('Conținutul lecției 1')).toBeVisible();

	await page.getByRole('button', { name: 'Lecția următoare' }).click();
	await expect(page.getByRole('heading', { name: 'Lecția 2' })).toBeVisible();
	await expect(page.getByText('Conținutul lecției 2')).toBeVisible();
});

test('cursantul susține testul final și vede rezultatul', async ({ page }) => {
	await page.goto('/courses/1/exams/1');
	await expect(page.getByRole('heading', { name: 'Test final E2E' })).toBeVisible();

	// Verificăm varianta bifată, nu lista de întrebări: pe telefon lista nu apare (doar săgeți și „1 / 2”).
	await page.getByLabel('București').check();
	await expect(page.getByLabel('București')).toBeChecked();
	await page.getByRole('button', { name: 'Întrebarea următoare' }).click();
	await page.getByLabel('4', { exact: true }).check();
	await expect(page.getByLabel('4', { exact: true })).toBeChecked();

	await page.getByRole('button', { name: 'Trimite testul' }).click();

	const main = page.locator('main');
	await expect(main.getByText('Promovat')).toBeVisible();
	await expect(main.getByText('100%')).toBeVisible();
	await expect(main.getByText('2 / 2')).toBeVisible();
	// Pe telefon detaliile fiecărui răspuns sunt restrânse; întrebarea și „Corect” se văd pe ambele ecrane.
	await expect(main.getByText('Care este capitala României?').first()).toBeVisible();
	await expect(main.getByText('Corect', { exact: false }).first()).toBeVisible();

	await main.getByRole('link', { name: 'Înapoi la curs' }).last().click();
	await expect(page).toHaveURL(/\/courses\/1/);
});

test('rezultatul apare în istoricul testelor', async ({ page }) => {
	await page.goto('/exam-results');
	await expect(page.getByRole('heading', { name: 'Rezultate teste' })).toBeVisible();
	// Rezultatele stau în mape pe curs, închise implicit: testul apare după ce deschizi mapa cursului.
	const courseFolder = page.getByRole('button', { name: /Curs E2E/ });
	await expect(courseFolder).toHaveAttribute('aria-expanded', 'false');
	await courseFolder.click();
	await expect(page.getByText('Test final E2E').first()).toBeVisible();
});

test('o lecție blocată arată motivul o singură dată, fără notificare în plus', async ({ page }) => {
	// deblocare secvențială: lecția 3 cere lecțiile anterioare
	await page.goto('/courses/1/lessons/3');
	await expect(page.getByRole('heading', { name: 'Lecție blocată' })).toBeVisible();
	await expect(page.getByText('Lecția este blocată. Completează lecțiile anterioare.')).toHaveCount(1);
	await expect(page.getByRole('button', { name: 'Înapoi la curs' })).toBeVisible();
});
