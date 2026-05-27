import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentActivityService } from '../services/api';
import {
	getFriendlyLogLine,
	getActionLabelRo,
	ACTION_LABELS_RO,
} from '../utils/activityLogLabels';

const SCOPE_OPTIONS = [
	{ id: 'progress', label: 'Progres (cursuri, lecții, teste)' },
	{ id: 'auth', label: 'Autentificare' },
	{ id: 'all', label: 'Tot' },
];

const ACTION_FILTER_OPTIONS = [
	'',
	'enrolled_course',
	'completed_lesson',
	'completed_course',
	'completed_exam',
	'telemetry.learner_attempt_submitted',
	'logged_in',
	'logged_out',
];

function getIcon(action) {
	if (action === 'completed_course') return '📗';
	if (action === 'completed_lesson') return '📖';
	if (action === 'enrolled_course') return '✨';
	if (action === 'logged_in') return '🔐';
	if (action === 'logged_out') return '🚪';
	if (action === 'completed_exam' || action === 'telemetry.learner_attempt_submitted') return '📝';
	return '•';
}

const StudentActivityPage = () => {
	const [entries, setEntries] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [scope, setScope] = useState('progress');
	const [actionFilter, setActionFilter] = useState('');
	const [pagination, setPagination] = useState({
		current_page: 1,
		last_page: 1,
		per_page: 20,
		total: 0,
	});

	const fetchActivity = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await studentActivityService.getActivity({
				page: pagination.current_page,
				per_page: pagination.per_page,
				scope: actionFilter ? undefined : scope,
				action: actionFilter || undefined,
			});
			setEntries(data.data || []);
			setPagination((prev) => ({
				...prev,
				current_page: data.pagination?.current_page ?? prev.current_page,
				last_page: data.pagination?.last_page ?? 1,
				per_page: data.pagination?.per_page ?? prev.per_page,
				total: data.pagination?.total ?? 0,
			}));
		} catch (err) {
			console.error('Error fetching student activity:', err);
			setError('Nu s-a putut încărca activitatea.');
			setEntries([]);
		} finally {
			setLoading(false);
		}
	}, [pagination.current_page, pagination.per_page, scope, actionFilter]);

	useEffect(() => {
		fetchActivity();
	}, [fetchActivity]);

	const formatDate = (dateString) => {
		if (!dateString) return '';
		return new Intl.DateTimeFormat('ro-RO', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		}).format(new Date(dateString));
	};

	const handleScopeChange = (value) => {
		setScope(value);
		setActionFilter('');
		setPagination((prev) => ({ ...prev, current_page: 1 }));
	};

	const handleActionChange = (value) => {
		setActionFilter(value);
		setPagination((prev) => ({ ...prev, current_page: 1 }));
	};

	const goToPage = (page) => {
		setPagination((prev) => ({ ...prev, current_page: page }));
	};

	return (
		<div className="va-profile-container va-student-activity-page">
			<div className="va-student-activity-header">
				<Link to="/profile" className="lms-btn-secondary lms-btn-sm">
					← Profil
				</Link>
				<div>
					<h1 className="va-student-activity-title">Activitatea mea</h1>
					<p className="va-student-activity-subtitle">
						Istoricul acțiunilor tale în platformă: înscrieri, lecții, teste și autentificări.
					</p>
				</div>
			</div>

			<div className="va-student-activity-filters">
				<div className="va-student-activity-filter">
					<label className="va-student-activity-filter-label">Ce vrei să vezi</label>
					<select
						className="va-student-activity-filter-input"
						value={scope}
						onChange={(e) => handleScopeChange(e.target.value)}
						disabled={Boolean(actionFilter)}
					>
						{SCOPE_OPTIONS.map((opt) => (
							<option key={opt.id} value={opt.id}>
								{opt.label}
							</option>
						))}
					</select>
				</div>
				<div className="va-student-activity-filter">
					<label className="va-student-activity-filter-label">Tip eveniment</label>
					<select
						className="va-student-activity-filter-input"
						value={actionFilter}
						onChange={(e) => handleActionChange(e.target.value)}
					>
						{ACTION_FILTER_OPTIONS.map((value) => (
							<option key={value || 'any'} value={value}>
								{value === '' ? 'Orice' : ACTION_LABELS_RO[value] || getActionLabelRo(value)}
							</option>
						))}
					</select>
				</div>
			</div>

			{error && (
				<div className="va-profile-error" style={{ marginBottom: 'var(--space-4)' }}>
					{error}
				</div>
			)}

			{loading && entries.length === 0 ? (
				<div className="lms-dashboard-loading">
					<div className="lms-spinner" />
					<p>Se încarcă activitatea…</p>
				</div>
			) : entries.length === 0 ? (
				<div className="lms-empty-state va-student-activity-empty">
					<p className="lms-empty-description">
						Încă nu ai evenimente înregistrate aici. Înscrie-te la un curs sau finalizează o lecție — activitatea va apărea automat.
					</p>
					<Link to="/courses" className="lms-btn-primary">
						Explorează cursuri
					</Link>
				</div>
			) : (
				<ul className="va-student-activity-list">
					{entries.map((entry) => {
						const line = getFriendlyLogLine({
							action: entry.action,
							description: entry.description,
							new_values: entry.new_values,
							user: { name: 'Tu' },
						});
						const label = getActionLabelRo(entry.action);

						return (
							<li key={entry.id} className="va-student-activity-item">
								<span className="va-student-activity-icon" aria-hidden>
									{getIcon(entry.action)}
								</span>
								<div className="va-student-activity-body">
									<div className="va-student-activity-meta">
										<span className="va-student-activity-badge">{label}</span>
										<time className="va-student-activity-time" dateTime={entry.created_at}>
											{formatDate(entry.created_at)}
										</time>
									</div>
									<p className="va-student-activity-line">{line}</p>
									{entry.link && (
										<Link to={entry.link} className="va-student-activity-link">
											Vezi detalii →
										</Link>
									)}
								</div>
							</li>
						);
					})}
				</ul>
			)}

			{pagination.last_page > 1 && (
				<div className="va-student-activity-pagination">
					<button
						type="button"
						className="lms-btn-secondary lms-btn-sm"
						disabled={pagination.current_page <= 1 || loading}
						onClick={() => goToPage(pagination.current_page - 1)}
					>
						Înapoi
					</button>
					<span className="va-student-activity-page-info">
						Pagina {pagination.current_page} din {pagination.last_page}
						{pagination.total > 0 && ` (${pagination.total} evenimente)`}
					</span>
					<button
						type="button"
						className="lms-btn-secondary lms-btn-sm"
						disabled={pagination.current_page >= pagination.last_page || loading}
						onClick={() => goToPage(pagination.current_page + 1)}
					>
						Înainte
					</button>
				</div>
			)}
		</div>
	);
};

export default StudentActivityPage;
