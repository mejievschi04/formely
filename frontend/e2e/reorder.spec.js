import { test, expect } from '@playwright/test';
import { login, ADMIN_EMAIL } from './helpers.js';

// Echipele și cursurile din „Mapă E2E” (E2eSeeder) se reordonează cu butonul de mutare, inclusiv de la tastatură.
// Fiecare rulare inversează primele două carduri, deci testul nu depinde de ordinea lăsată de proiectul anterior.
async function moveFirstCardForward(page, { handles, titles }) {
	const before = await titles.allTextContents();
	expect(before.length).toBeGreaterThanOrEqual(2);

	// dnd-kit anunță fiecare pas pentru cititoarele de ecran; așteptăm anunțul înainte de tasta următoare
	const announcer = page.locator('[id^="DndLiveRegion"]');
	await handles.first().focus();
	await page.keyboard.press('Space');
	await expect(announcer).toContainText('was moved over');
	const pickedUp = await announcer.textContent();
	// pe telefon cardurile stau unul sub altul
	const [first, second] = [await handles.nth(0).boundingBox(), await handles.nth(1).boundingBox()];
	await page.keyboard.press(second.y > first.y + first.height ? 'ArrowDown' : 'ArrowRight');
	await expect(announcer).not.toHaveText(pickedUp);
	await page.keyboard.press('Space');
	await expect(announcer).toContainText('was dropped');

	await expect(titles.first()).toHaveText(before[1]);
	return before;
}

test('echipele se reordonează de la tastatură, iar ordinea rămâne după reîncărcare', async ({ page }) => {
	await login(page, ADMIN_EMAIL);
	await page.goto('/admin/teams');
	const handles = page.getByLabel('Trage pentru a reordona echipa');
	const titles = page.locator('.admin-team-card-compact__title');
	await expect(handles).toHaveCount(2);

	const before = await moveFirstCardForward(page, { handles, titles });
	await page.waitForLoadState('networkidle');
	await page.reload();
	await expect(titles.first()).toHaveText(before[1]);
	await expect(titles.nth(1)).toHaveText(before[0]);
});

test('cursurile dintr-o mapă se reordonează de la tastatură, iar ordinea rămâne după reîncărcare', async ({ page }) => {
	await login(page, ADMIN_EMAIL);
	await page.goto('/admin/maps/1');
	const handles = page.getByLabel('Trage pentru a reordona cursul în mapă');
	const titles = page.locator('.course-showcase-card__title');
	await expect(handles).toHaveCount(2);

	const before = await moveFirstCardForward(page, { handles, titles });
	await page.waitForLoadState('networkidle');
	await page.reload();
	await expect(titles.first()).toHaveText(before[1]);
	await expect(titles.nth(1)).toHaveText(before[0]);
});
