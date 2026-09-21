import api, { ensureApiCsrfCookie } from '../api.js';
import { assertAiEnabled } from '../utils/aiAvailability.js';

function getCookie(name) {
	const cookieString = typeof document !== 'undefined' ? document.cookie : '';
	if (!cookieString) return null;
	const cookies = cookieString.split(';');
	for (const cookie of cookies) {
		const [rawName, ...rest] = cookie.trim().split('=');
		if (rawName === name) {
			return rest.join('=');
		}
	}
	return null;
}

function getXsrfToken() {
	const raw = getCookie('XSRF-TOKEN');
	if (!raw) return null;
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
}

async function fetchWithCsrfRetry(url, options) {
	await ensureApiCsrfCookie();
	let xsrfToken = getXsrfToken();
	let response = await fetch(url, {
		...options,
		headers: {
			...(options?.headers || {}),
			...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
		},
	});

	if (response.status === 419) {
		await ensureApiCsrfCookie();
		xsrfToken = getXsrfToken();
		response = await fetch(url, {
			...options,
			headers: {
				...(options?.headers || {}),
				...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
			},
		});
	}

	return response;
}

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// Service for AI-assisted generation (OpenAI-compatible / Hugging Face APIs)
export const openaiService = {
	/**
	 * Generate a course using AI chat
	 * @param {Object} params - Course generation parameters
	 * @param {string} params.prompt - User's prompt/request
	 * @param {Array} params.messages - Chat history (optional)
	 * @param {string} params.type - Type: 'course' or 'test'
	 * @returns {Promise} Stream response
	 */
	generateCourse: async (prompt, messages = []) => {
		assertAiEnabled();
		try {
			const response = await api.post('/admin/ai/generate-course', {
				prompt,
				messages,
				type: 'course',
			});
			return response.data;
		} catch (error) {
			console.error('Error generating course:', error);
			throw error;
		}
	},

	/**
	 * Generate a test using AI chat
	 * @param {Object} params - Test generation parameters
	 * @param {string} params.prompt - User's prompt/request
	 * @param {Array} params.messages - Chat history (optional)
	 * @param {number} params.courseId - Optional course ID to generate test for
	 * @returns {Promise} Stream response
	 */
	generateTest: async (prompt, messages = [], courseId = null) => {
		assertAiEnabled();
		try {
			const response = await api.post('/admin/ai/generate-test', {
				prompt,
				messages,
				courseId,
				type: 'test',
			});
			return response.data;
		} catch (error) {
			console.error('Error generating test:', error);
			throw error;
		}
	},

	/**
	 * Stream chat response for course generation
	 * @param {string} prompt - User's prompt
	 * @param {Array} messages - Chat history
	 * @param {Function} onChunk - Callback for each chunk
	 * @param {Function} onData - Callback for special data (like course_id)
	 * @returns {Promise} Full response
	 */
	streamCourseGeneration: async (prompt, messages = [], courseId = null, onChunk = null, onData = null, extraPayload = {}) => {
		assertAiEnabled();
		try {
			const token = localStorage.getItem('token');
			console.log('Starting course generation request...', { courseId });
			const response = await fetchWithCsrfRetry('/api/admin/ai/generate-course', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'text/event-stream',
					...(token ? { 'Authorization': `Bearer ${token}` } : {}),
				},
				credentials: 'include',
				body: JSON.stringify({
					prompt,
					messages,
					courseId, // Include course ID for updates
					type: 'course',
					...extraPayload,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('HTTP error response:', response.status, errorText);
				throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
			}

			const contentType = response.headers.get('content-type') || '';
			if (!contentType.includes('text/event-stream')) {
				const data = await response.json();
				if (data?.error) {
					throw new Error(data.error);
				}

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
				};
			}

			if (!response.body) {
				throw new Error('Response body is null');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let fullResponse = '';
			let buffer = '';

			console.log('Starting to read stream...');

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					// Process remaining buffer
					if (buffer) {
						const lines = buffer.split('\n');
						for (const line of lines) {
							if (line.startsWith('data: ')) {
								const data = line.slice(6).trim();
								if (data && data !== '[DONE]') {
									try {
										const parsed = JSON.parse(data);
										if (parsed.content) {
											fullResponse += parsed.content;
											if (onChunk) onChunk(parsed.content);
										}
									} catch (e) {
										console.warn('Failed to parse final chunk:', data, e);
									}
								}
							}
						}
					}
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				
				// Keep last incomplete line in buffer
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6).trim();
						if (data === '[DONE]') {
							console.log('Stream marked as done');
							continue;
						}
						
						if (!data) continue;
						
						try {
							const parsed = JSON.parse(data);
							if (parsed.content) {
								fullResponse += parsed.content;
								if (onChunk) onChunk(parsed.content);
							} else if (parsed.course_id || parsed.course_created || parsed.course_updated || parsed.response_type || parsed.clarification_question || parsed.question || parsed.message) {
								if (onData) {
									onData(parsed);
								}
							} else if (parsed.error) {
								console.error('Stream error:', parsed.error);
								throw new Error(parsed.error);
							}
						} catch (e) {
							if (e instanceof Error && e.message.includes('error')) {
								throw e;
							}
							console.warn('Failed to parse SSE data:', data, e);
						}
					}
				}
			}

			console.log('Stream complete. Total response length:', fullResponse.length);
			return { content: fullResponse };
		} catch (error) {
			console.error('Error streaming course generation:', error);
			throw error;
		}
	},

	/**
	 * Extract text from an uploaded document for AI.
	 * Returns a normalized payload with text and preview.
	 */
	extractDocumentContext: async (file) => {
		assertAiEnabled();
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
				body: formData,
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
			}

			return await response.json();
		} catch (error) {
			console.error('Error extracting document context:', error);
			throw error;
		}
	},

	/**
	 * Stream chat response for test generation
	 * @param {string} prompt - User's prompt
	 * @param {Array} messages - Chat history
	 * @param {number} courseId - Optional course ID
	 * @param {Function} onChunk - Callback for each chunk
	 * @param {Function} onData - Callback for special data (like test_id)
	 * @returns {Promise} Full response
	 */
	streamTestGeneration: async (prompt, messages = [], courseId = null, onChunk = null, onData = null, extraPayload = {}) => {
		assertAiEnabled();
		try {
			const token = localStorage.getItem('token');
			console.log('Starting test generation request...');
			const response = await fetchWithCsrfRetry('/api/admin/ai/generate-test', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'text/event-stream',
					...(token ? { 'Authorization': `Bearer ${token}` } : {}),
				},
				credentials: 'include',
				body: JSON.stringify({
					prompt,
					messages,
					courseId,
					type: 'test',
					...extraPayload,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('HTTP error response:', response.status, errorText);
				throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
			}

			if (!response.body) {
				throw new Error('Response body is null');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let fullResponse = '';
			let buffer = '';

			console.log('Starting to read stream...');

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					// Process remaining buffer
					if (buffer) {
						const lines = buffer.split('\n');
						for (const line of lines) {
							if (line.startsWith('data: ')) {
								const data = line.slice(6).trim();
								if (data && data !== '[DONE]') {
									try {
										const parsed = JSON.parse(data);
										if (parsed.content) {
											fullResponse += parsed.content;
											if (onChunk) onChunk(parsed.content);
										}
									} catch (e) {
										console.warn('Failed to parse final chunk:', data, e);
									}
								}
							}
						}
					}
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				
				// Keep last incomplete line in buffer
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6).trim();
						if (data === '[DONE]') {
							console.log('Stream marked as done');
							continue;
						}
						
						if (!data) continue;
						
						try {
							const parsed = JSON.parse(data);
							if (parsed.content) {
								fullResponse += parsed.content;
								if (onChunk) onChunk(parsed.content);
							} else if (parsed.test_id || parsed.test_created) {
								// Handle test creation notification
								if (onData) {
									onData(parsed);
								}
							} else if (parsed.error) {
								console.error('Stream error:', parsed.error);
								throw new Error(parsed.error);
							}
						} catch (e) {
							if (e instanceof Error && e.message.includes('error')) {
								throw e;
							}
							console.warn('Failed to parse SSE data:', data, e);
						}
					}
				}
			}

			console.log('Stream complete. Total response length:', fullResponse.length);
			return { content: fullResponse };
		} catch (error) {
			console.error('Error streaming test generation:', error);
			throw error;
		}
	},

	/**
	 * Stream student tutor chat for a lesson.
	 */
	streamStudentTutor: async (lessonId, prompt, messages = [], onChunk = null) => {
		assertAiEnabled();
		try {
			const token = localStorage.getItem('token');
			const response = await fetchWithCsrfRetry(`/api/lessons/${lessonId}/tutor`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'text/event-stream',
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				credentials: 'include',
				body: JSON.stringify({
					prompt,
					messages,
					lessonId,
					mode: 'student_tutor',
					type: 'tutor',
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
			}

			if (!response.body) {
				throw new Error('Response body is null');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let fullResponse = '';
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					const data = line.slice(6).trim();
					if (!data || data === '[DONE]') continue;
					try {
						const parsed = JSON.parse(data);
						if (parsed.content) {
							fullResponse += parsed.content;
							if (onChunk) onChunk(parsed.content);
						} else if (parsed.error) {
							throw new Error(parsed.error);
						}
					} catch (e) {
						if (e instanceof Error && e.message && !e.message.includes('JSON')) {
							throw e;
						}
					}
				}
			}

			return { content: fullResponse };
		} catch (error) {
			console.error('Error streaming student tutor:', error);
			throw error;
		}
	},
};


