import { rowMatchesResultFilters } from './TestResultsPanelShared.js';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '../../../services/api';

import { useToast } from '../../../contexts/ToastContextShared.js';

import { useAuth } from '../../../contexts/AuthContextShared.js';
import Modal from '../../common/Modal';
import RichTextHtml from '../../RichTextHtml';
import './TestResultsPanel.css';

function QuestionBreakdownList({ questions }) {
	if (!questions?.length) {
		return <div className="admin-test-results-empty">Nu există întrebări pentru această încercare.</div>;
	}
	return (
		<div className="admin-test-breakdown-list">
			{questions.map((q, idx) => {
				const mark = questionTypeMark(q.question_type);
				return (
					<div key={q.question_id || idx} className={`admin-test-breakdown-row${q.is_correct === true ? ' is-correct' : q.is_correct === false ? ' is-wrong' : ''}`}>
						<div className="admin-test-breakdown-row-head">
							<span
								className={`admin-test-question-mark is-${mark.shape}`}
								title={mark.label}
								aria-label={mark.label}
							/>
							<strong className="admin-test-breakdown-question">
								<span>{idx + 1}. </span>
								<RichTextHtml
									html={q.question_text}
									as="span"
									fallback={<span>Întrebare</span>}
								/>
							</strong>
							<span className="admin-test-breakdown-points">{q.points_earned ?? 0}/{q.points ?? 1}</span>
						</div>
						<p className="admin-test-breakdown-type">{mark.label}</p>
						<p className="admin-test-breakdown-answer">
							{q.has_answer
								? (q.user_answer_summary || 'Răspuns trimis')
								: 'Fără răspuns'}
						</p>
					</div>
				);
			})}
		</div>
	);
}

function formatDate(iso) {
	if (!iso) return '—';
	try {
		return new Date(iso).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
	} catch {
		return String(iso);
	}
}

function statusLabel(row) {
	if (row?.needs_manual_review || row?.status === 'pending' || row?.status === 'pending_review') {
		return 'În așteptare';
	}
	if (row?.passed) return 'Promovat';
	return 'Nepromovat';
}

function maxScoreForRow(row, kind) {
	if (kind === 'exam') {
		return Number(row?.total_points) || 1;
	}
	return Number(row?.max_score) || 1;
}

const SINGLE_ANSWER_TYPES = new Set(['single_choice', 'true_false', 'yes_no']);

const QUESTION_TYPE_LABELS = {
	single_choice: 'Un singur răspuns',
	multiple_choice: 'Mai multe răspunsuri',
	true_false: 'Adevărat / Fals',
	yes_no: 'Da / Nu',
	matching: 'Asociere',
	ordering: 'Ordonare',
};

function questionTypeMark(type) {
	const single = SINGLE_ANSWER_TYPES.has(type);
	return {
		shape: single ? 'circle' : 'square',
		label: QUESTION_TYPE_LABELS[type] || 'Întrebare',
	};
}



/**
 * @param {{ kind?: 'test' | 'exam', entityId: number, entityTitle?: string, showBreakdown?: boolean, embedded?: boolean, statusFilter?: string, dateFrom?: string, dateTo?: string }} props
 */
