import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';
import { useAuth } from '../../../contexts/AuthContext';
import {
	AUTO_GRADABLE_QUESTION_TYPES,
	getQuestionType,
	isManualReviewQuestion,
	manualQuestionTypeLabel,
} from '../../../utils/manualReview';

const qText = (q) => String(q?.question_text || q?.text || '').trim() || 'Întrebare';
const sortQs = (qs) => [...(Array.isArray(qs) ? qs : [])].sort((a, b) => Number(a?.order ?? 0) - Number(b?.order ?? 0));
const getAns = (answers, id) => {
	if (!answers || typeof answers !== 'object') return undefined;
	if (Object.prototype.hasOwnProperty.call(answers, Number(id))) return answers[Number(id)];
	if (Object.prototype.hasOwnProperty.call(answers, String(id))) return answers[String(id)];
	return undefined;
};
const sortOptions = (q) => [...(Array.isArray(q?.answers) ? q.answers : [])].sort((a, b) => Number(a?.order ?? 0) - Number(b?.order ?? 0));
const correctIndex = (opts) => {
	const idx = opts.findIndex((x) => Boolean(x?.is_correct));
	return idx >= 0 ? idx : null;
};
const answerText = (value) => {
	if (value === null || value === undefined || String(value).trim() === '') return '— (fără răspuns)';
	if (typeof value === 'object') {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return '— (fără răspuns)';
		}
	}
	return String(value);
};

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

