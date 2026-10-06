import TestAttemptFooter from '../components/student/TestAttemptFooter';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { examService } from '../services/api';

import { useAuth } from '../contexts/AuthContextShared.js';

import { useToast } from '../contexts/ToastContextShared.js';

import { handleApiError } from '../utils/errorHandler';
import StructuredQuestionRenderer from '../components/student/StructuredQuestionRenderer';
import ChoiceQuestionOptions from '../components/student/ChoiceQuestionOptions';
import RichTextHtml from '../components/RichTextHtml';
import '../styles/learning-experience.css';
import { useTestAttemptTelemetry } from '../hooks/useTestAttemptTelemetry';
import {
	coerceChoiceAnswerForQuestion,
	getCorrectChoiceIndices,
	isChoiceAnswered,
	isMultiSelectChoiceQuestion,
	areChoiceAnswersEqual,
	normalizeMultiChoiceIndices,
} from '../utils/examChoiceQuestions';

/** Ciornă răspunsuri în sessionStorage — supraviețuiește navigării înapoi la curs (nu la trimitere). */
function buildExamDraftKey(userId, courseId, examId) {
	return `volta_exam_draft:${userId ?? 'guest'}:${courseId ?? ''}:${examId}`;
}

function restoreExamDraftAnswers(rawJson, questions) {
	let restored = {};
	try {
		const parsed = rawJson ? JSON.parse(rawJson) : null;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			restored = parsed;
		}
	} catch {
		return {};
	}
	const next = {};
	for (const q of questions || []) {
		const id = q.id;
		let raw;
		if (Object.prototype.hasOwnProperty.call(restored, id)) {
			raw = restored[id];
		} else if (Object.prototype.hasOwnProperty.call(restored, String(id))) {
			raw = restored[String(id)];
		} else {
			continue;
		}
		next[id] = coerceChoiceAnswerForQuestion(q, raw);
	}
	return next;
}

function firstUnansweredIndex(questions, answers) {
	if (!Array.isArray(questions) || questions.length === 0) return 0;
	const idx = questions.findIndex((q) => !isChoiceAnswered(q, answers?.[q.id] ?? answers?.[String(q.id)]));
	return idx === -1 ? questions.length - 1 : idx;
}

/** Mapează chei string/number din API la id-uri numerice de întrebări (răspunsuri salvate). */
function normalizeAnswersFromApi(raw, questions) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const next = {};
	for (const q of questions || []) {
		const id = q.id;
		let value;
		if (Object.prototype.hasOwnProperty.call(raw, id)) {
			value = raw[id];
		} else if (Object.prototype.hasOwnProperty.call(raw, String(id))) {
			value = raw[String(id)];
		} else {
			continue;
		}
		next[id] = coerceChoiceAnswerForQuestion(q, value);
	}
	return next;
}

