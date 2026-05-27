/**
 * Extrage textul din PDF păstrând stiluri (bold, italic, mărime font, paragrafe/liniuțe).
 * Folosește pdfjs-dist (Mozilla PDF.js).
 */
import { getDocument } from 'pdfjs-dist';
import { configurePdfWorker } from './pdfWorker';

configurePdfWorker();

function escapeHtml(text) {
	if (typeof text !== 'string') return '';
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

/** Inferrează bold/italic din fontName (ex: "Helvetica-Bold", "Times-Italic", "g_d0_f1" cu style în styles). */
function getInlineStyle(item, styles) {
	const name = (item.fontName || '').toLowerCase();
	const style = styles?.[item.fontName];
	let bold = false;
	let italic = false;
	if (name.includes('bold')) bold = true;
	if (name.includes('italic') || name.includes('oblique')) italic = true;
	if (style?.fontFamily) {
		const ff = String(style.fontFamily).toLowerCase();
		if (ff.includes('bold')) bold = true;
		if (ff.includes('italic') || ff.includes('oblique')) italic = true;
	}
	const parts = [];
	if (bold) parts.push('strong');
	if (italic) parts.push('em');
	return { wrap: parts, bold, italic };
}

/** Înfășoară textul în tag-uri de stil. */
function wrapStyled(text, { wrap }) {
	if (!text) return '';
	let out = escapeHtml(text);
	for (const tag of wrap) {
		out = `<${tag}>${out}</${tag}>`;
	}
	return out;
}

/**
 * @param {File} file - Fișier PDF
 * @returns {Promise<string>} - HTML cu paragrafe și stiluri păstrate
 */
export async function extractPdfTextAsHtml(file) {
	if (!file || file.type !== 'application/pdf') {
		throw new Error('Fișierul trebuie să fie PDF.');
	}

	const arrayBuffer = await file.arrayBuffer();
	let pdf;
	try {
		pdf = await getDocument({ data: arrayBuffer }).promise;
	} catch (err) {
		if (err?.name === 'InvalidPDFException' || err?.message?.includes('Invalid PDF')) {
			throw new Error(
				'Acest fișier nu pare a fi un PDF valid sau are o structură neacceptată. Încearcă un alt PDF (de ex. generat din Word/Google Docs) sau verifică dacă fișierul nu e corupt.'
			);
		}
		if (err?.name === 'PasswordException') {
			throw new Error('PDF-ul este protejat cu parolă. Elimină parola și încearcă din nou.');
		}
		throw err;
	}

	const allLines = [];
	const numPages = pdf.numPages;

	for (let pageNum = 1; pageNum <= numPages; pageNum++) {
		const page = await pdf.getPage(pageNum);
		const textContent = await page.getTextContent();
		const items = (textContent.items || []).filter((it) => it.str !== undefined);
		const styles = textContent.styles || {};

		if (items.length === 0) {
			if (pageNum > 1) allLines.push({ y: 0, height: 0, chunks: [], page: pageNum });
			continue;
		}

		// Grupare pe linie după transform[5] (y); păstrăm x și width pentru spații
		const lineTolerance = 2;
		const byLine = [];
		for (const it of items) {
			const tr = Array.isArray(it.transform) && it.transform.length >= 6 ? it.transform : [];
			const y = tr[5] ?? 0;
			const x = tr[4] ?? 0;
			const w = it.width ?? 0;
			const chunk = {
				str: it.str,
				x,
				width: w,
				height: it.height ?? 0,
				hasEOL: it.hasEOL ?? false,
				style: getInlineStyle(it, styles),
			};
			let line = byLine.find((l) => Math.abs(l.y - y) <= lineTolerance);
			if (!line) {
				line = { y, chunks: [] };
				byLine.push(line);
			}
			line.chunks.push(chunk);
		}
		byLine.sort((a, b) => b.y - a.y);

		for (const line of byLine) {
			// Ordine pe linie: stânga → dreapta (x crescător)
			line.chunks.sort((a, b) => a.x - b.x);
			const maxHeight = Math.max(...line.chunks.map((c) => c.height), 0);
			// Estimare lățime medie caracter pentru spații (height ~ font size, width/len per item)
			const avgCharWidth =
				line.chunks.reduce((acc, c) => acc + (c.str.length ? c.width / c.str.length : c.height * 0.5), 0) /
				Math.max(1, line.chunks.filter((c) => c.str.length).length) || maxHeight * 0.5;
			const spaceUnit = Math.max(avgCharWidth * 0.4, 0.5);
			const parts = [];
			for (let i = 0; i < line.chunks.length; i++) {
				const c = line.chunks[i];
				if (i === 0) {
					// Spații la începutul liniei (indent)
					if (c.x > spaceUnit) {
						const n = Math.min(20, Math.round(c.x / spaceUnit));
						parts.push('\u00A0'.repeat(n)); // &nbsp;
					}
				} else {
					const prev = line.chunks[i - 1];
					if (prev.hasEOL) {
						parts.push('<br>');
						// Indent după line-break
						if (c.x > spaceUnit) {
							const n = Math.min(20, Math.round(c.x / spaceUnit));
							parts.push('\u00A0'.repeat(n));
						}
					} else {
						const gap = c.x - (prev.x + prev.width);
						if (gap > spaceUnit) {
							const n = Math.min(10, Math.max(1, Math.round(gap / spaceUnit)));
							parts.push('\u00A0'.repeat(n));
						}
					}
				}
				parts.push(wrapStyled(c.str, c.style));
			}
			const lineText = parts.join('');
			allLines.push({
				y: line.y,
				height: maxHeight,
				chunks: line.chunks,
				lineText: lineText.trimEnd(),
				page: pageNum,
			});
		}
	}

	if (allLines.length === 0) {
		return '<p>Nu s-a putut extrage text din acest PDF (poate conține doar imagini sau este scanat).</p>';
	}

	// Înălțimi pentru a distinge titluri vs paragraf (relativ la median)
	const heights = allLines.map((l) => l.height).filter((h) => h > 0);
	const medianHeight = heights.length
		? heights.slice().sort((a, b) => a - b)[Math.floor(heights.length / 2)]
		: 12;
	const thresholdH2 = medianHeight * 1.4;
	const thresholdH3 = medianHeight * 1.15;

	const blocks = [];
	for (const line of allLines) {
		const text = line.lineText;
		if (!text) continue;
		if (line.height >= thresholdH2) {
			blocks.push(`<h2>${text}</h2>`);
		} else if (line.height >= thresholdH3) {
			blocks.push(`<h3>${text}</h3>`);
		} else {
			blocks.push(`<p>${text}</p>`);
		}
	}

	const html = blocks.join('\n');
	return html || '<p>Nu s-a putut extrage text din acest PDF.</p>';
}

/**
 * Estimează o înălțime de preview pentru PDF astfel încât să evităm
 * spațiul gol excesiv în editor când documentul are puțin text.
 *
 * @param {File} file
 * @returns {Promise<number>} înălțime recomandată în pixeli
 */
export async function estimatePdfContentPreviewHeight(file) {
	if (!file || file.type !== 'application/pdf') {
		return 620;
	}

	try {
		const arrayBuffer = await file.arrayBuffer();
		const pdf = await getDocument({ data: arrayBuffer }).promise;
		const pageCount = Number(pdf?.numPages || 1);
		const firstPage = await pdf.getPage(1);
		const viewport = firstPage.getViewport({ scale: 1 });
		const textContent = await firstPage.getTextContent();
		const items = (textContent.items || []).filter((it) => typeof it?.str === 'string' && it.str.trim());

		// Heuristică simplă: cu cât avem mai mult text pe prima pagină,
		// cu atât creștem preview-ul. Pentru puțin text, îl păstrăm compact.
		const wordCount = items.reduce((total, it) => total + String(it.str).trim().split(/\s+/).filter(Boolean).length, 0);

		let baseHeight = Math.round((viewport?.height || 840) * 0.9);
		if (wordCount > 30) baseHeight += 60;
		if (wordCount > 90) baseHeight += 120;
		if (wordCount > 180) baseHeight += 180;
		if (wordCount > 300) baseHeight += 240;

		// Pentru PDF-uri cu mai multe pagini, mărim înălțimea preview-ului
		// ca să evităm tăierea conținutului în blocul embed.
		const pagesBoost = Math.max(0, pageCount - 1) * Math.round((viewport?.height || 840) * 0.75);
		return Math.min(2200, baseHeight + pagesBoost);
	} catch {
		return 900;
	}
}
