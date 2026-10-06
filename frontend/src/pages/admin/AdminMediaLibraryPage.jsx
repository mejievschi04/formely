import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, FilmStrip, MusicNotes, File, Trash } from '@phosphor-icons/react';
import { adminService } from '../../services/api';
import { useToast } from '../../contexts/ToastContextShared.js';
import { useAuth } from '../../contexts/AuthContextShared.js';
import { toImageUrl } from '../../utils/imageUrl';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import '../../styles/admin-content-list.css';
import './AdminMediaLibraryPage.css';

const TYPE_LABELS = {
	image: 'Imagine',
	document: 'Document',
	video: 'Video',
	audio: 'Audio',
	other: 'Alt fișier',
};

const TYPE_ICONS = {
	document: FileText,
	video: FilmStrip,
	audio: MusicNotes,
	other: File,
};

const PER_PAGE = 24;

const formatSize = (bytes) => {
	const value = Number(bytes) || 0;
	if (value < 1024) return `${value} B`;
	if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
	return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (value) => {
	if (!value) return '';
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ro-RO');
};

const AdminMediaLibraryPage = () => {
	const { canMutateInAdminArea } = useAuth();
	const { success, error } = useToast();
	const [items, setItems] = useState([]);
	const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
	const [page, setPage] = useState(1);
	const [search, setSearch] = useState('');
	const [query, setQuery] = useState('');
	const [type, setType] = useState('');
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(false);
	const [toDelete, setToDelete] = useState(null);
	const [deleting, setDeleting] = useState(false);
	const [inUse, setInUse] = useState(null);

	// căutarea pornește după o scurtă pauză de tastare
	useEffect(() => {
		const id = window.setTimeout(() => {
			setQuery(search.trim());
			setPage(1);
		}, 300);
		return () => window.clearTimeout(id);
	}, [search]);

	const load = useCallback(async () => {
		setLoading(true);
		setLoadError(false);
		try {
			const params = { page, per_page: PER_PAGE };
			if (query) params.q = query;
			if (type) params.type = type;
			const res = await adminService.getMediaAssets(params);
			setItems(Array.isArray(res?.data) ? res.data : []);
			setMeta(res?.meta || { current_page: 1, last_page: 1, total: 0 });
		} catch {
			setItems([]);
			setLoadError(true);
		} finally {
			setLoading(false);
		}
	}, [page, query, type]);

	useEffect(() => {
		load();
	}, [load]);

	const confirmDelete = async () => {
		if (!toDelete) return;
		setDeleting(true);
		try {
			await adminService.deleteMediaAsset(toDelete.id);
			success('Fișierul a fost șters.');
			setToDelete(null);
			// pagina poate rămâne goală după ștergerea ultimului element
			if (items.length === 1 && page > 1) setPage((p) => p - 1);
			else load();
		} catch (e) {
			const data = e?.response?.data;
			if (e?.response?.status === 409 && Array.isArray(data?.usages)) {
				setInUse({ file: toDelete, usages: data.usages });
			} else {
				error(data?.message || 'Nu am putut șterge fișierul.');
			}
			setToDelete(null);
		} finally {
			setDeleting(false);
		}
	};

	return (
		<div className="admin-media-page admin-content-list-page">
			<header className="admin-content-list-header">
				<div className="admin-content-list-header__copy">
					<p className="admin-content-list-header__kicker">Conținut</p>
					<h1>Fișiere media</h1>
					<p className="admin-content-list-header__lead">
						Imaginile, documentele și celelalte fișiere încărcate în lecții. Un fișier folosit într-o lecție nu poate fi șters.
					</p>
					<div className="admin-content-list-stats" aria-label="Rezumat">
						<span>Total<strong>{loading ? '…' : meta.total ?? 0}</strong></span>
					</div>
				</div>
			</header>

			<div className="admin-content-list-toolbar">
				<div className="admin-content-list-search">
					<input
						type="search"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Caută după numele fișierului"
						aria-label="Caută fișiere"
					/>
				</div>
				<div className="admin-content-list-filter">
					<label htmlFor="admin-media-type">Tip</label>
					<select
						id="admin-media-type"
						value={type}
						onChange={(e) => {
							setType(e.target.value);
							setPage(1);
						}}
					>
						<option value="">Toate</option>
						{Object.entries(TYPE_LABELS).map(([value, label]) => (
							<option key={value} value={value}>{label}</option>
						))}
					</select>
				</div>
			</div>

			{loading ? (
				<div className="admin-content-list-skeleton" aria-busy="true" aria-label="Se încarcă fișierele">
					{Array.from({ length: 6 }, (_, i) => <div key={i} className="admin-content-list-skeleton__card" />)}
				</div>
			) : loadError ? (
				<div className="admin-content-list-empty" role="alert">
					<p>Nu am putut încărca fișierele.</p>
					<button type="button" className="lms-btn-secondary" onClick={load}>Încearcă din nou</button>
				</div>
			) : items.length === 0 ? (
				<div className="admin-content-list-empty">
					{query || type ? 'Niciun fișier pentru căutarea sau filtrul curent.' : 'Nu există încă fișiere încărcate. Apar aici după ce adaugi imagini sau documente în lecții.'}
				</div>
			) : (
				<ul className="admin-media-grid" aria-label="Fișiere">
					{items.map((item) => {
						const Icon = TYPE_ICONS[item.type] || File;
						const src = item.url ? toImageUrl(item.url) : null;
						return (
							<li key={item.id} className="admin-media-card">
								<div className="admin-media-card__preview">
									{item.type === 'image' && src ? (
										<img src={src} alt="" loading="lazy" />
									) : (
										<Icon size={34} weight="duotone" aria-hidden="true" />
									)}
								</div>
								<div className="admin-media-card__body">
									<p className="admin-media-card__name" title={item.filename}>{item.filename || 'Fișier fără nume'}</p>
									<p className="admin-media-card__meta">
										{TYPE_LABELS[item.type] || item.type} · {formatSize(item.size)}
										{formatDate(item.created_at) ? ` · ${formatDate(item.created_at)}` : ''}
									</p>
								</div>
								<div className="admin-media-card__actions">
									{src ? (
										<a className="lms-btn-secondary lms-btn-sm" href={src} target="_blank" rel="noreferrer">Deschide</a>
									) : null}
									{canMutateInAdminArea ? (
										<button
											type="button"
											className="lms-btn-secondary lms-btn-sm va-btn-delete va-btn-danger admin-media-card__delete"
											onClick={() => setToDelete(item)}
											aria-label={`Șterge fișierul ${item.filename || ''}`}
											title="Șterge fișierul"
										>
											<Trash size={16} weight="bold" aria-hidden="true" />
										</button>
									) : null}
								</div>
							</li>
						);
					})}
				</ul>
			)}

			{!loading && !loadError && meta.last_page > 1 ? (
				<nav className="admin-media-pagination" aria-label="Pagini">
					<button type="button" className="lms-btn-secondary lms-btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
						Înapoi
					</button>
					<span>Pagina {meta.current_page} din {meta.last_page}</span>
					<button type="button" className="lms-btn-secondary lms-btn-sm" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)}>
						Înainte
					</button>
				</nav>
			) : null}

			<ConfirmModal
				open={Boolean(toDelete)}
				onClose={() => !deleting && setToDelete(null)}
				onConfirm={confirmDelete}
				title="Șterge fișierul"
				message={`„${toDelete?.filename || ''}” va fi șters definitiv de pe server. Dacă e folosit într-o lecție, ștergerea va fi refuzată.`}
				confirmLabel="Șterge"
				cancelLabel="Anulare"
				variant="danger"
				loading={deleting}
			/>

			<Modal isOpen={Boolean(inUse)} onClose={() => setInUse(null)}>
				<div className="admin-media-in-use">
					<h3>Fișierul este folosit</h3>
					<p>
						„{inUse?.file?.filename}” apare în {inUse?.usages?.length === 1 ? 'lecția' : 'lecțiile'} de mai jos.
						Scoate-l mai întâi din conținutul lor, apoi îl poți șterge.
					</p>
					<ul>
						{(inUse?.usages || []).map((usage) => (
							<li key={`${usage.type}-${usage.id}`}>
								{usage.course_id ? (
									<Link to={`/admin/courses/${usage.course_id}/builder`} onClick={() => setInUse(null)}>
										{usage.lesson_title || `Lecția ${usage.lesson_id}`}
									</Link>
								) : (
									usage.lesson_title || `Lecția ${usage.lesson_id}`
								)}
							</li>
						))}
					</ul>
					<div className="admin-media-in-use__actions">
						<button type="button" className="lms-btn-secondary" onClick={() => setInUse(null)}>Închide</button>
					</div>
				</div>
			</Modal>
		</div>
	);
};

export default AdminMediaLibraryPage;
