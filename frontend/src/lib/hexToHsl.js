/**
 * Convertește #RRGGBB în triplet HSL pentru `hsl(var(--theme-color) / …)` (fără `hsl()` în jur).
 * @param {string | null | undefined} hex
 * @returns {string} ex: "158 58% 38%"
 */
export function hexToHslSpace(hex) {
	if (!hex || typeof hex !== 'string') return '158 58% 38%';
	let h = hex.trim();
	if (!h.startsWith('#')) h = `#${h}`;
	const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h);
	if (!m) return '158 58% 38%';
	let s = m[1];
	if (s.length === 3) {
		s = s.split('').map((c) => c + c).join('');
	}
	const r = parseInt(s.slice(0, 2), 16) / 255;
	const g = parseInt(s.slice(2, 4), 16) / 255;
	const b = parseInt(s.slice(4, 6), 16) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	const l = (max + min) / 2;

	let hDeg = 0;
	if (d > 0) {
		switch (max) {
			case r:
				hDeg = ((g - b) / d + (g < b ? 6 : 0)) / 6;
				break;
			case g:
				hDeg = ((b - r) / d + 2) / 6;
				break;
			default:
				hDeg = ((r - g) / d + 4) / 6;
				break;
		}
	}

	const sHsl = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	const H = Math.round(hDeg * 360);
	const S = Math.round(sHsl * 100);
	const L = Math.round(l * 100);

	return `${H} ${S}% ${Math.min(52, Math.max(28, L))}%`;
}
