export function aiResponseErrorMessage(data, status) {
	const message = typeof data?.error === 'string' ? data.error : data?.error?.message || data?.message;
	if (typeof message === 'string' && message.trim() && !/<(?:!doctype|html|head|body)\b/i.test(message)) {
		return message;
	}
	return `Cererea AI a eșuat (HTTP ${status}). Încearcă din nou sau contactează administratorul.`;
}

export function parseAiStreamEvent(data) {
	try {
		return JSON.parse(data);
	} catch (error) {
		if (error instanceof SyntaxError) return null;
		throw error;
	}
}
