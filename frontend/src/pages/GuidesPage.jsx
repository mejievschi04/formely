import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { guidesService } from '../services/api';

import { useToast } from '../contexts/ToastContextShared.js';

import { useAuth } from '../contexts/AuthContextShared.js';
import Modal from '../components/common/Modal';
import { logger } from '../utils/logger';
import { toImageUrl } from '../utils/imageUrl';
import { ImageSquare, LinkSimple, Plus, X } from '@phosphor-icons/react';
import '../styles/library-page.css';
import '../styles/guides-page.css';

const COVER_PALETTES = [
	{ a: '#0c4a6e', b: '#0d9488', accent: '#fcd34d', glow: 'rgba(250, 204, 21, 0.35)' },
	{ a: '#1e1b4b', b: '#6366f1', accent: '#a5b4fc', glow: 'rgba(129, 140, 248, 0.4)' },
	{ a: '#134e4a', b: '#047857', accent: '#6ee7b7', glow: 'rgba(52, 211, 153, 0.35)' },
	{ a: '#4c0519', b: '#be123c', accent: '#fda4af', glow: 'rgba(251, 113, 133, 0.35)' },
	{ a: '#312e81', b: '#4338ca', accent: '#fde68a', glow: 'rgba(253, 224, 71, 0.3)' },
	{ a: '#14532d', b: '#15803d', accent: '#bbf7d0', glow: 'rgba(187, 247, 208, 0.35)' },
	{ a: '#1c1917', b: '#78716c', accent: '#e7e5e4', glow: 'rgba(255, 255, 255, 0.12)' },
	{ a: '#0f172a', b: '#0ea5e9', accent: '#7dd3fc', glow: 'rgba(14, 165, 233, 0.35)' },
];

const emptyForm = { title: '', description: '', url: '', cover: null };

function coverPaletteForItem(item) {
	const seed = (Number(item?.id) || 0) * 17 + String(item?.title || '').length * 3;
	return COVER_PALETTES[Math.abs(seed) % COVER_PALETTES.length];
}