export default function TestResultsPanel({
	kind = 'test',
	entityId,
	entityTitle = '',
	showBreakdown = false,
	embedded = false,
	statusFilter = 'all',
	dateFrom = '',
	dateTo = '',
}) {
	const label = kind === 'exam' ? 'examen' : 'test';
	const title = entityTitle || (kind === 'exam' ? 'Examen' : 'Test');
	const { success: showSuccess, error: showError } = useToast();
	const { canMutateInAdminArea } = useAuth();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState('');
	const [editTarget, setEditTarget] = useState(null);
	const [editScore, setEditScore] = useState('');
	const [editNote, setEditNote] = useState('');
	const [saving, setSaving] = useState(false);
	const [expandedId, setExpandedId] = useState(null);
	const [breakdownById, setBreakdownById] = useState({});
	const [breakdownLoadingId, setBreakdownLoadingId] = useState(null);
	const [breakdownTarget, setBreakdownTarget] = useState(null);
	const [breakdownData, setBreakdownData] = useState(null);
	const [breakdownLoading, setBreakdownLoading] = useState(false);

	const loadResults = useCallback(async () => {
		if (!entityId) return;
		setLoading(true);
		try {
			const data = kind === 'exam'
				? await adminService.getExamResults(entityId)
				: await adminService.getTestResults(entityId);
			setRows(Array.isArray(data) ? data : []);
		} catch (e) {
			console.error('Failed to load assessment results:', e);
			setRows([]);
			showError(`Nu s-au putut încărca rezultatele ${label === 'examen' ? 'examenului' : 'testului'}.`);
		} finally {
			setLoading(false);
		}
	}, [entityId, kind, label, showError]);

	useEffect(() => {
		loadResults();
	}, [loadResults]);

	const filteredRows = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return rows.filter((row) => {
			if (!rowMatchesResultFilters(row, { statusFilter, dateFrom, dateTo })) return false;
			if (!needle) return true;
			const hay = `${row.user?.name || ''} ${row.user?.email || ''}`.toLowerCase();
			return hay.includes(needle);
		});
	}, [query, rows, statusFilter, dateFrom, dateTo]);

	const openEdit = (row) => {
		setEditTarget(row);
		setEditScore(String(row.score ?? 0));
		setEditNote('');
	};

	const closeEdit = () => {
		if (saving) return;
		setEditTarget(null);
		setEditScore('');
		setEditNote('');
	};

	const handleSaveScore = async () => {
		if (!editTarget?.id) return;
		const maxScore = maxScoreForRow(editTarget, kind);
		let score = Number(editScore);
		if (!Number.isFinite(score)) {
			showError('Introdu un punctaj valid.');
			return;
		}
		score = Math.min(Math.max(0, score), maxScore);
		setSaving(true);
		try {
			const response = kind === 'exam'
				? await adminService.updateExamResultScore(editTarget.id, score, editNote.trim())
				: await adminService.updateTestResultScore(editTarget.id, score, editNote.trim());
			const updated = response?.result;
			setRows((prev) => prev.map((row) => (
				row.id === editTarget.id
					? {
						...row,
						score: updated?.score ?? score,
						max_score: updated?.max_score ?? row.max_score,
						total_points: updated?.total_points ?? row.total_points,
						percentage: updated?.percentage ?? row.percentage,
						passed: updated?.passed ?? row.passed,
						status: updated?.status ?? row.status,
						reviewed_at: updated?.reviewed_at ?? row.reviewed_at,
						needs_manual_review: false,
					}
					: row
			)));
			showSuccess(response?.message || 'Punctaj actualizat.');
			setEditTarget(null);
			setEditScore('');
			setEditNote('');
		} catch (e) {
			console.error('Failed to update assessment score:', e);
			showError(e?.response?.data?.message || e?.response?.data?.error || 'Nu s-a putut salva punctajul.');
		} finally {
			setSaving(false);
		}
	};

	const maxForEdit = editTarget ? maxScoreForRow(editTarget, kind) : 1;

	const loadBreakdown = async (row) => {
		if (breakdownById[row.id]) return breakdownById[row.id];
		setBreakdownLoadingId(row.id);
		try {
			const data = await adminService.getTestResultBreakdown(row.id);
			setBreakdownById((prev) => ({ ...prev, [row.id]: data }));
			return data;
		} catch (e) {
			console.error('Failed to load attempt breakdown:', e);
			showError('Nu s-au putut încărca detaliile încercării.');
			return null;
		} finally {
			setBreakdownLoadingId(null);
		}
	};

	const toggleRow = async (row) => {
		if (expandedId === row.id) {
			setExpandedId(null);
			return;
		}
		setExpandedId(row.id);
		if (showBreakdown && kind === 'test') {
			await loadBreakdown(row);
		}
	};

	const openBreakdown = async (row) => {
		setBreakdownTarget(row);
		setBreakdownData(breakdownById[row.id] || null);
		setBreakdownLoading(!breakdownById[row.id]);
		const data = await loadBreakdown(row);
		if (!data) {
			setBreakdownTarget(null);
			return;
		}
		setBreakdownData(data);
		setBreakdownLoading(false);
	};

	const closeBreakdown = () => {
		if (breakdownLoading) return;
		setBreakdownTarget(null);
		setBreakdownData(null);
	};

	return (
		<div className={`admin-test-results-panel${embedded ? ' is-embedded' : ''}`}>
			{!embedded ? (
			<div className="admin-test-results-head">
				<div>
					<h2>Rezultate încercări</h2>
					<p>Toate încercările pentru «{title}». Poți ajusta manual punctajul obținut.</p>
				</div>
				<button type="button" className="admin-btn admin-btn-secondary" onClick={loadResults} disabled={loading}>
					{loading ? 'Se încarcă…' : 'Reîmprospătează'}
				</button>
			</div>
			) : null}

			<div className="admin-test-results-toolbar">
				<input
					type="search"
					placeholder="Caută elev după nume sau email…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					aria-label="Caută rezultate"
				/>
				<span className="admin-test-results-count">{filteredRows.length} încercări</span>
			</div>

			{loading && rows.length === 0 ? (
				<div className="admin-test-results-empty">Se încarcă rezultatele…</div>
			) : filteredRows.length === 0 ? (
				<div className="admin-test-results-empty">
					{rows.length === 0
						? `Nicio încercare înregistrată pentru acest ${label}.`
						: 'Niciun rezultat pentru căutare.'}
				</div>
			) : (
				<div className="admin-test-results-cards">
					{filteredRows.map((row) => {
						const rowMax = maxScoreForRow(row, kind);
						const open = expandedId === row.id;
						const breakdown = breakdownById[row.id];
						const percent = row.percentage != null ? `${row.percentage}%` : '—';
						const attempt = row.attempt_number != null ? `#${row.attempt_number}` : '—';
						return (
							<article key={row.id} className={`admin-test-result-card${open ? ' is-open' : ''}`}>
								<button
									type="button"
									className="admin-test-result-card-toggle"
									aria-expanded={open}
									onClick={() => toggleRow(row)}
								>
									<span className="admin-test-result-card-name">
										{row.user?.name || row.user?.email || 'Elev'}
									</span>
									<span className={`admin-test-results-status ${row.passed ? 'is-passed' : row.needs_manual_review ? 'is-pending' : 'is-failed'}`}>
										{statusLabel(row)}
									</span>
									<span className="admin-test-result-metric" title="Procent, încercare și punctaj">
										<strong>{percent}</strong>
										<span>încercarea {attempt}</span>
										<span>{row.score ?? 0}/{rowMax}</span>
									</span>
								</button>
								{open ? (
									<div className="admin-test-result-card-body">
										<p className="admin-test-result-card-meta">
											{row.user?.id ? (
												<Link to={`/admin/users/${row.user.id}/profile`}>{row.user.email || 'Profil'}</Link>
											) : (row.user?.email || '—')}
											<span> · {formatDate(row.completed_at)}</span>
										</p>
										<div className="admin-test-results-actions">
											{showBreakdown && kind === 'test' ? (
												<button type="button" className="admin-btn admin-btn-secondary admin-test-results-edit" onClick={() => openBreakdown(row)}>
													Detalii
												</button>
											) : null}
											{canMutateInAdminArea ? (
												<button type="button" className="admin-btn admin-btn-secondary admin-test-results-edit" onClick={() => openEdit(row)}>
													Modifică punctaj
												</button>
											) : null}
										</div>
										{showBreakdown && kind === 'test' ? (
											breakdownLoadingId === row.id && !breakdown ? (
												<div className="admin-test-results-empty">Se încarcă răspunsurile…</div>
											) : (
												<QuestionBreakdownList questions={breakdown?.questions || []} />
											)
										) : null}
									</div>
								) : null}
							</article>
						);
					})}
				</div>
			)}

			<Modal isOpen={Boolean(editTarget)} onClose={closeEdit} ariaLabelledby="admin-test-score-modal-title">
				<div className="admin-test-results-modal">
					<h3 id="admin-test-score-modal-title">Modifică punctajul</h3>
					<p className="admin-test-results-modal-sub">
						{editTarget?.user?.name || editTarget?.user?.email || 'Utilizator'} · încercarea #{editTarget?.attempt_number ?? '—'}
					</p>
					<label className="admin-test-results-field">
						Punctaj obținut (0–{maxForEdit})
						<input
							type="number"
							min={0}
							max={maxForEdit}
							step={0.5}
							value={editScore}
							onChange={(e) => setEditScore(e.target.value)}
						/>
					</label>
					<label className="admin-test-results-field">
						Notă internă (opțional)
						<textarea rows={3} value={editNote} onChange={(e) => setEditNote(e.target.value)} />
					</label>
					<div className="admin-test-results-modal-actions">
						<button type="button" className="admin-btn admin-btn-secondary" onClick={closeEdit} disabled={saving}>
							Anulează
						</button>
						<button type="button" className="va-btn-save admin-btn lms-btn-primary" onClick={handleSaveScore} disabled={saving}>
							{saving ? 'Se salvează…' : 'Salvează punctajul'}
						</button>
					</div>
				</div>
			</Modal>

			<Modal isOpen={Boolean(breakdownTarget)} onClose={closeBreakdown} ariaLabelledby="admin-test-breakdown-modal-title">
				<div className="admin-test-results-modal admin-test-breakdown-modal">
					<h3 id="admin-test-breakdown-modal-title">Detalii încercare</h3>
					<p className="admin-test-results-modal-sub">
						{breakdownTarget?.user?.name || breakdownTarget?.user?.email || 'Utilizator'} · încercarea #{breakdownTarget?.attempt_number ?? '—'}
						{breakdownTarget?.percentage != null ? ` · ${breakdownTarget.percentage}%` : ''}
					</p>
					{breakdownLoading ? (
						<div className="admin-test-results-empty">Se încarcă răspunsurile…</div>
					) : (
						<QuestionBreakdownList questions={breakdownData?.questions || []} />
					)}
					<div className="admin-test-results-modal-actions">
						<button type="button" className="admin-btn admin-btn-secondary" onClick={closeBreakdown} disabled={breakdownLoading}>
							Închide
						</button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
