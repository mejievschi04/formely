import { test, expect } from '@playwright/test';
import { login, ADMIN_EMAIL } from './helpers.js';

// Folderele din E2eSeeder sunt separate pe proiect (desktop / mobile), pentru că testele le modifică.
const folder = (kind, testInfo) => `Folder ${kind} ${testInfo.project.name}`;

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
	await login(page, ADMIN_EMAIL);
});

async function openFolder(page, title) {
	await page.goto('/admin/question-banks');
	await page.getByRole('button', { name: 'Foldere' }).click();
	await page.getByText(title, { exact: true }).click();
	await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

test('mută întrebările selectate în alt folder', async ({ page }, testInfo) => {
	await openFolder(page, folder('sursă', testInfo));
	await page.getByRole('button', { name: 'Selectează vizibile' }).click();
	await page.getByRole('button', { name: 'Mută în alt folder' }).click();

	await page.getByLabel('Folderul în care le muți').selectOption({ label: folder('țintă', testInfo) });
	await page.getByRole('button', { name: 'Mută', exact: true }).click();

	await expect(page.getByText(/2 întrebări mutate în/)).toBeVisible();
	await expect(page.getByText('Folder gol')).toBeVisible();

	await openFolder(page, folder('țintă', testInfo));
	await expect(page.getByText(`Prima întrebare din folder (${testInfo.project.name})`)).toBeVisible();
	await expect(page.getByText(`A doua întrebare din folder (${testInfo.project.name})`)).toBeVisible();
});

test('șterge un folder după confirmare', async ({ page }, testInfo) => {
	const title = folder('de șters', testInfo);
	await openFolder(page, title);
	await page.getByRole('button', { name: 'Șterge folderul' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Șterge folderul' }).click();

	await expect(page).toHaveURL(/\/admin\/question-banks$/);
	await expect(page.getByText('Folderul a fost șters.')).toBeVisible();
	await page.getByRole('button', { name: 'Foldere' }).click();
	await expect(page.getByText(folder('țintă', testInfo), { exact: true })).toBeVisible();
	await expect(page.getByText(title, { exact: true })).toHaveCount(0);
});