const ExamPage = () => {
	const params = useParams();
	const courseId = params.courseId ?? null;
	const examId = params.examId;
	const { user } = useAuth();
	const [searchParams] = useSearchParams();
	// Admin și analist parcurg testul ca un cursant, dar serverul nu le salvează încercarea și rezultatul.
	const isPreviewMode = ['admin', 'analyst'].includes(user?.actualRole ?? user?.role);
	const examKind = ['test', 'exam'].includes(searchParams.get('kind')) ? searchParams.get('kind') : null;
	const back = courseId
		? { to: `/courses/${courseId}`, label: 'Înapoi la curs' }
		: searchParams.get('preview') === '1'
			? { to: '/admin/content?tab=tests', label: 'Înapoi la teste' }
			: { to: '/monthly-tests', label: 'Înapoi la teste lunare' };
	const { warning: showWarning } = useToast();
	const [exam, setExam] = useState(null);
	const [answers, setAnswers] = useState({});
	const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const submitInFlightRef = useRef(false);
    const latestSubmitRef = useRef(null);
	const [result, setResult] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [timeRemaining, setTimeRemaining] = useState(null);
	const [startTime, setStartTime] = useState(null);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
	const [isMobile, setIsMobile] = useState(() =>
		typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
	);
	const timerIntervalRef = useRef(null);
	const examPageRef = useRef(null);
	const userIdRef = useRef(user?.id);
	const answersRef = useRef({});
	const saveProgressTimerRef = useRef(null);

	useEffect(() => {
		const mq = window.matchMedia('(max-width: 768px)');
		const onChange = () => setIsMobile(mq.matches);
		onChange();
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	}, []);
	userIdRef.current = user?.id;
	const examFetchInFlightRef = useRef(false);
	const examFetchKeyRef = useRef(null);
	const testTelemetry = useTestAttemptTelemetry({
		enabled: Boolean(user?.id),
		userId: user?.id,
		entityId: examId,
		courseId,
		testId: exam?.test_id ?? exam?.testId ?? null,
		modelType: 'exam',
	});
	const testTelemetryRef = useRef(testTelemetry);
	testTelemetryRef.current = testTelemetry;
	const reviewAnswers = useMemo(() => {
		if (!submitted || !result || !result.answers || typeof result.answers !== 'object') return null;
		return normalizeAnswersFromApi(result.answers, exam?.questions || []);
	}, [submitted, result, exam?.questions]);
	const visibleAnswers = reviewAnswers || answers;

	const fetchExamData = useCallback(async ({ forceFreshAttempt = false } = {}) => {
		const draftKey = buildExamDraftKey(userIdRef.current, courseId, examId);
		const fetchKey = `${examId}:${courseId ?? ''}:${forceFreshAttempt ? '1' : '0'}`;
		if (examFetchInFlightRef.current && examFetchKeyRef.current === fetchKey) {
			return;
		}
		examFetchInFlightRef.current = true;
		examFetchKeyRef.current = fetchKey;
		try {
			setLoading(true);
			if (forceFreshAttempt) {
				try {
					sessionStorage.removeItem(draftKey);
				} catch {
					/* ignore */
				}
			}
			const data = await examService.getExam(examId, courseId, { newAttempt: forceFreshAttempt, kind: examKind });
			setExam(data);

			const completedStatuses = ['completed', 'pending_review'];
			const viewingCompleted = data.latest_result
				&& completedStatuses.includes(String(data.latest_result.status || 'completed'))
				&& !forceFreshAttempt
				&& !data.active_attempt;

			if (viewingCompleted) {
				setResult(data.latest_result);
				setSubmitted(true);
				setAnswers({});
				void testTelemetryRef.current.trackResultViewed(data.latest_result);
			} else {
				testTelemetryRef.current.resetSession();
				setResult(null);
				setSubmitted(false);
				let draftAnswers = {};
				const serverAnswers = data.active_attempt?.answers;
				if (serverAnswers && typeof serverAnswers === 'object' && !Array.isArray(serverAnswers)
					&& Object.keys(serverAnswers).length > 0) {
					draftAnswers = restoreExamDraftAnswers(JSON.stringify(serverAnswers), data.questions);
				} else if (!forceFreshAttempt) {
					try {
						const raw = sessionStorage.getItem(draftKey);
						if (raw) {
							draftAnswers = restoreExamDraftAnswers(raw, data.questions);
						}
					} catch {
						draftAnswers = {};
					}
				}
				setAnswers(draftAnswers);
				answersRef.current = draftAnswers;
				setCurrentQuestionIndex(firstUnansweredIndex(data.questions, draftAnswers));
				void testTelemetryRef.current.trackStarted({
					attempt_number: data.active_attempt?.attempt_number ?? data.current_attempt ?? null,
					question_count: data.questions?.length ?? 0,
					test_id: data.test_id ?? data.testId ?? null,
				});
			}

			if (data.active_attempt?.expires_at) {
				const expiresMs = new Date(data.active_attempt.expires_at).getTime();
				setTimeRemaining(Math.max(0, Math.floor((expiresMs - Date.now()) / 1000)));
				setStartTime(data.active_attempt.started_at ? new Date(data.active_attempt.started_at).getTime() : Date.now());
			} else if (data.time_limit_minutes && !viewingCompleted) {
				setTimeRemaining(data.time_limit_minutes * 60);
				setStartTime(Date.now());
			} else if (!data.time_limit_minutes) {
				setTimeRemaining(null);
				setStartTime(null);
			}

			// În timpul testului nu dezvăluim varianta corectă (UI nu folosește answerIndex până la submit).
			// După trimitere afișăm mereu rezumatul: corect/greșit, răspunsul tău și (dacă e cazul) varianta corectă.
			if (viewingCompleted) {
				setCurrentQuestionIndex(0);
			}
			setError(null);
		} catch (err) {
			const errorMessage = handleApiError(err, 'fetchExam');
			setError(errorMessage || 'Testul nu a fost găsit');
		} finally {
			setLoading(false);
			examFetchInFlightRef.current = false;
		}
	}, [examId, courseId]);

	useEffect(() => {
		fetchExamData();
	}, [examId, courseId, fetchExamData]);

	// Persistă răspunsurile în timp real ca să nu se piardă la ieșire din pagină / refresh (până la trimitere).
	useEffect(() => {
		if (!exam || submitted) return;
		const draftKey = buildExamDraftKey(user?.id, courseId, examId);
		try {
			sessionStorage.setItem(draftKey, JSON.stringify(answers));
		} catch {
			/* quota / private mode */
		}
	}, [exam, submitted, answers, user?.id, courseId, examId]);
	answersRef.current = answers;

	const persistProgress = useCallback(async (nextAnswers) => {
		if (!exam || submitted) return;
		try {
			await examService.saveProgress(
				examId,
				nextAnswers,
				courseId || null,
				exam?.active_attempt?.id ?? null,
				examKind,
			);
		} catch {
			/* sessionStorage remains the local fallback */
		}
	}, [exam, submitted, examId, courseId]);

	const scheduleProgressSave = useCallback((nextAnswers) => {
		if (saveProgressTimerRef.current) {
			clearTimeout(saveProgressTimerRef.current);
		}
		saveProgressTimerRef.current = setTimeout(() => {
			saveProgressTimerRef.current = null;
			void persistProgress(nextAnswers);
		}, 350);
	}, [persistProgress]);

	useEffect(() => {
		return () => {
			if (saveProgressTimerRef.current) {
				clearTimeout(saveProgressTimerRef.current);
			}
		};
	}, []);

	useEffect(() => {
		const flush = () => {
			if (saveProgressTimerRef.current) {
				clearTimeout(saveProgressTimerRef.current);
				saveProgressTimerRef.current = null;
			}
			void persistProgress(answersRef.current);
		};
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') flush();
		};
		window.addEventListener('pagehide', flush);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			window.removeEventListener('pagehide', flush);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	}, [persistProgress]);

	useEffect(() => {
		if (!exam || submitted) return;
		testTelemetryRef.current.trackAnswerSaved(answers, exam.questions?.length ?? 0);
	}, [exam, submitted, answers]);

	useEffect(() => {
		if (!submitted || !result) return;
		examPageRef.current?.querySelector('.student-exam-body')?.scrollTo({ top: 0 });
	}, [submitted, result]);

	// Timer countdown
	useEffect(() => {
		if (!exam?.time_limit_minutes || submitted || !startTime) return;

		timerIntervalRef.current = setInterval(() => {
			const elapsed = Math.floor((Date.now() - startTime) / 1000);
			const remaining = (exam.time_limit_minutes * 60) - elapsed;

			if (remaining <= 0) {
				setTimeRemaining(0);
                setCurrentQuestionIndex(Math.max(0, (exam?.questions?.length ?? 1) - 1));
				clearInterval(timerIntervalRef.current);
				latestSubmitRef.current?.();
			} else {
				setTimeRemaining(remaining);
			}
		}, 1000);

		return () => {
			if (timerIntervalRef.current) {
				clearInterval(timerIntervalRef.current);
			}
		};
	}, [exam?.time_limit_minutes, exam?.questions?.length, submitted, startTime]);

	// Handle submit
	const handleSubmit = useCallback(async () => {
        if (submitInFlightRef.current || submitted) return;
        submitInFlightRef.current = true;
        setSubmitting(true);
        setError(null);
		try {
			if (saveProgressTimerRef.current) {
				clearTimeout(saveProgressTimerRef.current);
				saveProgressTimerRef.current = null;
			}
			const latestAnswers = answersRef.current || answers;
			await persistProgress(latestAnswers);
			if (timerIntervalRef.current) {
				clearInterval(timerIntervalRef.current);
			}

			const resultData = await examService.submitExam(examId, latestAnswers, courseId || null, {
				attempt_id: exam?.active_attempt?.id ?? null,
				started_at: exam?.active_attempt?.started_at ?? (startTime ? new Date(startTime).toISOString() : null),
			}, examKind);
			const submittedResult = resultData.result;
            if (submittedResult && 'remaining_attempts' in submittedResult) {
                setExam((prev) => prev ? { ...prev,
                    remaining_attempts: submittedResult.remaining_attempts,
                    extra_attempts: submittedResult.extra_attempts ?? prev.extra_attempts,
                    allowed_attempts: submittedResult.allowed_attempts ?? prev.allowed_attempts,
                    can_retake: !submittedResult.passed && !submittedResult.needs_manual_review
                        && (submittedResult.remaining_attempts === null || submittedResult.remaining_attempts > 0),
                } : prev);
            }
			const reviewQs = Array.isArray(submittedResult?.review_questions) ? submittedResult.review_questions : null;
			setResult(submittedResult);
			if (reviewQs && reviewQs.length > 0) {
				setExam((prev) => (prev ? { ...prev, questions: reviewQs } : prev));
			}
			if (submittedResult?.answers && typeof submittedResult.answers === 'object') {
				const questionList = reviewQs?.length ? reviewQs : exam?.questions || [];
				setAnswers((prev) => ({ ...prev, ...normalizeAnswersFromApi(submittedResult.answers, questionList) }));
			}
			setSubmitted(true);
			void testTelemetryRef.current.trackSubmitted(submittedResult);
			try {
				sessionStorage.removeItem(buildExamDraftKey(user?.id, courseId, examId));
			} catch {
				/* ignore */
			}
		} catch (err) {
			const errorMessage = handleApiError(err, 'submitExam');
			setError(errorMessage
				? `${errorMessage} Răspunsurile tale sunt păstrate. Poți trimite din nou.`
				: 'Eroare la trimiterea testului. Răspunsurile tale sunt păstrate. Poți trimite din nou.');
		} finally {
            submitInFlightRef.current = false;
            setSubmitting(false);
        }
	}, [examId, answers, exam, courseId, user?.id, submitted, startTime, persistProgress]);
    latestSubmitRef.current = handleSubmit;

	// Handle retry
	const handleRetry = useCallback(async () => {
		if (!exam?.can_retake) {
			showWarning('Ai atins numărul maxim de încercări pentru acest test.');
			return;
		}
		await testTelemetryRef.current.trackRetakeStarted({
			remaining_attempts: exam?.remaining_attempts ?? null,
		});
		await fetchExamData({ forceFreshAttempt: true });
	}, [exam, fetchExamData, showWarning]);

	// Format time
	const formatTime = useCallback((seconds) => {
		if (!seconds) return '00:00';
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	}, []);

	const normalizeAnswerIndex = useCallback((value) => {
		if (value === null || value === undefined || value === '') return null;
		const parsed = Number(value);
		return Number.isNaN(parsed) ? null : parsed;
	}, []);

	const normalizeComparableAnswer = useCallback((value) => {
		if (value === null || value === undefined) return '';
		if (typeof value === 'object') {
			const text = value.text ?? value.answer_text ?? value.content ?? value.label ?? value.value ?? '';
			return String(text).trim().replace(/\s+/g, ' ').toLowerCase();
		}
		return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
	}, []);

	const resolveOptionIndex = useCallback((answerValue, options = []) => {
		if (!Array.isArray(options) || options.length === 0 || answerValue === null || answerValue === undefined || answerValue === '') {
			return null;
		}
		const numericIndex = normalizeAnswerIndex(answerValue);
		if (numericIndex !== null && options[numericIndex] !== undefined) {
			return numericIndex;
		}
		if (typeof answerValue === 'object') {
			for (const key of ['index', 'answerIndex', 'answer_index', 'selectedIndex', 'selected_index']) {
				const nestedIndex = normalizeAnswerIndex(answerValue[key]);
				if (nestedIndex !== null && options[nestedIndex] !== undefined) {
					return nestedIndex;
				}
			}
			for (const key of ['text', 'answer_text', 'content', 'label', 'value']) {
				const resolved = resolveOptionIndex(answerValue[key], options);
				if (resolved !== null) return resolved;
			}
		}
		const needle = normalizeComparableAnswer(answerValue);
		if (!needle) return null;
		const foundIndex = options.findIndex((option) => normalizeComparableAnswer(option) === needle);
		return foundIndex >= 0 ? foundIndex : null;
	}, [normalizeAnswerIndex, normalizeComparableAnswer]);

	const normalizeSequenceAnswer = useCallback((value) => {
		if (!Array.isArray(value)) return null;
		return value.map((item) => String(item));
	}, []);

	const isQuestionCorrect = useCallback((question, answerValue) => {
		if (!question) return false;
		if (question.type === 'matching' && question.matching?.correctMap) {
			const userSeq = normalizeSequenceAnswer(answerValue);
			const correctSeq = normalizeSequenceAnswer(question.matching.correctMap);
			return Boolean(userSeq && correctSeq && userSeq.length === correctSeq.length && userSeq.every((v, i) => v === correctSeq[i]));
		}
		if (question.type === 'ordering' && question.ordering?.correctOrder) {
			const userSeq = normalizeSequenceAnswer(answerValue);
			const correctSeq = normalizeSequenceAnswer(question.ordering.correctOrder);
			return Boolean(userSeq && correctSeq && userSeq.length === correctSeq.length && userSeq.every((v, i) => v === correctSeq[i]));
		}
		if (Array.isArray(question.options) && question.options.length > 0) {
			const correctIndices = getCorrectChoiceIndices(question);
			if (correctIndices.length === 0) return false;
			if (isMultiSelectChoiceQuestion(question)) {
				return areChoiceAnswersEqual(question, answerValue, correctIndices);
			}
			const userAnswer = resolveOptionIndex(answerValue, question.options);
			return userAnswer !== null && userAnswer === correctIndices[0];
		}
		return false;
	}, [normalizeSequenceAnswer, resolveOptionIndex]);

	// Handle answer change
	const handleAnswerChange = useCallback((questionId, answer) => {
		setAnswers((prev) => {
			const next = {
				...prev,
				[questionId]: answer,
			};
			answersRef.current = next;
			scheduleProgressSave(next);
			return next;
		});
	}, [scheduleProgressSave]);

	// Scroll to question
	const scrollToQuestion = useCallback((index) => {
		if (!exam?.questions || index < 0 || index >= exam.questions.length) return;
		const current = exam.questions[currentQuestionIndex];
		const currentAnswer = current
			? (answers[current.id] ?? answers[String(current.id)])
			: undefined;
		if (index < currentQuestionIndex) {
			const target = exam.questions[index];
			if (target && isChoiceAnswered(target, answers[target.id] ?? answers[String(target.id)])) {
				return;
			}
		}
		if (index > currentQuestionIndex + 1) return;
		if (index === currentQuestionIndex + 1) {
			if (current && !isChoiceAnswered(current, currentAnswer)) {
				return;
			}
			if (saveProgressTimerRef.current) {
				clearTimeout(saveProgressTimerRef.current);
				saveProgressTimerRef.current = null;
			}
			void persistProgress(answersRef.current);
		}
		setCurrentQuestionIndex(index);
		examPageRef.current?.querySelector('.student-exam-body')?.scrollTo({ top: 0, behavior: 'smooth' });
	}, [exam, currentQuestionIndex, answers, persistProgress]);

	const needsManualReview = Boolean(result?.needs_manual_review || result?.status === 'pending_review');
	const showsPartialManualReview = Boolean(needsManualReview && exam?.manual_review_mode === 'partial');
	const allowedAttempts = exam?.allowed_attempts ?? exam?.max_attempts;
	const resultPercent = result?.percentage == null ? null : Math.round(Number(result.percentage));
	const isSequentialNavigation = !submitted;
	const showOnlySubmittedAnswers = Boolean(exam?.show_only_submitted_answers);
	const canShowInstantResults = Boolean(submitted && result && (!needsManualReview || showsPartialManualReview));
	const canShowCorrectAnswers = Boolean(canShowInstantResults && exam?.show_correct_answers && !showOnlySubmittedAnswers);
	const mobileSingleQuestion = isMobile && !submitted;
	const visibleQuestions = useMemo(() => {
		if (!exam?.questions) return [];
		if (submitted) return exam.questions;
		if (mobileSingleQuestion || isSequentialNavigation) {
			const q = exam.questions[currentQuestionIndex];
			return q ? [q] : [];
		}
		return exam.questions;
	}, [exam, submitted, isSequentialNavigation, currentQuestionIndex, mobileSingleQuestion]);

	const currentQuestion = exam?.questions?.[currentQuestionIndex] || null;
	const previousQuestion = currentQuestionIndex > 0 ? exam?.questions?.[currentQuestionIndex - 1] : null;
	const canGoBack = Boolean(
		!submitted
		&& previousQuestion
		&& !isChoiceAnswered(previousQuestion, answers[previousQuestion.id] ?? answers[String(previousQuestion.id)])
	);
	const canGoNext = Boolean(
		!submitted
		&& currentQuestion
		&& currentQuestionIndex < (exam?.questions?.length ?? 0) - 1
		&& isChoiceAnswered(currentQuestion, answers[currentQuestion.id] ?? answers[String(currentQuestion.id)])
	);

	// Get question status
	const getQuestionStatus = useCallback((questionId, index) => {
		if (submitted && result) {
			const question = exam.questions.find(q => q.id === questionId);
			if (typeof question?.is_correct === 'boolean') {
				return question.is_correct ? 'completed' : 'incorrect';
			}
			if (showOnlySubmittedAnswers) {
				const isAnswered = question
					? isChoiceAnswered(question, visibleAnswers[questionId])
					: visibleAnswers[questionId] !== undefined;
				return isAnswered ? 'answered' : 'not-started';
			}
			if (!Array.isArray(question?.options) || question.options.length === 0) {
				return (question?.type === 'matching' || question?.type === 'ordering') ? (isQuestionCorrect(question, visibleAnswers[questionId]) ? 'completed' : 'incorrect') : 'pending';
			}
			return isQuestionCorrect(question, visibleAnswers[questionId]) ? 'completed' : 'incorrect';
		}
			const question = exam.questions.find((q) => q.id === questionId);
			const isAnswered = question ? isChoiceAnswered(question, answers[questionId]) : answers[questionId] !== undefined;
		const isCurrent = index === currentQuestionIndex;
		if (isCurrent) return 'current';
		if (isAnswered) return 'answered';
		return 'not-started';
	}, [answers, currentQuestionIndex, submitted, result, exam, isQuestionCorrect, visibleAnswers, showOnlySubmittedAnswers]);

	if (loading) {
		return (
			<div className="student-exam-page">
				<div className="student-exam-loading">
					<div className="student-loading-spinner"></div>
					<p>Se încarcă testul...</p>
				</div>
			</div>
		);
	}

	if (!exam) {
		return (
			<div className="student-exam-page">
				<div className="student-exam-error">
					<p>{error || 'Testul nu a fost găsit'}</p>
					<Link to={back.to} className="student-exam-btn student-exam-btn-secondary">
						{back.label}
					</Link>
				</div>
			</div>
		);
	}

	const renderExamFeedbackItem = (q, idx) => {
		const userAnswer = visibleAnswers[q.id];
		const userAnswerIndices = isMultiSelectChoiceQuestion(q)
			? normalizeMultiChoiceIndices(userAnswer)
			: (() => {
				const optionIdx = resolveOptionIndex(userAnswer, q.options);
				return optionIdx !== null ? [optionIdx] : [];
			})();
		const correctIndices = getCorrectChoiceIndices(q);
		const hasOptions = Array.isArray(q.options) && q.options.length > 0;
		const hasMatching = q.type === 'matching' && q.matching;
		const hasOrdering = q.type === 'ordering' && q.ordering;
		const isStructured = Boolean(hasMatching || hasOrdering);
		const isCorrect = typeof q.is_correct === 'boolean'
			? q.is_correct
			: (showOnlySubmittedAnswers ? null : isQuestionCorrect(q, userAnswer));
		const matchingUserValues = Array.isArray(userAnswer) ? userAnswer : [];
		const orderingUserValues = Array.isArray(userAnswer) ? userAnswer : [];
		const statusLabel = isCorrect === null
			? (hasOptions || isStructured ? 'Răspuns trimis' : 'Tip fără opțiuni')
			: (isCorrect ? '✓ Corect' : '✗ Incorect');
		const feedbackToneClass = isCorrect === null ? 'submitted' : (isCorrect ? 'correct' : 'incorrect');
		const questionPreview =
			typeof q.text === 'string' && q.text.length > 80 ? `${q.text.slice(0, 80)}…` : q.text;

		const feedbackBody = (
			<>
				<div className="student-exam-feedback-item-question">
					<RichTextHtml html={q.text} />
				</div>
				{hasMatching && q.matching && (
					<div className="student-exam-feedback-item-answers">
						{q.matching.leftItems?.map((left, pairIndex) => {
							const userChoice = matchingUserValues[pairIndex] ?? null;
							const correctChoice = q.matching.correctMap?.[pairIndex];
							const selectedItem = q.matching.rightItems?.find((opt) => String(opt.id) === String(userChoice));
							const correctItem = q.matching.rightItems?.find((opt) => String(opt.id) === String(correctChoice));
							return (
								<div key={left.id} className="student-exam-feedback-item-answer">
									<div><strong>{left.text}</strong></div>
									<div>Răspunsul tău: {selectedItem?.text || '—'}</div>
									{canShowCorrectAnswers && !isCorrect && <div>Răspuns corect: {correctItem?.text || '—'}</div>}
								</div>
							);
						})}
					</div>
				)}
				{hasOrdering && q.ordering && (
					<div className="student-exam-feedback-item-answers">
						<div>Ordinea ta: {orderingUserValues.map((id) => q.ordering.items?.find((item) => String(item.id) === String(id))?.text).filter(Boolean).join(' • ')}</div>
						{canShowCorrectAnswers && !isCorrect && (
							<div>Ordinea corectă: {(q.ordering.correctOrder || []).map((id) => q.ordering.items?.find((item) => String(item.id) === String(id))?.text).filter(Boolean).join(' • ')}</div>
						)}
					</div>
				)}
				{hasOptions && (
					<div className="student-exam-feedback-item-answers">
						{userAnswerIndices.length > 0 && (
							<div className="student-exam-feedback-item-user">
								<strong>Răspunsul tău:</strong>{' '}
								{userAnswerIndices.map((i) => q.options?.[i]).filter(Boolean).join('; ') || '—'}
							</div>
						)}
						{canShowCorrectAnswers && !isCorrect && correctIndices.length > 0 && (
							<div className="student-exam-feedback-item-correct">
								<strong>Răspuns corect:</strong>{' '}
								{correctIndices.map((i) => q.options?.[i]).filter(Boolean).join('; ')}
							</div>
						)}
					</div>
				)}
			</>
		);

		if (isMobile) {
			return (
				<details
					key={q.id}
					className={`student-exam-feedback-item student-exam-feedback-item--collapsible ${feedbackToneClass}`}
					open={isCorrect === false}
				>
					<summary className="student-exam-feedback-item-summary">
						<span className="student-exam-feedback-item-number">{idx + 1}</span>
						<span className="student-exam-feedback-item-status">{statusLabel}</span>
						<span className="student-exam-feedback-item-preview">{questionPreview}</span>
					</summary>
					<div className="student-exam-feedback-item-body">{feedbackBody}</div>
				</details>
			);
		}

		return (
			<div key={q.id} className={`student-exam-feedback-item ${feedbackToneClass}`}>
				<div className="student-exam-feedback-item-header">
					<span className="student-exam-feedback-item-number">{idx + 1}</span>
					<span className="student-exam-feedback-item-status">{statusLabel}</span>
				</div>
				{feedbackBody}
			</div>
		);
	};

	return (
		<div
			ref={examPageRef}
			className={[
				'student-exam-page',
				isMobile ? 'student-exam-page--mobile' : 'student-exam-page--desktop',
				mobileSingleQuestion ? 'student-exam-page--mobile-focus' : '',
				submitted && result ? 'student-exam-page--results' : '',
			]
				.filter(Boolean)
				.join(' ')}
		>
			<div className="student-exam-body" onScroll={(event) => {
                if (submitted || isSequentialNavigation || isMobile) return;
                const top = event.currentTarget.getBoundingClientRect().top + 100;
                const index = exam.questions.findIndex((q) => {
                    const node = document.getElementById(`question-${q.id}`);
                    return node && node.getBoundingClientRect().bottom > top;
                });
                if (index >= 0) setCurrentQuestionIndex(index);
            }}>
                {error && <p role="alert" className="student-exam-error">{error}</p>}
			{isPreviewMode ? (
				<p className="student-exam-preview-note" role="note">
					Previzualizare: parcurgi testul ca un cursant, dar răspunsurile și rezultatul nu se salvează.
				</p>
			) : null}
			{submitted ? (
				<Link to={back.to} className="student-exam-back-link student-exam-back-link--accent">
					← {back.label}
				</Link>
			) : null}

			{!(isMobile && submitted && result) && (
			<div className="student-exam-header student-exam-header-compact">
				<div className="student-exam-header-row">
					<h1 className="student-exam-title">{exam.title}</h1>
					{timeRemaining !== null && !submitted && (
						<div className={`student-exam-timer ${timeRemaining < 300 ? 'student-exam-timer-warning' : ''}`}>
							<span className="student-exam-timer-value">{formatTime(timeRemaining)}</span>
						</div>
					)}
				</div>

				{mobileSingleQuestion && exam.questions.length > 0 ? (
					<div className="student-exam-mobile-progress">
						<span className="student-exam-mobile-progress-label">
							Întrebarea {currentQuestionIndex + 1} din {exam.questions.length}
						</span>
						<div className="student-exam-mobile-progress-track" aria-hidden>
							<div
								className="student-exam-mobile-progress-fill"
								style={{ width: `${Math.round(((currentQuestionIndex + 1) / exam.questions.length) * 100)}%` }}
							/>
						</div>
					</div>
				) : null}

				{exam.current_attempt > 0 && (
					<div className="student-exam-attempt-info">
						<span>Încercare {exam.current_attempt}</span>
						{exam.remaining_attempts !== null && (
							<span className="student-exam-attempt-remaining">
								({exam.remaining_attempts} {exam.remaining_attempts === 1 ? 'încercare' : 'încercări'} rămase)
							</span>
						)}
					</div>
				)}
			</div>
			)}

			{/* Navigator + Questions */}
			{!submitted && (
				<div className="student-exam-layout">
					{!isMobile ? (
					<details className="exam-question-overview" open>
					<summary>
						Întrebări
					</summary>
					<aside className="student-exam-nav" aria-label="Navigare întrebări">
						<div className="student-exam-nav-title">Întrebări</div>
						<div className="student-exam-nav-list">
							{exam.questions.map((q, idx) => {
								const status = getQuestionStatus(q.id, idx);
								const canJumpToQuestion =
									idx === currentQuestionIndex
									|| (idx === currentQuestionIndex + 1 && canGoNext)
									|| (idx < currentQuestionIndex && !isChoiceAnswered(q, answers[q.id] ?? answers[String(q.id)]));
								return (
									<button
										key={q.id}
										type="button"
										onClick={() => canJumpToQuestion && scrollToQuestion(idx)}
										className={`student-exam-nav-item ${status === 'current' ? 'current' : ''} ${status === 'answered' ? 'answered' : ''}`}
										title={`Întrebarea ${idx + 1}`}
										aria-label={`Întrebarea ${idx + 1}, ${isChoiceAnswered(q, answers[q.id]) ? 'completată' : 'fără răspuns'}`}
										aria-current={status === 'current' ? 'true' : undefined}
										disabled={!canJumpToQuestion}
									>
										{idx + 1}
									</button>
								);
							})}
						</div>
					</aside>
					</details>
					) : null}
					<div className="student-exam-questions">
					{visibleQuestions.map((q, idx) => {
						const actualIndex =
							(mobileSingleQuestion || (isSequentialNavigation && !submitted))
								? currentQuestionIndex
								: idx;
							const hasOptions = Array.isArray(q.options) && q.options.length > 0;
							const hasMatching = q.type === 'matching' && q.matching;
							const hasOrdering = q.type === 'ordering' && q.ordering;

						return (
							<div
								key={q.id}
								id={`question-${q.id}`}
								className="student-exam-question"
							>
								<div className="student-exam-question-header">
									{submitted ? (
										<div className="student-exam-question-number">
											{actualIndex + 1}
										</div>
									) : null}
									<div className="student-exam-question-content">
										<RichTextHtml
											html={q.text}
											className="student-exam-question-text"
											fallback={<div className="student-exam-question-text">Întrebare fără conținut</div>}
										/>
										{(q.comment || q.explanation) && !submitted ? (
											<RichTextHtml
												html={q.comment || q.explanation}
												className="student-exam-question-comment"
											/>
										) : null}
									</div>
								</div>

								{hasMatching || hasOrdering ? (
									<StructuredQuestionRenderer
										question={q}
										value={answers[q.id]}
										onChange={(next) => handleAnswerChange(q.id, next)}
										disabled={submitted || submitting}
									/>
								) : hasOptions ? (
									<ChoiceQuestionOptions
										question={q}
										value={answers[q.id]}
										onChange={(next) => handleAnswerChange(q.id, next)}
										disabled={submitted || submitting}
									/>
								) : (
									<div className="student-exam-answer-options">
										<span className="student-exam-answer-option default">
											<span>Tip de întrebare fără opțiuni afișabile</span>
										</span>
									</div>
								)}

							</div>
						);
					})}
					</div>
				</div>
			)}

			{/* Results */}
			{submitted && result && (
				<div className="student-exam-results">
					<div className={`student-exam-result-header ${needsManualReview ? 'pending' : (result.passed ? 'passed' : 'failed')}`}>
						<div className="student-exam-result-icon">{needsManualReview ? '⏳' : (result.passed ? '✓' : '✗')}</div>
						<div className="student-exam-result-title">
							{needsManualReview
								? 'În curs de corectare'
								: `${resultPercent}% ${result.passed ? 'Promovat' : 'Nepromovat'}`}
						</div>
						{needsManualReview ? (
							<div className="student-exam-result-subtitle">
								Rezultatul final vine după evaluarea instructorului.
							</div>
						) : (!result.passed && allowedAttempts > 1 && exam.remaining_attempts > 0) ? (
							<div className="student-exam-result-subtitle">
								{exam.remaining_attempts}/{allowedAttempts} încercări rămase
							</div>
						) : null}
					</div>

					{showsPartialManualReview && (
						<p className="student-exam-result-notice">
							Rezultat provizoriu: vezi partea evaluată automat acum, iar răspunsurile deschise rămân în verificare manuală.
						</p>
					)}
					{canShowInstantResults && (
					<>
					<div className="student-exam-result-stats">
						<div className="student-exam-result-stat">
							<div className="student-exam-result-stat-label">Scor</div>
							<div className="student-exam-result-stat-value">
								{result.score} / {result.total_points}
							</div>
						</div>
					</div>

					{/* După trimitere: rezumat pe întrebări (în timpul testului nu se arată varianta corectă). */}
					</>
					)}
					{canShowInstantResults && exam.questions.length > 0 && (
					<>
						{isMobile && (
							<h2 className="student-exam-feedback-section-title">Detalii răspunsuri</h2>
						)}
						<div className="student-exam-final-feedback">
							{exam.questions.map((q, idx) => renderExamFeedbackItem(q, idx))}
						</div>
					</>
					)}
				</div>
			)}
			</div>

            <TestAttemptFooter currentIndex={currentQuestionIndex} total={exam.questions.length}
                onNavigate={scrollToQuestion} onSubmit={handleSubmit} submitting={submitting}
                submitted={submitted} backTo={back.to}
                backLabel={back.label}
                canSubmit={timeRemaining === 0 || exam.questions.some((q) => isChoiceAnswered(q, answers[q.id]))}
                canGoBack={canGoBack}
                canGoNext={canGoNext}>
                {submitted && result && exam.can_retake && !result.passed && !needsManualReview && (
                    <button type="button" onClick={handleRetry} className="lms-btn-primary">
                        Reîncearcă
                    </button>
                )}
            </TestAttemptFooter>
		</div>
	);
};

export default ExamPage;
