import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { libraryService } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { scrollAppToTop } from '../utils/scrollToTop';
import '../styles/library-reader-page.css';

function isPdfItem(item) {
	const mimeType = String(item?.mime_type || '').toLowerCase();
	const filename = String(item?.original_filename || '').toLowerCase();
	return mimeType === 'application/pdf' || filename.endsWith('.pdf') || item?.is_pdf === true;
}

const LibraryReaderPage = () => {
	const { itemId } = useParams();
	const navigate = useNavigate();
	const location = useLocation();
	const { error: showError } = useToast();

	const [item, setItem] = useState(location.state?.item ?? null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [pdfUrl, setPdfUrl] = useState('');
	const [pdfLoading, setPdfLoading] = useState(false);
	const [pdfError, setPdfError] = useState(null);

	useEffect(() => {
		scrollAppToTop();
	}, [itemId]);

	useEffect(() => {
		let active = true;

		const loadItem = async () => {
			setLoading(true);
			setError(null);

			try {
				if (location.state?.item && Number(location.state.item.id) === Number(itemId)) {
					setItem(location.state.item);
				}

				const response = await libraryService.getItem(itemId);
				if (!active) return;

				setItem(response?.item || null);
			} catch (err) {
				if (!active) return;
				setError(err?.response?.data?.message || 'Nu s-a putut incarca materialul din biblioteca.');
			} finally {
				if (active) setLoading(false);
			}
		};

		loadItem();

		return () => {
			active = false;
		};
	}, [itemId, location.state]);

	useEffect(() => {
		let active = true;
		let objectUrl = null;

		const loadPdf = async () => {
			if (!item || !isPdfItem(item)) {
				setPdfUrl('');
				setPdfLoading(false);
				setPdfError(null);
				return;
			}

			setPdfLoading(true);
			setPdfError(null);

			try {
				const { blob } = await libraryService.downloadItemBlob(
					item.id,
					item.original_filename || item.title || 'document.pdf',
				);

				if (!active) return;

				objectUrl = URL.createObjectURL(blob);
				setPdfUrl(objectUrl);
			} catch (err) {
				if (active) {
					setPdfError(err?.response?.data?.message || 'Nu s-a putut deschide PDF-ul.');
				}
			} finally {
				if (active) {
					setPdfLoading(false);
				}
			}
		};

		loadPdf();

		return () => {
			active = false;
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl);
			}
		};
	}, [item]);

	const isPdf = isPdfItem(item);

	const handleDownload = async () => {
		if (!item) return;

		try {
			const { blob, filename } = await libraryService.downloadItemBlob(
				item.id,
				item.original_filename || item.title || 'document',
			);
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = filename || item.original_filename || item.title || 'document';
			anchor.rel = 'noopener';
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(url);
		} catch (err) {
			showError(err?.response?.data?.message || 'Descarcarea a esuat.');
		}
	};

	if (loading) {
		return (
			<div className="library-reader-page library-reader-page--fullscreen">
				<div className="library-reader-loading">
					<div className="library-reader-spinner" />
					<p>Se incarca materialul...</p>
				</div>
			</div>
		);
	}

	if (error || !item) {
		return (
			<div className="library-reader-page library-reader-page--fullscreen">
				<div className="library-reader-empty-state">
					<div className="library-reader-empty-icon">PDF</div>
					<h1>Material indisponibil</h1>
					<p>{error || 'Fisierul nu a fost gasit.'}</p>
					<button type="button" className="library-reader-btn library-reader-btn-primary" onClick={() => navigate('/library')}>
						Inapoi la biblioteca
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="library-reader-page library-reader-page--fullscreen">
			<main className="library-reader-stage">
				<div className="library-reader-floating-actions" aria-label="Actiuni rapide">
					<button type="button" className="library-reader-btn library-reader-floating-btn" onClick={() => navigate('/library')}>
						← Biblioteca
					</button>
					<button type="button" className="library-reader-btn library-reader-floating-btn" onClick={handleDownload}>
						Descarca
					</button>
				</div>

				{!isPdf ? (
					<div className="library-reader-empty-state library-reader-empty-state--embedded">
						<div className="library-reader-empty-icon">PDF</div>
						<h1>Acest material nu este PDF</h1>
						<p>Fisierul poate fi descarcat din biblioteca.</p>
						<button type="button" className="library-reader-btn library-reader-btn-primary" onClick={handleDownload}>
							Descarca fisierul
						</button>
					</div>
				) : pdfLoading ? (
					<div className="library-reader-loading library-reader-loading--embedded">
						<div className="library-reader-spinner" />
						<p>Se pregateste PDF-ul...</p>
					</div>
				) : pdfError ? (
					<div className="library-reader-empty-state library-reader-empty-state--embedded">
						<div className="library-reader-empty-icon">PDF</div>
						<h1>Nu am putut deschide PDF-ul</h1>
						<p>{pdfError}</p>
						<button type="button" className="library-reader-btn library-reader-btn-primary" onClick={handleDownload}>
							Descarca documentul
						</button>
					</div>
				) : (
					<iframe className="library-reader-frame" src={pdfUrl} title={item.title || 'PDF reader'} />
				)}
			</main>
		</div>
	);
};

export default LibraryReaderPage;
