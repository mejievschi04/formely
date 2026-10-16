import { AiApiError, applyAiUsageFromResponse } from '../utils/voltAvailability.js';
import { aiResponseErrorMessage } from '../utils/aiResponseErrors.js';

const base = '/api/admin/ai/course-generations';
const keyPrefix = 'formely-ai-course-request:';
const activeKey = 'formely-ai-course-active';

function remember(run, storageKey = null) {
	try {
		const previous = JSON.parse(localStorage.getItem(activeKey) || 'null');
		localStorage.setItem(activeKey, JSON.stringify({ id: run.generation_id, storageKey: storageKey || (previous?.id === run.generation_id ? previous.storageKey : null) }));
	} catch { /* Recovery is also available from the server. */ }
}

function forget(id) {
	try {
		const saved = JSON.parse(localStorage.getItem(activeKey) || 'null');
		if (saved?.id === id) {
			if (saved.storageKey) localStorage.removeItem(saved.storageKey);
			localStorage.removeItem(activeKey);
		}
	} catch { /* Ignore storage restrictions. */ }
}

function pause(ms, signal) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
		const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
		const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
		signal?.addEventListener('abort', abort, { once: true });
	});
}

export function createCourseGenerationClient(request, interval = 1500) {
	async function json(url, options = {}) {
		const response = await request(url, options);
		const data = await response.json();
		if (!response.ok) throw new AiApiError(aiResponseErrorMessage(data, response.status), response.status, data);
		return data;
	}

	async function watch(run, onData, signal) {
		let failures = 0;
		while (true) {
			if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
			onData?.({ progress: run, generation_id: run.generation_id });
			if (run.status === 'completed') {
				if (!run.result?.course_id) throw new Error('Generarea s-a încheiat fără un curs salvat.');
				applyAiUsageFromResponse(run.result);
				forget(run.generation_id);
				return run.result;
			}
			if (run.status === 'failed') throw new AiApiError(run.error || 'Generarea a fost întreruptă. Reia etapa.', 422, { generation_id: run.generation_id, retry_available: true });
			await pause(interval, signal);
			try {
				run = await json(`${base}/${run.generation_id}`, { signal });
				failures = 0;
			} catch (error) {
				if (error.name === 'AbortError' || (error.status && error.status < 500) || ++failures >= 3) throw error;
			}
		}
	}

	return {
		async start(input, onData, signal) {
			const bytes = new TextEncoder().encode(JSON.stringify(input));
			const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
			const storageKey = keyPrefix + hash;
			let key;
			try { key = localStorage.getItem(storageKey); } catch { /* Storage can be disabled. */ }
			key ||= crypto.randomUUID();
			try { localStorage.setItem(storageKey, key); } catch { /* Backend also deduplicates active runs. */ }
			let run = await json(base, { method: 'POST', signal, body: JSON.stringify({ ...input, request_key: key }) });
			remember(run, storageKey);
			if (run.status === 'failed') run = await json(`${base}/${run.generation_id}/retry`, { method: 'POST', signal });
			const result = await watch(run, onData, signal);
			// Keep the key through errors/refresh; a later explicit successful submission may start a new course.
			try { localStorage.removeItem(storageKey); } catch { /* Ignore storage restrictions. */ }
			return result;
		},
		async active(signal) {
			let saved;
			try { saved = JSON.parse(localStorage.getItem(activeKey) || 'null'); } catch { /* Ignore storage restrictions. */ }
			if (saved?.id) {
				try { return await json(`${base}/${saved.id}`, { signal }); }
				catch (error) { if (error.status !== 404) throw error; forget(saved.id); }
			}
			const run = (await json(`${base}/active`, { signal })).generation || null;
			if (run) remember(run);
			return run;
		},
		async resume(id, onData, signal, retry = false) {
			const run = await json(`${base}/${id}${retry ? '/retry' : ''}`, { method: retry ? 'POST' : 'GET', signal });
			return watch(run, onData, signal);
		},
	};
}
