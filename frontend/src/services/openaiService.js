import api, { ensureApiCsrfCookie, readXsrfToken, refreshApiCsrfCookie } from '../api.js';
import {
	AiApiError,
	applyAiUsageFromResponse,
	assertVoltEnabled,
} from '../utils/voltAvailability.js';
import { logger } from '../utils/logger';
import { aiResponseErrorMessage, parseAiStreamEvent } from '../utils/aiResponseErrors.js';
import { createCourseGenerationClient } from './courseGenerationClient.js';

async function fetchWithCsrfRetry(url, options) {
	const send = () => {
		const xsrfToken = readXsrfToken();
		return fetch(url, {
			...options,
			credentials: 'include',
			headers: {
				...(options?.headers || {}),
				...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
			},
		});
	};

	await ensureApiCsrfCookie();
	let response = await send();

	if (response.status === 419) {
		await refreshApiCsrfCookie();
		response = await send();
	}

	return response;
}

async function throwIfNotOk(response) {
	if (response.ok) return;
	const errorText = await response.text();
	let data = null;
	try {
		data = errorText ? JSON.parse(errorText) : null;
	} catch {
		data = null;
	}
	const message = aiResponseErrorMessage(data, response.status);
	throw new AiApiError(message, response.status, data);
}

function handleParsedEvent(parsed, onChunk, onData, accumulate) {
	if (!parsed || typeof parsed !== 'object') return;
	if (parsed.error) throw new Error(parsed.error);
	if (parsed.ai_usage) {
		applyAiUsageFromResponse(parsed);
	}
	if (parsed.content) {
		accumulate.value += parsed.content;
		if (onChunk) onChunk(parsed.content);
	} else if (
		parsed.course_id
		|| parsed.course_created
		|| parsed.course_updated
		|| parsed.response_type
		|| parsed.clarification_question
		|| parsed.question
		|| parsed.message
		|| parsed.test_id
		|| parsed.test_created
		|| parsed.ai_usage
	) {
		if (onData) onData(parsed);
	} else if (parsed.error) {
		throw new Error(parsed.error);
	}
}

async function readSseStream(response, onChunk, onData) {
	if (!response.body) {
		throw new Error('Response body is null');
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const accumulate = { value: '' };
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				if (buffer) {
					for (const line of buffer.split('\n')) {
						if (!line.startsWith('data: ')) continue;
						const data = line.slice(6).trim();
						if (!data || data === '[DONE]') continue;
						handleParsedEvent(parseAiStreamEvent(data), onChunk, onData, accumulate);
					}
				}
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (!line.startsWith('data: ')) continue;
				const data = line.slice(6).trim();
				if (data === '[DONE]' || !data) continue;
				handleParsedEvent(parseAiStreamEvent(data), onChunk, onData, accumulate);
			}
		}
	} finally {
		try {
			reader.releaseLock();
		} catch {
			/* ignore */
		}
	}

	return { content: accumulate.value };
}

// Service for Volt-assisted generation (OpenAI-compatible / Hugging Face APIs)
const courseGenerations = createCourseGenerationClient((url, options = {}) => {
	const token = localStorage.getItem('token');
	return fetchWithCsrfRetry(url, {
		...options,
		headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
	});
});

