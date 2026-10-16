import test from 'node:test';
import assert from 'node:assert/strict';
import { createCourseGenerationClient } from '../src/services/courseGenerationClient.js';
import { courseGenerationProgress } from '../src/utils/courseGenerationProgress.js';

const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const run = { generation_id: 'run-1', status: 'running', phase: 'lessons', completed_lessons: 1, total_lessons: 4 };

test('progress follows validated lessons and reserves completion for the saved course', () => {
	assert.match(courseGenerationProgress(run).title, /2 din 4/);
	assert.equal(courseGenerationProgress({ ...run, completed_lessons: 4 }).percent, 95);
	assert.equal(courseGenerationProgress({ ...run, status: 'completed' }).percent, 100);
	assert.match(courseGenerationProgress({ ...run, phase: 'outline' }).title, /structura/);
	assert.ok(courseGenerationProgress({ ...run, completed_lessons: 95, total_lessons: 96 }).percent < courseGenerationProgress({ ...run, completed_lessons: 96, total_lessons: 96 }).percent);
});

test('polling reports real progress and returns the single persisted course', async () => {
	let calls = 0;
	const progress = [];
	const result = { course_id: 42, content: 'Curs salvat.' };
	const client = createCourseGenerationClient(async () => response(++calls < 3 ? run : { ...run, status: 'completed', result }), 0);
	assert.deepEqual(await client.resume('run-1', data => progress.push(data.progress.completed_lessons)), result);
	assert.equal(calls, 3);
	assert.equal(progress.length, 3);
});

test('a failed stage exposes a retry ID without starting another course', async () => {
	const calls = [];
	const client = createCourseGenerationClient(async (url, options) => { calls.push([url, options.method]); return response({ ...run, status: 'failed', error: 'Lecția este prea scurtă.' }); }, 0);
	await assert.rejects(client.resume('run-1'), error => error.data.generation_id === 'run-1' && /prea scurtă/.test(error.message));
	assert.equal(calls.length, 1);
	assert.equal(calls[0][1], 'GET');
});

test('retry resumes the same job and cancellation stops polling', async () => {
	const abort = new AbortController();
	const calls = [];
	const client = createCourseGenerationClient(async (url, options) => { calls.push([url, options.method]); return response(run); }, 0);
	await assert.rejects(client.resume('run-1', () => abort.abort(), abort.signal, true), { name: 'AbortError' });
	assert.deepEqual(calls, [['/api/admin/ai/course-generations/run-1/retry', 'POST']]);
});

test('lost start responses reuse their idempotency key', async () => {
	const store = new Map();
	globalThis.localStorage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
	const keys = [];
	const client = createCourseGenerationClient(async (_url, options) => {
		keys.push(JSON.parse(options.body).request_key);
		if (keys.length === 1) throw new TypeError('Network disconnected');
		return response({ ...run, status: 'completed', result: { course_id: 42 } });
	}, 0);
	try {
		await assert.rejects(client.start({ prompt: 'Curs' }), /disconnected/);
		await client.start({ prompt: 'Curs' });
		assert.equal(keys[0], keys[1]);
		assert.equal(store.size, 0);
	} finally { delete globalThis.localStorage; }
});

test('refresh recovers a course completed before the page returned and clears its pending key', async () => {
	const store = new Map([
		['formely-ai-course-active', JSON.stringify({ id: 'run-1', storageKey: 'request-key' })],
		['request-key', 'uuid'],
	]);
	globalThis.localStorage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
	const methods = [];
	const client = createCourseGenerationClient(async (_url, options) => {
		methods.push(options.method || 'GET');
		return response({ ...run, status: 'completed', result: { course_id: 42 } });
	}, 0);
	try {
		const recovered = await client.active();
		assert.equal(recovered.status, 'completed');
		assert.equal((await client.resume(recovered.generation_id)).course_id, 42);
		assert.deepEqual(methods, ['GET', 'GET']);
		assert.equal(store.size, 0);
	} finally { delete globalThis.localStorage; }
});
