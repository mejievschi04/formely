import { toImageUrl } from './imageUrl';

export function normalizeRichTextMediaHtml(html) {
	if (!html || typeof html !== 'string') {
		return '';
	}

	return html.replace(
		/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
		(match, prefix, src, suffix) => {
			const normalizedSrc = toImageUrl(src) || src;
			return `${prefix}${normalizedSrc}${suffix}`;
		}
	);
}
