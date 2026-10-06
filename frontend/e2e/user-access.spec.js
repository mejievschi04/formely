import { test, expect } from '@playwright/test';
import { login, ADMIN_EMAIL, PASSWORD } from './helpers.js';

// Contul din E2eSeeder pe care îl suspendăm, separat pe proiect (desktop / mobile).
const account = (testInfo) => ({
	name: `Angajat acces ${testInfo.project.name}`,
	email: `access-${testInfo.project.name}@e2e.test`,
});

async function openEdit(page, name) {
	await page.goto('/admin/users');
	await page.getByLabel('Caută utilizatori', { exact: true }).fill(name);
	await page.getByRole('button', { name: `Editează utilizatorul: ${name}` }).click();
	await expect(page.getByRole('heading', { name: 'Acces cont' })).toBeVisible();
}

test('adminul suspendă un cont, care nu se mai poate autentifica, apoi îl reactivează', async ({ page, browser }, testInfo) => {
	const { name, email } = account(testInfo);
	await login(page, ADMIN_EMAIL);

	await openEdit(page, name);
	await page.getByRole('button', { name: 'Suspendă contul' }).click();
	await page.getByLabel(/Motiv/).fill('Test end-to-end');
	await page.getByRole('button', { name: 'Confirmă suspendarea' }).click();
	await expect(page.getByText('Utilizator suspendat cu succes')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Reactivează contul' })).toBeVisible();

	// contul suspendat nu intră
	const other = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL });
	const visitor = await other.newPage();
	await visitor.goto('/login');
	await visitor.getByLabel('Email').fill(email);
	await visitor.getByLabel('Parolă', { exact: true }).fill(PASSWORD);
	await visitor.getByRole('button', { name: 'Autentificare' }).click();
	await expect(visitor.getByText('Contul tău a fost suspendat.')).toBeVisible();
	await expect(visitor).toHaveURL(/\/login/);

	await page.getByRole('button', { name: 'Reactivează contul' }).click();
	await expect(page.getByText('Utilizator activat cu succes')).toBeVisible();

	// după reactivare intră din nou
	await visitor.getByRole('button', { name: 'Autentificare' }).click();
	await expect(visitor).not.toHaveURL(/\/login/);
	await other.close();
});

test('adminul cere schimbarea parolei la următoarea autentificare', async ({ page }, testInfo) => {
	await login(page, ADMIN_EMAIL);
	await openEdit(page, account(testInfo).name);
	await page.getByRole('button', { name: 'Cere schimbarea parolei' }).click();
	await expect(page.getByText('Va trebui să-și schimbe parola la următoarea autentificare.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Cere schimbarea parolei' })).toBeDisabled();
});
