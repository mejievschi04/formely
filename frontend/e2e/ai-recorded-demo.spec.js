import { test, expect } from '@playwright/test';

async function mockAcademy(page, { demo, aiEnabled = false }) {
	const writes = [];
	await page.addInitScript(() => {
		sessionStorage.setItem('formely_demo_guide_open', '0');
		sessionStorage.setItem('formely_demo_banner_dismissed', '1');
	});
	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(path);
		let payload = { data: [], notifications: [], unread_count: 0, count: 0 };
		if (path.endsWith('/csrf-cookie')) payload = { token: 'test-csrf' };
		if (path.endsWith('/auth/me')) payload = {
			user: {
				id: 900, name: 'Demo Admin', role: 'admin', status: 'active',
				is_demo: demo, is_public_demo_session: false,
				company: { id: 90, name: 'Academie Demo', is_demo: demo },
				capabilities: { volt: aiEnabled },
				entitlements: {
					features: { ai_creator: true, ai_test_generation: true },
					ai_usage: { credits: { remaining: 0, limit: 0 } },
				},
			},
		};
		await route.fulfill({ json: payload });
	});
	return writes;
}

test('recorded demo works with AI disabled and zero credits without any API writes', async ({ page }) => {
	const writes = await mockAcademy(page, { demo: true });
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/admin/ai-setup');
	await expect(page.getByLabel('Subiect / titlu curs')).toHaveValue('Prima zi în echipă');
	await page.getByRole('button', { name: 'Continuă', exact: true }).click();
	await expect(page.getByText('Demonstrație înregistrată', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Redă demonstrația', exact: true }).click();
	await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
	await page.getByRole('button', { name: 'Pauză', exact: true }).click();
	await page.clock.install();
	await page.clock.fastForward(6000);
	await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
	await page.getByRole('button', { name: 'Continuă demonstrația', exact: true }).click();
	for (let i = 0; i < 3; i++) await page.clock.fastForward(1800);
	await expect(page.getByRole('heading', { name: 'Acces la conturi și instrumente', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Explorează cursurile demo' })).toHaveAttribute('href', '/admin/content?tab=courses');
	await page.getByRole('button', { name: 'Reia de la început' }).click();
	await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
	await page.getByRole('button', { name: 'Înapoi la material' }).click();
	await page.clock.fastForward(10000);
	await page.getByRole('button', { name: 'Continuă', exact: true }).click();
	await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
	expect(writes).toEqual([]);
	expect(errors).toEqual([]);
});

test('real academy keeps its AI gate and generation flow instead of recorded content', async ({ page }) => {
	await mockAcademy(page, { demo: false });
	await page.goto('/admin/ai-setup');
	await expect(page.getByText('Planul sau configurarea AI nu permite încă acest flux.', { exact: false })).toBeVisible();
	await expect(page.getByText('Demonstrație înregistrată', { exact: true })).toHaveCount(0);
	await page.unroute('**/api/**');
	await mockAcademy(page, { demo: false, aiEnabled: true });
	await page.reload();
	await expect(page.getByLabel('Subiect / titlu curs')).toHaveValue('Onboarding angajați noi');
	await page.getByLabel('Sau adaugă textul direct').fill('Ghidul real al companiei: proceduri de lucru și instrucțiuni pentru colegii noi.');
	await page.getByRole('button', { name: 'Continuă', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Generează cursul', exact: true })).toBeVisible();
	await expect(page.getByText('Demonstrație înregistrată', { exact: true })).toHaveCount(0);
});
