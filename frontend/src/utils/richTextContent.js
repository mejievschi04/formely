import { toImageUrl } from './imageUrl';

const EDITOR_CHROME_HINT_SNIPPETS = [
	'Trage de marginile stânga sau dreapta pentru lățime',
	'Trage de mânere — sus: decupare, jos/laterale: înălțime',
];

function cleanupLeakedImageFigureText(doc) {
	doc.querySelectorAll('figure[data-rte-image-wrap="1"]').forEach((fig) => {
		Array.from(fig.children).forEach((child) => {
			if (child.tagName !== 'IMG') {
				child.remove();
			}
		});
	});

	Array.from(doc.body.querySelectorAll('*')).forEach((node) => {
		if (node.childNodes.length !== 1 || node.firstChild?.nodeType !== Node.TEXT_NODE) return;
		const text = node.textContent?.trim() || '';
		if (!text) return;
		if (EDITOR_CHROME_HINT_SNIPPETS.some((snippet) => text.includes(snippet))) {
			node.remove();
			return;
		}
		if (/^\d{1,3}%$/.test(text) && node.parentElement?.closest('figure[data-rte-image-wrap="1"]')) {
			node.remove();
		}
	});
}

/** Elimină UI-ul de editare (mânere, hint-uri) salvat accidental în HTML. */
export function stripRichTextEditorChrome(html) {
	if (!html || typeof html !== 'string') {
		return '';
	}

	if (typeof DOMParser === 'undefined') {
		return html
			.replace(/<div[^>]*\brte-image-chrome\b[^>]*>[\s\S]*?<\/div>/gi, '')
			.replace(/<div[^>]*\brte-pdf-chrome\b[^>]*>[\s\S]*?<\/div>/gi, '');
	}

	const doc = new DOMParser().parseFromString(html, 'text/html');

	doc.querySelectorAll('.rte-image--selected, .rte-image--dragging, .rte-image--editing, .rte-image-wrap--editing, .rte-pdf-figure--editing').forEach((el) => {
		el.classList.remove('rte-image--selected', 'rte-image--dragging', 'rte-image--editing', 'rte-image-wrap--editing', 'rte-pdf-figure--editing');
	});

	const chromeNodes = doc.querySelectorAll(
		'.rte-image-chrome, .rte-pdf-chrome, [data-rte-image-chrome]',
	);
	const needsCleanup = chromeNodes.length > 0
		|| html.includes('data-rte-image-wrap=')
		|| EDITOR_CHROME_HINT_SNIPPETS.some((snippet) => html.includes(snippet));

	if (!needsCleanup) {
		const cleaned = doc.body.innerHTML;
		return cleaned === html ? html : cleaned;
	}

	chromeNodes.forEach((el) => el.remove());
	cleanupLeakedImageFigureText(doc);

	doc.querySelectorAll('figure[data-rte-pdf="1"] .rte-pdf-chrome').forEach((el) => el.remove());

	const cleaned = doc.body.innerHTML;
	return cleaned === html ? html : cleaned;
}

export function stripRichTextToPlain(html) {
	if (!html || typeof html !== 'string') {
		return '';
	}

	const withBreaks = html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n');

	if (typeof document !== 'undefined') {
		const div = document.createElement('div');
		div.innerHTML = withBreaks;
		return (div.textContent || div.innerText || '')
			.replace(/\u00a0/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	return withBreaks
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function normalizeRichTextMediaHtml(html) {
	if (!html || typeof html !== 'string') {
		return '';
	}

	const withoutChrome = stripRichTextEditorChrome(html);

	return withoutChrome.replace(
		/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
		(match, prefix, src, suffix) => {
			const normalizedSrc = toImageUrl(src) || src;
			return `${prefix}${normalizedSrc}${suffix}`;
		},
	);
}