export default function AdminExamManualReviewPanel() {
	const { success: toastSuccess, error: toastError } = useToast();
	const { canMutateInAdminArea } = useAuth();
	const [pendingRows, setPendingRows] = useState([]);
	const [loading, setLoading] = useState(true);
	const [showManualReviewModal, setShowManualReviewModal] = useState(false);
	const [manualReviewTarget, setManualReviewTarget] = useState(null);
	const [manualReviewScores, setManualReviewScores] = useState({});
	const [manualReviewFeedback, setManualReviewFeedback] = useState({});
	const [manualReviewOverallFeedback, setManualReviewOverallFeedback] = useState('');
	const [manualReviewSubmitting, setManualReviewSubmitting] = useState(false);
	const [clearing, setClearing] = useState(false);

	const manualReviewSortedQuestions = useMemo(() => sortQs(manualReviewTarget?.exam?.questions), [manualReviewTarget]);
	const manualQuestionCount = useMemo(
		() => manualReviewSortedQuestions.filter(isManualReviewQuestion).length,
		[manualReviewSortedQuestions],
	);

	const loadPending = useCallback(async () => {
		setLoading(true);
		try {
			const data = await adminService.getPendingExamReviews();
			setPendingRows(Array.isArray(data) ? data : []);
		} catch (e) {
			console.error('Pending exam reviews:', e);
			setPendingRows([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadPending();
	}, [loadPending]);

	const openManualReviewModal = (row) => {
		const manualQuestions = (Array.isArray(row?.exam?.questions) ? row.exam.questions : []).filter(isManualReviewQuestion);
		if (!manualQuestions.length) {
			toastError('Această lucrare nu are întrebări de notat manual.');
			return;
		}
		const nextScores = {};
		const nextFeedback = {};
		manualQuestions.forEach((question) => {
			nextScores[question.id] = Number(question?.points || 0);
			nextFeedback[question.id] = '';
		});
		setManualReviewTarget(row);
		setManualReviewScores(nextScores);
		setManualReviewFeedback(nextFeedback);
		setManualReviewOverallFeedback('');
		setShowManualReviewModal(true);
	};

	const closeManualReviewModal = () => {
		if (manualReviewSubmitting) return;
		setShowManualReviewModal(false);
		setManualReviewTarget(null);
		setManualReviewScores({});
		setManualReviewFeedback({});
		setManualReviewOverallFeedback('');
	};

	const submitManualReview = async () => {
		if (!manualReviewTarget?.id) return;
		const manualRows = (Array.isArray(manualReviewTarget?.exam?.questions) ? manualReviewTarget.exam.questions : [])
			.filter(isManualReviewQuestion)
			.map((question) => ({
				question_id: question.id,
				score: Math.max(0, Number(manualReviewScores[question.id] || 0)),
				feedback: (manualReviewFeedback[question.id] || '').trim() || undefined,
			}));
		setManualReviewSubmitting(true);
		try {
			await adminService.submitExamManualReview(manualReviewTarget.id, manualRows, manualReviewOverallFeedback.trim());
			toastSuccess('Verificarea a fost salvată.');
			closeManualReviewModal();
			await loadPending();
		} catch (e) {
			console.error('Failed to submit manual review:', e);
			toastError(e?.response?.data?.message || 'Nu s-a putut salva verificarea.');
		} finally {
			setManualReviewSubmitting(false);
		}
	};

	const handleClearPending = async () => {
		if (!canMutateInAdminArea || clearing) return;
		const ok = window.confirm('Sigur vrei să golești coada? Vor fi curățate lucrările expirate sau invalide.');
		if (!ok) return;
		setClearing(true);
		try {
			const result = await adminService.clearPendingExamReviews(30);
			toastSuccess(result?.message || 'Coada a fost curățată.');
			await loadPending();
		} catch (e) {
			toastError(e?.response?.data?.message || e?.response?.data?.error || 'Nu s-a putut goli coada.');
		} finally {
			setClearing(false);
		}
	};

	const count = pendingRows.length;

	return (
		<div className="amr-panel">
			<div className="amr-toolbar">
				<div className="amr-toolbar-meta">
					<span className={`amr-count-badge${count === 0 ? ' is-empty' : ''}`}>
						{count === 0 ? 'Nimic în așteptare' : `${count} în așteptare`}
					</span>
				</div>
				<div className="amr-toolbar-actions">
					<button type="button" className="amr-btn-ghost" onClick={loadPending} disabled={loading || clearing}>
						{loading ? 'Se încarcă…' : 'Reîmprospătează'}
					</button>
					{canMutateInAdminArea ? (
						<button type="button" className="amr-btn-ghost" onClick={handleClearPending} disabled={loading || clearing}>
							{clearing ? 'Se golește…' : 'Golire coadă'}
						</button>
					) : null}
				</div>
			</div>

			<div className="amr-queue">
				{loading && count === 0 ? (
					<div className="amr-queue-empty">Se încarcă lucrările…</div>
				) : count === 0 ? (
					<div className="amr-queue-empty">
						<strong>Nicio verificare în așteptare</strong>
						Examenele cu întrebări deschise vor apărea aici după ce elevii le trimit.
					</div>
				) : (
					pendingRows.map((row) => (
						<article key={row.id} className="amr-card">
							<div className="amr-card-main">
								<span className="amr-card-avatar" aria-hidden>
									{userInitials(row)}
								</span>
								<div className="amr-card-body">
									<span className="amr-card-title">{row.exam?.title || 'Examen'}</span>
									<span className="amr-card-sub">{row.user?.name || row.user?.email || 'Elev'}</span>
									<span className="amr-card-meta">
										Încercarea {row.attempt_number ?? '—'} · {formatCompletedAt(row.completed_at)}
									</span>
								</div>
							</div>
							{canMutateInAdminArea ? (
								<button type="button" className="amr-btn-primary" onClick={() => openManualReviewModal(row)}>
									Verifică
								</button>
							) : null}
						</article>
					))
				)}
			</div>

			{showManualReviewModal && manualReviewTarget ? (
				<div className="amr-modal-overlay" role="presentation" onClick={closeManualReviewModal}>
					<div
						className="amr-modal"
						role="dialog"
						aria-modal="true"
						aria-labelledby="amr-exam-review-title"
						onClick={(e) => e.stopPropagation()}
					>
						<header className="amr-modal-header">
							<div>
								<h2 id="amr-exam-review-title">Corectare examen</h2>
								<p className="amr-modal-sub">
									<strong>{manualReviewTarget?.user?.name || 'Elev'}</strong>
									{' · '}
									{manualReviewTarget?.exam?.title || 'Examen'}
									{' · '}
									Încercarea #{manualReviewTarget?.attempt_number || 1}
								</p>
								<p className="amr-modal-score">
									Scor automat: {Number(manualReviewTarget?.score ?? 0)} / {Number(manualReviewTarget?.total_points ?? 0)}{' '}
									· {manualQuestionCount} întrebări de notat manual
								</p>
							</div>
							<button
								type="button"
								className="amr-modal-close"
								onClick={closeManualReviewModal}
								disabled={manualReviewSubmitting}
								aria-label="Închide"
							>
								×
							</button>
						</header>

						<div className="amr-modal-body">
							{manualReviewSortedQuestions.map((question) => {
								const questionType = getQuestionType(question);
								const manual = isManualReviewQuestion(question);
								const points = Number(question?.points ?? 1);
								const options = sortOptions(question);
								const rawAnswer = getAns(manualReviewTarget?.answers, question.id);
								const pickedIndex =
									rawAnswer === '' || rawAnswer === undefined || rawAnswer === null ? null : Number(rawAnswer);
								const rightIndex = correctIndex(options);

								return (
									<article key={question.id} className={`amr-question${manual ? '' : ' is-auto'}`}>
										<div className="amr-question-head">
											<span className={manual ? 'is-manual-tag' : ''}>{manualQuestionTypeLabel(questionType)}</span>
											<span>
												{points} {points === 1 ? 'punct' : 'puncte'}
												{manual ? '' : ' · notat automat'}
											</span>
										</div>
										<div className="amr-question-text">{qText(question)}</div>

										{manual ? (
											<>
												<span className="amr-answer-label">Răspuns elev</span>
												<div className="amr-answer-box">{answerText(rawAnswer)}</div>
												<div className="amr-grade-grid">
													<label className="amr-grade-field">
														Notă (0–{points})
														<input
															type="number"
															min={0}
															max={points}
															step={0.5}
															value={manualReviewScores[question.id] ?? 0}
															onChange={(e) =>
																setManualReviewScores((prev) => ({
																	...prev,
																	[question.id]: Math.max(0, Math.min(points, Number(e.target.value || 0))),
																}))
															}
														/>
													</label>
													<label className="amr-grade-field">
														Feedback
														<textarea
															rows={2}
															value={manualReviewFeedback[question.id] || ''}
															onChange={(e) =>
																setManualReviewFeedback((prev) => ({ ...prev, [question.id]: e.target.value }))
															}
														/>
													</label>
												</div>
											</>
										) : AUTO_GRADABLE_QUESTION_TYPES.includes(questionType) && options.length > 0 ? (
											<ul className="amr-options">
												{options.map((option, optionIndex) => {
													const isCorrect = rightIndex !== null && optionIndex === rightIndex;
													const isSelected =
														pickedIndex !== null && !Number.isNaN(pickedIndex) && optionIndex === pickedIndex;
													const wrongPick = isSelected && rightIndex !== null && !isCorrect;
													return (
														<li
															key={option?.id ?? optionIndex}
															className={`amr-option${isCorrect ? ' is-correct' : ''}${wrongPick ? ' is-wrong' : ''}`}
														>
															<span className="amr-option-letter">{String.fromCharCode(65 + optionIndex)}</span>
															<span>{String(option?.answer_text ?? option?.text ?? `Varianta ${optionIndex + 1}`)}</span>
														</li>
													);
												})}
											</ul>
										) : (
											<>
												<span className="amr-answer-label">Răspuns înregistrat</span>
												<div className="amr-answer-box">{answerText(rawAnswer)}</div>
											</>
										)}
									</article>
								);
							})}
						</div>

						<footer className="amr-modal-footer">
							<label className="amr-grade-field">
								Feedback general
								<textarea
									rows={2}
									value={manualReviewOverallFeedback}
									onChange={(e) => setManualReviewOverallFeedback(e.target.value)}
								/>
							</label>
							<div className="amr-modal-actions">
								<button type="button" className="amr-btn-secondary" onClick={closeManualReviewModal} disabled={manualReviewSubmitting}>
									Anulează
								</button>
								<button type="button" className="amr-btn-primary" onClick={submitManualReview} disabled={manualReviewSubmitting}>
									{manualReviewSubmitting ? 'Se salvează…' : 'Finalizează verificarea'}
								</button>
							</div>
						</footer>
					</div>
				</div>
			) : null}
		</div>
	);
}
