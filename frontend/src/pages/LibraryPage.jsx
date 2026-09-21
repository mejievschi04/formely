import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { libraryService } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { isStaffAdminRole } from '../constants/staffRoles';
import Modal from '../components/common/Modal';
import { logger } from '../utils/logger';
import { toImageUrl } from '../utils/imageUrl';
import { renderPdfFirstPageAsJpegBlob } from '../utils/renderPdfFirstPageCover';
import { UploadSimple } from '@phosphor-icons/react';
import '../styles/library-page.css';

function formatBytes(n) {
	if (n == null || Number.isNaN(Number(n))) return '—';
	const v = Number(n);
	if (v < 1024) return `${v} B`;
	if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
	return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

const ALLOWED_FILES_HINT =
	'PDF, EPUB, MOBI, DOC, DOCX, TXT, ZIP — max. ~512 MB per fișier. Pentru PDF, coperta primei pagini se face automat în browser (nu e nevoie de Ghostscript pe server).';

function isPdfItem(item) {
	const mimeType = String(item?.mime_type || '').toLowerCase();
	const filename = String(item?.original_filename || '').toLowerCase();
	return mimeType === 'application/pdf' || filename.endsWith('.pdf') || item?.is_pdf === true;
}

function isTextItem(item) {
	return item?.is_text === true || item?.content_type === 'text';
}

function getItemTypeLabel(item) {
	if (isTextItem(item)) return 'Text';
	if (isPdfItem(item)) return 'PDF';
	const filename = String(item?.original_filename || '').toLowerCase();
	if (filename.endsWith('.doc') || filename.endsWith('.docx')) return 'DOC';
	if (filename.endsWith('.txt')) return 'TXT';
	if (filename.endsWith('.zip')) return 'ZIP';
	return 'Fișier';
}

/** Palete pentru coperte CSS (gradient + accente). */
const COVER_PALETTES = [
	{ a: '#0c4a6e', b: '#0891b2', accent: '#22d3ee', glow: 'rgba(34, 211, 238, 0.35)' },
	{ a: '#0f172a', b: '#155e75', accent: '#67e8f9', glow: 'rgba(103, 232, 249, 0.35)' },
	{ a: '#083344', b: '#0e7490', accent: '#a5f3fc', glow: 'rgba(8, 145, 178, 0.4)' },
	{ a: '#164e63', b: '#22d3ee', accent: '#ecfeff', glow: 'rgba(34, 211, 238, 0.3)' },
	{ a: '#082f49', b: '#0284c7', accent: '#7dd3fc', glow: 'rgba(14, 165, 233, 0.35)' },
	{ a: '#0f172a', b: '#334155', accent: '#e2e8f0', glow: 'rgba(226, 232, 240, 0.2)' },
	{ a: '#042f2e', b: '#0e7490', accent: '#99f6e4', glow: 'rgba(8, 145, 178, 0.3)' },
	{ a: '#020617', b: '#0891b2', accent: '#22d3ee', glow: 'rgba(8, 145, 178, 0.4)' },
];

function coverPaletteForItem(item) {
	const seed = (Number(item?.id) || 0) * 17 + String(item?.title || '').length * 3;
	return COVER_PALETTES[Math.abs(seed) % COVER_PALETTES.length];
}

const LibraryPage = () => {
	const navigate = useNavigate();
	const { user } = useAuth();
	const { success: showSuccess, error: showError } = useToast();
	const [items, setItems] = useState([]);
	const [meta, setMeta] = useState(null);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [uploading, setUploading] = useState(false);
	const [deletingId, setDeletingId] = useState(null);
	const [showUploadModal, setShowUploadModal] = useState(false);
	const [form, setForm] = useState({ title: '', file: null });
	const [uploadFormKey, setUploadFormKey] = useState(0);
	const [dropzoneActive, setDropzoneActive] = useState(false);
	const fileInputRef = useRef(null);
	const dropDepthRef = useRef(0);

	const actualRole = user?.actualRole ?? user?.role ?? 'student';
	const canUpload = user?.role !== 'student' && isStaffAdminRole(actualRole);

	const canDeleteItem = useCallback(
		(item) => {
			if (!item || !user || user.role === 'student') return false;
			if (actualRole === 'admin') return true;
			if (actualRole === 'instructor' && item.uploader?.id === user.id) return true;
			return false;
		},
		[actualRole, user],
	);

	const canEditItem = useCallback(
		(item) => canDeleteItem(item) && isTextItem(item),
		[canDeleteItem],
	);

	const load = useCallback(async (p = 1) => {
		setLoading(true);
		setError(null);
		try {
			const data = await libraryService.listItems({ page: p, per_page: 20 });
			setItems(Array.isArray(data?.data) ? data.data : []);
			setMeta(data?.meta || null);
			setPage(p);
		} catch (err) {
			logger.error('Library list', err);
			setError(err.response?.data?.message || 'Nu s-a putut încărca biblioteca.');
			setItems([]);
			setMeta(null);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load(1);
	}, [load]);

	useEffect(() => {
		if (!showUploadModal) {
			setDropzoneActive(false);
			dropDepthRef.current = 0;
		}
	}, [showUploadModal]);

	const assignLibraryFile = useCallback((file) => {
		if (!file) {
			setForm((f) => ({ ...f, file: null }));
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
			return;
		}
		const input = fileInputRef.current;
		if (input) {
			try {
				const dt = new DataTransfer();
				dt.items.add(file);
				input.files = dt.files;
			} catch {
				/* unele browsere vechi */
			}
		}
		setForm((f) => ({ ...f, file }));
	}, []);

	const onDropzoneDragEnter = (e) => {
		e.preventDefault();
		e.stopPropagation();
		dropDepthRef.current += 1;
		setDropzoneActive(true);
	};

	const onDropzoneDragLeave = (e) => {
		e.preventDefault();
		e.stopPropagation();
		dropDepthRef.current -= 1;
		if (dropDepthRef.current <= 0) {
			dropDepthRef.current = 0;
			setDropzoneActive(false);
		}
	};

	const onDropzoneDragOver = (e) => {
		e.preventDefault();
		e.stopPropagation();
	};

	const onDropzoneDrop = (e) => {
		e.preventDefault();
		e.stopPropagation();
		dropDepthRef.current = 0;
		setDropzoneActive(false);
		const f = e.dataTransfer?.files?.[0];
		if (f) {
			assignLibraryFile(f);
		}
	};

	const onSubmitUpload = async (e) => {
		e.preventDefault();
		if (!form.file) {
			showError('Selectează un fișier.');
			return;
		}
		setUploading(true);
		try {
			let coverBlob = null;
			const f = form.file;
			const looksPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
			if (looksPdf) {
				try {
					coverBlob = await renderPdfFirstPageAsJpegBlob(f);
				} catch (coverErr) {
					logger.warn('Copertă PDF (browser):', coverErr);
					/* continuăm fără copertă; server poate încerca Imagick/GS dacă există */
				}
			}

			await libraryService.uploadItem({
				file: form.file,
				title: form.title.trim() || undefined,
				cover: coverBlob || undefined,
			});
			showSuccess('Fișier încărcat în bibliotecă.');
			setForm({ title: '', file: null });
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
			setUploadFormKey((k) => k + 1);
			setShowUploadModal(false);
			await load(1);
		} catch (err) {
			logger.error('Library upload', err);
			const status = err?.response?.status;
			if (status === 413) {
				showError(
					'Fișierul este prea mare pentru limita de upload a serverului. Încearcă un fișier mai mic sau mărește limita de upload pe server.',
				);
			} else {
				showError(err.response?.data?.message || 'Încărcarea a eșuat.');
			}
		} finally {
			setUploading(false);
		}
	};

	const onDownload = async (item) => {
		try {
			const { blob, filename } = await libraryService.downloadItemBlob(
				item.id,
				item.original_filename || 'document',
			);
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename || item.original_filename || 'document';
			a.rel = 'noopener';
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} catch (err) {
			logger.error('Library download', err);
			showError(err.response?.data?.message || 'Descărcarea a eșuat.');
		}
	};

	const onOpen = (item) => {
		navigate(`/library/items/${item.id}`, { state: { item } });
	};

	const onDelete = async (item) => {
		if (!window.confirm(`Elimini „${item.title}” din bibliotecă?`)) return;
		setDeletingId(item.id);
		try {
			await libraryService.deleteItem(item.id);
			showSuccess('Element eliminat.');
			await load(page);
		} catch (err) {
			logger.error('Library delete', err);
			showError(err.response?.data?.message || 'Ștergerea a eșuat.');
		} finally {
			setDeletingId(null);
		}
	};

	return (
		<div className="va-main library-page">
			<header className="library-page-header">
				<div className="library-page-header-copy">
					<h1 className="library-page-title">Bibliotecă</h1>
					<p className="library-page-lead">
						Biblioteca organizației tale în Formely — cărți, documente și articole partajate.
						Toți utilizatorii autentificați pot citi; administratorii și instructorii pot încărca sau compune materiale noi.
					</p>
				</div>
				{canUpload && (
					<div className="library-page-header-actions">
						<button
							type="button"
							className="library-btn library-btn--secondary library-upload-trigger"
							onClick={() => navigate('/library/compose')}
						>
							Scrie material
						</button>
						<button
							type="button"
							className="library-btn library-btn--primary library-upload-trigger"
							onClick={() => setShowUploadModal(true)}
						>
							Încarcă material
						</button>
					</div>
				)}
			</header>

			{error && <div className="library-error" role="alert">{error}</div>}

			<section aria-labelledby="library-list-heading">
				<h2 id="library-list-heading" className="library-section-title">
					Materiale disponibile
				</h2>
				{loading ? (
					<p className="library-empty">Se încarcă...</p>
				) : items.length === 0 ? (
					<p className="library-empty">Biblioteca Formely este goală — revino când apar materiale noi.</p>
				) : (
					<ul className="library-book-grid">
						{items.map((item) => {
							const pal = coverPaletteForItem(item);
							const coverSrc = item.cover_image_url ? (toImageUrl(item.cover_image_url) || item.cover_image_url) : null;
							return (
								<li
									key={item.id}
									className={`library-book-card${coverSrc ? ' library-book-card--cover-photo' : ''}`}
								>
									<div
										className="library-book-card-inner library-book-card-inner--clickable"
										role="button"
										tabIndex={0}
										onClick={() => onOpen(item)}
										onKeyDown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												onOpen(item);
											}
										}}
									>
										<div className="library-book-cover-wrap">
											<div className="library-book-spine" aria-hidden />
											<div
												className={`library-book-cover${coverSrc ? ' library-book-cover--photo' : ''}`}
												style={{
													'--lib-cover-a': pal.a,
													'--lib-cover-b': pal.b,
													'--lib-cover-accent': pal.accent,
													'--lib-cover-glow': pal.glow,
												}}
											>
												{coverSrc ? (
													<img
														src={coverSrc}
														alt=""
														className="library-book-cover-photo"
														loading="lazy"
														decoding="async"
													/>
												) : null}
												<div className="library-book-cover-shine" aria-hidden />
												<div className="library-book-cover-grain" aria-hidden />
												<span className="library-book-ribbon" aria-hidden />
												<div className="library-book-cover-body">
													<span className="library-book-cover-type">{getItemTypeLabel(item)}</span>
													<h3 className="library-book-cover-title">{item.title}</h3>
												</div>
												<div className="library-book-cover-footer" aria-hidden />
											</div>
										</div>
										<div className="library-book-info">
											<p className="library-book-filename" title={isTextItem(item) ? item.description || item.title : item.original_filename}>
												{isTextItem(item) ? (item.description || 'Material scris') : item.original_filename}
											</p>
											<div className="library-book-actions">
												<button
													type="button"
													className="library-btn library-btn--primary library-btn--grow"
													onClick={(e) => {
														e.stopPropagation();
														if (isTextItem(item)) {
															onOpen(item);
														} else {
															onDownload(item);
														}
													}}
												>
													{isTextItem(item) ? 'Citește' : 'Descarcă'}
												</button>
												{canEditItem(item) && (
													<button
														type="button"
														className="library-btn library-btn--secondary library-btn--icon"
														onClick={(e) => {
															e.stopPropagation();
															navigate(`/library/compose/${item.id}`);
														}}
														title="Editează materialul"
														aria-label="Editează materialul"
													>
														✎
													</button>
												)}
												{canDeleteItem(item) && (
													<button
														type="button"
														className="library-btn library-btn--danger library-btn--icon"
														disabled={deletingId === item.id}
														onClick={(e) => {
															e.stopPropagation();
															onDelete(item);
														}}
														title="Șterge din bibliotecă"
														aria-label="Șterge din bibliotecă"
													>
														{deletingId === item.id ? '…' : '✕'}
													</button>
												)}
											</div>
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				)}
				{meta && meta.last_page > 1 && (
					<div className="library-pagination">
						<button
							type="button"
							className="library-btn library-btn--secondary"
							disabled={page <= 1 || loading}
							onClick={() => load(page - 1)}
						>
							Înapoi
						</button>
						<span className="library-item-meta" style={{ alignSelf: 'center' }}>
							Pagina {meta.current_page} din {meta.last_page}
						</span>
						<button
							type="button"
							className="library-btn library-btn--secondary"
							disabled={page >= meta.last_page || loading}
							onClick={() => load(page + 1)}
						>
							Înainte
						</button>
					</div>
				)}
			</section>

			<Modal
				isOpen={showUploadModal}
				onClose={() => setShowUploadModal(false)}
				ariaLabelledby="library-upload-modal-title"
				className="library-upload-modal-overlay"
			>
				<div className="library-upload-modal">
					<header className="library-upload-modal-header">
						<div>
							<h2 id="library-upload-modal-title">Încarcă material</h2>
							<p>
								Adaugă un fișier nou în bibliotecă. La PDF, prima pagină devine copertă automat în browser — nu trebuie
								instalat nimic pe server pentru asta.
							</p>
						</div>
						<button
							type="button"
							className="library-upload-modal-close"
							onClick={() => setShowUploadModal(false)}
							aria-label="Închide"
						>
							×
						</button>
					</header>
					<form key={uploadFormKey} onSubmit={onSubmitUpload} className="library-upload-modal-form">
						<div className="library-form-row library-form-row--dropzone">
							<span className="library-form-label" id="library-file-label">
								Fișier
							</span>
							<input
								ref={fileInputRef}
								id="library-file"
								type="file"
								required
								className="library-file-input-hidden"
								accept=".pdf,.epub,.mobi,.doc,.docx,.txt,.zip,application/pdf"
								aria-labelledby="library-file-label"
								onChange={(e) => assignLibraryFile(e.target.files?.[0] || null)}
							/>
							<div
								className={[
									'library-dropzone',
									dropzoneActive ? 'library-dropzone--active' : '',
									form.file ? 'library-dropzone--has-file' : '',
								]
									.filter(Boolean)
									.join(' ')}
								onDragEnter={onDropzoneDragEnter}
								onDragLeave={onDropzoneDragLeave}
								onDragOver={onDropzoneDragOver}
								onDrop={onDropzoneDrop}
								onClick={() => fileInputRef.current?.click()}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										fileInputRef.current?.click();
									}
								}}
								role="button"
								tabIndex={0}
								aria-describedby="library-file-hint"
								aria-label={
									form.file
										? `Fișier selectat: ${form.file.name}. Apasă pentru alt fișier.`
										: 'Trage fișierul aici sau apasă pentru a alege din calculator'
								}
							>
								<div className="library-dropzone__icon" aria-hidden>
									<UploadSimple size={44} weight="duotone" />
								</div>
								<p className="library-dropzone__title">
									{form.file ? form.file.name : 'Trage fișierul aici'}
								</p>
								<p className="library-dropzone__subtitle">
									{form.file ? (
										<>
											<span className="library-dropzone__size">{formatBytes(form.file.size)}</span>
											{' · '}
											<button
												type="button"
												className="library-dropzone__change"
												onClick={(ev) => {
													ev.stopPropagation();
													assignLibraryFile(null);
													fileInputRef.current?.click();
												}}
											>
												Schimbă fișierul
											</button>
										</>
									) : (
										<>
											sau <strong>apasă</strong> pentru a alege din calculator
										</>
									)}
								</p>
							</div>
							<p id="library-file-hint" className="library-hint">
								{ALLOWED_FILES_HINT}
							</p>
						</div>
						<div className="library-form-row">
							<label htmlFor="library-title">Titlu (opțional)</label>
							<input
								id="library-title"
								type="text"
								placeholder="Lasă gol pentru a folosi numele fișierului"
								value={form.title}
								onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
							/>
						</div>
						<div className="library-upload-modal-actions">
							<button type="button" className="library-btn library-btn--secondary" onClick={() => setShowUploadModal(false)} disabled={uploading}>
								Renunță
							</button>
							<button type="submit" className="library-btn library-btn--primary" disabled={uploading}>
								{uploading ? 'Se încarcă...' : 'Încarcă în bibliotecă'}
							</button>
						</div>
					</form>
				</div>
			</Modal>
		</div>
	);
};

export default LibraryPage;
