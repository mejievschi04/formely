import { expect } from '@playwright/test';

// Conturile din volta-backend/database/seeders/E2eSeeder.php
export const PASSWORD = 'E2e-parola-1';
export const ADMIN_EMAIL = 'admin@e2e.test';

/** Fiecare proiect (desktop, mobile) are cursantul lui, ca încercările să nu se amestece. */
export const studentEmail = (testInfo) => `student-${testInfo.project.name}@e2e.test`;

export async function login(page, email) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Parolă', { exact: true }).fill(PASSWORD);
	await page.getByRole('button', { name: 'Autentificare' }).click();
	await expect(page).not.toHaveURL(/\/login/);
}
