#!/usr/bin/env node
/**
 * Formely – LMS Audit Script
 *
 * Testează API-ul și fluxurile tipice LMS; raportează ce nu e în regulă.
 * Rulează: node scripts/test-lms-audit.js
 * Opțional: API_URL=http://localhost:8000/api LMS_TEST_ADMIN_EMAIL=admin@test.com LMS_TEST_ADMIN_PASSWORD=secret node scripts/test-lms-audit.js
 */

const fs = require('fs');
const path = require('path');

const API_URL = process.env.API_URL || process.env.VITE_API_URL || 'http://localhost:8000/api';
const ADMIN_EMAIL = process.env.LMS_TEST_ADMIN_EMAIL || process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.LMS_TEST_ADMIN_PASSWORD || process.env.TEST_ADMIN_PASSWORD;

let sessionCookie = null;

async function request(method, url, body = null, options = {}) {
	const fullUrl = url.startsWith('http') ? url : `${API_URL.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
	const headers = {
		'Accept': 'application/json',
		'Content-Type': 'application/json',
		...options.headers,
	};
	const skipCookie = options.noCookie === true;
	if (sessionCookie && !skipCookie) headers['Cookie'] = sessionCookie;
	const init = { method, headers, ...options };
	if (body && method !== 'GET') init.body = typeof body === 'string' ? body : JSON.stringify(body);
	const res = await fetch(fullUrl, init);
	const setCookie = res.headers.get('set-cookie');
	if (setCookie && !skipCookie) sessionCookie = setCookie.split(',').map(c => c.split(';')[0].trim()).join('; ');
	let data = null;
	const text = await res.text();
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = { _raw: text };
	}
	return { ok: res.ok, status: res.status, data, headers: res.headers };
}

async function login() {
	if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return { ok: false, message: 'Lipsesc LMS_TEST_ADMIN_EMAIL sau LMS_TEST_ADMIN_PASSWORD' };
	const res = await request('POST', 'auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
	if (!res.ok) return { ok: false, message: res.data?.message || res.data?.email?.[0] || `HTTP ${res.status}` };
	return { ok: true, user: res.data?.user };
}

// --- Check helpers ---
function pass(name, detail = '') {
	return { name, ok: true, message: 'OK', detail };
}
function fail(name, message, detail = '') {
	return { name, ok: false, message, detail };
}

// --- Tests ---
async function runAuthChecks() {
	const results = [];
	// Login cu credențiale invalide (fără cookie ca să nu poluăm sesiunea)
	const loginRes = await request('POST', 'auth/login', { email: 'wrong@x.com', password: 'wrong' }, { noCookie: true });
	results.push(
		loginRes.status === 401 || loginRes.status === 422
			? pass('Auth: login respinge credențiale invalide')
			: fail('Auth: login cu credențiale invalide', `Așteptat 401/422, primit ${loginRes.status}`)
	);
	// /auth/me FĂRĂ niciun cookie – trebuie 401
	const meRes = await request('GET', 'auth/me', null, { noCookie: true });
	results.push(
		meRes.status === 401
			? pass('Auth: /auth/me neautentificat returnează 401')
			: fail('Auth: /auth/me fără sesiune', `Așteptat 401, primit ${meRes.status}`)
	);
	return results;
}

async function runPublicApiChecks() {
	const results = [];
	const r = await request('GET', 'courses');
	results.push(
		r.ok && Array.isArray(r.data) || (r.data?.data && Array.isArray(r.data.data))
			? pass('Public: GET /courses returnează listă')
			: fail('Public: GET /courses', r.ok ? 'Răspuns nu e listă de cursuri' : `HTTP ${r.status}`, JSON.stringify(r.data)?.slice(0, 200))
	);

	const r2 = await request('GET', 'events');
	results.push(
		r2.ok && (Array.isArray(r2.data) || (r2.data?.data && Array.isArray(r2.data.data)))
			? pass('Public: GET /events returnează listă')
			: fail('Public: GET /events', `HTTP ${r2.status} sau răspuns invalid`)
	);
	return results;
}

async function runAdminChecks() {
	const results = [];
	// Fără auth – nu trimitem niciun cookie ca să simulăm utilizator neautentificat
	const r = await request('GET', 'admin/courses', null, { noCookie: true });
	if (r.status === 401 || r.status === 403) {
		results.push(pass('Admin: rutele admin cer autentificare'));
	} else {
		results.push(fail('Admin: rute admin', 'Ar trebui să returneze 401/403 fără auth', `HTTP ${r.status}`));
	}
	return results;
}

async function runAdminChecksAuthenticated() {
	const results = [];
	const coursesRes = await request('GET', 'admin/courses');
	if (!coursesRes.ok) {
		results.push(fail('Admin: GET /admin/courses', `HTTP ${coursesRes.status}`, JSON.stringify(coursesRes.data)?.slice(0, 300)));
		return results;
	}
	const courses = Array.isArray(coursesRes.data) ? coursesRes.data : coursesRes.data?.data ?? [];
	results.push(pass('Admin: listă cursuri', `${courses.length} cursuri`));

	// Curs cu structură (builder)
	if (courses.length > 0) {
		const c = courses[0];
		const structRes = await request('GET', `admin/courses/${c.id}/builder/structure`);
		if (structRes.ok && structRes.data) {
			const hasModules = Array.isArray(structRes.data.modules) || Array.isArray(structRes.data.course?.modules);
			results.push(
				hasModules
					? pass('Admin: builder structure returnează module', '')
					: fail('Admin: builder structure', 'Lipsește lista de module în răspuns')
			);
			const course = structRes.data.course || structRes.data;
			const modules = course?.modules || structRes.data.modules || [];
			const lessons = modules.flatMap(m => m.lessons || []);
			if (lessons.length > 0) {
				const lesson = lessons[0];
				// Verifică că lecțiile au câmpuri esențiale
				const hasTitle = lesson.title != null && lesson.title !== '';
				results.push(
					hasTitle ? pass('LMS: lecții au titlu') : fail('LMS: lecții', 'Lecțiile ar trebui să aibă titlu')
				);
			}
		} else {
			results.push(fail('Admin: builder structure', `HTTP ${structRes.status}`));
		}
	}

	// Teste
	const testsRes = await request('GET', 'admin/tests');
	results.push(
		testsRes.ok && (Array.isArray(testsRes.data) || Array.isArray(testsRes.data?.data))
			? pass('Admin: listă teste', '')
			: fail('Admin: listă teste', `HTTP ${testsRes.status}`)
	);

	// Bănci întrebări
	const banksRes = await request('GET', 'admin/question-banks');
	results.push(
		banksRes.ok && (Array.isArray(banksRes.data?.data) || Array.isArray(banksRes.data))
			? pass('Admin: listă bănci întrebări', '')
			: fail('Admin: listă bănci întrebări', `HTTP ${banksRes.status}`)
	);

	return results;
}

async function runLmsDataIntegrityChecks() {
	const results = [];
	const coursesRes = await request('GET', 'admin/courses');
	if (!coursesRes.ok) return results;
	const courses = Array.isArray(coursesRes.data) ? coursesRes.data : coursesRes.data?.data ?? [];
	for (const course of courses.slice(0, 5)) {
		const structRes = await request('GET', `admin/courses/${course.id}/builder/structure`);
		if (!structRes.ok) continue;
		const data = structRes.data;
		const modules = data?.course?.modules ?? data?.modules ?? [];
		for (const mod of modules) {
			const lessons = mod.lessons || [];
			for (const lesson of lessons) {
				if (lesson.id == null) {
					results.push(fail('LMS integritate', `Lecție fără id în curs ${course.id} / modul ${mod.title}`));
				}
				if (!lesson.title || String(lesson.title).trim() === '') {
					results.push(fail('LMS integritate', `Lecție fără titlu (id ${lesson.id}) în curs ${course.id}`));
				}
			}
		}
	}
	if (results.length === 0 && courses.length > 0) results.push(pass('LMS integritate', 'Module/lecții au id și titlu (eșantion)'));
	return results;
}

async function runStudentFlowChecks() {
	const results = [];
	// După login ca admin, putem verifica și ca „student” dacă există endpoint-uri de progress
	const progressRes = await request('GET', 'dashboard');
	results.push(
		progressRes.ok || progressRes.status === 401
			? pass('Student: dashboard endpoint răspunde', progressRes.ok ? 'OK' : '401 fără student')
			: fail('Student: dashboard', `HTTP ${progressRes.status}`)
	);
	const courseProgressRes = await request('GET', 'courses/1/progress');
	results.push(
		courseProgressRes.ok || courseProgressRes.status === 401 || courseProgressRes.status === 404
			? pass('Student: progress curs răspunde', '')
			: fail('Student: progress curs', `HTTP ${courseProgressRes.status}`)
	);
	return results;
}

async function runExamFlowChecks() {
	const results = [];
	const examsRes = await request('GET', 'admin/exams');
	const hasExams = examsRes.ok && (Array.isArray(examsRes.data) || Array.isArray(examsRes.data?.data));
	const testsRes = await request('GET', 'admin/tests');
	const testsList = Array.isArray(testsRes.data) ? testsRes.data : testsRes.data?.data ?? [];
	const hasTests = testsRes.ok && Array.isArray(testsList);
	results.push(
		hasExams || hasTests
			? pass('LMS: există exams sau tests', hasTests ? 'tests' : 'exams')
			: fail('LMS: examene/teste', 'Nici exams nici tests nu returnează listă validă')
	);
	if (hasTests && testsList.length > 0) {
		const t = testsList[0];
		const qRes = await request('GET', `admin/tests/${t.id}/questions`);
		const hasQuestionsShape = qRes.ok && Array.isArray(qRes.data);
		results.push(
			hasQuestionsShape ? pass('LMS: test are endpoint întrebări') : fail('LMS: întrebări test', `HTTP ${qRes.status}`)
		);
	}
	return results;
}

async function runCourseModelChecks() {
	const results = [];
	const coursesRes = await request('GET', 'admin/courses');
	if (!coursesRes.ok) return results;
	const courses = Array.isArray(coursesRes.data) ? coursesRes.data : coursesRes.data?.data ?? [];
	if (courses.length === 0) {
		results.push(pass('LMS: model curs', 'Niciun curs – verificare sărită'));
		return results;
	}
	const c = courses[0];
	const hasTitle = c.title != null && String(c.title).trim() !== '';
	results.push(hasTitle ? pass('LMS: curs are titlu') : fail('LMS: model curs', 'Curs fără titlu'));
	const hasStatus = c.status != null || c.publish_status != null;
	results.push(hasStatus ? pass('LMS: curs are status/publicare') : fail('LMS: model curs', 'Curs fără câmp status'));
	return results;
}

async function runContentBlocksChecks() {
	const results = [];
	const coursesRes = await request('GET', 'admin/courses');
	if (!coursesRes.ok) return results;
	const courses = Array.isArray(coursesRes.data) ? coursesRes.data : coursesRes.data?.data ?? [];
	for (const course of courses.slice(0, 3)) {
		const structRes = await request('GET', `admin/courses/${course.id}/builder/structure`);
		if (!structRes.ok) continue;
		const blocks = structRes.data?.content_blocks ?? [];
		if (Array.isArray(blocks) && blocks.length > 0) {
			const first = blocks[0];
			const hasType = first.type != null;
			results.push(hasType ? pass('LMS: content block are tip') : fail('LMS: content block', 'Bloc fără type'));
			break;
		}
	}
	if (results.length === 0) results.push(pass('LMS: content blocks', 'Niciun bloc în eșantion – OK'));
	return results;
}

async function runAll() {
	const start = Date.now();
	const report = {
		meta: { apiUrl: API_URL, hasAuth: !!(ADMIN_EMAIL && ADMIN_PASSWORD), time: new Date().toISOString() },
		groups: [],
		summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
		issues: [],
	};

	let authOk = false;
	if (ADMIN_EMAIL && ADMIN_PASSWORD) {
		const loginResult = await login();
		authOk = loginResult.ok;
		report.groups.push({
			name: 'Autentificare admin',
			results: loginResult.ok ? [pass('Login admin', loginResult.user?.email)] : [fail('Login admin', loginResult.message || 'Eroare')],
		});
	} else {
		report.groups.push({
			name: 'Autentificare admin',
			results: [fail('Login admin', 'Lipsesc LMS_TEST_ADMIN_EMAIL și LMS_TEST_ADMIN_PASSWORD – setați în .env sau env')],
		});
	}

	report.groups.push({ name: 'Auth (public)', results: await runAuthChecks() });
	report.groups.push({ name: 'API public', results: await runPublicApiChecks() });
	report.groups.push({ name: 'Admin (fără auth)', results: await runAdminChecks() });
	if (authOk) {
		report.groups.push({ name: 'Admin (autentificat)', results: await runAdminChecksAuthenticated() });
		report.groups.push({ name: 'Model curs (LMS)', results: await runCourseModelChecks() });
		report.groups.push({ name: 'Content blocks (LMS)', results: await runContentBlocksChecks() });
		report.groups.push({ name: 'Integritate date LMS', results: await runLmsDataIntegrityChecks() });
		report.groups.push({ name: 'Flux student', results: await runStudentFlowChecks() });
		report.groups.push({ name: 'Examene / Teste', results: await runExamFlowChecks() });
	}

	for (const g of report.groups) {
		for (const r of g.results) {
			report.summary.total++;
			if (r.ok) report.summary.passed++;
			else {
				report.summary.failed++;
				report.issues.push(`[${g.name}] ${r.name}: ${r.message}`);
			}
		}
	}

	report.meta.durationMs = Date.now() - start;
	return report;
}

function printReport(report) {
	const out = [];
	out.push('# Raport audit LMS – Formely');
	out.push('');
	out.push(`- **API:** ${report.meta.apiUrl}`);
	out.push(`- **Autentificare admin:** ${report.meta.hasAuth ? 'Da' : 'Nu (setați LMS_TEST_ADMIN_EMAIL și LMS_TEST_ADMIN_PASSWORD)'}`);
	out.push(`- **Dată:** ${report.meta.time}`);
	out.push(`- **Durată:** ${report.meta.durationMs} ms`);
	out.push('');
	out.push('## Rezumat');
	out.push(`- Total verificări: **${report.summary.total}**`);
	out.push(`- Reușite: **${report.summary.passed}**`);
	out.push(`- Eșuate: **${report.summary.failed}**`);
	out.push('');
	out.push('---');
	out.push('');

	for (const g of report.groups) {
		out.push(`## ${g.name}`);
		out.push('');
		for (const r of g.results) {
			const icon = r.ok ? '✅' : '❌';
			out.push(`- ${icon} **${r.name}**: ${r.ok ? 'OK' : r.message}${r.detail ? ` ${r.detail}` : ''}`);
		}
		out.push('');
	}

	if (report.issues.length > 0) {
		out.push('## Ce nu e în regulă (LMS)');
		out.push('');
		for (const i of report.issues) out.push(`- ${i}`);
		out.push('');
		out.push('Recomandare: remediați punctele de mai sus și relansați scriptul.');
	} else {
		out.push('## Status: toate verificările au trecut.');
	}

	return out.join('\n');
}

async function main() {
	console.log('Audit LMS – Formely');
	console.log('API URL:', API_URL);
	console.log('Admin auth:', ADMIN_EMAIL ? 'setat' : 'nesetat (unele verificări vor fi sărite)\n');
	try {
		const report = await runAll();
		const md = printReport(report);
		console.log(md);
		const reportPath = path.join(__dirname, '..', 'LMS_AUDIT_REPORT.md');
		fs.writeFileSync(reportPath, md, 'utf8');
		console.log('\nRaport salvat în:', reportPath);
		process.exit(report.summary.failed > 0 ? 1 : 0);
	} catch (err) {
		console.error('Eroare la rulare audit:', err.message);
		process.exit(2);
	}
}

main();
