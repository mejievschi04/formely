import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';
import { useAuth } from '../../../contexts/AuthContext';
import '../../../pages/admin/AdminExamsPage.css';
import '../../../pages/admin/AdminTestsPendingReviewsPage.css';

const MANUAL_TYPES = [];
const AUTO_TYPES = ['multiple_choice', 'single_choice', 'true_false'];

const qType = (q) => String(q?.question_type || q?.type || 'multiple_choice');
const qText = (q) => String(q?.question_text || q?.text || '').trim() || 'Intrebare';
const isManual = (q) => MANUAL_TYPES.includes(qType(q));
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
	if (value === null || value === undefined || String(value).trim() === '') return '- (fara raspuns)';
	if (typeof value === 'object') {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return '- (fara raspuns)';
		}
	}
	return String(value);
};
const typeLabel = (type) =>
	({
		multiple_choice: 'Grila',
		single_choice: 'Alegere unica',
		true_false: 'Adevarat / fals',
		matching: 'Asocieri',
		ordering: 'Ordonare',
	}[type] || type);

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
		const manualQuestions = (Array.isArray(row?.exam?.questions) ? row.exam.questions : []).filter((question) =>
			isManual(question),
		);
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
			.filter((question) => isManual(question))
			.map((question) => ({
				question_id: question.id,
				score: Math.max(0, Number(manualReviewScores[question.id] || 0)),
				feedback: (manualReviewFeedback[question.id] || '').trim() || undefined,
			}));
		setManualReviewSubmitting(true);
		try {
			await adminService.submitExamManualReview(manualReviewTarget.id, manualRows, manualReviewOverallFeedback.trim());
			toastSuccess('Verificarea manuală a fost salvată.');
			closeManualReviewModal();
			await loadPending();
		} catch (e) {
			console.error('Failed to submit manual review:', e);
			toastError(e?.response?.data?.message || 'Nu s-a putut salva verificarea manuală.');
		} finally {
			setManualReviewSubmitting(false);
		}
	};

	const handleClearPending = async () => {
		if (!canMutateInAdminArea || clearing) return;
		const ok = window.confirm('Sigur vrei să golești coada? Vor fi curățate lucrările expirate/eronate/neverificate mai vechi.');
		if (!ok) return;
		setClearing(true);
		try {
			const result = await adminService.clearPendingExamReviews(30);
			toastSuccess(result?.message || 'Coada a fost curățată.');
			await loadPending();
		} catch (e) {
			console.error('Clear pending exam reviews failed:', e);
			toastError(e?.response?.data?.message || e?.response?.data?.error || 'Nu s-a putut goli coada.');
		} finally {
			setClearing(false);
		}
	};

	return (
		<div className="admin-exams-manual-review admin-tests-pending-embedded">
			<div className="admin-exams-manual-review-head admin-exams-manual-review-head--toolbar">
				<div>
					<h2>Examene</h2>
					<p>Lucrări în așteptare cu întrebări deschise — notezi manual și salvezi feedback-ul.</p>
				</div>
				<button type="button" className="admin-exams-section-refresh-btn" onClick={() => loadPending()} disabled={loading}>
					{loading ? 'Se încarcă…' : 'Reîmprospătează'}
				</button>
				{canMutateInAdminArea ? (
					<button
						type="button"
						className="admin-exams-section-refresh-btn"
						onClick={handleClearPending}
						disabled={loading || clearing}
					>
						{clearing ? 'Se golește…' : 'Golire'}
					</button>
				) : null}
			</div>

			<section className="admin-tests-pending-section" aria-label="Coadă examene">
				{loading && pendingRows.length === 0 ? (
					<div className="admin-tests-pending-empty">Se încarcă coada de verificări…</div>
				) : pendingRows.length === 0 ? (
					<div className="admin-tests-pending-empty">Nu există lucrări în așteptare.</div>
				) : (
					<ul className="admin-tests-pending-list">
						{pendingRows.map((row) => (
							<li key={row.id} className="admin-tests-pending-row">
								<div className="admin-tests-pending-main">
									<strong className="admin-tests-pending-test">{row.exam?.title || 'Examen'}</strong>
									<span className="admin-tests-pending-user">{row.user?.name || row.user?.email || 'Elev'}</span>
									<span className="admin-tests-pending-meta">
										Încercarea {row.attempt_number ?? '—'} · {formatCompletedAt(row.completed_at)}
									</span>
								</div>
								{canMutateInAdminArea ? (
									<button type="button" className="admin-tests-pending-verify" onClick={() => openManualReviewModal(row)}>
										Verifică
									</button>
								) : null}
							</li>
						))}
					</ul>
				)}
			</section>

			{showManualReviewModal && manualReviewTarget ? (
				<div className="admin-exams-create-modal-overlay" onClick={() => !manualReviewSubmitting && closeManualReviewModal()}>
					<div
						className="admin-exams-create-modal admin-exams-manual-modal admin-exams-manual-modal--full"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="admin-exams-manual-modal-top">
							<div>
								<h3>Corectare lucrare</h3>
								<p className="admin-exams-manual-modal-sub">
									<strong>{manualReviewTarget?.user?.name || 'Elev'}</strong>
									<span className="admin-exams-manual-modal-dot">·</span>
									<span>{manualReviewTarget?.exam?.title || 'Examen'}</span>
									<span className="admin-exams-manual-modal-dot">·</span>
									<span>Incercare #{manualReviewTarget?.attempt_number || 1}</span>
								</p>
								<p className="admin-exams-manual-modal-summary">
									Scor automat:{' '}
									<strong>
										{Number(manualReviewTarget?.score ?? 0)} / {Number(manualReviewTarget?.total_points ?? 0)}
									</strong>
								</p>
							</div>
							<button
								type="button"
								className="admin-exams-manual-modal-close"
								onClick={() => !manualReviewSubmitting && closeManualReviewModal()}
								disabled={manualReviewSubmitting}
							>
								×
							</button>
						</div>
						<div className="admin-exams-manual-test-preview">
							{manualReviewSortedQuestions.map((question, index) => {
								const questionType = qType(question);
								const manual = isManual(question);
								const points = Number(question?.points ?? 1);
								const options = sortOptions(question);
								const rawAnswer = getAns(manualReviewTarget?.answers, question.id);
								const pickedIndex = rawAnswer === '' || rawAnswer === undefined || rawAnswer === null ? null : Number(rawAnswer);
								const rightIndex = correctIndex(options);
								return (
									<article key={question.id} className={`admin-exams-manual-q-card ${manual ? 'is-manual' : 'is-auto'}`}>
										<header className="admin-exams-manual-q-card-head">
											<span className="admin-exams-manual-q-num">{index + 1}</span>
											<div className="admin-exams-manual-q-head-text">
												<span className="admin-exams-manual-q-badge">{typeLabel(questionType)}</span>
												<span className="admin-exams-manual-q-points">
													{points} {points === 1 ? 'punct' : 'puncte'}
												</span>
											</div>
										</header>
										<div className="admin-exams-manual-q-text">{qText(question)}</div>
										{manual ? (
											<div className="admin-exams-manual-q-body">
												<div className="admin-exams-manual-student-answer">
													<span className="admin-exams-manual-student-answer-label">Raspunsul elevului</span>
													<div className="admin-exams-manual-student-answer-box">{answerText(rawAnswer)}</div>
												</div>
												<label className="admin-exams-manual-grade-row">
													<span>Nota (0-{points})</span>
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
												<label className="admin-exams-manual-grade-row">
													<span>Feedback</span>
													<textarea
														rows={3}
														value={manualReviewFeedback[question.id] || ''}
														onChange={(e) =>
															setManualReviewFeedback((prev) => ({ ...prev, [question.id]: e.target.value }))
														}
													/>
												</label>
											</div>
										) : AUTO_TYPES.includes(questionType) && options.length > 0 ? (
											<div className="admin-exams-manual-q-body">
												<ul className="admin-exams-manual-options">
													{options.map((option, optionIndex) => {
														const isCorrect = rightIndex !== null && optionIndex === rightIndex;
														const isSelected = pickedIndex !== null && !Number.isNaN(pickedIndex) && optionIndex === pickedIndex;
														const wrongPick = isSelected && rightIndex !== null && !isCorrect;
														return (
															<li
																key={option?.id ?? optionIndex}
																className={`admin-exams-manual-option ${isCorrect ? 'is-correct' : ''} ${isSelected ? 'is-selected' : ''} ${wrongPick ? 'is-wrong-pick' : ''}`}
															>
																<span className="admin-exams-manual-option-letter">{String.fromCharCode(65 + optionIndex)}</span>
																<span className="admin-exams-manual-option-text">
																	{String(option?.answer_text ?? option?.text ?? `Varianta ${optionIndex + 1}`)}
																</span>
																{isCorrect ? <span className="admin-exams-manual-option-tag">Corect</span> : null}
																{isSelected ? <span className="admin-exams-manual-option-tag is-muted">Ales</span> : null}
															</li>
														);
													})}
												</ul>
											</div>
										) : (
											<div className="admin-exams-manual-q-body">
												<span className="admin-exams-manual-student-answer-label">Raspuns inregistrat</span>
												<pre className="admin-exams-manual-raw-answer">{answerText(rawAnswer)}</pre>
											</div>
										)}
									</article>
								);
							})}
						</div>
						<label className="admin-exams-manual-grade-row">
							<span>Feedback general</span>
							<textarea
								rows={3}
								value={manualReviewOverallFeedback}
								onChange={(e) => setManualReviewOverallFeedback(e.target.value)}
							/>
						</label>
						<div className="admin-exams-create-modal-actions admin-exams-manual-modal-actions">
							<button type="button" className="cancel" onClick={closeManualReviewModal} disabled={manualReviewSubmitting}>
								Anuleaza
							</button>
							<button type="button" className="confirm" onClick={submitManualReview} disabled={manualReviewSubmitting}>
								{manualReviewSubmitting ? 'Se salveaza...' : 'Salveaza review-ul'}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
