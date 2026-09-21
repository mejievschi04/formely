export const LESSON_READ_MILESTONES = [25, 50, 75, 100];

export function findLessonScrollRoot(startEl) {
	let node = startEl?.parentElement;
	while (node && node !== document.documentElement) {
		const style = window.getComputedStyle(node);
		const overflowY = style.overflowY;
		if (
			(overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
			node.scrollHeight > node.clientHeight + 8
		) {
			return node;
		}
		node = node.parentElement;
	}
	return null;
}

export function lessonTabObstructionPx() {
	const raw = getComputedStyle(document.documentElement).getPropertyValue('--student-tab-height').trim();
	const parsed = parseFloat(raw);
	if (Number.isFinite(parsed) && parsed > 0) {
		return Math.round(parsed);
	}
	return window.matchMedia('(max-width: 768px)').matches ? 68 : 0;
}

export function estimateLessonMinDwellSeconds(contentEl) {
	const text = (contentEl?.innerText || '').replace(/\s+/g, ' ').trim();
	const words = text ? text.split(' ').filter(Boolean).length : 0;
	const hasMedia = Boolean(
		contentEl?.querySelector('video[data-lesson-media], [data-lesson-embed]')
	);
	let seconds = Math.max(4, Math.ceil(words / 4));
	if (hasMedia) {
		seconds = Math.max(seconds, 12);
	}
	return Math.min(180, seconds);
}

export function isDirectLessonVideoUrl(url) {
	return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(String(url || '').trim());
}
