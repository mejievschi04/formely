import { test, expect } from '@playwright/test';
import { login, ADMIN_EMAIL } from './helpers.js';

// Fișierele din E2eSeeder sunt separate pe proiect (desktop / mobile).
test.beforeEach(async ({ page }) => {
	await login(page, ADMIN_EMAIL);
	await page.goto('/admin/content?tab=media');
	await expect(page.getByRole('heading', { name: 'Fișiere media' })).toBeVisible();
});

test('șterge un fișier nefolosit', async ({ page }, testInfo) => {
	const name = `nefolosit-${testInfo.project.name}.pdf`;
	await page.getByLabel('Caută fișiere').fill(name);
	await expect(page.getByText(name, { exact: true })).toBeVisible();

	await page.getByRole('button', { name: `Șterge fișierul ${name}` }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Șterge', exact: true }).click();

	await expect(page.getByText('Fișierul a fost șters.')).toBeVisible();
	await expect(page.getByText(name, { exact: true })).toHaveCount(0);
});

test('un fișier folosit într-o lecție nu se șterge și arată lecția', async ({ page }, testInfo) => {
	const name = `folosit-${testInfo.project.name}.pdf`;
	await page.getByLabel('Caută fișiere').fill(name);
	await page.getByRole('button', { name: `Șterge fișierul ${name}` }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Șterge', exact: true }).click();

	await expect(page.getByRole('heading', { name: 'Fișierul este folosit' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Lecția 3' })).toBeVisible();
	await page.getByRole('button', { name: 'Închide' }).click();
	await expect(page.getByText(name, { exact: true })).toBeVisible();
});
