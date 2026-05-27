/**
 * Randare prima pagină PDF → JPEG în browser (pdfjs-dist).
 * Evită dependența de Ghostscript / Imagick pe server.
 */
import { getDocument } from 'pdfjs-dist';
import { configurePdfWorker } from './pdfWorker';

configurePdfWorker();

const MAX_EDGE = 1200;

/**
 * @param {File} file
 * @param {{ quality?: number, maxEdge?: number }} [opts]
 * @returns {Promise<Blob>}
 */
export async function renderPdfFirstPageAsJpegBlob(file, opts = {}) {
	if (!file || typeof window === 'undefined') {
		throw new Error('Fișier PDF lipsă sau mediu invalid.');
	}

	const quality = typeof opts.quality === 'number' ? opts.quality : 0.86;
	const maxEdge = typeof opts.maxEdge === 'number' ? opts.maxEdge : MAX_EDGE;

	const arrayBuffer = await file.arrayBuffer();
	const pdf = await getDocument({ data: arrayBuffer }).promise;
	const page = await pdf.getPage(1);
	const base = page.getViewport({ scale: 1 });
	const scale = Math.min(2.25, maxEdge / Math.max(base.width, base.height, 1));
	const viewport = page.getViewport({ scale });

	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		throw new Error('Canvas 2D indisponibil.');
	}
	canvas.width = Math.floor(viewport.width);
	canvas.height = Math.floor(viewport.height);
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	await page.render({
		canvasContext: ctx,
		viewport,
	}).promise;

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob || blob.size === 0) {
					reject(new Error('Nu s-a putut genera imaginea de copertă.'));
					return;
				}
				resolve(blob);
			},
			'image/jpeg',
			quality,
		);
	});
}
