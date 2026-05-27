/**
 * Normalize lesson payload from GET /lessons/:id (flat or { data: lesson }).
 */
export function normalizeLessonFromApi(raw) {
	if (!raw || typeof raw !== 'object') return null;
	const lesson =
		raw.data && typeof raw.data === 'object' && raw.data.id != null ? raw.data : raw;
	const blocks = Array.isArray(lesson.content_blocks)
		? lesson.content_blocks
		: Array.isArray(lesson.contentBlocks)
			? lesson.contentBlocks
			: [];
	return {
		...lesson,
		content: typeof lesson.content === 'string' ? lesson.content : '',
		content_blocks: blocks,
		contentBlocks: blocks,
	};
}

export function resolveContentBlockSource(block) {
	if (!block || typeof block !== 'object') return '';
	const source = typeof block.source === 'string' ? block.source.trim() : '';
	if (source) return block.source;
	const payload = block.payload;
	if (typeof payload === 'string' && payload.trim()) return payload;
	if (payload && typeof payload === 'object') {
		for (const key of ['html', 'text', 'content', 'body', 'url', 'src']) {
			const v = payload[key];
			if (typeof v === 'string' && v.trim()) return v;
		}
	}
	return '';
}

export function contentBlockHasBody(block) {
	return Boolean(resolveContentBlockSource(block));
}

export function lessonHasDisplayableContent(lesson) {
	if (!lesson) return false;
	const blocks = lesson.content_blocks ?? lesson.contentBlocks ?? [];
	if (Array.isArray(blocks) && blocks.some(contentBlockHasBody)) return true;
	const legacy = typeof lesson.content === 'string' ? lesson.content.trim() : '';
	return legacy.length > 0;
}

export function lessonLegacyHtml(lesson) {
	return typeof lesson?.content === 'string' ? lesson.content : '';
}
