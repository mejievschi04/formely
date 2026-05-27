import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { adminService } from '../../services/api';
import {
	getFriendlyLogLine,
	getActionLabelRo,
	ACTION_LABELS_RO,
} from '../../utils/activityLogLabels';

function getSimpleIcon(action) {
	if (!action) return '✓';
	if (action === 'completed_course') return '📗';
	if (action === 'logged_in') return '🔐';
	if (action === 'logged_out') return '🚪';
	if (action === 'completed_exam' || action === 'telemetry.learner_attempt_submitted') return '📝';
	if (String(action).startsWith('telemetry.learner')) return '🎓';
	return '•';
}

/** Valori permise la filtru — etichetele vin din ACTION_LABELS_RO (aceeași sursă ca în jurnal). */
const SIMPLE_EVENT_FILTER_VALUES = [
	'',
	'completed_course',
	'completed_lesson',
	'completed_exam',
	'enrolled_course',
	'telemetry.learner_attempt_submitted',
	'telemetry.learner_attempt_started',
	'telemetry.learner_result_viewed',
	'telemetry.learner_focus_seconds',
	'telemetry.learner_answer_saved',
	'telemetry.learner_retake_weak_areas_started',
];

const SIMPLE_EVENT_TYPES = SIMPLE_EVENT_FILTER_VALUES.map((value) => ({
	value,
	label: value === '' ? 'Orice' : ACTION_LABELS_RO[value] || getActionLabelRo(value),
}));

const SEARCH_DEBOUNCE_MS = 400;