export const openaiService = {
	activeCourseGeneration: signal => courseGenerations.active(signal),
	resumeCourseGeneration: (id, onData, signal, retry = false) => courseGenerations.resume(id, onData, signal, retry),
	generateCourse: async (prompt, messages = []) => {
		assertVoltEnabled();
		try {
			const response = await api.post('/admin/ai/generate-course', {
				prompt,
				messages,
				type: 'course',
			});
			applyAiUsageFromResponse(response.data);
			return response.data;
		} catch (error) {
			console.error('Error generating course:', error);
			throw error;
		}
	},

	generateTest: async (prompt, messages = [], courseId = null) => {
		assertVoltEnabled();
		try {
			const response = await api.post('/admin/ai/generate-test', {
				prompt,
				messages,
				courseId,
				type: 'test',
			});
			applyAiUsageFromResponse(response.data);
			return response.data;
		} catch (error) {
			console.error('Error generating test:', error);
			throw error;
		}
	},

	/**
	 * @param {object} [extraPayload]
	 * @param {AbortSignal} [signal]
	 */
	streamCourseGeneration: async (
		prompt,
		messages = [],
		courseId = null,
		onChunk = null,
		onData = null,
		extraPayload = {},
		signal = null,
	) => {
		assertVoltEnabled();
		try {
			if (extraPayload?.guided_brief && String(extraPayload.mode || '').includes('guided_creation') && !courseId && !extraPayload.courseId) {
				const result = await courseGenerations.start({
					prompt, guided_brief: extraPayload.guided_brief,
					...(extraPayload.source_text ? { source_text: extraPayload.source_text } : {}),
					...(extraPayload.attachments?.length ? { attachments: extraPayload.attachments.map(({ name, text }) => ({ name, text })) } : {}),
				}, onData, signal);
				if (result.content) onChunk?.(result.content);
				onData?.(result);
				return result;
			}
			const token = localStorage.getItem('token');
			logger.log('Starting course generation request...', { courseId });
			const response = await fetchWithCsrfRetry('/api/admin/ai/generate-course', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'text/event-stream, application/json',
					...(token ? { 'Authorization': `Bearer ${token}` } : {}),
				},
				credentials: 'include',
				signal: signal || undefined,
				body: JSON.stringify({
					prompt,
					messages,
					courseId,
					type: 'course',
					...extraPayload,
				}),
			});

			await throwIfNotOk(response);

			const contentType = response.headers.get('content-type') || '';
			if (!contentType.includes('text/event-stream')) {
				const data = await response.json();
				if (data?.error) {
					throw new AiApiError(data.error, response.status, data);
				}
				applyAiUsageFromResponse(data);

				const finalContent = String(data?.content || '').trim();
				if (finalContent && onChunk) {
					onChunk(finalContent);
				}
				if (onData) {
					onData(data);
				}

				return {
					content: finalContent,
					response_type: data?.response_type || null,
					clarification_question: data?.clarification_question || null,
					course_id: data?.course_id || null,
					course_created: data?.course_created || null,
					course_updated: data?.course_updated || null,
					ai_usage: data?.ai_usage || null,
				};
			}

			const result = await readSseStream(response, onChunk, onData);
			logger.log('Stream complete. Total response length:', result.content.length);
			return result;
		} catch (error) {
			if (error?.name === 'AbortError') {
				throw error;
			}
			console.error('Error streaming course generation:', error);
			throw error;
		}
	},

	extractDocumentContext: async (file, signal = null) => {
		assertVoltEnabled();
		try {
			const token = localStorage.getItem('token');
			const formData = new FormData();
			formData.append('file', file);

			const response = await fetchWithCsrfRetry('/api/ai/extract-document', {
				method: 'POST',
				headers: {
					...(token ? { 'Authorization': `Bearer ${token}` } : {}),
				},
				credentials: 'include',
				signal: signal || undefined,
				body: formData,
			});

			await throwIfNotOk(response);
			return await response.json();
		} catch (error) {
			console.error('Error extracting document context:', error);
			throw error;
		}
	},

	streamTestGeneration: async (
		prompt,
		messages = [],
		courseId = null,
		onChunk = null,
		onData = null,
		extraPayload = {},
		signal = null,
	) => {
		assertVoltEnabled();
		try {
			const token = localStorage.getItem('token');
			logger.log('Starting test generation request...');
			const response = await fetchWithCsrfRetry('/api/admin/ai/generate-test', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'text/event-stream, application/json',
					...(token ? { 'Authorization': `Bearer ${token}` } : {}),
				},
				credentials: 'include',
				signal: signal || undefined,
				body: JSON.stringify({
					prompt,
					messages,
					courseId,
					type: 'test',
					...extraPayload,
				}),
			});

			await throwIfNotOk(response);

			const contentType = response.headers.get('content-type') || '';
			if (!contentType.includes('text/event-stream')) {
				const data = await response.json();
				if (data?.error) {
					throw new AiApiError(data.error, response.status, data);
				}
				applyAiUsageFromResponse(data);
				const finalContent = String(data?.content || '').trim();
				if (finalContent && onChunk) onChunk(finalContent);
				if (onData) onData(data);
				return { content: finalContent, ...data };
			}

			const result = await readSseStream(response, onChunk, onData);
			logger.log('Stream complete. Total response length:', result.content.length);
			return result;
		} catch (error) {
			if (error?.name === 'AbortError') {
				throw error;
			}
			console.error('Error streaming test generation:', error);
			throw error;
		}
	},
};
