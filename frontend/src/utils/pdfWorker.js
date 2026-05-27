import { GlobalWorkerOptions } from 'pdfjs-dist';

let configured = false;

export function configurePdfWorker() {
	if (configured || typeof window === 'undefined') {
		return;
	}

	const base = String(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
	GlobalWorkerOptions.workerSrc = `${base}assets/pdf.worker.js`;
	configured = true;
}
