import { test, expect } from '@playwright/test';
import { PASSWORD } from './helpers.js';

test('o pagină protejată trimite vizitatorul neautentificat la login', async ({ page }) => {
	await page.goto('/courses');
	await expect(page).toHaveURL(/\/login/);
	await expect(page.getByRole('heading', { name: 'Bine ai revenit' })).toBeVisible();
});

test('o parolă greșită nu autentifică', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@e2e.test');
	await page.getByLabel('Parolă', { exact: true }).fill(`${PASSWORD}-gresita`);
	await page.getByRole('button', { name: 'Autentificare' }).click();
	await expect(page).toHaveURL(/\/login/);
});
