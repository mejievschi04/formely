import React, { useCallback, useEffect, useState } from 'react';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';
import { useAuth } from '../../../contexts/AuthContext';
import { canUseAiFeature } from '../../../utils/aiAvailability';
import {
	getManualQuestions,
	getQuestionType,
	manualQuestionTypeLabel,
	testRequiresApprovalOnly,
} from '../../../utils/manualReview';

function getTestQuestionsList(test) {
	if (!test) return [];
	const bank = test.question_bank || test.questionBank;
	if (test.question_source === 'bank' && Array.isArray(bank?.questions) && bank.questions.length) {
		return bank.questions;
	}
	return Array.isArray(test.questions) ? test.questions : [];
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
		return new Date(iso).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
	} catch {
		return String(iso);
	}
}

function userInitials(row) {
	const name = row?.user?.name || row?.user?.email || '?';
	const parts = String(name).trim().split(/\s+/);
	if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
	return name.slice(0, 2).toUpperCase();
}

export default function TestManualReviewPanel() {
	const { success: showSuccess, error: showError } = useToast();
	const { canMutateInAdminArea, user } = useAuth();
	const [pendingReviews, setPendingReviews] = useState([]);
	const [pendingLoading, setPendingLoading] = useState(true);
	const [showReviewModal, setShowReviewModal] = useState(false);
	const [reviewTarget, setReviewTarget] = useState(null);
	const [reviewScores, setReviewScores] = useState({});
	const [reviewFeedback, setReviewFeedback] = useState({});
	const [overallFeedback, setOverallFeedback] = useState('');
	const [reviewSubmitting, setReviewSubmitting] = useState(false);
	const [approvalOnly, setApprovalOnly] = useState(false);
	const [clearing, setClearing] = useState(false);
	const [aiSuggesting, setAiSuggesting] = useState(false);
	const aiReviewAllowed = canUseAiFeature(user, 'ai_test_generation');

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
		if (reviewSubmitting || aiSuggesting) return;
		setShowReviewModal(false);
		setReviewTarget(null);
		setReviewScores({});
		setReviewFeedback({});
		setOverallFeedback('');
		setApprovalOnly(false);
	};

	const openReviewModal = (result) => {
		const allQuestions = getTestQuestionsList(result?.test);
		const manualQs = getManualQuestions(allQuestions);
		const onlyApproval = testRequiresApprovalOnly(result, manualQs);
		if (!manualQs.length && !onlyApproval) {
			showError('Această încercare nu necesită verificare manuală.');
			return;
		}
		const scores = {};
		manualQs.forEach((q) => {
			scores[q.id] = 0;
		});
		setReviewTarget(result);
		setReviewScores(scores);
		setReviewFeedback({});
		setOverallFeedback('');
		setApprovalOnly(onlyApproval);
		setShowReviewModal(true);
	};

	const reviewModalQuestions = reviewTarget ? getManualQuestions(getTestQuestionsList(reviewTarget.test)) : [];

	const handleSubmitReview = async () => {
		if (!reviewTarget?.id) return;
		const manual_review_scores = reviewModalQuestions.map((q) => {
			const maxPts = Math.max(1, Number(q.points ?? 1));
			let score = Number(reviewScores[q.id]);
			if (!Number.isFinite(score)) score = 0;
			score = Math.min(Math.max(0, score), maxPts);
			const fb = (reviewFeedback[q.id] || '').trim();
			return {
				question_id: q.id,
				score,
				...(fb ? { feedback: fb } : {}),
			};
		});
		setReviewSubmitting(true);
		try {
			await adminService.submitTestManualReview(reviewTarget.id, manual_review_scores, overallFeedback.trim());
			showSuccess('Verificarea a fost salvată.');
			closeReviewModal();
			await loadPendingReviews();
		} catch (e) {
			console.error('Manual review failed:', e);
			showError(e?.response?.data?.message || e?.response?.data?.error || 'Nu s-a putut salva verificarea.');
		} finally {
			setReviewSubmitting(false);
		}
	};

	const handleAiSuggestions = async () => {
		if (!reviewTarget?.id || aiSuggesting || reviewSubmitting) return;
		setAiSuggesting(true);
		try {
			const data = await adminService.suggestManualReviewFeedbackWithAi(reviewTarget.id);
			const nextScores = { ...reviewScores };
			const nextFeedback = { ...reviewFeedback };
			(Array.isArray(data?.scores) ? data.scores : []).forEach((row) => {
				const qid = row?.question_id;
				if (qid == null) return;
				if (row.suggested_score != null) nextScores[qid] = row.suggested_score;
				if (row.feedback) nextFeedback[qid] = row.feedback;
			});
			setReviewScores(nextScores);
			setReviewFeedback(nextFeedback);
			if (data?.overall_feedback) setOverallFeedback(data.overall_feedback);
			showSuccess('Sugestiile Formely AI au fost aplicate. Le poți ajusta înainte de salvare.');
		} catch (e) {
			showError(e?.response?.data?.error || e?.response?.data?.message || 'Nu s-au putut genera sugestiile AI.');
		} finally {
			setAiSuggesting(false);
		}
	};

	const handleClearPending = async () => {
		if (!canMutateInAdminArea || clearing) return;
		const ok = window.confirm('Sigur vrei să golești coada? Vor fi curățate intrările expirate sau invalide.');
		if (!ok) return;
		setClearing(true);
		try {
			const result = await adminService.clearPendingTestReviews(30);
			showSuccess(result?.message || 'Coada a fost curățată.');
			await loadPendingReviews();
		} catch (e) {
			showError(e?.response?.data?.message || e?.response?.data?.error || 'Nu s-a putut goli coada.');
		} finally {
			setClearing(false);
		}
	};

	const count = pendingReviews.length;

	return (
		<div className="amr-panel">
			<div className="amr-toolbar">
				<div className="amr-toolbar-meta">
					<span className={`amr-count-badge${count === 0 ? ' is-empty' : ''}`}>
						{count === 0 ? 'Nimic în așteptare' : `${count} în așteptare`}
					</span>
				</div>
				<div className="amr-toolbar-actions">
					<button type="button" className="amr-btn-ghost" onClick={loadPendingReviews} disabled={pendingLoading || clearing}>
						{pendingLoading ? 'Se încarcă…' : 'Reîmprospătează'}
					</button>
					{canMutateInAdminArea ? (
						<button type="button" className="amr-btn-ghost" onClick={handleClearPending} disabled={pendingLoading || clearing}>
							{clearing ? 'Se golește…' : 'Golire coadă'}
						</button>
					) : null}
				</div>
			</div>

			<div className="amr-queue">
				{pendingLoading && count === 0 ? (
					<div className="amr-queue-empty">Se încarcă încercările…</div>
				) : count === 0 ? (
					<div className="amr-queue-empty">
						<strong>Nicio verificare în așteptare</strong>
						Încercările la teste cu răspunsuri deschise sau verificare obligatorie vor apărea aici.
					</div>
				) : (
					pendingReviews.map((row) => (
						<article key={row.id} className="amr-card">
							<div className="amr-card-main">
								<span className="amr-card-avatar" aria-hidden>
									{userInitials(row)}
								</span>
								<div className="amr-card-body">
									<span className="amr-card-title">{row.test?.title || 'Test'}</span>
									<span className="amr-card-sub">{row.user?.name || row.user?.email || 'Elev'}</span>
									<span className="amr-card-meta">
										Încercarea {row.attempt_number ?? '—'} · {formatCompletedAt(row.completed_at)}
									</span>
								</div>
							</div>
							{canMutateInAdminArea ? (
								<button type="button" className="amr-btn-primary" onClick={() => openReviewModal(row)}>
									Verifică
								</button>
							) : null}
						</article>
					))
				)}
			</div>

			{showReviewModal && reviewTarget ? (
				<div className="amr-modal-overlay" role="presentation" onClick={closeReviewModal}>
					<div
						className="amr-modal"
						role="dialog"
						aria-modal="true"
						aria-labelledby="amr-test-review-title"
						onClick={(e) => e.stopPropagation()}
					>
						<header className="amr-modal-header">
							<div>
								<h2 id="amr-test-review-title">Verificare test</h2>
								<p className="amr-modal-sub">
									<strong>{reviewTarget.user?.name || reviewTarget.user?.email || 'Elev'}</strong>
									{' · '}
									{reviewTarget.test?.title || 'Test'}
									{' · '}
									Încercarea #{reviewTarget.attempt_number ?? 1}
								</p>
								<p className="amr-modal-score">
									Scor automat: {Number(reviewTarget.score ?? 0)} / {Number(reviewTarget.max_score ?? 0)} puncte
								</p>
							</div>
							<button type="button" className="amr-modal-close" onClick={closeReviewModal} disabled={reviewSubmitting} aria-label="Închide">
								×
							</button>
						</header>

						<div className="amr-modal-body">
							{approvalOnly ? (
								<p className="amr-approval-banner">
									Testul are verificare manuală activată, fără întrebări deschise. Confirmă rezultatul după ce ai revizuit
									răspunsurile notate automat.
								</p>
							) : null}
							{reviewModalQuestions.map((q) => {
								const maxPts = Math.max(1, Number(q.points ?? 1));
								const qType = getQuestionType(q);
								return (
									<article key={q.id} className="amr-question">
										<div className="amr-question-head">
											<span className="is-manual-tag">{manualQuestionTypeLabel(qType)}</span>
											<span>max. {maxPts} pct</span>
										</div>
										<div className="amr-question-text">{q.content || 'Întrebare'}</div>
										<span className="amr-answer-label">Răspuns elev</span>
										<div className="amr-answer-box">{getAnswerDisplay(reviewTarget.answers, q.id)}</div>
										<div className="amr-grade-grid">
											<label className="amr-grade-field">
												Punctaj (0–{maxPts})
												<input
													type="number"
													min={0}
													max={maxPts}
													step={0.5}
													value={reviewScores[q.id] ?? 0}
													onChange={(e) =>
														setReviewScores((prev) => ({
															...prev,
															[q.id]: Math.max(0, Math.min(maxPts, Number(e.target.value) || 0)),
														}))
													}
												/>
											</label>
											<label className="amr-grade-field">
												Feedback (opțional)
												<textarea
													rows={2}
													value={reviewFeedback[q.id] || ''}
													onChange={(e) => setReviewFeedback((prev) => ({ ...prev, [q.id]: e.target.value }))}
												/>
											</label>
										</div>
									</article>
								);
							})}
						</div>

						<footer className="amr-modal-footer">
							<label className="amr-grade-field">
								Feedback general (opțional)
								<textarea rows={2} value={overallFeedback} onChange={(e) => setOverallFeedback(e.target.value)} />
							</label>
							<div className="amr-modal-actions">
								{canMutateInAdminArea && !approvalOnly && aiReviewAllowed ? (
									<button
										type="button"
										className="amr-btn-ghost"
										onClick={handleAiSuggestions}
										disabled={reviewSubmitting || aiSuggesting}
									>
										{aiSuggesting ? 'Se generează…' : 'Sugestii Formely AI'}
									</button>
								) : null}
								<button type="button" className="amr-btn-secondary" onClick={closeReviewModal} disabled={reviewSubmitting || aiSuggesting}>
									Anulează
								</button>
								<button type="button" className="amr-btn-primary" onClick={handleSubmitReview} disabled={reviewSubmitting || aiSuggesting}>
									{reviewSubmitting ? 'Se salvează…' : 'Finalizează verificarea'}
								</button>
							</div>
						</footer>
					</div>
				</div>
			) : null}
		</div>
	);
}