function formatLinkHost(url) {
	if (!url) return '';
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

const GuidesPage = () => {
	const { user } = useAuth();
	const { success: showSuccess, error: showError } = useToast();
	const [items, setItems] = useState([]);
	const [meta, setMeta] = useState(null);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [saving, setSaving] = useState(false);
	const [deletingId, setDeletingId] = useState(null);
	const [showModal, setShowModal] = useState(false);
	const [editingItem, setEditingItem] = useState(null);
	const [form, setForm] = useState(emptyForm);
	const [removeCover, setRemoveCover] = useState(false);
	const coverInputRef = useRef(null);

	const selectedCoverUrl = useMemo(() => (form.cover ? URL.createObjectURL(form.cover) : null), [form.cover]);
	useEffect(() => () => {
		if (selectedCoverUrl) URL.revokeObjectURL(selectedCoverUrl);
	}, [selectedCoverUrl]);
	const existingCoverUrl = editingItem?.cover_image_url && !removeCover
		? (toImageUrl(editingItem.cover_image_url) || editingItem.cover_image_url)
		: null;
	const coverPreview = selectedCoverUrl || existingCoverUrl;

	const clearCover = () => {
		if (coverInputRef.current) coverInputRef.current.value = '';
		if (form.cover) {
			setForm((f) => ({ ...f, cover: null }));
		} else {
			setRemoveCover(true);
		}
	};

	const actualRole = user?.actualRole ?? user?.role ?? 'student';
	const canManage = actualRole === 'admin' || actualRole === 'instructor';

	const canDeleteItem = useCallback(
		(item) => {
			if (!item || !user) return false;
			if (actualRole === 'admin') return true;
			if (actualRole === 'instructor' && item.uploader?.id === user.id) return true;
			return false;
		},
		[actualRole, user],
	);

	const load = useCallback(async (p = 1) => {
		setLoading(true);
		setError(null);
		try {
			const data = await guidesService.listItems({ page: p, per_page: 20 });
			setItems(Array.isArray(data?.data) ? data.data : []);
			setMeta(data?.meta || null);
			setPage(p);
		} catch (err) {
			logger.error('Guides list', err);
			setError(err.response?.data?.message || 'Nu s-au putut încărca ghidurile.');
			setItems([]);
			setMeta(null);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load(1);
	}, [load]);

	const openCreateModal = () => {
		setEditingItem(null);
		setForm(emptyForm);
		setRemoveCover(false);
		setShowModal(true);
	};

	const openEditModal = (item) => {
		setEditingItem(item);
		setForm({
			title: item.title || '',
			description: item.description || '',
			url: item.url || '',
			cover: null,
		});
		setRemoveCover(false);
		setShowModal(true);
	};

	const closeModal = () => {
		setShowModal(false);
		setEditingItem(null);
		setForm(emptyForm);
		setRemoveCover(false);
	};

	const onOpenLink = (item) => {
		if (!item?.url) return;
		window.open(item.url, '_blank', 'noopener,noreferrer');
	};

	const onSubmit = async (e) => {
		e.preventDefault();
		if (!form.title.trim() || !form.url.trim()) {
			showError('Titlul și linkul sunt obligatorii.');
			return;
		}
		setSaving(true);
		try {
			const payload = {
				title: form.title.trim(),
				description: form.description.trim() || undefined,
				url: form.url.trim(),
				cover: form.cover || undefined,
				removeCover,
			};
			if (editingItem) {
				await guidesService.updateItem(editingItem.id, payload);
				showSuccess('Ghidul a fost actualizat.');
			} else {
				await guidesService.createItem(payload);
				showSuccess('Ghidul a fost adăugat.');
			}
			closeModal();
			await load(editingItem ? page : 1);
		} catch (err) {
			logger.error('Guides save', err);
			showError(err.response?.data?.message || 'Salvarea a eșuat.');
		} finally {
			setSaving(false);
		}
	};

	const onDelete = async (item) => {
		if (!window.confirm(`Elimini „${item.title}” din ghiduri?`)) return;
		setDeletingId(item.id);
		try {
			await guidesService.deleteItem(item.id);
			showSuccess('Ghid eliminat.');
			await load(page);
		} catch (err) {
			logger.error('Guides delete', err);
			showError(err.response?.data?.message || 'Ștergerea a eșuat.');
		} finally {
			setDeletingId(null);
		}
	};

	return (
		<div className="va-main library-page guides-page">
			<header className="library-page-header">
				<div className="library-page-header-copy">
					<h1 className="library-page-title">Ghiduri</h1>
				</div>
				{canManage && (
					<div className="library-page-header-actions">
						<button
							type="button"
							className="library-btn lms-btn-primary library-btn--primary library-upload-trigger"
							onClick={openCreateModal}
						>
							<Plus size={18} weight="bold" aria-hidden />
							Adaugă ghid
						</button>
					</div>
				)}
			</header>

			{error && <div className="library-error" role="alert">{error}</div>}

			<section aria-labelledby="guides-list-heading">
				<h2 id="guides-list-heading" className="library-section-title">
					Ghiduri disponibile
				</h2>
				{loading ? (
					<p className="library-empty">Se încarcă...</p>
				) : items.length === 0 ? (
					<p className="library-empty">Nu există încă ghiduri adăugate.</p>
				) : (
					<ul className="library-book-grid">
						{items.map((item) => {
							const pal = coverPaletteForItem(item);
							const coverSrc = item.cover_image_url ? (toImageUrl(item.cover_image_url) || item.cover_image_url) : null;
							const host = formatLinkHost(item.url);
							return (
								<li
									key={item.id}
									className={`library-book-card guides-card${coverSrc ? ' library-book-card--cover-photo' : ''}`}
								>
									<div
										className="library-book-card-inner library-book-card-inner--clickable"
										role="button"
										tabIndex={0}
										onClick={() => onOpenLink(item)}
										onKeyDown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												onOpenLink(item);
											}
										}}
									>
										<div className="library-book-cover-wrap">
											<div className="library-book-spine" aria-hidden />
											<div
												className={`library-book-cover guides-cover${coverSrc ? ' library-book-cover--photo' : ''}`}
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
												) : (
													<span className="guides-cover-icon" aria-hidden>
														<LinkSimple size={42} weight="duotone" />
													</span>
												)}
												<div className="library-book-cover-shine" aria-hidden />
												<div className="library-book-cover-grain" aria-hidden />
												<span className="library-book-ribbon" aria-hidden />
												<div className="library-book-cover-body">
													<span className="library-book-cover-type">Link</span>
													<h3 className="library-book-cover-title">{item.title}</h3>
												</div>
												<div className="library-book-cover-footer" aria-hidden />
											</div>
										</div>
										<div className="library-book-info">
											<p className="library-book-filename" title={item.url}>
												{item.description?.trim() || host || item.url}
											</p>
											{host && item.description?.trim() ? (
												<p className="guides-link-host">{host}</p>
											) : null}
											<div className="library-book-actions">
												<button
													type="button"
													className="library-btn lms-btn-primary library-btn--primary library-btn--grow"
													onClick={(e) => {
														e.stopPropagation();
														onOpenLink(item);
													}}
												>
													Deschide link
												</button>
												{canDeleteItem(item) && (
													<>
														<button
															type="button"
															className="library-btn library-btn--secondary library-btn--icon"
															onClick={(e) => {
																e.stopPropagation();
																openEditModal(item);
															}}
															title="Editează ghidul"
															aria-label="Editează ghidul"
														>
															✎
														</button>
														<button
															type="button"
															className="library-btn va-btn-delete library-btn--danger library-btn--icon"
															disabled={deletingId === item.id}
															onClick={(e) => {
																e.stopPropagation();
																onDelete(item);
															}}
															title="Șterge ghidul"
															aria-label="Șterge ghidul"
														>
															{deletingId === item.id ? '…' : '✕'}
														</button>
													</>
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
				isOpen={showModal}
				onClose={closeModal}
				ariaLabelledby="guides-modal-title"
				className="library-upload-modal-overlay"
			>
				<div className="library-upload-modal guides-modal">
					<header className="library-upload-modal-header">
						<div>
							<h2 id="guides-modal-title">{editingItem ? 'Editează ghid' : 'Adaugă ghid'}</h2>
							<p>Completează titlul și linkul. Poți adăuga o descriere scurtă și o imagine de copertă opțională.</p>
						</div>
						<button type="button" className="library-upload-modal-close va-close-btn" onClick={closeModal} aria-label="Închide">
							<X size={18} weight="bold" aria-hidden="true" />
						</button>
					</header>
					<form onSubmit={onSubmit} className="library-upload-modal-form">
						<div className="library-form-row">
							<label htmlFor="guide-title">Titlu</label>
							<input
								id="guide-title"
								type="text"
								required
								placeholder="Ex: Ghid onboarding"
								value={form.title}
								onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
							/>
						</div>
						<div className="library-form-row">
							<label htmlFor="guide-url">Link</label>
							<input
								id="guide-url"
								type="url"
								required
								placeholder="https://exemplu.ro/ghid"
								value={form.url}
								onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
							/>
						</div>
						<div className="library-form-row">
							<label htmlFor="guide-description">Descriere (opțional)</label>
							<textarea
								id="guide-description"
								rows={3}
								placeholder="Scurtă descriere a resursei"
								value={form.description}
								onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
							/>
						</div>
						<div className="library-form-row">
							<span className="library-form-label" id="guide-cover-label">Copertă (opțional)</span>
							<input
								ref={coverInputRef}
								id="guide-cover"
								type="file"
								className="library-file-input-hidden"
								accept="image/jpeg,image/png,image/webp"
								aria-labelledby="guide-cover-label"
								onChange={(e) => {
									setForm((f) => ({ ...f, cover: e.target.files?.[0] || null }));
									setRemoveCover(false);
								}}
							/>
							<div className={`guides-cover-picker${coverPreview ? ' has-image' : ''}`}>
								<div className="guides-cover-picker-thumb" aria-hidden>
									{coverPreview ? <img src={coverPreview} alt="" /> : <ImageSquare size={28} weight="duotone" />}
								</div>
								<div className="guides-cover-picker-copy">
									<strong>
										{form.cover ? form.cover.name : coverPreview ? 'Copertă curentă' : 'Nicio copertă aleasă'}
									</strong>
									<span>JPG, PNG sau WEBP</span>
								</div>
								<div className="guides-cover-picker-actions">
									<button
										type="button"
										className="library-btn library-btn--secondary"
										onClick={() => coverInputRef.current?.click()}
									>
										{coverPreview ? 'Schimbă' : 'Alege imagine'}
									</button>
									{coverPreview ? (
										<button
											type="button"
											className="library-btn va-btn-delete library-btn--danger"
											onClick={clearCover}
										>
											Elimină
										</button>
									) : null}
								</div>
							</div>
						</div>
						<div className="library-upload-modal-actions">
							<button type="button" className="library-btn library-btn--secondary" onClick={closeModal} disabled={saving}>
								Renunță
							</button>
							<button type="submit" className="va-btn-save library-btn lms-btn-primary library-btn--primary" disabled={saving}>
								{saving ? 'Se salvează...' : editingItem ? 'Salvează' : 'Adaugă ghid'}
							</button>
						</div>
					</form>
				</div>
			</Modal>
		</div>
	);
};

export default GuidesPage;
