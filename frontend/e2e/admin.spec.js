import { test, expect } from '@playwright/test';
import { login, ADMIN_EMAIL } from './helpers.js';

test.beforeEach(async ({ page }) => {
	await login(page, ADMIN_EMAIL);
});

test('adminul ajunge pe panoul de control', async ({ page }) => {
	await expect(page).toHaveURL(/\/admin$/);
	await expect(page.getByRole('heading', { name: 'Panou de control' })).toBeVisible();
});

test('builder-ul afișează structura cursului și lecția deschisă', async ({ page }) => {
	await page.goto('/admin/courses/1/builder');
	await expect(page.getByText('Test final E2E').first()).toBeVisible();
	for (const lesson of ['Lecția 1', 'Lecția 2', 'Lecția 3']) {
		await expect(page.getByText(lesson, { exact: true }).first()).toBeVisible();
	}
	await expect(page.getByText('Conținutul lecției 1')).toBeVisible();
});

test('o adresă inexistentă din admin arată pagina 404', async ({ page }) => {
	await page.goto('/admin/pagina-care-nu-exista');
	await expect(page.getByRole('heading', { name: 'Pagina nu a fost găsită' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Înapoi la administrare' })).toBeVisible();
});

test('lista de utilizatori își arată numele și emailul pe câte un rând', async ({ page }) => {
	await page.goto('/admin/users');
	const row = page.locator('.admin-users-table tbody tr').filter({ hasText: 'student-desktop@e2e.test' });
	// rândurile de text ocupate de un element (pe telefon emailul se rupea literă cu literă)
	const textLines = (locator) => locator.evaluate((el) => {
		const range = document.createRange();
		range.selectNodeContents(el);
		return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
	});
	const name = row.locator('.admin-users-table-cell-name');
	await expect(name).toHaveText('Cursant E2E desktop');
	expect(await textLines(name)).toBe(1);
	const email = row.locator(':is(.admin-users-table-cell-email, .admin-users-table-cell-email-stacked):visible');
	await expect(email).toHaveText('student-desktop@e2e.test');
	expect(await textLines(email)).toBe(1);
	await expect(row.getByRole('button', { name: 'Editează utilizatorul: Cursant E2E desktop' })).toBeVisible();
});

test('în tema închisă butoanele din antetul mapei au text lizibil', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('volta-ui-theme', 'dark'));
	await page.goto('/admin/maps/1');
	const header = page.locator('.course-map-page-header');
	for (const name of ['Înapoi', 'Editează']) {
		const label = header.getByText(name, { exact: true });
		await expect(label).toBeVisible();
		// contrast text / fundalul butonului (fundalul era alb, iar textul lua culoarea deschisă a temei)
		const ratio = await label.evaluate((el) => {
			const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
			const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
				.reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
			const button = el.closest('button');
			const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(rgb(getComputedStyle(button).backgroundColor))];
			return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
		});
		expect(ratio, name).toBeGreaterThanOrEqual(4.5);
	}
});

test('butonul X închide fereastra și are aspectul comun', async ({ page }) => {
	await page.goto('/admin/teams');
	await page.getByRole('button', { name: 'Adaugă Echipă' }).first().click();
	const heading = page.getByRole('heading', { name: 'Adaugă Echipă Nouă' });
	await expect(heading).toBeVisible();
	const close = page.locator('.va-close-btn:visible');
	await expect(close).toHaveCount(1);
	await expect(close).toHaveAccessibleName('Închide');
	// iconița comună (nu caracterul „×”), într-un buton cu margine vizibilă
	await expect(close.locator('svg')).toHaveCount(1);
	await expect(close).toHaveText('');
	const borderWidth = await close.evaluate((el) => getComputedStyle(el).borderTopWidth);
	expect(borderWidth).toBe('1px');
	await close.click();
	await expect(heading).toHaveCount(0);
});

// contrast text / fundal efectiv (culorile cu transparență sunt compuse peste părinți)
async function contrastOf(locator) {
	return locator.evaluate((el) => {
		const parse = (c) => { const p = c.match(/[\d.]+/g).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
		const over = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
		const lum = (c) => [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
			.reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
		const chain = [];
		for (let n = el; n; n = n.parentElement) chain.unshift(n);
		let bg = { r: 255, g: 255, b: 255, a: 1 };
		for (const n of chain) {
			const b = parse(getComputedStyle(n).backgroundColor);
			if (b.a > 0) bg = over(b, bg);
		}
		const fg = over(parse(getComputedStyle(el).color), bg);
		const [x, y] = [lum(fg), lum(bg)];
		return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
	});
}

test('în tema deschisă textul de accent din notificări se citește (nu e galben pe alb)', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('volta-ui-theme', 'light'));
	await page.goto('/admin');
	await page.getByRole('button', { name: 'Deschide notificările' }).click();
	const drawer = page.locator('.va-notif-drawer-panel');
	for (const target of [drawer.getByRole('tab', { name: /Primite/ }), drawer.getByRole('button', { name: 'Marchează toate ca citite' })]) {
		await expect(target).toBeVisible();
		expect(await contrastOf(target)).toBeGreaterThanOrEqual(4.5);
	}
});

