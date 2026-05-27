import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist';
import { configurePdfWorker } from './pdfWorker';

configurePdfWorker();

export async function getPdfPageCount(file) {
	if (!file || file.type !== 'application/pdf') {
		throw new Error('Fișierul trebuie să fie PDF.');
	}
	const arrayBuffer = await file.arrayBuffer();
	const pdf = await getDocument({ data: arrayBuffer }).promise;
	return Number(pdf?.numPages || 0);
}

export async function slicePdfFileByRange(file, startPage, endPage) {
	if (!file || file.type !== 'application/pdf') {
		throw new Error('Fișierul trebuie să fie PDF.');
	}

	const safeStart = Math.max(1, Number(startPage || 1));
	const safeEnd = Math.max(safeStart, Number(endPage || safeStart));

	const arrayBuffer = await file.arrayBuffer();
	const sourcePdf = await PDFDocument.load(arrayBuffer);
	const totalPages = sourcePdf.getPageCount();
	if (totalPages < 1) {
		throw new Error('PDF-ul nu conține pagini.');
	}

	const boundedStart = Math.min(safeStart, totalPages);
	const boundedEnd = Math.min(safeEnd, totalPages);
	const targetPdf = await PDFDocument.create();

	const pageIndexes = [];
	for (let page = boundedStart; page <= boundedEnd; page += 1) {
		pageIndexes.push(page - 1);
	}

	const copiedPages = await targetPdf.copyPages(sourcePdf, pageIndexes);
	for (const page of copiedPages) {
		targetPdf.addPage(page);
	}

	const out = await targetPdf.save();
	const nameBase = String(file.name || 'document.pdf').replace(/\.pdf$/i, '');
	const outName = `${nameBase}-pag-${boundedStart}-${boundedEnd}.pdf`;
	return new File([out], outName, { type: 'application/pdf' });
}
