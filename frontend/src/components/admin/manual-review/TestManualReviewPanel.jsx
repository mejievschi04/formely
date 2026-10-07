import React, { useCallback, useEffect, useState } from 'react';
import { adminService } from '../../../services/api';

import { useToast } from '../../../contexts/ToastContextShared.js';

import { useAuth } from '../../../contexts/AuthContextShared.js';
import { isVoltEnabled } from '../../../utils/voltAvailability';
import '../../../pages/admin/AdminTestsPendingReviewsPage.css';

const MANUAL_QUESTION_TYPES = ['essay'];

function getTestQuestionsList(test) {
	if (!test) return [];
	const bank = test.question_bank || test.questionBank;
	if (test.question_source === 'bank' && Array.isArray(bank?.questions) && bank.questions.length) {
		return bank.questions;
	}
	return Array.isArray(test.questions) ? test.questions : [];
}

function getManualQuestionsForResult(result) {
	return getTestQuestionsList(result?.test).filter((q) => MANUAL_QUESTION_TYPES.includes(q?.type));
}

function getAnswerDisplay(answers, questionId) {
	if (!answers || typeof answers !== 'object') return '—';
	const raw = answers[questionId] ?? answers[String(questionId)];
	if (raw == null || raw === '') return '—';
	if (typeof raw === 'string') return raw;
	if (typeof raw === 'object') {
		const t = raw.text ?? raw.answer_text ?? raw.value;
		if (t != null && t !== '') return String(t);
		if (raw.answer != null && typeof raw.answer !== 'object') return String(raw.answer);
		return '—';
	}
	return String(raw);
}

function formatCompletedAt(iso) {
	if (!iso) return '';
	try {
		return new Date(iso).toLocaleString('ro-RO', {
			dateStyle: 'medium',
			timeStyle: 'short',
		});
	} catch {
		return String(iso);
	}
}

/**
 * @param {{ embedded?: boolean }} props
 */
