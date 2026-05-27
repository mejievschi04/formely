import React, { useEffect, useMemo, useState } from 'react';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { toImageUrl } from '../../../utils/imageUrl';

const formatBytes = (bytes) => {
	if (!bytes || bytes <= 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
	return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
};

const MediaLibraryModal = ({ open, onClose, courseId, type, onSelect }) => {
	const { showToast } = useToast();
	const [loading, setLoading] = useState(false);
	const [q, setQ] = useState('');
	const [page, setPage] = useState(1);
	const [perPage] = useState(24);
	const [data, setData] = useState([]);
	const [meta, setMeta] = useState(null);
	const [loadError, setLoadError] = useState(null);
	const [deleteConfirmAssetId, setDeleteConfirmAssetId] = useState(null);
	const [deleteLoading, setDeleteLoading] = useState(false);

	const effectiveType = type || '';

	const load = async () => {
		setLoadError(null);
		try {
			setLoading(true);
			const res = await adminService.listMediaAssets({
				courseId,
				type: effectiveType || undefined,
				q: q || undefined,
				page,
				perPage,
			});
			setData(Array.isArray(res?.data) ? res.data : []);
			setMeta(res?.meta || null);
		} catch (e) {
			console.error('Load media failed:', e);
			setLoadError(e?.response?.data?.message || e?.message || 'Nu s-a putut încărca biblioteca media.');
			setData([]);
			setMeta(null);
			showToast('Nu s-a putut încărca biblioteca media', 'error');
		} finally {
			setLoading(false);
		}
	};

	const handleConfirmDeleteAsset = async () => {
		if (!deleteConfirmAssetId) return;
		setDeleteLoading(true);
		try {
			await adminService.deleteMediaAsset(deleteConfirmAssetId);
			setDeleteConfirmAssetId(null);
			showToast('Șters', 'success');
			load();
		} catch (e) {
			console.error('Delete media failed:', e);
			showToast('Ștergerea a eșuat', 'error');
		} finally {
			setDeleteLoading(false);
		}
	};

	useEffect(() => {
		if (!open) return;
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, courseId, effectiveType, page]);

	const canPrev = (meta?.current_page || 1) > 1;
	const canNext = (meta?.current_page || 1) < (meta?.last_page || 1);

	const title = useMemo(() => {
		if (effectiveType) return `Biblioteca media (${effectiveType})`;
		return 'Biblioteca media';
	}, [effectiveType]);

	if (!open) return null;

	return (
		<div className="admin-team-modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
			<div className="admin-team-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(980px, calc(100vw - 32px))' }}>
				<div className="admin-team-modal-header">
					<div>
						<h2 className="admin-team-modal-title">{title}</h2>
						<p className="admin-page-subtitle" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
							Alege un fișier deja încărcat (reutilizare) sau caută după nume.
						</p>
					</div>
					<button type="button" className="admin-team-modal-close" onClick={onClose} aria-label="Închide">
						×
					</button>
				</div>

				<div className="admin-team-modal-body">
					{loadError && (
						<div className="admin-form-error-inline" role="alert" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
							<span>{loadError}</span>
							<button type="button" className="admin-btn admin-btn-secondary" onClick={() => load()}>
								Reîncearcă
							</button>
						</div>
					)}
					<div className="admin-card" style={{ marginBottom: 'var(--space-4)' }}>
						<div className="admin-card-body" style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
							<input
								className="admin-settings-input"
								placeholder="Caută după nume..."
								value={q}
								onChange={(e) => setQ(e.target.value)}
								style={{ flex: 1, minWidth: 240 }}
							/>
							<button
								type="button"
								className="admin-btn admin-btn-secondary"
								onClick={() => {
									setPage(1);
									load();
								}}
								disabled={loading}
							>
								Caută
							</button>
							<button type="button" className="admin-btn admin-btn-secondary" onClick={() => { setQ(''); setPage(1); }} disabled={loading}>
								Reset
							</button>
						</div>
					</div>

					{loading ? (
						<div className="lms-dashboard-loading">
							<div className="lms-spinner"></div>
							<p>Se încarcă...</p>
						</div>
					) : data.length === 0 ? (
						<div className="lms-empty-state">
							<p>Nu există fișiere în bibliotecă (pentru filtrul curent).</p>
						</div>
					) : (
						<div style={{ display: 'grid', gap: 'var(--space-3)' }}>
							{data.map((a) => (
								<div key={a.id} className="admin-card">
									<div className="admin-card-body" style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', alignItems: 'center' }}>
										<div style={{ minWidth: 0, display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
											{a.type === 'image' && a.url ? (
												<img
													src={toImageUrl(a.url) || a.url}
													alt=""
													loading="lazy"
													style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-primary)' }}
												/>
											) : null}
											<div style={{ minWidth: 0 }}>
												<div style={{ fontWeight: 'var(--font-weight-semibold)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
													{a.filename}
												</div>
												<div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1)' }}>
													{a.type || 'other'} • {formatBytes(a.size)} • {a.created_at ? new Date(a.created_at).toLocaleString() : '—'}
												</div>
											</div>
										</div>
										<div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
											<button
												type="button"
												className="admin-btn admin-btn-primary"
												onClick={() => onSelect?.(a.url, a)}
												disabled={!a.url}
											>
												Alege
											</button>
											<button
												type="button"
												className="admin-btn admin-btn-secondary"
												onClick={() => window.open(a.url, '_blank', 'noopener,noreferrer')}
												disabled={!a.url}
											>
												Preview
											</button>
											<button
												type="button"
												className="admin-btn admin-btn-secondary"
												onClick={() => setDeleteConfirmAssetId(a.id)}
											>
												Șterge
											</button>
										</div>
									</div>
								</div>
							))}
						</div>
					)}

					<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-4)' }}>
						<div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
							{meta ? `Total: ${meta.total} • Pagina ${meta.current_page}/${meta.last_page}` : null}
						</div>
						<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
							<button type="button" className="admin-btn admin-btn-secondary" disabled={!canPrev || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
								←
							</button>
							<button type="button" className="admin-btn admin-btn-secondary" disabled={!canNext || loading} onClick={() => setPage((p) => p + 1)}>
								→
							</button>
						</div>
					</div>
				</div>
			</div>

			<ConfirmModal
				open={!!deleteConfirmAssetId}
				onClose={() => setDeleteConfirmAssetId(null)}
				onConfirm={handleConfirmDeleteAsset}
				title="Șterge fișier"
				message="Ștergi acest fișier din biblioteca media?"
				confirmLabel="Șterge"
				cancelLabel="Anulare"
				variant="danger"
				loading={deleteLoading}
			/>
		</div>
	);
};

export default MediaLibraryModal;

