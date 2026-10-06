import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Teste end-to-end: pornesc un backend pe o bază SQLite separată (recreată la fiecare rulare din
// E2eSeeder) și Vite pe alte porturi decât cele de dezvoltare, deci nu ating datele locale.
const root = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(root, '../backend');
const dbPath = path.join(backendDir, 'storage/framework/testing/e2e.sqlite');
// fișierele încărcate în teste (ex. imagini din editorul de lecții), golit la fiecare rulare
const publicRoot = path.join(backendDir, 'storage/framework/testing/e2e-public');
const BACKEND_PORT = 8011;
const FRONTEND_PORT = 5175;
const frontendUrl = `http://localhost:${FRONTEND_PORT}`;

const backendEnv = {
	APP_ENV: 'local',
	APP_DEBUG: 'false',
	APP_URL: frontendUrl,
	FRONTEND_URL: frontendUrl,
	SANCTUM_STATEFUL_DOMAINS: `localhost:${FRONTEND_PORT}`,
	SESSION_DOMAIN: '',
	SESSION_DRIVER: 'database',
	DB_CONNECTION: 'sqlite',
	DB_DATABASE: dbPath,
	PUBLIC_STORAGE_ROOT: publicRoot,
	CACHE_STORE: 'array',
	QUEUE_CONNECTION: 'sync',
	MAIL_MAILER: 'array',
	LOG_CHANNEL: 'null',
	// fără apeluri AI reale din teste
	GROQ_API_KEY: '',
	OPENAI_API_KEY: '',
	HUGGINGFACE_API_KEY: '',
};

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	timeout: 60_000,
	expect: { timeout: 15_000 },
	reporter: [['list']],
	use: {
		baseURL: frontendUrl,
		// Chrome-ul instalat pe sistem: nu e nevoie de `npx playwright install`
		channel: 'chrome',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
		{ name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
	],
	webServer: [
		{
			command: `rm -f "${dbPath}" && touch "${dbPath}" && rm -rf "${publicRoot}" && mkdir -p "${publicRoot}" && php artisan migrate:fresh --seed --seeder=E2eSeeder --force && php artisan serve --port=${BACKEND_PORT}`,
			cwd: backendDir,
			env: backendEnv,
			url: `http://localhost:${BACKEND_PORT}/up`,
			reuseExistingServer: false,
			timeout: 120_000,
		},
		{
			command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
			cwd: root,
			// VITE_API_URL relativ: cererile trec prin proxy-ul Vite spre backend-ul de test,
			// indiferent ce URL absolut are .env-ul local.
			env: { VOLTA_BACKEND_URL: `http://localhost:${BACKEND_PORT}`, VITE_API_URL: '/api', VITE_STORAGE_URL: '' },
			url: frontendUrl,
			reuseExistingServer: false,
			timeout: 120_000,
		},
	],
});
