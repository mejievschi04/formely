import { test, expect } from '@playwright/test';
import { login, ADMIN_EMAIL } from './helpers.js';

// Modificarea unei lecții dintr-un curs publicat: builder-ul arată că ea nu e încă publicată, cursantul vede
// versiunea publicată până la „Publică modificările”, apoi, la refresh, varianta nouă.
// Rulează după testele cursantului (ordinea fișierelor), pe „Curs E2E”, doar pe desktop (builder-ul).
test('o modificare a lecției ajunge la cursant după „Publică modificările”', async ({ browser }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'fluxul de editare din builder se verifică pe desktop');
	const context = { ...testInfo.project.use, baseURL: testInfo.project.use.baseURL };
	const admin = await (await browser.newContext(context)).newPage();
	const student = await (await browser.newContext(context)).newPage();
	await login(admin, ADMIN_EMAIL);
	await login(student, `student-${testInfo.project.name}@e2e.test`);
	const marker = `Text adăugat ${Date.now()}`;

	await student.goto('/courses/1/lessons/1');
	await expect(student.getByText('Conținutul lecției 1')).toBeVisible();

	await admin.goto('/admin/courses/1/builder');
	const surface = admin.locator('.lesson-tiptap-surface');
	await expect(surface).toContainText('Conținutul lecției 1');
	// cursorul la capătul paragrafului (Home/End diferă între sisteme)
	await surface.evaluate((root) => {
		const p = [...root.querySelectorAll('p')].find((el) => el.textContent.includes('Conținutul lecției 1'));
		const range = document.createRange();
		range.selectNodeContents(p);
		range.collapse(false);
		root.focus();
		getSelection().removeAllRanges();
		getSelection().addRange(range);
	});
	await admin.keyboard.type(` ${marker}`);
	await admin.getByRole('toolbar', { name: 'Formatare lecție' }).getByRole('button', { name: 'Salvează' }).click();

	// builder-ul spune că modificarea nu e publicată (înainte: „Cursanții văd această versiune publicată”)
	await expect(admin.getByText('Publicat · Ai modificări nepublicate')).toBeVisible();
	const publish = admin.getByRole('button', { name: 'Publică modificările' });
	await expect(publish).toBeVisible();

	await student.reload();
	await expect(student.getByText('Conținutul lecției 1')).toBeVisible();
	await expect(student.getByText(marker)).toHaveCount(0);

	await publish.click();
	const dialog = admin.getByRole('dialog');
	await dialog.getByRole('button', { name: /Publică/ }).last().click();
	await expect(admin.getByText('Publicat · Ai modificări nepublicate')).toHaveCount(0);

	await student.reload();
	await expect(student.getByText(marker)).toBeVisible();
});
