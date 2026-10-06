import '../styles/exam-results-modern.css';
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
	CheckCircle,
	Eye,
	MagnifyingGlass,
	WarningCircle,
	XCircle,
} from '@phosphor-icons/react';
import { examResultsService } from '../services/api';
import { handleApiError } from '../utils/errorHandler';
import {
	getCorrectChoiceIndices,
	isMultiSelectChoiceQuestion,
	normalizeMultiChoiceIndices,
} from '../utils/examChoiceQuestions';
import RichTextHtml from '../components/RichTextHtml';

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

function getResultTitle(result) {
	return result?.exam?.title || result?.test?.title || 'Test';
}

function getCourseTitle(result) {
	return result?.exam?.course?.title || result?.test?.course?.title || 'Fără curs';
}

function isPendingReview(result) {
	return Boolean((result?.needs_manual_review || result?.status === 'pending_review') && !result?.reviewed_at);
}

function getResultState(result) {
	if (isPendingReview(result)) {
		return { key: 'pending', label: 'În curs de corectare' };
	}
	if (result?.passed) {
		return { key: 'passed', label: 'Promovat' };
	}
	return { key: 'failed', label: 'Nepromovat' };
}

function testIdentity(result) {
	if (result?.test_id) return `test:${result.test_id}`;
	if (result?.exam_id) return `exam:${result.exam_id}`;
	return `${result?.type || 'exam'}:${result?.id}`;
}

function latestResultPerTest(list) {
	const byTest = new Map();
	list.forEach((row) => {
		const key = testIdentity(row);
		const current = byTest.get(key);
		if (!current) {
			byTest.set(key, row);
			return;
		}
		const currentTime = new Date(current.completed_at || 0).getTime();
		const nextTime = new Date(row.completed_at || 0).getTime();
		const currentAttempt = Number(current.attempt_number) || 0;
		const nextAttempt = Number(row.attempt_number) || 0;
		if (nextTime > currentTime || (nextTime === currentTime && nextAttempt > currentAttempt)) {
			byTest.set(key, row);
		}
	});
	return [...byTest.values()];
}

function renderValueList(values, itemLookup) {
	if (!Array.isArray(values) || values.length === 0) return 'Fără răspuns';
	const labels = values
		.map((id) => itemLookup?.get(String(id))?.text || String(id))
		.filter(Boolean);
	return labels.length ? labels.join(' → ') : 'Fără răspuns';
}

function QuestionReview({ question, index, result, submittedOnly = false }) {
	const type = question.type || question.question_type || 'multiple_choice';
	const userAnswer = question.user_answer ?? result?.answers?.[question.id] ?? result?.answers?.[String(question.id)];
	const multi = isMultiSelectChoiceQuestion({ type });
	const userAnswerIndices = Array.isArray(question.user_answer_indices)
		? normalizeMultiChoiceIndices(question.user_answer_indices)
		: multi
			? normalizeMultiChoiceIndices(userAnswer)
			: (() => {
				const idx = normalizeAnswerIndex(question.user_answer_index ?? userAnswer);
				return idx !== null ? [idx] : [];
			})();
	const correctIndices = Array.isArray(question.correct_answer_indices)
		? normalizeMultiChoiceIndices(question.correct_answer_indices)
		: getCorrectChoiceIndices(question);
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
	const correctness = typeof question.is_correct === 'boolean' ? question.is_correct : null;
	const hasAutoStatus = typeof correctness === 'boolean';
	const statusClass = hasAutoStatus ? (correctness ? 'correct' : 'incorrect') : 'submitted';
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
		<article className={`student-exam-feedback-item exam-result-question ${statusClass}`}>
			<div className="student-exam-feedback-item-header">
				<span className="student-exam-feedback-item-number">{index + 1}</span>
				<span className="student-exam-feedback-item-status">
					{hasAutoStatus ? (correctness ? '✓ Corect' : '✗ Incorect') : 'Răspuns trimis'}
				</span>
			</div>

			<RichTextHtml
				html={question.text || question.question_text || question.content}
				className="exam-result-question-text"
				fallback={<div className="exam-result-question-text">Întrebare fără conținut</div>}
			/>

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
						const correct = fromApiAnswers
							? Boolean(answer.is_correct)
							: (!submittedOnly && correctIndices.includes(answerIndex));
						const answerText = answer.answer_text || answer.text || answer.content || `Varianta ${answerIndex + 1}`;
						const tone = correct ? 'correct' : selected ? 'user-incorrect' : 'default';
						return (
							<div
								key={answer.id ?? answerIndex}
								className={`exam-result-answer ${tone}`}
							>
								{(correct || selected) && (
									<span className="exam-result-answer-marker" aria-hidden>
										{correct ? <CheckCircle size={18} weight="bold" /> : <XCircle size={18} weight="bold" />}
									</span>
								)}
								<span className="exam-result-answer-text">{answerText}</span>
								{selected && <span className="exam-result-answer-label user">Răspunsul tău</span>}
								{!submittedOnly && correct && <span className="exam-result-answer-label">Corect</span>}
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

		</article>
	);
}

