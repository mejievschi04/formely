import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
	ArrowClockwise,
	CheckCircle,
	Clock,
	Eye,
	MagnifyingGlass,
	Medal,
	WarningCircle,
	XCircle,
} from '@phosphor-icons/react';
import { catalogExamResultsService, examResultsService } from '../services/api';
import { handleApiError } from '../utils/errorHandler';
import {
	getChoiceTypeLabel,
	getCorrectChoiceIndices,
	getUserChoiceDisplayIndices,
	getUserChoiceDisplayLabels,
	isMultiSelectChoiceQuestion,
	normalizeMultiChoiceIndices,
} from '../utils/examChoiceQuestions';
import RichTextHtml from '../components/RichTextHtml';

const PASSING_ACCENT = '#22c55e';
const FAILING_ACCENT = '#ef4444';
const REVIEW_ACCENT = '#0e7490';

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

function formatDateShort(value) {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '—';
	return new Intl.DateTimeFormat('ro-RO', {
		day: '2-digit',
		month: 'short',
	}).format(date);
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
	return result?.test?.title || result?.exam?.title || 'Test';
}

function getCourseTitle(result) {
	return result?.test?.course?.title || result?.exam?.course?.title || 'Fara curs';
}

function isTestResultRow(result) {
	return result?.type === 'test' || Boolean(result?.test_id);
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

function QuestionReview({ question, index, result, submittedOnly = false }) {
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
	const hasAutoStatus = !submittedOnly && typeof correctness === 'boolean';
	const hasStoredAnswer = userAnswerLabels.length > 0 || userAnswerIndices.length > 0;
	const manualEntry = getManualEntry(result, question.id);
	const manualScore = typeof manualEntry === 'object' ? manualEntry?.score : manualEntry;
	const manualFeedback = typeof manualEntry === 'object' ? manualEntry?.feedback : null;
	const statusClass = submittedOnly
		? 'submitted'
		: (!hasAutoStatus
		? 'pending'
		: correctness
			? 'correct'
			: hasStoredAnswer
				? 'incorrect'
				: 'pending');
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
					{!hasOptions && type === 'short_answer' && (
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
				) : submittedOnly ? null : (
					<span className="exam-result-question-status pending">Evaluare manuala</span>
				)}
			</div>

			<RichTextHtml
				html={question.text || question.question_text || question.content}
				className="exam-result-question-text"
				fallback={<div className="exam-result-question-text">Întrebare fără conținut</div>}
			/>

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
						if (submittedOnly && !selected) {
							return null;
						}
						const correct = submittedOnly
							? false
							: (fromApiAnswers
							? Boolean(answer.is_correct)
							: correctIndices.includes(answerIndex));
						const answerText = answer.answer_text || answer.text || answer.content || `Varianta ${answerIndex + 1}`;
						return (
							<div
								key={answer.id ?? answerIndex}
								className={`exam-result-answer ${submittedOnly ? 'submitted' : (correct ? 'correct' : selected ? 'user-incorrect' : 'default')}`}
							>
								{!submittedOnly && (
								<span className="exam-result-answer-marker" aria-hidden>
									{correct ? <CheckCircle size={18} weight="bold" /> : selected ? <XCircle size={18} weight="bold" /> : null}
								</span>
								)}
								<span className="exam-result-answer-text">{answerText}</span>
								{selected && <span className="exam-result-answer-label user">Răspunsul tău</span>}
								{!submittedOnly && correct && !selected && <span className="exam-result-answer-label">Variantă corectă</span>}
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
								{!submittedOnly && !correctness && (
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
					{!submittedOnly && !correctness && (
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

			{!submittedOnly && question.explanation && (
				<div className="exam-result-explanation">
					<strong>Explicatie:</strong>{' '}
					<RichTextHtml html={question.explanation} className="exam-result-explanation-body" />
				</div>
			)}
		</article>
	);
}

function isCatalogExamResultRow(result) {
	return result?.type === 'exam' || (Boolean(result?.exam_id) && !result?.test_id);
}

function ScoreRing({ value, tone = 'passed', size = 72, className = '' }) {
	const pct = Math.min(100, Math.max(0, toNumber(value)));
	return (
		<div
			className={`exam-results-score-ring tone-${tone} ${className}`.trim()}
			style={{ '--ring-pct': pct, '--ring-size': `${size}px` }}
			role="img"
			aria-label={`Scor ${pct} procente`}
		>
			<span>{pct}%</span>
		</div>
	);
}

const FILTER_OPTIONS = [
	{ value: 'all', label: 'Toate' },
	{ value: 'passed', label: 'Promovate' },
	{ value: 'failed', label: 'Nepromovate' },
	{ value: 'review', label: 'Review' },
];

const RESULTS_PAGE_VARIANTS = {
	tests: {
		service: examResultsService,
		filterRow: isTestResultRow,
		keyPrefix: 'test',
		title: 'Rezultate teste',
		historyLabel: 'Istoric rezultate teste',
		searchPlaceholder: 'Cauta dupa test sau curs',
		emptyTitle: 'Nu ai rezultate inca',
		emptyText: 'Finalizeaza un test pentru a vedea scorul aici.',
		emptyLink: '/courses',
		emptyLinkLabel: 'Mergi la cursuri',
		errorList: 'Nu s-au putut incarca rezultatele testelor.',
		getContextLabel: getCourseTitle,
	},
	catalogExams: {
		service: catalogExamResultsService,
		filterRow: isCatalogExamResultRow,
		keyPrefix: 'exam',
		title: 'Rezultate examene',
		historyLabel: 'Istoric rezultate examene',
		searchPlaceholder: 'Cauta dupa examen',
		emptyTitle: 'Nu ai rezultate la examene inca',
		emptyText: 'Finalizeaza un examen din catalog pentru a vedea scorul aici.',
		emptyLink: '/courses',
		emptyLinkLabel: 'Mergi la examene',
		errorList: 'Nu s-au putut incarca rezultatele examenelor.',
		getContextLabel: () => 'Examen catalog',
	},
};

const ExamResultsPage = ({ variant = 'tests' }) => {
	const pageConfig = RESULTS_PAGE_VARIANTS[variant] || RESULTS_PAGE_VARIANTS.tests;
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
			const data = await pageConfig.service.getAll();
			const list = (Array.isArray(data) ? data : []).filter(pageConfig.filterRow);
			setResults(list);
			if (!selectedKey && list.length > 0) {
				const first = list[0];
				setSelectedKey(`${pageConfig.keyPrefix}:${first.id}`);
			}
		} catch (err) {
			handleApiError(err, 'fetchExamResults');
			setError(pageConfig.errorList);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		setSelectedKey(null);
		setSelectedResult(null);
		loadResults();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [variant]);

	const selectedListResult = useMemo(() => {
		if (!selectedKey) return null;
		return results.find((result) => `${pageConfig.keyPrefix}:${result.id}` === selectedKey) || null;
	}, [results, selectedKey, pageConfig.keyPrefix]);

	useEffect(() => {
		if (!selectedListResult) {
			setSelectedResult(null);
			return;
		}

		let cancelled = false;
		const fetchDetails = async () => {
			try {
				setLoadingDetails(true);
				const details = await pageConfig.service.getById(selectedListResult.id);
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
	}, [selectedListResult, pageConfig]);

	const filteredResults = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return [...results]
			.filter((result) => {
				const state = getResultState(result).key;
				if (filterStatus !== 'all' && state !== filterStatus) return false;
				if (!needle) return true;
				return `${getResultTitle(result)} ${pageConfig.getContextLabel(result)}`.toLowerCase().includes(needle);
			})
			.sort((a, b) => {
				const dateA = new Date(a.completed_at || 0).getTime();
				const dateB = new Date(b.completed_at || 0).getTime();
				return sortBy === 'oldest' ? dateA - dateB : dateB - dateA;
			});
	}, [results, query, filterStatus, sortBy, pageConfig]);

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
	const submittedOnly = Boolean(activeResult?.show_only_submitted_answers);
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
			<div className="exam-results-page exam-results-page--loading">
				<header className="exam-results-hero">
					<div className="exam-results-skeleton exam-results-skeleton-tabs" />
					<div className="exam-results-skeleton exam-results-skeleton-title" />
					<div className="exam-results-kpi-grid">
						{[1, 2, 3, 4, 5].map((i) => (
							<div key={i} className="exam-results-skeleton exam-results-skeleton-kpi" />
						))}
					</div>
				</header>
				<div className="exam-results-workspace">
					<aside className="exam-results-rail">
						<div className="exam-results-skeleton exam-results-skeleton-block" />
					</aside>
					<main className="exam-results-stage">
						<div className="exam-results-loading">
							<div className="lms-spinner" />
							<p>Se incarca rezultatele...</p>
						</div>
					</main>
				</div>
			</div>
		);
	}

	return (
		<div className="exam-results-page">
			<header className="exam-results-hero">
				<nav className="exam-results-tabs" aria-label="Tip rezultate">
					<NavLink
						to="/exam-results"
						end
						className={({ isActive }) => `exam-results-tab${isActive ? ' active' : ''}`}
					>
						Rezultate teste
					</NavLink>
					<NavLink
						to="/catalog-exam-results"
						end
						className={({ isActive }) => `exam-results-tab${isActive ? ' active' : ''}`}
					>
						Rezultate examene
					</NavLink>
				</nav>

				<div className="exam-results-hero-copy">
					<h1 className="exam-results-hero-title">{pageConfig.title}</h1>
				</div>

				<div className="exam-results-kpi-grid" aria-label="Statistici rezultate">
					<article className="exam-results-kpi">
						<span className="exam-results-kpi-label">Total incercari</span>
						<strong className="exam-results-kpi-value">{results.length}</strong>
					</article>
					<article className="exam-results-kpi is-success">
						<span className="exam-results-kpi-label">Promovate</span>
						<strong className="exam-results-kpi-value">{stats.passed}</strong>
					</article>
					<article className="exam-results-kpi">
						<span className="exam-results-kpi-label">Nepromovate</span>
						<strong className="exam-results-kpi-value">{stats.failed}</strong>
					</article>
					<article className="exam-results-kpi is-warning">
						<span className="exam-results-kpi-label">In review</span>
						<strong className="exam-results-kpi-value">{stats.review}</strong>
					</article>
					<article className="exam-results-kpi is-accent">
						<span className="exam-results-kpi-label">
							<Medal size={16} weight="duotone" aria-hidden />
							Medie generala
						</span>
						<strong className="exam-results-kpi-value">{stats.average}%</strong>
					</article>
				</div>
			</header>

			{error && (
				<div className="exam-results-error">
					<WarningCircle size={18} weight="bold" aria-hidden />
					<span>{error}</span>
				</div>
			)}

			<div className="exam-results-workspace">
				<aside className="exam-results-rail" aria-label={pageConfig.historyLabel}>
					<div className="exam-results-rail-head">
						<h2 className="exam-results-rail-title">
							Istoric
							{results.length > 0 && (
								<span className="exam-results-count-badge">{filteredResults.length}</span>
							)}
						</h2>
						<button type="button" className="exam-results-icon-btn" onClick={loadResults} aria-label="Reincarca rezultate">
							<ArrowClockwise size={16} weight="bold" aria-hidden />
						</button>
					</div>

					<div className="exam-results-search">
						<MagnifyingGlass size={16} weight="bold" aria-hidden />
						<input
							type="search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={pageConfig.searchPlaceholder}
						/>
					</div>

					<div className="exam-results-filter-chips" aria-label="Filtre rezultate">
						{FILTER_OPTIONS.map((option) => (
							<button
								key={option.value}
								type="button"
								className={`exam-results-filter-chip${filterStatus === option.value ? ' active' : ''}`}
								onClick={() => setFilterStatus(option.value)}
							>
								{option.label}
							</button>
						))}
					</div>

					<div className="exam-results-sort-row">
						<span>Sortare</span>
						<select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="exam-results-select" aria-label="Sortare rezultate">
							<option value="recent">Cele mai recente</option>
							<option value="oldest">Cele mai vechi</option>
						</select>
					</div>

					{filteredResults.length > 0 ? (
						<div className="exam-results-rail-list">
							{filteredResults.map((result) => {
								const state = getResultState(result);
								const key = `${pageConfig.keyPrefix}:${result.id}`;
								const isSelected = selectedKey === key;
								return (
									<button
										key={key}
										type="button"
										onClick={() => setSelectedKey(key)}
										className={`exam-result-row tone-${state.tone}${isSelected ? ' selected' : ''}`}
										aria-current={isSelected ? 'true' : undefined}
									>
										<ScoreRing value={result.percentage} tone={state.tone} size={44} className="exam-result-row-ring" />
										<div className="exam-result-row-body">
											<div className="exam-result-row-title">{getResultTitle(result)}</div>
											<div className="exam-result-row-meta">
												<span>{formatDateShort(result.completed_at)}</span>
												<span>Incercarea #{result.attempt_number || 1}</span>
											</div>
										</div>
										<span className={`exam-result-row-badge tone-${state.tone}`}>{state.label}</span>
									</button>
								);
							})}
						</div>
					) : (
						<div className="exam-results-empty exam-results-empty--rail">
							<Eye size={32} weight="duotone" aria-hidden />
							<div className="exam-results-empty-title">
								{results.length === 0 ? pageConfig.emptyTitle : 'Niciun rezultat la filtre'}
							</div>
							<div className="exam-results-empty-text">
								{results.length === 0 ? pageConfig.emptyText : 'Schimba filtrul sau cautarea.'}
							</div>
							{results.length === 0 && (
								<Link to={pageConfig.emptyLink} className="lms-btn-primary">{pageConfig.emptyLinkLabel}</Link>
							)}
						</div>
					)}
				</aside>

				<main className={`exam-results-stage tone-${activeState.tone}`}>
					{activeResult ? (
						<>
							<div className="exam-results-report-head">
								<ScoreRing value={activeResult.percentage} tone={activeState.tone} size={104} />
								<div className="exam-results-report-head-copy">
									<span className={`exam-result-status-badge ${activeState.tone}`}>
										{activeState.icon}
										{activeState.label}
									</span>
									<h2>{getResultTitle(activeResult)}</h2>
									<p>{pageConfig.getContextLabel(activeResult)} · {formatDate(activeResult.completed_at)}</p>
								</div>
							</div>

							<div className="exam-results-report-metrics">
								<div className="exam-results-metric">
									<span>Scor</span>
									<strong>{toNumber(activeResult.score)} / {toNumber(activeResult.total_points ?? activeResult.max_score)}</strong>
								</div>
								<div className="exam-results-metric">
									<span>Corecte</span>
									<strong>
										{hasOfficialBreakdown
											? `${officialCorrect} / ${officialTotal}`
											: questionStats.graded > 0
												? `${questionStats.correct} / ${questionStats.graded}`
												: '—'}
									</strong>
								</div>
								<div className="exam-results-metric">
									<span>Incercare</span>
									<strong>#{activeResult.attempt_number || 1}</strong>
								</div>
							</div>

							{overallFeedback && (
								<div className="exam-result-manual-review reviewed">
									Feedback general: {overallFeedback}
								</div>
							)}
							{(breakdownMismatch || scoreMismatch) && (
								<div className="exam-results-error exam-results-error--inline" role="status">
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

							{loadingDetails ? (
								<div className="exam-results-loading compact">
									<div className="lms-spinner" />
									<p>Se incarca detaliile...</p>
								</div>
							) : questions.length > 0 ? (
								<div className="exam-results-questions-block">
									<h3 className="exam-result-questions-title">
										Raspunsurile tale
										{questionStats.graded > 0 && !submittedOnly && (
											<span className="exam-result-questions-count">
												{questionStats.correct} corecte · {questionStats.graded - questionStats.correct} gresite
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
												submittedOnly={submittedOnly}
											/>
										))}
									</div>
								</div>
							) : (
								<div className="exam-results-empty exam-results-empty--stage">
									<Eye size={34} weight="duotone" aria-hidden />
									<div className="exam-results-empty-title">Detaliile intrebarilor nu sunt disponibile</div>
									<div className="exam-results-empty-text">Rezumatul rezultatului este afisat corect mai sus.</div>
								</div>
							)}
						</>
					) : (
						<div className="exam-results-empty exam-results-empty--stage">
							<div className="exam-results-empty-icon" aria-hidden>
								<Eye size={32} weight="duotone" />
							</div>
							<div className="exam-results-empty-title">Selecteaza o incercare</div>
							<div className="exam-results-empty-text">Alege un rezultat din lista din stanga pentru a vedea raportul complet.</div>
						</div>
					)}
				</main>
			</div>
		</div>
	);
};

export default ExamResultsPage;
