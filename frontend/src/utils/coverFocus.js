export const DEFAULT_COVER_FOCUS = { x: 50, y: 50, zoom: 1 };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizeCoverFocus(value) {
	const x = Number(value?.x);
	const y = Number(value?.y);
	const zoom = Number(value?.zoom);
	return {
		x: Number.isFinite(x) ? clamp(x, 0, 100) : DEFAULT_COVER_FOCUS.x,
		y: Number.isFinite(y) ? clamp(y, 0, 100) : DEFAULT_COVER_FOCUS.y,
		zoom: Number.isFinite(zoom) ? clamp(zoom, 1, 2.5) : DEFAULT_COVER_FOCUS.zoom,
	};
}

export function coverFocusImgStyle(value) {
	const { x, y, zoom } = normalizeCoverFocus(value);
	return {
		objectPosition: `${x}% ${y}%`,
		transform: `scale(${zoom})`,
		transformOrigin: `${x}% ${y}%`,
	};
}
