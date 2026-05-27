import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
	ArrowClockwise,
	BookOpenText,
	CalendarBlank,
	CheckCircle,
	Clock,
	Eye,
	Funnel,
	MagnifyingGlass,
	Medal,
	WarningCircle,
	XCircle,
} from '@phosphor-icons/react';
import { examResultsService } from '../services/api';
import { handleApiError } from '../utils/errorHandler';
import {
	getChoiceTypeLabel,
	getCorrectChoiceIndices,
	getUserChoiceDisplayIndices,
	getUserChoiceDisplayLabels,
	isMultiSelectChoiceQuestion,
	normalizeMultiChoiceIndices,
} from '../utils/examChoiceQuestions';

const PASSING_ACCENT = '#22c55e';
const FAILING_ACCENT = '#ef4444';
const REVIEW_ACCENT = '#f59e0b';
const DEFAULT_ACCENT = '#5b72ff';

function asArray(value) {
	return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAnswerIndex(value) {
	if (value === null || value === undefined || value === '') return null;
	const parsed = Number(value);
	return Number.isNaN(parsed) ? null : parsed;
}

function formatDate(value) {
	if (!value) return 'Data indisponibila';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return 'Data indisponibila';
	return new Intl.DateTimeFormat('ro-RO', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(date);
}

function getResultTitle(result) {
	return result?.exam?.title || result?.test?.title || 'Test';
}

function getCourseTitle(result) {
	return result?.exam?.course?.title || result?.test?.course?.title || 'Fara curs';
}

function isPendingReview(result) {
	return Boolean(result?.needs_manual_review || result?.status === 'pending_review');
}

function getResultState(result) {
	if (isPendingReview(result) && !result?.reviewed_at) {
		return {
			key: 'review',
			label: 'In verificare',
			tone: 'review',
			icon: <Clock size={16} weight="bold" aria-hidden />,
			accent: REVIEW_ACCENT,
		};
	}

	if (result?.passed) {
		return {
			key: 'passed',
			label: 'Promovat',
			tone: 'passed',
			icon: <CheckCircle size={16} weight="bold" aria-hidden />,
			accent: PASSING_ACCENT,
		};
	}

	return {
		key: 'failed',
		label: 'Nepromovat',
		tone: 'failed',
		icon: <XCircle size={16} weight="bold" aria-hidden />,
		accent: FAILING_ACCENT,
	};
}

function getManualEntry(result, questionId) {
	const scores = result?.manual_review_scores;
	if (!scores || typeof scores !== 'object') return null;
	return scores[questionId] ?? scores[String(questionId)] ?? null;
}

function renderValueList(values, itemLookup) {
	if (!Array.isArray(values) || values.length === 0) return 'Fără răspuns';
	const labels = values
		.map((id) => itemLookup?.get(String(id))?.text || String(id))
		.filter(Boolean);
	return labels.length ? labels.join(' → ') : 'Fără răspuns';
}

function countAutoGradedQuestions(questions) {
	const graded = questions.filter((q) => typeof q?.is_correct === 'boolean');
	const correct = graded.filter((q) => q.is_correct).length;
	return { graded: graded.length, correct, total: questions.length };
}

function QuestionReview({ question, index, result }) {
	const type = question.type || question.question_type || 'multiple_choice';
	const userAnswer = question.user_answer ?? result?.answers?.[question.id] ?? result?.answers?.[String(question.id)];
	const userAnswerIndices = getUserChoiceDisplayIndices(question);
	const userAnswerLabels = getUserChoiceDisplayLabels(question, userAnswerIndices);
	const correctIndices = getCorrectChoiceIndices(question);
	const options = asArray(question.answers).length
		? asArray(question.answers)
		: asArray(question.options).map((text, answerIndex) => ({
			id: answerIndex,
			text,
			answer_text: text,
			is_correct: correctIndices.includes(answerIndex),
			is_selected: userAnswerIndices.includes(answerIndex),
		}));
	const hasOptions = options.length > 0 && !['matching', 'ordering'].includes(type);
	const correctness = question.is_correct;
	const hasAutoStatus = typeof correctness === 'boolean';
	const hasStoredAnswer = userAnswerLabels.length > 0 || userAnswerIndices.length > 0;
	const manualEntry = getManualEntry(result, question.id);
	const manualScore = typeof manualEntry === 'object' ? manualEntry?.score : manualEntry;
	const manualFeedback = typeof manualEntry === 'object' ? manualEntry?.feedback : null;
	const statusClass = !hasAutoStatus
		? 'pending'
		: correctness
			? 'correct'
			: hasStoredAnswer
				? 'incorrect'
				: 'pending';
	const matching = question.matching;
	const ordering = question.ordering;
	const rightLookup = useMemo(
		() => new Map(asArray(matching?.rightItems).map((item) => [String(item.id), item])),
		[matching]
	);
	const orderLookup = useMemo(
		() => new Map(asArray(ordering?.items).map((item) => [String(item.id), item])),
		[ordering]
	);

	return (
		<article className={`exam-result-question ${statusClass}`}>
			<div className="exam-result-question-header">
				<div>
					<div className="exam-result-question-number">
						Întrebarea {index + 1}
					</div>
					{hasOptions && (
						<span className="exam-result-question-type">{getChoiceTypeLabel({ type })}</span>
					)}
					<div className="exam-result-question-points">
						{question.points || 1} {(question.points || 1) === 1 ? 'punct' : 'puncte'}
					</div>
				</div>
				{hasAutoStatus ? (
					<span className={`exam-result-question-status ${statusClass}`}>
						{correctness ? 'Corect' : hasStoredAnswer ? 'Incorect' : 'Fără răspuns salvat'}
					</span>
				) : (
					<span className="exam-result-question-status pending">Evaluare manuala</span>
				)}
			</div>

			<div className="exam-result-question-text">
				{question.text || question.question_text || question.content || 'Întrebare fără conținut'}
			</div>

			{hasOptions && userAnswerLabels.length > 0 && (
				<p className="exam-result-user-answer-summary">
					<strong>Răspunsul tău:</strong> {userAnswerLabels.join('; ')}
				</p>
			)}

			{hasOptions && (
				<div className="exam-result-answers">
					{options.map((answer, answerIndex) => {
						const fromApiAnswers = asArray(question.answers).length > 0;
						const selected = fromApiAnswers
							? Boolean(answer.is_selected)
							: userAnswerIndices.includes(answerIndex);
						const correct = fromApiAnswers
							? Boolean(answer.is_correct)
							: correctIndices.includes(answerIndex);
						const answerText = answer.answer_text || answer.text || answer.content || `Varianta ${answerIndex + 1}`;
						return (
							<div
								key={answer.id ?? answerIndex}
								className={`exam-result-answer ${correct ? 'correct' : selected ? 'user-incorrect' : 'default'}`}
							>
								<span className="exam-result-answer-marker" aria-hidden>
									{correct ? <CheckCircle size={18} weight="bold" /> : selected ? <XCircle size={18} weight="bold" /> : null}
								</span>
								<span className="exam-result-answer-text">{answerText}</span>
								{selected && <span className="exam-result-answer-label user">Răspunsul tău</span>}
								{correct && !selected && <span className="exam-result-answer-label">Variantă corectă</span>}
							</div>
						);
					})}
				</div>
			)}

			{type === 'matching' && matching && (
				<div className="exam-result-structured">
					{asArray(matching.leftItems).map((left, pairIndex) => {
						const userChoice = Array.isArray(userAnswer) ? userAnswer[pairIndex] : null;
						const correctChoice = matching.correctMap?.[pairIndex];
						return (
							<div key={left.id ?? pairIndex} className="exam-result-structured-row">
								<strong>{left.text}</strong>
								<span>Răspunsul tău: {rightLookup.get(String(userChoice))?.text || 'Fără răspuns'}</span>
								{!correctness && (
									<span>Corect: {rightLookup.get(String(correctChoice))?.text || 'Indisponibil'}</span>
								)}
							</div>
						);
					})}
				</div>
			)}

			{type === 'ordering' && ordering && (
				<div className="exam-result-structured">
					<div className="exam-result-structured-row">
						<strong>Ordinea ta</strong>
						<span>{renderValueList(userAnswer, orderLookup)}</span>
					</div>
					{!correctness && (
						<div className="exam-result-structured-row">
							<strong>Ordinea corectă</strong>
							<span>{renderValueList(ordering.correctOrder, orderLookup)}</span>
						</div>
					)}
				</div>
			)}

			{!hasOptions && type !== 'matching' && type !== 'ordering' && (
				<div className="exam-result-open-text-answer">
					{typeof userAnswer === 'string' && userAnswer.trim()
						? userAnswer
						: 'Fără răspuns afișabil pentru acest tip de întrebare.'}
				</div>
			)}

			{manualScore !== null && manualScore !== undefined && (
				<div className="exam-result-manual-review reviewed">
					Punctaj manual: {manualScore}
					{manualFeedback ? <span> - {manualFeedback}</span> : null}
				</div>
			)}

			{question.explanation && (
				<div className="exam-result-explanation">
					<strong>Explicatie:</strong> {question.explanation}
				</div>
			)}
		</article>
	);
}

const ExamResultsPage = () => {
	const [results, setResults] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [selectedKey, setSelectedKey] = useState(null);
	const [selectedResult, setSelectedResult] = useState(null);
	const [loadingDetails, setLoadingDetails] = useState(false);
	const [query, setQuery] = useState('');
	const [filterStatus, setFilterStatus] = useState('all');
	const [sortBy, setSortBy] = useState('recent');

	const loadResults = async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await examResultsService.getAll();
			const list = Array.isArray(data) ? data : [];
			setResults(list);
			if (!selectedKey && list.length > 0) {
				const first = list[0];
				setSelectedKey(`${first.type || 'exam'}:${first.id}`);
			}
		} catch (err) {
			handleApiError(err, 'fetchExamResults');
			setError('Nu s-au putut incarca rezultatele testelor.');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadResults();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const selectedListResult = useMemo(() => {
		if (!selectedKey) return null;
		return results.find((result) => `${result.type || 'exam'}:${result.id}` === selectedKey) || null;
	}, [results, selectedKey]);

	useEffect(() => {
		if (!selectedListResult) {
			setSelectedResult(null);
			return;
		}

		let cancelled = false;
		const fetchDetails = async () => {
			try {
				setLoadingDetails(true);
				const details = await examResultsService.getById(selectedListResult.id, selectedListResult.type);
				if (!cancelled) {
					setSelectedResult(details);
				}
			} catch (err) {
				handleApiError(err, 'fetchResultDetails');
				if (!cancelled) {
					setSelectedResult(selectedListResult);
					setError('Detaliile rezultatului selectat nu s-au putut incarca complet.');
				}
			} finally {
				if (!cancelled) setLoadingDetails(false);
			}
		};

		fetchDetails();
		return () => {
			cancelled = true;
		};
	}, [selectedListResult]);

	const filteredResults = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return [...results]
			.filter((result) => {
				const state = getResultState(result).key;
				if (filterStatus !== 'all' && state !== filterStatus) return false;
				if (!needle) return true;
				return `${getResultTitle(result)} ${getCourseTitle(result)}`.toLowerCase().includes(needle);
			})
			.sort((a, b) => {
				const dateA = new Date(a.completed_at || 0).getTime();
				const dateB = new Date(b.completed_at || 0).getTime();
				return sortBy === 'oldest' ? dateA - dateB : dateB - dateA;
			});
	}, [results, query, filterStatus, sortBy]);

	const stats = useMemo(() => {
		const passed = results.filter((result) => getResultState(result).key === 'passed').length;
		const review = results.filter((result) => getResultState(result).key === 'review').length;
		const failed = results.filter((result) => getResultState(result).key === 'failed').length;
		const average = results.length
			? Math.round(results.reduce((sum, result) => sum + toNumber(result.percentage), 0) / results.length)
			: 0;
		return { passed, failed, review, average };
	}, [results]);

	const activeResult = selectedResult || selectedListResult;
	const activeState = getResultState(activeResult);
	const questions = asArray(activeResult?.exam?.questions);
	const questionStats = useMemo(() => countAutoGradedQuestions(questions), [questions]);
	const overallFeedback = activeResult?.manual_review_scores?._meta?.overall_feedback || null;
	const officialCorrect = toNumber(activeResult?.correct_answers_count);
	const officialTotal = toNumber(activeResult?.total_questions);
	const hasOfficialBreakdown = officialTotal > 0 && activeResult?.correct_answers_count != null;
	const breakdownMismatch = hasOfficialBreakdown
		&& questionStats.graded > 0
		&& officialCorrect !== questionStats.correct;
	const scoreMismatch = hasOfficialBreakdown
		&& questionStats.graded > 0
		&& officialCorrect === 0
		&& toNumber(activeResult?.percentage) >= 50;

	if (loading) {
		return (
			<div className="exam-results-page">
				<div className="exam-results-loading">
					<div className="lms-spinner" />
					<p>Se incarca rezultatele...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="exam-results-page" style={{ '--exam-results-accent': activeState.accent || DEFAULT_ACCENT }}>
			<section className="exam-results-page-header">
				<div className="exam-results-page-header-main">
					<div className="exam-results-page-header-copy">
						<span className="exam-results-eyebrow">Student</span>
						<h1 className="exam-results-page-title">Rezultate teste</h1>
						<p className="exam-results-page-subtitle">
							Urmareste scorurile, incercarile si raspunsurile salvate pentru testele finalizate.
						</p>
					</div>
					<div className="exam-results-page-header-stats">
						<div className="exam-results-page-header-stat">
							<strong>{results.length}</strong>
							<span>Total</span>
						</div>
						<div className="exam-results-page-header-stat is-success">
							<strong>{stats.passed}</strong>
							<span>Promovate</span>
						</div>
						<div className="exam-results-page-header-stat is-danger">
							<strong>{stats.failed}</strong>
							<span>Nepromovate</span>
						</div>
						<div className="exam-results-page-header-stat is-warning">
							<strong>{stats.review}</strong>
							<span>In review</span>
						</div>
					</div>
				</div>
				<div className="exam-results-score-hero">
					<Medal size={34} weight="duotone" aria-hidden />
					<span>Medie rezultate</span>
					<strong>{stats.average}%</strong>
				</div>
			</section>

			{error && (
				<div className="exam-results-error">
					<WarningCircle size={18} weight="bold" aria-hidden />
					<span>{error}</span>
				</div>
			)}

			<div className="exam-results-grid">
				<section className="exam-results-list-panel exam-results-history-panel" aria-label="Istoric rezultate teste">
					<div className="exam-results-toolbar">
						<div>
							<h2 className="exam-results-section-title">Istoric</h2>
							<p className="exam-results-section-subtitle">Incercari si rezultate</p>
						</div>
						<button type="button" className="exam-results-icon-btn" onClick={loadResults} aria-label="Reincarca rezultate">
							<ArrowClockwise size={18} weight="bold" aria-hidden />
						</button>
					</div>

					<div className="exam-results-search">
						<MagnifyingGlass size={18} weight="bold" aria-hidden />
						<input
							type="search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Cauta dupa test sau curs"
						/>
					</div>

					<div className="exam-results-filters" aria-label="Filtre rezultate">
						<Funnel size={16} weight="bold" aria-hidden />
						<select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="exam-results-select">
							<option value="all">Toate</option>
							<option value="passed">Promovate</option>
							<option value="failed">Nepromovate</option>
							<option value="review">In review</option>
						</select>
						<select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="exam-results-select">
							<option value="recent">Recente</option>
							<option value="oldest">Vechi</option>
						</select>
					</div>

					{filteredResults.length > 0 ? (
						<div className="exam-results-list">
							{filteredResults.map((result) => {
								const state = getResultState(result);
								const key = `${result.type || 'exam'}:${result.id}`;
								return (
									<button
										key={key}
										type="button"
										onClick={() => setSelectedKey(key)}
										className={`exam-result-item ${selectedKey === key ? 'selected' : ''}`}
									>
										<div className="exam-result-header">
											<div>
												<div className="exam-result-title">{getResultTitle(result)}</div>
												<div className="exam-result-course">
													<BookOpenText size={14} weight="bold" aria-hidden />
													{getCourseTitle(result)}
												</div>
											</div>
											<span className={`exam-result-status-badge ${state.tone}`}>
												{state.icon}
												{state.label}
											</span>
										</div>
										<div className="exam-result-meta">
											<span><CalendarBlank size={14} weight="bold" aria-hidden />{formatDate(result.completed_at)}</span>
											<span>Incercarea #{result.attempt_number || 1}</span>
										</div>
										<div className="exam-result-score">
											<span>{toNumber(result.score)} / {toNumber(result.total_points ?? result.max_score)}</span>
											<strong>{toNumber(result.percentage)}%</strong>
										</div>
									</button>
								);
							})}
						</div>
					) : (
						<div className="exam-results-empty">
							<Eye size={34} weight="duotone" aria-hidden />
							<div className="exam-results-empty-title">
								{results.length === 0 ? 'Nu ai rezultate inca' : 'Nu exista rezultate pentru filtrele alese'}
							</div>
							<div className="exam-results-empty-text">
								{results.length === 0 ? 'Finalizeaza un test pentru a vedea scorul aici.' : 'Schimba filtrul sau cautarea.'}
							</div>
							{results.length === 0 && (
								<Link to="/courses" className="lms-btn-primary">Mergi la cursuri</Link>
							)}
						</div>
					)}
				</section>

				<section className="exam-result-details exam-result-report" aria-label="Raport rezultat">
					{activeResult ? (
						<>
							<div className="exam-result-details-header">
								<div>
									<span className={`exam-result-status-badge ${activeState.tone}`}>
										{activeState.icon}
										{activeState.label}
									</span>
									<h2>{getResultTitle(activeResult)}</h2>
									<p>{getCourseTitle(activeResult)}</p>
								</div>
								<div className="exam-result-report-hero-score" aria-label="Procentaj rezultat">
									<span>Rezultat</span>
									<strong>{toNumber(activeResult.percentage)}%</strong>
								</div>
							</div>

							<div className="exam-result-summary">
								<div className="exam-result-score-display">
									<div className="exam-result-score-display-item">
										<div className="exam-result-score-display-label">Scor</div>
										<div className="exam-result-score-display-value">
											{toNumber(activeResult.score)} / {toNumber(activeResult.total_points ?? activeResult.max_score)}
										</div>
									</div>
									<div className="exam-result-score-display-item">
										<div className="exam-result-score-display-label">Procentaj</div>
										<div className={`exam-result-score-display-value percentage ${activeState.tone}`}>
											{toNumber(activeResult.percentage)}%
										</div>
									</div>
									<div className="exam-result-score-display-item">
										<div className="exam-result-score-display-label">Întrebări corecte</div>
										<div className="exam-result-score-display-value">
											{hasOfficialBreakdown
												? `${officialCorrect} / ${officialTotal}`
												: questionStats.graded > 0
													? `${questionStats.correct} / ${questionStats.graded}`
													: '—'}
										</div>
									</div>
									<div className="exam-result-score-display-item">
										<div className="exam-result-score-display-label">Încercare</div>
										<div className="exam-result-score-display-value">#{activeResult.attempt_number || 1}</div>
									</div>
									<div className="exam-result-score-display-item exam-result-score-display-item-wide">
										<div className="exam-result-score-display-label">Finalizat</div>
										<div className="exam-result-score-display-date">{formatDate(activeResult.completed_at)}</div>
									</div>
								</div>
								{overallFeedback && (
									<div className="exam-result-manual-review reviewed">
										Feedback general: {overallFeedback}
									</div>
								)}
								{(breakdownMismatch || scoreMismatch) && (
									<div className="exam-results-error" role="status">
										<WarningCircle size={20} weight="bold" aria-hidden />
										<span>
											Scorul afișat ({toNumber(activeResult.percentage)}%) nu corespunde răspunsurilor salvate
											{hasOfficialBreakdown
												? ` (${officialCorrect}/${officialTotal} corecte).`
												: ` (${questionStats.correct}/${questionStats.graded} corecte la reevaluare).`}
											{' '}Dacă e un rezultat vechi de test, refă încercarea pentru date coerente.
										</span>
									</div>
								)}
							</div>

							{loadingDetails ? (
								<div className="exam-results-loading compact">
									<div className="lms-spinner" />
									<p>Se incarca detaliile...</p>
								</div>
							) : questions.length > 0 ? (
								<div>
									<h3 className="exam-result-questions-title">
										Răspunsurile tale
										{questionStats.graded > 0 && (
											<span className="exam-result-questions-count">
												{questionStats.correct} corecte · {questionStats.graded - questionStats.correct} greșite
											</span>
										)}
									</h3>
									<div className="exam-result-questions">
										{questions.map((question, index) => (
											<QuestionReview
												key={question.id ?? index}
												question={question}
												index={index}
												result={activeResult}
											/>
										))}
									</div>
								</div>
							) : (
								<div className="exam-results-empty">
									<Eye size={34} weight="duotone" aria-hidden />
									<div className="exam-results-empty-title">Detaliile intrebarilor nu sunt disponibile</div>
									<div className="exam-results-empty-text">Rezumatul rezultatului este in continuare afisat corect.</div>
								</div>
							)}
						</>
					) : (
						<div className="exam-results-empty">
							<Eye size={34} weight="duotone" aria-hidden />
							<div className="exam-results-empty-title">Selecteaza un rezultat</div>
							<div className="exam-results-empty-text">Alege un test din lista pentru a vedea raspunsurile.</div>
						</div>
					)}
				</section>
			</div>
		</div>
	);
};

export default ExamResultsPage;
