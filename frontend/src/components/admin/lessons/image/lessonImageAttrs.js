export const LESSON_IMAGE_ALIGNMENTS = ['inline', 'left', 'center', 'right', 'full'];
export const LESSON_IMAGE_MIN_WIDTH = 80;

export function normalizeLessonImageAlignment(value) {
	return LESSON_IMAGE_ALIGNMENTS.includes(value) ? value : 'center';
}

function positiveInt(value) {
	const number = Number.parseInt(String(value ?? ''), 10);
	return Number.isFinite(number) && number > 0 ? number : null;
}

function styleWidthPx(value) {
	const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)px$/i);
	return match ? Math.round(Number(match[1])) : null;
}

export function readLessonImageAttrs(element) {
	const alignment = normalizeLessonImageAlignment(
		element.getAttribute('data-alignment') || inferAlignment(element),
	);
	const width = positiveInt(element.getAttribute('width')) || styleWidthPx(element.style?.width);
	const height = positiveInt(element.getAttribute('height')) || styleWidthPx(element.style?.height);
	return { alignment, width, height };
}

function inferAlignment(element) {
	const left = String(element.style?.marginLeft || '').trim();
	const right = String(element.style?.marginRight || '').trim();
	if (left === 'auto' && right === 'auto') return 'center';
	if (left === 'auto') return 'right';
	if (right === 'auto') return 'left';
	if (String(element.style?.width || '').trim() === '100%') return 'full';
	return null;
}

export function lessonImageHtmlAttributes(attrs = {}) {
	const alignment = normalizeLessonImageAlignment(attrs['data-alignment'] || attrs.alignment);
	const width = positiveInt(attrs.width);
	const height = positiveInt(attrs.height);
	const style = ['display:block', 'max-width:100%', 'height:auto'];

	if (alignment === 'full') {
		style.push('width:100%');
	} else if (width) {
		style.push(`width:${width}px`);
	}

	if (alignment === 'right') {
		style.push('margin-left:auto', 'margin-right:0');
	} else if (alignment === 'left' || alignment === 'inline') {
		style.push('margin-left:0', 'margin-right:auto');
	} else if (alignment !== 'full') {
		style.push('margin-left:auto', 'margin-right:auto');
	}

	const html = {
		'data-alignment': alignment,
		style: style.join(';'),
	};
	if (width && alignment !== 'full') html.width = String(width);
	if (height) html.height = String(height);
	return html;
}

export function nextLessonImageWidth({ startWidth, dx, dy, direction, ratio, min = LESSON_IMAGE_MIN_WIDTH, max }) {
	const safeRatio = ratio > 0 ? ratio : 1;
	let delta = 0;
	if (direction === 'e' || direction === 'ne' || direction === 'se') delta = dx;
	else if (direction === 'w' || direction === 'nw' || direction === 'sw') delta = -dx;
	else if (direction === 's') delta = dy / safeRatio;
	else if (direction === 'n') delta = -dy / safeRatio;

	const limit = Number.isFinite(max) && max > 0 ? max : startWidth;
	const next = startWidth + delta;
	if (!Number.isFinite(next)) return Math.round(startWidth);
	return Math.round(Math.min(Math.max(limit, min), Math.max(min, next)));
}