test('pagina Ghiduri deschisă direct are meniul de admin stilizat', async ({ page }) => {
	await page.goto('/guides');
	await expect(page.getByRole('heading', { name: 'Ghiduri', exact: true })).toBeVisible();
	// fără stilurile de admin, meniul lateral apărea ca o listă de linkuri în fluxul paginii
	const nav = page.getByRole('link', { name: 'Panou' }).first();
	await expect(nav).toBeAttached();
	const position = await page.locator('aside.modern-sidebar').first().evaluate((el) => getComputedStyle(el).position);
	expect(['fixed', 'sticky']).toContain(position);
});

test('Biblioteca și Ghidurile au margine față de meniu, iar antetul e aliniat cu lista', async ({ page }) => {
	for (const [url, list] of [['/library', 'Materiale disponibile'], ['/guides', 'Ghiduri disponibile']]) {
		await page.goto(url);
		const header = page.locator('.library-page-header');
		const listTitle = page.getByRole('heading', { name: list });
		await expect(listTitle).toBeVisible();
		// stilurile de admin se încarcă după pagină: așteptăm meniul lateral stilizat înainte de măsurare
		await expect.poll(() => page.locator('aside.modern-sidebar').first().evaluate((el) => getComputedStyle(el).position)).toMatch(/fixed|sticky/);
		// pagina intră cu o animație: comparăm pozițiile după ce s-au stabilizat
		await expect.poll(async () => Math.round((await listTitle.boundingBox()).x - (await header.boundingBox()).x), { message: url }).toBe(0);
		// înainte conținutul era lipit de meniul lateral (spațierea era anulată în cadrul de admin)
		const mainLeft = await page.locator('.va-shell-main').first().evaluate((el) => el.getBoundingClientRect().left);
		expect((await header.boundingBox()).x - mainLeft, url).toBeGreaterThanOrEqual(16);
	}
});

test('adminul parcurge un test ca un cursant, fără să i se salveze încercarea', async ({ page }) => {
	await page.goto('/admin/content?tab=tests');
	await page.locator('.admin-content-card').filter({ hasText: 'Test final E2E' }).getByRole('button', { name: 'Încearcă testul' }).click();
	await expect(page).toHaveURL(/\/exams\/\d+\?preview=1/);
	await expect(page.getByRole('note')).toContainText('nu se salvează');

	await page.getByLabel('București').check();
	await page.getByRole('button', { name: 'Întrebarea următoare' }).click();
	await page.getByLabel('4', { exact: true }).check();
	const submit = page.getByRole('button', { name: /Trimite/ }).first();
	await submit.click();
	const confirm = page.getByRole('dialog').getByRole('button', { name: /Trimite/ });
	if (await confirm.isVisible().catch(() => false)) await confirm.click();
	await expect(page.getByText('Promovat').first()).toBeVisible();

	await page.getByRole('link', { name: /Înapoi la teste/ }).first().click();
	await expect(page).toHaveURL(/\/admin\/content\?tab=tests/);
});

