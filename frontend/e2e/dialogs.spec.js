import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, ADMIN_EMAIL } from './helpers.js';

const coverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures-cover.png');

// Ferestrele de editare (mapă, utilizator, curs) au aceeași structură: titlu + X, câmpuri, iar
// Anulează / Salvează se văd fără derulare, inclusiv pe telefon.
async function expectDialogShell(page, title) {
	const dialog = page.locator('.va-dialog');
	await expect(dialog.getByRole('heading', { name: title })).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Închide' })).toBeVisible();
	const save = dialog.locator('.va-dialog__footer').getByRole('button', { name: /Salvează|Creează/ });
	await expect(save).toBeInViewport();
	await expect(dialog.locator('.va-dialog__footer').getByRole('button', { name: 'Anulează' })).toBeInViewport();
	return { dialog, save };
}

test.beforeEach(async ({ page }) => {
	await login(page, ADMIN_EMAIL);
});

test('adaugă un utilizator din fereastra de utilizator', async ({ page }, testInfo) => {
	const email = `nou-${testInfo.project.name}-${Date.now()}@e2e.test`;
	await page.goto('/admin/users');
	await page.getByRole('button', { name: /Adaugă Utilizator/ }).first().click();
	const { dialog, save } = await expectDialogShell(page, 'Adaugă utilizator nou');

	await dialog.getByLabel('Nume').fill('Utilizator din fereastră');
	await dialog.getByLabel('Email').click();
	await dialog.getByLabel('Email').fill(email);
	await dialog.getByLabel('Rol', { exact: true }).selectOption('student');
	await save.click();

	await expect(page.getByText('Utilizatorul a fost creat.')).toBeVisible();
	await expect(dialog).toHaveCount(0);
	await page.getByLabel('Caută utilizatori', { exact: true }).fill(email);
	await expect(page.locator('.admin-users-table').getByText(email, { exact: true }).locator('visible=true')).toHaveCount(1);
});

test('salvează descrierea mapei din fereastra de editare', async ({ page }, testInfo) => {
	const description = `Descriere ${testInfo.project.name} ${Date.now()}`;
	await page.goto('/admin/content');
	await page.getByRole('button', { name: 'Editează mapa' }).first().click();
	const { dialog, save } = await expectDialogShell(page, 'Editează mapa');

	await expect(dialog.getByLabel('Nume')).toHaveValue('Mapă E2E');

	// fila Aspect: coperta se încarcă, iar pe desktop totul încape fără derulare
	await expect(dialog.getByRole('tab', { name: 'Aspect' })).toHaveAttribute('aria-selected', 'true');
	await dialog.locator('input[type="file"]').setInputFiles(coverPath);
	await expect(page.getByText('Coperta a fost încărcată')).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Schimbă imaginea' })).toBeVisible();
	if (testInfo.project.name === 'desktop') {
		const [scrollHeight, clientHeight] = await dialog.locator('.va-dialog__body').evaluate((el) => [el.scrollHeight, el.clientHeight]);
		expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1);
	}

	// fila Cursuri: lista „În mapă” a rămas după încărcarea copertei (răspunsul nu conține cursurile)
	const aspectBox = await dialog.boundingBox();
	await dialog.getByRole('tab', { name: /Cursuri/ }).click();
	// fereastra are mărime fixă: nu se micșorează când fila are mai puțin conținut
	const coursesBox = await dialog.boundingBox();
	expect(Math.round(coursesBox.height)).toBe(Math.round(aspectBox.height));
	expect(Math.round(coursesBox.width)).toBe(Math.round(aspectBox.width));
	await expect(dialog.getByRole('button', { name: 'Scoate Curs E2E din mapă' })).toBeVisible();
	await expect(dialog.getByLabel('Nume')).toBeHidden();
	await dialog.getByRole('tab', { name: 'Aspect' }).click();

	await dialog.getByLabel(/Descriere/).fill(description);
	await save.click();
	await expect(page.getByText('Mapa a fost actualizată')).toBeVisible();

	await page.reload();
	await page.getByRole('button', { name: 'Editează mapa' }).first().click();
	await expect(page.locator('.va-dialog').getByLabel(/Descriere/)).toHaveValue(description);
});

test('salvează descrierea scurtă a cursului din fereastra de editare', async ({ page }, testInfo) => {
	const summary = `Rezumat ${testInfo.project.name} ${Date.now()}`;
	// cursul-ciornă al proiectului: „Curs E2E” e folosit de testele cursantului, iar o editare îl trece în „editing”
	const title = `Curs editor ${testInfo.project.name}`;
	const courses = await page.evaluate(async (q) => {
		const res = await fetch(`/api/admin/courses?search=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
		return res.json();
	}, title);
	const course = (courses.data || []).find((item) => item.title === title);
	await page.goto(`/admin/courses/${course.id}`);
	await page.getByRole('button', { name: 'Editează curs' }).first().click();
	const { dialog, save } = await expectDialogShell(page, 'Editare curs');

	await expect(dialog.getByLabel('Titlu curs')).toHaveValue(title);
	await dialog.getByLabel(/Descriere scurtă/).fill(summary);
	await save.click();
	await expect(page.getByText('Datele cursului au fost actualizate.')).toBeVisible();
	await expect(dialog).toHaveCount(0);

	await page.getByRole('button', { name: 'Editează curs' }).first().click();
	await expect(page.locator('.va-dialog').getByLabel(/Descriere scurtă/)).toHaveValue(summary);
	await page.locator('.va-dialog').getByRole('button', { name: 'Închide' }).click();
	await expect(page.locator('.va-dialog')).toHaveCount(0);
});