export default function TestManualReviewPanel({ embedded = false }) {
	const { success: showSuccess, error: showError } = useToast();
	const { canMutateInAdminArea } = useAuth();
	const [pendingReviews, setPendingReviews] = useState([]);
	const [pendingLoading, setPendingLoading] = useState(true);

	const [showReviewModal, setShowReviewModal] = useState(false);
	const [reviewTarget, setReviewTarget] = useState(null);
	const [reviewScores, setReviewScores] = useState({});
	const [reviewFeedback, setReviewFeedback] = useState({});
	const [reviewRubrics, setReviewRubrics] = useState({});
	const [reviewNotes, setReviewNotes] = useState([]);
	const [overallFeedback, setOverallFeedback] = useState('');
	const [reviewSubmitting, setReviewSubmitting] = useState(false);
	const [voltFeedbackLoading, setVoltFeedbackLoading] = useState(false);
	const [clearing, setClearing] = useState(false);

	const loadPendingReviews = useCallback(async () => {
		setPendingLoading(true);
		try {
			const data = await adminService.getPendingTestReviews();
			setPendingReviews(Array.isArray(data) ? data : []);
		} catch (e) {
			console.warn('Pending test reviews:', e);
			setPendingReviews([]);
		} finally {
			setPendingLoading(false);
		}
	}, []);

	useEffect(() => {
		loadPendingReviews();
	}, [loadPendingReviews]);

	const closeReviewModal = () => {
		if (reviewSubmitting) return;
		setShowReviewModal(false);
		setReviewTarget(null);
		setReviewScores({});
		setReviewFeedback({});
		setReviewRubrics({});
		setReviewNotes([]);
		setOverallFeedback('');
	};

	const openReviewModal = (result) => {
		const qs = getManualQuestionsForResult(result);
		if (!qs.length) {
			showError('Acest rezultat nu are întrebări deschise de notat manual.');
			return;
		}
		const scores = {};
		qs.forEach((q) => {
			scores[q.id] = 0;
		});
		setReviewTarget(result);
		setReviewScores(scores);
		setReviewFeedback({});
		setReviewRubrics({});
		setReviewNotes([]);
		setOverallFeedback('');
		setShowReviewModal(true);
	};

	const handleSuggestWithVolt = async () => {
		if (!reviewTarget?.id || voltFeedbackLoading) return;
		setVoltFeedbackLoading(true);
		try {
			const suggestions = await adminService.suggestTestManualReviewFeedback(reviewTarget.id);
			const nextScores = {};
			const nextFeedback = {};
			const nextRubrics = {};
			(suggestions?.scores || []).forEach((item) => {
				if (!item?.question_id) return;
				nextScores[item.question_id] = item.suggested_score ?? 0;
				nextFeedback[item.question_id] = item.feedback || '';
				nextRubrics[item.question_id] = Array.isArray(item.rubric_criteria) ? item.rubric_criteria : [];
			});
			setReviewScores((prev) => ({ ...prev, ...nextScores }));
			setReviewFeedback((prev) => ({ ...prev, ...nextFeedback }));
			setReviewRubrics((prev) => ({ ...prev, ...nextRubrics }));
			if (suggestions?.overall_feedback) {
				setOverallFeedback(suggestions.overall_feedback);
			}
			setReviewNotes(Array.isArray(suggestions?.review_notes) ? suggestions.review_notes : []);
			showSuccess('Formely AI a completat sugestiile de feedback.');
		} catch (e) {
			console.error('Formely AI feedback failed:', e);
			showError(e?.response?.data?.message || e?.response?.data?.error || 'Formely AI nu a putut genera feedback.');
		} finally {
			setVoltFeedbackLoading(false);
		}
	};

	const handleSubmitReview = async () => {
		if (!reviewTarget?.id) return;
		const qs = getManualQuestionsForResult(reviewTarget);
		const manual_review_scores = qs.map((q) => {
			const maxPts = Math.max(1, Number(q.points ?? 1));
			let score = Number(reviewScores[q.id]);
			if (!Number.isFinite(score)) score = 0;
			score = Math.min(Math.max(0, score), maxPts);
			const fb = (reviewFeedback[q.id] || '').trim();
			return {
				question_id: q.id,
				score,
				...(fb ? { feedback: fb } : {}),
				...(reviewRubrics[q.id]?.length ? { rubric_criteria: reviewRubrics[q.id] } : {}),
			};
		});
		setReviewSubmitting(true);
		try {
			await adminService.submitTestManualReview(reviewTarget.id, manual_review_scores, overallFeedback.trim());
			showSuccess('Verificarea a fost salvată.');
			setShowReviewModal(false);
			setReviewTarget(null);
			setReviewScores({});
			setReviewFeedback({});
			setReviewRubrics({});
			setReviewNotes([]);
			setOverallFeedback('');
			await loadPendingReviews();
		} catch (e) {
			console.error('Manual review failed:', e);
			showError(e?.response?.data?.message || e?.response?.data?.error || 'Nu s-a putut salva verificarea.');
		} finally {
			setReviewSubmitting(false);
		}
	};

	const reviewModalQuestions = reviewTarget ? getManualQuestionsForResult(reviewTarget) : [];

	const handleClearPending = async () => {
		if (!canMutateInAdminArea || clearing) return;
		const ok = window.confirm('Sigur vrei să golești coada? Vor fi curățate intrările expirate/eronate/neverificate mai vechi.');
		if (!ok) return;
		setClearing(true);
		try {
			const result = await adminService.clearPendingTestReviews(30);
			showSuccess(result?.message || 'Coada a fost curățată.');
			await loadPendingReviews();
		} catch (e) {
			console.error('Clear pending test reviews failed:', e);
			showError(e?.response?.data?.message || e?.response?.data?.error || 'Nu s-a putut goli coada.');
		} finally {
			setClearing(false);
		}
	};

	const rootClass = embedded ? 'admin-tests-pending-embedded' : 'admin-tests-pending-page admin-container';

	return (
		<div className={rootClass}>
			<header className="admin-tests-pending-page-header">
				<div>
					<h1>{embedded ? 'Teste' : 'Așteaptă verificare'}</h1>
					<p>Încercări cu răspunsuri deschise care necesită notare manuală.</p>
				</div>
				<div className="admin-manual-review-toolbar">
					<button
						type="button"
						className="admin-tests-pending-refresh admin-manual-review-refresh-btn"
						onClick={() => loadPendingReviews()}
						disabled={pendingLoading || clearing}
					>
						{pendingLoading ? 'Se încarcă…' : 'Reîmprospătează'}
					</button>
					{canMutateInAdminArea ? (
						<button
							type="button"
							className="va-btn-delete admin-manual-review-clear-danger"
							onClick={handleClearPending}
							disabled={pendingLoading || clearing}
						>
							{clearing ? 'Se golește…' : 'Golire'}
						</button>
					) : null}
				</div>
			</header>

			<section className="admin-tests-pending-section" aria-label="Coadă verificări">
				{pendingLoading && pendingReviews.length === 0 ? (
					<div className="admin-tests-pending-empty">Se încarcă coada de verificări…</div>
				) : pendingReviews.length === 0 ? (
					<div className="admin-tests-pending-empty">Nu există încercări în așteptare.</div>
				) : (
					<ul className="admin-tests-pending-list">
						{pendingReviews.map((row) => (
							<li key={row.id} className="admin-tests-pending-row">
								<div className="admin-tests-pending-main">
									<strong className="admin-tests-pending-test">{row.test?.title || 'Test'}</strong>
									<span className="admin-tests-pending-user">{row.user?.name || row.user?.email || 'Utilizator'}</span>
									<span className="admin-tests-pending-meta">
										Încercarea {row.attempt_number ?? '—'} · {formatCompletedAt(row.completed_at)}
									</span>
								</div>
								{canMutateInAdminArea ? (
									<button type="button" className="admin-tests-pending-verify admin-manual-review-verify-btn" onClick={() => openReviewModal(row)}>
										Verifică
									</button>
								) : null}
							</li>
						))}
					</ul>
				)}
			</section>

			{showReviewModal && reviewTarget ? (
				<div className="admin-tests-modal-overlay" role="presentation">
					<div
						className="admin-tests-modal admin-tests-review-modal"
						role="dialog"
						aria-modal="true"
						aria-labelledby="admin-tests-review-title"
						onClick={(e) => e.stopPropagation()}
					>
						<h3 id="admin-tests-review-title">De corectat</h3>
						<p className="admin-tests-review-sub">
							{reviewTarget.user?.name || reviewTarget.user?.email || 'Utilizator'} · {reviewTarget.test?.title || 'Test'}
						</p>
						{isVoltEnabled('ai_test_generation') ? (
							<div className="admin-tests-review-ai-actions">
								<button type="button" className="admin-tests-review-ai-btn" onClick={handleSuggestWithVolt} disabled={voltFeedbackLoading || reviewSubmitting}>
									{voltFeedbackLoading ? 'Formely AI analizează…' : 'Generează feedback cu Formely AI'}
								</button>
								<span>Completează scoruri, rubrici și feedback. Verifică înainte de salvare.</span>
							</div>
						) : null}
						<div className="admin-tests-review-questions">
							{reviewModalQuestions.map((q) => {
								const maxPts = Math.max(1, Number(q.points ?? 1));
								const rubrics = reviewRubrics[q.id] || [];
								return (
									<div key={q.id} className="admin-tests-review-q">
										<div className="admin-tests-review-q-head">
											<span className="admin-tests-review-q-type">{q.type}</span>
											<span className="admin-tests-review-q-points">max. {maxPts} pct</span>
										</div>
										<p className="admin-tests-review-q-text">{q.content || 'Întrebare'}</p>
										<div className="admin-tests-review-answer">
											<span className="admin-tests-review-label">Răspuns elev</span>
											<div className="admin-tests-review-answer-box">
												{getAnswerDisplay(reviewTarget.answers, q.id)}
											</div>
										</div>
										<label className="admin-tests-review-score-label">
											Punctaj acordat (0–{maxPts})
											<input
												type="number"
												min={0}
												max={maxPts}
												step={0.5}
												value={reviewScores[q.id] ?? 0}
												onChange={(e) =>
													setReviewScores((prev) => ({ ...prev, [q.id]: Number(e.target.value) }))
												}
											/>
										</label>
										<label className="admin-tests-review-fb-label">
											Feedback (opțional)
											<textarea
												rows={2}
												value={reviewFeedback[q.id] || ''}
												onChange={(e) =>
													setReviewFeedback((prev) => ({ ...prev, [q.id]: e.target.value }))
												}
											/>
										</label>
										{rubrics.length ? (
											<div className="admin-tests-review-rubrics">
												<span className="admin-tests-review-label">Rubrică sugerată</span>
												<ul>
													{rubrics.map((criterion, index) => (
														<li key={`${q.id}-rubric-${index}`}>{criterion}</li>
													))}
												</ul>
											</div>
										) : null}
									</div>
								);
							})}
						</div>
						{reviewNotes.length ? (
							<div className="admin-tests-review-notes">
								<strong>Observații pentru profesor</strong>
								<ul>
									{reviewNotes.map((note, index) => (
										<li key={`review-note-${index}`}>{note}</li>
									))}
								</ul>
							</div>
						) : null}
						<label className="admin-tests-review-overall">
							Feedback general (opțional)
							<textarea
								rows={3}
								value={overallFeedback}
								onChange={(e) => setOverallFeedback(e.target.value)}
							/>
						</label>
						<div className="admin-tests-modal-actions">
							<button type="button" onClick={closeReviewModal} disabled={reviewSubmitting}>
								Anulează
							</button>
							<button type="button" className="va-btn-save is-primary" onClick={handleSubmitReview} disabled={reviewSubmitting}>
								{reviewSubmitting ? 'Se salvează…' : 'Salvează verificarea'}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