const AdminActivityLogsPage = () => {
	const [logs, setLogs] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [expandedId, setExpandedId] = useState(null);
	const [pagination, setPagination] = useState({
		current_page: 1,
		last_page: 1,
		per_page: 50,
		total: 0,
	});
	const [filters, setFilters] = useState({
		search: '',
		action: '',
		action_scope: 'all',
		user_id: '',
		date_from: '',
		date_to: '',
		sort_dir: 'desc',
	});
	const [showMyActions, setShowMyActions] = useState(false);
	const [searchInput, setSearchInput] = useState('');
	const searchDebounceRef = useRef(null);
	const searchEffectBoot = useRef(true);

	const [availableFilters, setAvailableFilters] = useState({
		action_scopes: [],
	});

	const fetchLogs = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const actionAllowed = SIMPLE_EVENT_TYPES.some((o) => o.value === filters.action && o.value !== '');
			const params = {
				page: pagination.current_page,
				per_page: pagination.per_page,
				search: filters.search || undefined,
				action: actionAllowed ? filters.action : undefined,
				action_scope: filters.action_scope !== 'all' ? filters.action_scope : undefined,
				user_id: filters.user_id || undefined,
				date_from: filters.date_from || undefined,
				date_to: filters.date_to || undefined,
				sort_by: 'created_at',
				sort_dir: filters.sort_dir,
				exclude_self: showMyActions ? 0 : 1,
			};
			Object.keys(params).forEach((key) => {
				if (params[key] === '' || params[key] === null || params[key] === undefined) {
					delete params[key];
				}
			});

			const data = await adminService.getActivityLogs(params);
			setLogs(data.data || []);
			setPagination((prev) => ({
				...prev,
				current_page: data.pagination?.current_page || prev.current_page,
				last_page: data.pagination?.last_page || prev.last_page,
				per_page: data.pagination?.per_page || prev.per_page,
				total: data.pagination?.total ?? 0,
			}));
			if (data.filters?.action_scopes?.length) {
				setAvailableFilters(() => ({
					action_scopes: data.filters.action_scopes,
				}));
			}
		} catch (err) {
			console.error('Error fetching activity logs:', err);
			setError('Nu s-a putut încărca jurnalul.');
			setLogs([]);
		} finally {
			setLoading(false);
		}
	}, [pagination.current_page, pagination.per_page, filters, showMyActions]);

	useEffect(() => {
		fetchLogs();
	}, [fetchLogs]);

	useEffect(() => {
		if (searchEffectBoot.current) {
			searchEffectBoot.current = false;
			return;
		}
		if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
		searchDebounceRef.current = setTimeout(() => {
			setFilters((prev) => ({ ...prev, search: searchInput.trim() }));
			setPagination((prev) => ({ ...prev, current_page: 1 }));
		}, SEARCH_DEBOUNCE_MS);
		return () => {
			if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
		};
	}, [searchInput]);

	const handleFilterChange = (key, value) => {
		setFilters((prev) => ({ ...prev, [key]: value }));
		setPagination((prev) => ({ ...prev, current_page: 1 }));
	};

	const handlePageChange = (page) => {
		setPagination((prev) => ({ ...prev, current_page: page }));
	};

	const formatDate = (dateString) => {
		const date = new Date(dateString);
		return new Intl.DateTimeFormat('ro-RO', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		}).format(date);
	};

	const scopeOptions = useMemo(() => {
		if (availableFilters.action_scopes?.length) return availableFilters.action_scopes;
		return [
			{ id: 'elev_progres', label: 'Progres elevi (cursuri și teste)' },
			{ id: 'all', label: 'Toată activitatea' },
			{ id: 'learner', label: 'Activitate elevi' },
		];
	}, [availableFilters.action_scopes]);

	if (loading && logs.length === 0) {
		return (
			<div className="admin-container admin-activity-logs-page">
				<div className="lms-dashboard-loading">
					<div className="lms-spinner"></div>
					<p>Se încarcă jurnalul…</p>
				</div>
			</div>
		);
	}

	return (
		<div className="admin-container admin-activity-logs-page">
			<div className="admin-page-header">
				<div>
					<h1 className="admin-page-title">Activitate elevi</h1>
					<p className="admin-page-subtitle">
						Implicit vezi tot jurnalul (poți restrânge din „Ce vrei să vezi” și „Tip eveniment”). Acțiunile tale ca administrator nu apar, decât dacă bifezi opțiunea de mai jos.
					</p>
				</div>
			</div>

			{error && (
				<div className="admin-error-message" style={{ marginBottom: 'var(--space-6)' }}>
					<p>{error}</p>
				</div>
			)}

			<div className="admin-activity-logs-filters">
				<div className="admin-activity-logs-filters-grid">
					<div className="admin-activity-logs-filter-group" style={{ gridColumn: '1 / -1' }}>
						<label className="admin-activity-logs-filter-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
							<input
								type="checkbox"
								checked={showMyActions}
								onChange={(e) => {
									setShowMyActions(e.target.checked);
									setPagination((prev) => ({ ...prev, current_page: 1 }));
								}}
							/>
							Arată și ce fac eu în platformă (ca administrator)
						</label>
					</div>
					<div className="admin-activity-logs-filter-group">
						<label className="admin-activity-logs-filter-label">Căutare</label>
						<input
							type="text"
							className="admin-activity-logs-filter-input"
							placeholder="Nume elev, email, text…"
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
						/>
					</div>
					<div className="admin-activity-logs-filter-group">
						<label className="admin-activity-logs-filter-label">Ce vrei să vezi</label>
						<select
							className="admin-activity-logs-filter-input"
							value={filters.action_scope}
							onChange={(e) => handleFilterChange('action_scope', e.target.value)}
						>
							{scopeOptions.map((s) => (
								<option key={s.id} value={s.id}>
									{s.label}
								</option>
							))}
						</select>
					</div>
					<div className="admin-activity-logs-filter-group">
						<label className="admin-activity-logs-filter-label">Tip eveniment</label>
						<select
							className="admin-activity-logs-filter-input"
							value={SIMPLE_EVENT_TYPES.some((o) => o.value === filters.action) ? filters.action : ''}
							onChange={(e) => handleFilterChange('action', e.target.value)}
						>
							{SIMPLE_EVENT_TYPES.map((opt) => (
								<option key={opt.value || 'any'} value={opt.value}>
									{opt.label}
								</option>
							))}
						</select>
					</div>
					<div className="admin-activity-logs-filter-group">
						<label className="admin-activity-logs-filter-label">Ordine în listă</label>
						<select
							className="admin-activity-logs-filter-input"
							value={filters.sort_dir}
							onChange={(e) => handleFilterChange('sort_dir', e.target.value)}
						>
							<option value="desc">Cel mai nou primul</option>
							<option value="asc">Cel mai vechi primul</option>
						</select>
					</div>
					<div className="admin-activity-logs-filter-group">
						<label className="admin-activity-logs-filter-label">De la dată</label>
						<input
							type="date"
							className="admin-activity-logs-filter-input"
							value={filters.date_from}
							onChange={(e) => handleFilterChange('date_from', e.target.value)}
						/>
					</div>
					<div className="admin-activity-logs-filter-group">
						<label className="admin-activity-logs-filter-label">Până la dată</label>
						<input
							type="date"
							className="admin-activity-logs-filter-input"
							value={filters.date_to}
							onChange={(e) => handleFilterChange('date_to', e.target.value)}
						/>
					</div>
				</div>
			</div>

			<div className="admin-activity-logs-list">
				{logs.length > 0 ? (
					<div>
						{logs.map((log) => {
							const line = getFriendlyLogLine(log);
							const isOpen = expandedId === log.id;

							return (
								<div key={log.id} className="admin-activity-logs-item">
									<button
										type="button"
										className="admin-activity-logs-item-toggle"
										onClick={() => setExpandedId(isOpen ? null : log.id)}
										aria-expanded={isOpen}
									>
										<div className="admin-activity-logs-item-content">
											<div className="admin-activity-logs-icon" aria-hidden>
												{getSimpleIcon(log.action)}
											</div>
											<div className="admin-activity-logs-main">
												<div className="admin-activity-logs-card-header">
													<span className="admin-activity-logs-description" style={{ fontSize: '1.05rem', lineHeight: 1.45 }}>
														{line}
													</span>
												</div>
												<div className="admin-activity-logs-meta">
													{log.user && (
														<span className="admin-activity-logs-meta-item">
															{log.user.email}
														</span>
													)}
													<span className="admin-activity-logs-meta-item">{formatDate(log.created_at)}</span>
													<span className="admin-activity-logs-meta-item admin-activity-logs-chevron">
														{isOpen ? 'Ascunde' : 'Vezi tot'}
													</span>
												</div>
											</div>
										</div>
									</button>
									{isOpen && (
										<div className="admin-activity-logs-detail">
											{log.user?.name ? (
												<p className="admin-activity-logs-detail-desc" style={{ marginTop: 'var(--space-3)' }}>
													<strong>{log.user.name}</strong>
													{log.user.email ? (
														<>
															{' '}
															<span className="admin-activity-logs-detail-tech" style={{ fontWeight: 'normal' }}>
																({log.user.email})
															</span>
														</>
													) : null}
												</p>
											) : null}
											{log.action ? (
												<p className="admin-activity-logs-detail-tech" title={log.action}>
													Tip înregistrare: <strong>{getActionLabelRo(log.action)}</strong>
												</p>
											) : null}
										</div>
									)}
								</div>
							);
						})}
					</div>
				) : (
					<div className="admin-activity-logs-empty">
						<div className="admin-activity-logs-empty-icon">📋</div>
						<div className="admin-activity-logs-empty-title">Nicio înregistrare</div>
						<div className="admin-activity-logs-empty-text">
							Schimbă filtrele sau așteaptă ca elevii să finalizeze cursuri sau teste.
						</div>
						<button
							type="button"
							className="lms-btn-primary lms-btn-sm"
							style={{ marginTop: '0.9rem' }}
							onClick={() => {
								setSearchInput('');
								setShowMyActions(true);
								setFilters((prev) => ({
									...prev,
									search: '',
									action: '',
									action_scope: 'all',
									date_from: '',
									date_to: '',
								}));
								setPagination((prev) => ({ ...prev, current_page: 1 }));
							}}
						>
							Arată toată activitatea
						</button>
					</div>
				)}

				{pagination.last_page > 1 && (
					<div className="admin-activity-logs-pagination">
						<button
							type="button"
							onClick={() => handlePageChange(pagination.current_page - 1)}
							disabled={pagination.current_page === 1}
							className="lms-btn-secondary lms-btn-sm"
							style={{
								opacity: pagination.current_page === 1 ? 0.5 : 1,
								cursor: pagination.current_page === 1 ? 'not-allowed' : 'pointer',
							}}
						>
							← Anterior
						</button>
						<span className="admin-activity-logs-pagination-info">
							Pagina {pagination.current_page} din {pagination.last_page} ({pagination.total} înregistrări)
						</span>
						<button
							type="button"
							onClick={() => handlePageChange(pagination.current_page + 1)}
							disabled={pagination.current_page === pagination.last_page}
							className="lms-btn-secondary lms-btn-sm"
							style={{
								opacity: pagination.current_page === pagination.last_page ? 0.5 : 1,
								cursor: pagination.current_page === pagination.last_page ? 'not-allowed' : 'pointer',
							}}
						>
							Următor →
						</button>
					</div>
				)}
			</div>
		</div>
	);
};

export default AdminActivityLogsPage;