const STATUS_FILTERS = [
	{ id: 'all', label: 'Toate' },
	{ id: 'passed', label: 'Promovate' },
	{ id: 'failed', label: 'Nepromovate' },
];

const SORT_FILTERS = [
	{ id: 'recent', label: 'Recente' },
	{ id: 'oldest', label: 'Vechi' },
];

const ExamResultsPage = () => {
	const [results, setResults] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [query, setQuery] = useState('');
	const [filterStatus, setFilterStatus] = useState('all');
	const [sortBy, setSortBy] = useState('recent');

	const loadResults = async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await examResultsService.getAll({ view: 'cards' });
			const list = latestResultPerTest(Array.isArray(data) ? data : []);
			const detailed = await Promise.all(list.map(async (row) => {
				if (Array.isArray(row?.exam?.questions)) {
					return row;
				}
				try {
					const details = await examResultsService.getById(row.id, row.type);
					return { ...row, ...details };
				} catch (detailError) {
					handleApiError(detailError, 'fetchResultDetails');
					return row;
				}
			}));
			setResults(detailed);
		} catch (err) {
			handleApiError(err, 'fetchExamResults');
			setError('Nu s-au putut încărca rezultatele testelor.');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadResults();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

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

	if (loading) {
		return (
			<div className="exam-results-page">
				<div className="exam-results-loading">
					<div className="lms-spinner" />
					<p>Se încarcă rezultatele...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="exam-results-page">
			<section className="exam-results-page-header exam-results-page-header--simple">
				<h1 className="exam-results-page-title">Rezultate teste</h1>
			</section>

			{error && (
				<div className="exam-results-error">
					<WarningCircle size={18} weight="bold" aria-hidden />
					<span>{error}</span>
				</div>
			)}

			<div className="exam-results-controls">
				<div className="exam-results-button-row" role="group" aria-label="Filtru teste">
					{STATUS_FILTERS.map((filter) => (
						<button
							key={filter.id}
							type="button"
							className={`exam-results-filter-btn ${filterStatus === filter.id ? 'is-active' : ''}`}
							aria-pressed={filterStatus === filter.id}
							onClick={() => setFilterStatus(filter.id)}
						>
							{filter.label}
						</button>
					))}
				</div>
				<div className="exam-results-button-row" role="group" aria-label="Ordine teste">
					{SORT_FILTERS.map((filter) => (
						<button
							key={filter.id}
							type="button"
							className={`exam-results-filter-btn ${sortBy === filter.id ? 'is-active' : ''}`}
							aria-pressed={sortBy === filter.id}
							onClick={() => setSortBy(filter.id)}
						>
							{filter.label}
						</button>
					))}
				</div>
				<div className="exam-results-search">
					<MagnifyingGlass size={18} weight="bold" aria-hidden />
					<input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Caută după test sau curs"
						aria-label="Caută teste"
					/>
				</div>
			</div>

			{filteredResults.length > 0 ? (
				<div className="exam-results-stack">
					{filteredResults.map((result) => {
						const state = getResultState(result);
						const percent = Math.round(toNumber(result.percentage));
						const questions = asArray(result?.exam?.questions);
						const submittedOnly = Boolean(result?.show_only_submitted_answers);
						return (
							<article key={`${result.type || 'exam'}:${result.id}`} className="student-exam-results exam-results-test-card">
								<h2 className="exam-results-test-title">{getResultTitle(result)}</h2>
								<p className="exam-results-test-course">{getCourseTitle(result)}</p>
								<div className={`student-exam-result-header ${state.key}`}>
									<div className="student-exam-result-icon">{state.key === 'passed' ? '✓' : state.key === 'pending' ? '⏳' : '✗'}</div>
									<div className="student-exam-result-title">
										{state.key === 'pending' ? state.label : `${percent}% ${state.label}`}
									</div>
								</div>
								<div className="student-exam-result-stats">
									<div className="student-exam-result-stat">
										<div className="student-exam-result-stat-label">Scor</div>
										<div className="student-exam-result-stat-value">
											{toNumber(result.score)} / {toNumber(result.total_points ?? result.max_score)}
										</div>
									</div>
								</div>
								{questions.length > 0 ? (
									<div className="student-exam-final-feedback">
										{questions.map((question, index) => (
											<QuestionReview
												key={question.id ?? index}
												question={question}
												index={index}
												result={result}
												submittedOnly={submittedOnly}
											/>
										))}
									</div>
								) : (
									<p className="exam-results-test-missing">Detaliile întrebărilor nu sunt disponibile.</p>
								)}
							</article>
						);
					})}
				</div>
			) : (
				<div className="exam-results-empty">
					<Eye size={34} weight="duotone" aria-hidden />
					<div className="exam-results-empty-title">
						{results.length === 0 ? 'Nu ai rezultate încă' : 'Niciun test pentru filtrele alese'}
					</div>
					<div className="exam-results-empty-text">
						{results.length === 0 ? 'Finalizează un test pentru a vedea scorul aici.' : 'Schimbă filtrul sau căutarea.'}
					</div>
					{results.length === 0 && (
						<Link to="/courses" className="lms-btn-primary">Mergi la cursuri</Link>
					)}
				</div>
			)}
		</div>
	);
};

export default ExamResultsPage;
