import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { libraryService } from '../services/api';

import { useAuth } from '../contexts/AuthContextShared.js';

import { useToast } from '../contexts/ToastContextShared.js';
import { scrollAppToTop } from '../utils/scrollToTop';
import { toImageUrl } from '../utils/imageUrl';
import RichTextHtml from '../components/RichTextHtml';
import '../styles/library-reader-page.css';
import '../components/admin/lessons/callout/LessonCallout.css';
import '../components/admin/lessons/video/LessonVideo.css';
import '../components/admin/lessons/image/LessonImageContent.css';

function isPdfItem(item) {
	const mimeType = String(item?.mime_type || '').toLowerCase();
	const filename = String(item?.original_filename || '').toLowerCase();
	return mimeType === 'application/pdf' || filename.endsWith('.pdf') || item?.is_pdf === true;
}

function isTextItem(item) {
	return item?.is_text === true || item?.content_type === 'text';
}

const LibraryReaderPage = () => {
	const { itemId } = useParams();
	const navigate = useNavigate();
	const location = useLocation();
	const { user } = useAuth();
	const { error: showError } = useToast();
	const actualRole = user?.actualRole ?? user?.role ?? 'student';

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
				setError(err?.response?.data?.message || 'Nu s-a putut încărca materialul din bibliotecă.');
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
			if (!item || !isPdfItem(item) || isTextItem(item)) {
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
	const isText = isTextItem(item);
	const canEditItem =
		isText &&
		(actualRole === 'admin' || (actualRole === 'instructor' && item?.uploader?.id === user?.id));

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
			showError(err?.response?.data?.message || 'Descărcarea a eșuat.');
		}
	};

	if (loading) {
		return (
			<div className="library-reader-page library-reader-page--fullscreen">
				<div className="library-reader-loading">
					<div className="library-reader-spinner" />
					<p>Se încarcă materialul...</p>
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
					<p>{error || 'Materialul nu a fost găsit.'}</p>
					<button type="button" className="library-reader-btn lms-btn-primary library-reader-btn-primary" onClick={() => navigate('/library')}>
						Înapoi la bibliotecă
					</button>
				</div>
			</div>
		);
	}

	if (isText) {
		const coverSrc = item.cover_image_url ? (toImageUrl(item.cover_image_url) || item.cover_image_url) : '';

		return (
			<div className="library-reader-page library-reader-page--article">
				<header className="library-reader-article-header">
					<button type="button" className="library-reader-btn" onClick={() => navigate('/library')}>
						← Bibliotecă
					</button>
					<div className="library-reader-article-actions">
						{canEditItem ? (
							<button
								type="button"
								className="library-reader-btn"
								onClick={() => navigate(`/library/compose/${item.id}`)}
							>
								Editează
							</button>
						) : null}
						<button type="button" className="library-reader-btn" onClick={handleDownload}>
							Descarcă HTML
						</button>
					</div>
				</header>
				<article className="library-reader-article">
					{coverSrc ? (
						<div className="library-reader-article-cover-wrap">
							<img src={coverSrc} alt="" className="library-reader-article-cover" />
						</div>
					) : null}
					<h1 className="library-reader-article-title">{item.title}</h1>
					{item.description ? <p className="library-reader-article-lead">{item.description}</p> : null}
					<div className="library-reader-article-body lesson-preview-content">
						<RichTextHtml html={item.body || ''} />
					</div>
				</article>
			</div>
		);
	}

	return (
		<div className="library-reader-page library-reader-page--fullscreen">
			<main className="library-reader-stage">
				<div className="library-reader-floating-actions" aria-label="Acțiuni rapide">
					<button type="button" className="library-reader-btn library-reader-floating-btn" onClick={() => navigate('/library')}>
						← Bibliotecă
					</button>
					<button type="button" className="library-reader-btn library-reader-floating-btn" onClick={handleDownload}>
						Descarcă
					</button>
				</div>

				{!isPdf ? (
					<div className="library-reader-empty-state library-reader-empty-state--embedded">
						<div className="library-reader-empty-icon">PDF</div>
						<h1>Acest material nu este PDF</h1>
						<p>Fișierul poate fi descărcat din bibliotecă.</p>
						<button type="button" className="library-reader-btn lms-btn-primary library-reader-btn-primary" onClick={handleDownload}>
							Descarcă fișierul
						</button>
					</div>
				) : pdfLoading ? (
					<div className="library-reader-loading library-reader-loading--embedded">
						<div className="library-reader-spinner" />
						<p>Se pregătește PDF-ul...</p>
					</div>
				) : pdfError ? (
					<div className="library-reader-empty-state library-reader-empty-state--embedded">
						<div className="library-reader-empty-icon">PDF</div>
						<h1>Nu am putut deschide PDF-ul</h1>
						<p>{pdfError}</p>
						<button type="button" className="library-reader-btn lms-btn-primary library-reader-btn-primary" onClick={handleDownload}>
							Descarcă documentul
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
