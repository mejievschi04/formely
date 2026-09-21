function clampByte(value) {
	const n = Number(value);
	if (!Number.isFinite(n)) return 0;
	return Math.min(255, Math.max(0, Math.round(n)));
}

function byteToHex(value) {
	return clampByte(value).toString(16).padStart(2, '0');
}

function normalizeHexInput(raw) {
	const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(raw || '').trim());
	if (!match) return null;
	let hex = match[1];
	if (hex.length === 3) {
		hex = hex.split('').map((c) => c + c).join('');
	}
	return `#${hex.toLowerCase()}`;
}

function normalizeRgbInput(raw) {
	const match = /^rgba?\(\s*([+\-]?\d{1,3})\s*,\s*([+\-]?\d{1,3})\s*,\s*([+\-]?\d{1,3})(?:\s*,\s*(?:\d*\.?\d+))?\s*\)$/i.exec(String(raw || '').trim());
	if (!match) return null;
	return `#${byteToHex(match[1])}${byteToHex(match[2])}${byteToHex(match[3])}`;
}

export function normalizeColorInputToHex(value, fallback = '#0891b2') {
	const normalized = normalizeHexInput(value) || normalizeRgbInput(value);
	if (normalized) return normalized;
	if (fallback == null) return null;
	return normalizeHexInput(fallback) || '#0891b2';
}

export function isValidColorInput(value) {
	return Boolean(normalizeHexInput(value) || normalizeRgbInput(value));
}
