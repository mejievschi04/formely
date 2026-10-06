import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, ADMIN_EMAIL } from './helpers.js';

const imagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures-pixel.png');

// Fiecare proiect (desktop, mobile) are cursul lui în E2eSeeder („Curs editor <proiect>”).
test('editorul de lecții formatează, inserează și salvează conținutul', async ({ page }, testInfo) => {
	const consoleProblems = [];
	page.on('console', (message) => {
		if (['warning', 'error'].includes(message.type())) consoleProblems.push(message.text());
	});
	await login(page, ADMIN_EMAIL);
	const title = `Curs editor ${testInfo.project.name}`;
	const courses = await page.evaluate(async (q) => {
		const res = await fetch(`/api/admin/courses?search=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
		return res.json();
	}, title);
	const course = (courses.data || []).find((item) => item.title === title);
	expect(course).toBeTruthy();

	await page.goto(`/admin/courses/${course.id}/builder`);
	const toolbar = page.getByRole('toolbar', { name: 'Formatare lecție' });
	const surface = page.locator('.lesson-tiptap-surface');
	await expect(surface).toContainText('Text inițial.');
	await expect(toolbar.getByRole('button', { name: 'Anulează' })).toBeDisabled();

	// Selecție pusă direct prin API-ul browserului (ProseMirror o preia): tastele Home/End diferă între sisteme.
	const select = async (text, { collapseToEnd = false } = {}) => {
		await surface.evaluate((root, args) => {
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			let node = walker.nextNode();
			while (node && node.textContent !== args.text) node = walker.nextNode();
			if (!node) throw new Error(`Textul „${args.text}” nu e în editor`);
			root.focus();
			const range = document.createRange();
			range.setStart(node, args.collapseToEnd ? node.length : 0);
			range.setEnd(node, node.length);
			const selection = window.getSelection();
			selection.removeAllRanges();
			selection.addRange(range);
		}, { text, collapseToEnd });
		await page.waitForTimeout(50);
	};
	// selectarea unui text deschide panoul de chenar, care pe telefon acoperă bara de unelte
	const closeCalloutPanel = async () => {
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog', { name: 'Chenar' })).toHaveCount(0);
	};

	// text aldin: butonul își arată starea activă, iar „Anulează” devine disponibil
	await select('Text inițial.', { collapseToEnd: true });
	await page.keyboard.press('Enter');
	await toolbar.getByRole('button', { name: 'Aldin' }).click();
	await expect(toolbar.getByRole('button', { name: 'Aldin' })).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.type('Aldin');
	await expect(surface.locator('strong')).toHaveText('Aldin');
	await expect(toolbar.getByRole('button', { name: 'Anulează' })).toBeEnabled();
	await toolbar.getByRole('button', { name: 'Aldin' }).click();
	await expect(toolbar.getByRole('button', { name: 'Aldin' })).toHaveAttribute('aria-pressed', 'false');

	// link pe cuvântul selectat
	await page.keyboard.press('Enter');
	await page.keyboard.type('Documentație');
	await select('Documentație');
	await closeCalloutPanel();
	page.once('dialog', (dialog) => dialog.accept('https://example.com/doc'));
	await toolbar.getByRole('button', { name: 'Link' }).click();
	await expect(surface.locator('a[href="https://example.com/doc"]')).toHaveText('Documentație');

	// chenar în jurul unui paragraf nou
	await select('Documentație', { collapseToEnd: true });
	await page.keyboard.press('Enter');
	await page.keyboard.type('Atenție');
	await select('Atenție');
	await closeCalloutPanel();
	await toolbar.getByRole('button', { name: 'Chenar' }).click();
	const panel = page.getByRole('dialog', { name: 'Chenar' });
	await panel.getByRole('button', { name: 'Atenție' }).click();
	await panel.getByRole('button', { name: 'Gradient' }).click();
	await expect(surface.locator('blockquote[data-callout-variant="warning"][data-callout-fill="gradient"]')).toHaveText('Atenție');
	await panel.getByRole('button', { name: 'Închide' }).click();

	// imagine încărcată pe server
	await page.locator('.lesson-tiptap input[type="file"]').setInputFiles(imagePath);
	await expect(surface.locator('img')).toHaveCount(1);

	await toolbar.getByRole('button', { name: 'Salvează' }).click();
	await expect(toolbar.getByRole('button', { name: 'Salvează' })).toBeEnabled();

	// după reîncărcare conținutul e cel salvat
	await page.reload();
	await expect(surface).toContainText('Text inițial.');
	await expect(surface.locator('strong')).toHaveText('Aldin');
	await expect(surface.locator('a[href="https://example.com/doc"]')).toHaveText('Documentație');
	await expect(surface.locator('blockquote[data-callout-variant="warning"][data-callout-fill="gradient"]')).toHaveText('Atenție');
	await expect(surface.locator('img')).toHaveCount(1);

	// TipTap anunță în consolă extensiile duplicate sau opțiunile greșite
	expect(consoleProblems.filter((text) => /tiptap|extension/i.test(text))).toEqual([]);
});