test('builder-ul de test: antet cu acțiuni, file și alegerea tipului întrebării într-o fereastră', async ({ page }) => {
	await page.goto('/admin/tests/1/builder');
	await expect(page.getByRole('heading', { level: 1, name: 'Test final E2E' })).toBeVisible();
	await expect(page.getByRole('tab', { name: /Întrebări \(2\)/ })).toHaveAttribute('aria-selected', 'true');
	// panoul cu tipuri nu mai stă deschis peste pagină
	await expect(page.getByRole('heading', { name: 'Tipul întrebării' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Întrebarea 1: Răspuns multiplu. Schimbă tipul' }).click();
	const dialog = page.getByRole('dialog', { name: 'Tipul întrebării' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('radio', { name: /Răspuns multiplu/ })).toHaveAttribute('aria-checked', 'true');
	await expect(dialog.getByRole('radio', { name: /Potrivire/ })).toHaveAttribute('aria-checked', 'false');
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);

	await page.getByRole('tab', { name: 'Setări' }).click();
	await expect(page.getByLabel('Titlu test')).toHaveValue('Test final E2E');

	await page.getByRole('button', { name: 'Încearcă testul' }).click();
	await expect(page).toHaveURL(/\/exams\/1\?preview=1/);
});

test('în editorul întrebării, varianta corectă se marchează clar și rămâne salvată', async ({ page }) => {
	// „Test cu toate tipurile” din E2eSeeder; testul revine la starea inițială, ca rularea pe celălalt proiect să înceapă la fel
	await page.goto('/admin/tests/2/builder');
	const question = page.locator('[data-qtype="multiple_choice"]');
	await question.getByRole('button', { name: 'Editează' }).click();

	const green = question.getByLabel('Varianta 2 este corectă');
	await expect(green).not.toBeChecked();
	await expect(question.locator('.va-qa__row').nth(1)).toContainText('Greșit');
	await green.check();
	await expect(question.locator('.va-qa__row').nth(1)).toContainText('Corect');
	await page.waitForLoadState('networkidle');

	await page.reload();
	await page.locator('[data-qtype="multiple_choice"]').getByRole('button', { name: 'Editează' }).click();
	const reloaded = page.locator('[data-qtype="multiple_choice"]').getByLabel('Varianta 2 este corectă');
	await expect(reloaded).toBeChecked();

	await reloaded.uncheck();
	await expect(page.locator('[data-qtype="multiple_choice"] .va-qa__row').nth(1)).toContainText('Greșit');
	await page.waitForLoadState('networkidle');
});

test('setările testului: comutatoarele se salvează și rămân după reîncărcare', async ({ page }) => {
	// „Test cu toate tipurile”; comutatorul revine la starea inițială pentru rularea pe celălalt proiect
	await page.goto('/admin/tests/2/builder?section=settings');
	await expect(page.getByRole('heading', { name: 'Comportament' })).toBeVisible();
	const shuffle = page.getByRole('switch', { name: /Amestecă întrebările/ });
	await expect(shuffle).not.toBeChecked();
	await page.locator('.va-ts__toggle').filter({ hasText: 'Amestecă întrebările' }).click();
	await expect(shuffle).toBeChecked();
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(600);

	await page.reload();
	const reloaded = page.getByRole('switch', { name: /Amestecă întrebările/ });
	await expect(reloaded).toBeChecked();
	await page.locator('.va-ts__toggle').filter({ hasText: 'Amestecă întrebările' }).click();
	await expect(reloaded).not.toBeChecked();
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(600);
});

test('în examen, întrebarea se editează ca în builder-ul de test: tipul cu opțiuni, variante Corect/Greșit', async ({ page }, info) => {
	await page.goto('/admin/content?tab=exams');
	await page.getByRole('button', { name: 'Creează examen' }).first().click();
	await page.getByRole('dialog').getByLabel('Titlu').fill(`Examen editor ${info.project.name} ${Date.now()}`);
	await page.getByRole('dialog').getByRole('button', { name: 'Creează' }).click();

	await page.getByRole('tab', { name: /Întrebări/ }).first().click();
	await page.getByText('Mapă E2E').first().click();
	await page.getByRole('button', { name: 'Adaugă toate' }).first().click();
	await expect(page.getByRole('button', { name: 'Scoate' }).first()).toBeVisible();

	await page.getByRole('button', { name: /Care este capitala României\?/ }).click();
	const dialog = page.getByRole('dialog', { name: 'Editează întrebarea' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('radiogroup', { name: 'Tipul întrebării' })).toHaveCount(0);
	await dialog.getByRole('button', { name: /Tipul întrebării: Răspuns multiplu/ }).click();
	await expect(dialog.getByRole('radio', { name: /Răspuns multiplu/ })).toHaveAttribute('aria-checked', 'true');

	const correct = dialog.getByLabel('Varianta 1 este corectă');
	await expect(correct).toBeChecked();
	await expect(dialog.locator('.va-qa__row').first()).toContainText('Corect');
	await expect(dialog.getByLabel('Varianta 2 este corectă')).not.toBeChecked();
	await expect(dialog.locator('.va-qa__row').nth(1)).toContainText('Greșit');

	// fără salvare: întrebarea aparține testului din curs
	await dialog.getByRole('button', { name: 'Închide' }).click();
	await expect(dialog).toHaveCount(0);
});

test('setările examenului au secțiunile din builder-ul de test, iar încercările se setează cu comutator și se salvează', async ({ page }, info) => {
	const title = `Examen setări ${info.project.name} ${Date.now()}`;
	await page.goto('/admin/content?tab=exams');
	await page.getByRole('button', { name: 'Creează examen' }).first().click();
	await page.getByRole('dialog').getByLabel('Titlu').fill(title);
	await page.getByRole('dialog').getByRole('button', { name: 'Creează' }).click();

	for (const name of ['Informații', 'Desfășurare', 'Termen limită', 'Comportament']) {
		await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
	}
	const unlimited = page.getByRole('switch', { name: 'Nelimitate' });
	const attempts = page.getByLabel('Încercări', { exact: true });
	await expect(unlimited).toBeChecked();
	await expect(attempts).toBeDisabled();
	await page.locator('.va-ts__switch').filter({ hasText: 'Nelimitate' }).click();
	await expect(attempts).toBeEnabled();
	await attempts.fill('3');
	await page.locator('.va-ts__toggle').filter({ hasText: 'Amestecă întrebările' }).click();
	await expect(page.getByRole('switch', { name: /Amestecă întrebările/ })).toBeChecked();
	await page.getByRole('button', { name: 'Salvează', exact: true }).click();
	await expect(page.getByText('Examen salvat cu succes.')).toBeVisible();

	await page.getByRole('button', { name: 'Înapoi' }).first().click();
	await page.getByRole('article').filter({ hasText: title }).getByRole('button', { name: 'Deschide builder-ul' }).click();
	await expect(page.getByLabel('Încercări', { exact: true })).toHaveValue('3');
	await expect(page.getByRole('switch', { name: 'Nelimitate' })).not.toBeChecked();
	await expect(page.getByRole('switch', { name: /Amestecă întrebările/ })).toBeChecked();
});
