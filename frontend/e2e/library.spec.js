import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, ADMIN_EMAIL } from './helpers.js';

const imagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures-pixel.png');

// Materialele scrise în bibliotecă folosesc editorul din builder-ul de lecții.
test('adminul scrie un material cu editorul de lecții și îl publică în bibliotecă', async ({ page }, testInfo) => {
	await login(page, ADMIN_EMAIL);
	await page.goto('/library/compose');

	const title = `Material scris ${testInfo.project.name}`;
	await page.getByRole('textbox', { name: 'Titlu', exact: true }).fill(title);

	const toolbar = page.getByRole('toolbar', { name: 'Formatare lecție' });
	const surface = page.locator('.lesson-tiptap-surface');
	await surface.click();
	await page.keyboard.type('Primul paragraf al materialului.');
	await page.keyboard.press('Enter');
	await page.keyboard.type('Reține asta');

	// chenar pe paragraful selectat (selecția prin API-ul browserului, ca în testul editorului de lecții)
	await surface.evaluate((root) => {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let node = walker.nextNode();
		while (node && node.textContent !== 'Reține asta') node = walker.nextNode();
		root.focus();
		const range = document.createRange();
		range.setStart(node, 0);
		range.setEnd(node, node.length);
		window.getSelection().removeAllRanges();
		window.getSelection().addRange(range);
	});
	await page.waitForTimeout(50);
	await page.keyboard.press('Escape');
	await toolbar.getByRole('button', { name: 'Chenar' }).click();
	const panel = page.getByRole('dialog', { name: 'Chenar' });
	await panel.getByRole('button', { name: 'Verde' }).click();
	await expect(surface.locator('blockquote[data-callout-variant="tip"]')).toHaveText('Reține asta');
	await panel.getByRole('button', { name: 'Închide' }).click();

	// imaginea se încarcă pe server, nu rămâne base64 (HtmlSanitizer ar elimina-o)
	await page.locator('.lesson-tiptap input[type="file"]').setInputFiles(imagePath);
	await expect(surface.locator('img[src*="/storage/library/images/"]')).toHaveCount(1);

	await page.getByRole('button', { name: 'Publică în bibliotecă' }).click();
	await expect(page).toHaveURL(/\/library\/items\/\d+/);

	const article = page.locator('.library-reader-article-body');
	await expect(article).toContainText('Primul paragraf al materialului.');
	await expect(article.locator('blockquote[data-callout-variant="tip"]')).toHaveText('Reține asta');
	await expect(article.locator('img[src*="/storage/library/images/"]')).toHaveCount(1);
});
