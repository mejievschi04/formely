/**
 * Opens a PDF with pdf.js. The worker is a hashed .mjs asset (`?url`), not this module,
 * so the worker thread never executes app code (which caused TDZ / 404 crashes).
 */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerConfigured = false;

function toPdfBytes(data) {
	if (data instanceof Uint8Array) {
		return data;
	}
	if (data instanceof ArrayBuffer) {
		return new Uint8Array(data.slice(0));
	}
	return new Uint8Array(data);
}

function configureWorker() {
	if (workerConfigured || typeof window === 'undefined') {
		return;
	}
	GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
	workerConfigured = true;
}

function loadDocument(bytes, useWorker) {
	return getDocument({
		data: bytes,
		useSystemFonts: true,
		disableAutoFetch: true,
		disableStream: true,
		isEvalSupported: false,
		disableWorker: !useWorker,
	}).promise;
}

export async function openPdfFromData(data) {
	configureWorker();
	const bytes = toPdfBytes(data);

	try {
		return await loadDocument(bytes, true);
	} catch (error) {
		const message = String(error?.message || error || '');
		const workerFailed = /worker|failed to fetch|404|setting up fake worker|cannot access/i.test(message)
			|| error?.name === 'UnknownErrorException';
		if (!workerFailed) {
			throw error;
		}
		return loadDocument(bytes, false);
	}
}
