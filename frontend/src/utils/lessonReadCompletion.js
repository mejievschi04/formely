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

export function isDirectLessonVideoUrl(url) {
	return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(String(url || '').trim());
}
