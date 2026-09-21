import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { examService, courseProgressService, coursesService } from '../services/api';
import { advanceAfterExamPassed } from '../utils/courseFlowNavigation';
import CourseCongratulationsModal from '../components/student/CourseCongratulationsModal';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { logger } from '../utils/logger';
import { handleApiError } from '../utils/errorHandler';
import StructuredQuestionRenderer from '../components/student/StructuredQuestionRenderer';
import ChoiceQuestionOptions from '../components/student/ChoiceQuestionOptions';
import RichTextHtml from '../components/RichTextHtml';
import { stripRichTextToPlain } from '../utils/richTextContent';
import { useTestAttemptTelemetry } from '../hooks/useTestAttemptTelemetry';
import TestAttemptFooter from '../components/student/TestAttemptFooter';
import {
	coerceChoiceAnswerForQuestion,
	getCorrectChoiceIndices,
	getUserChoiceDisplayIndices,
	getUserChoiceDisplayLabels,
	isChoiceAnswered,
	isTextAnswerQuestion,
	isMultiSelectChoiceQuestion,
	areChoiceAnswersEqual,
	normalizeMultiChoiceIndices,
} from '../utils/examChoiceQuestions';

/** Ciornă răspunsuri în sessionStorage — supraviețuiește navigării înapoi la curs (nu la trimitere). */
function buildExamDraftKey(userId, courseId, examId) {
	return `formely_exam_draft:${userId ?? 'guest'}:${courseId ?? ''}:${examId}`;
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
	const navigate = useNavigate();
	const { warning: showWarning, error: showError } = useToast();
	const [exam, setExam] = useState(null);
	const [answers, setAnswers] = useState({});
	const [submitted, setSubmitted] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [timeRemaining, setTimeRemaining] = useState(null);
	const [startTime, setStartTime] = useState(null);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
	const [isMobile, setIsMobile] = useState(() =>
		typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
	);
	const [flaggedQuestions, setFlaggedQuestions] = useState(new Set());
	const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
	const [showCourseCongrats, setShowCourseCongrats] = useState(false);
	const [congratsCourseTitle, setCongratsCourseTitle] = useState('');
	const timerIntervalRef = useRef(null);
	const examPageRef = useRef(null);
	const userIdRef = useRef(user?.id);

	useEffect(() => {
		const mq = window.matchMedia('(max-width: 768px)');
		const onChange = () => setIsMobile(mq.matches);
		onChange();
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	}, []);

	useEffect(() => {
		document.body.classList.add('student-exam-player');
		return () => document.body.classList.remove('student-exam-player');
	}, []);
	userIdRef.current = user?.id;
	const examFetchAbortRef = useRef(null);
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
		if (!submitted || !exam?.questions?.length) return null;
		const mapped = {};
		let found = false;
		for (const q of exam.questions) {
			if (Array.isArray(q.user_answer_display_indices) && q.user_answer_display_indices.length > 0) {
				mapped[q.id] = isMultiSelectChoiceQuestion(q)
					? q.user_answer_display_indices
					: q.user_answer_display_indices[0];
				found = true;
				continue;
			}
			if (Array.isArray(q.user_answer_indices) && q.user_answer_indices.length > 0) {
				mapped[q.id] = isMultiSelectChoiceQuestion(q) ? q.user_answer_indices : q.user_answer_indices[0];
				found = true;
				continue;
			}
			if (q.user_answer_index !== undefined && q.user_answer_index !== null) {
				mapped[q.id] = q.user_answer_index;
				found = true;
			}
		}
		if (found) return mapped;
		if (result?.answers && typeof result.answers === 'object') {
			return normalizeAnswersFromApi(result.answers, exam.questions);
		}
		return null;
	}, [submitted, result, exam?.questions]);
	const visibleAnswers = submitted ? (reviewAnswers ?? answers) : answers;

	const fetchExamData = useCallback(async ({ forceFreshAttempt = false } = {}) => {
		const draftKey = buildExamDraftKey(userIdRef.current, courseId, examId);
		examFetchAbortRef.current?.abort();
		const abortController = new AbortController();
		examFetchAbortRef.current = abortController;
		try {
			setLoading(true);
			if (forceFreshAttempt) {
				try {
					sessionStorage.removeItem(draftKey);
				} catch {
					/* ignore */
				}
			}
			const data = await examService.getExam(examId, courseId, { newAttempt: forceFreshAttempt });
			if (abortController.signal.aborted) return;
			setExam({
				...data,
				questions: Array.isArray(data?.questions) ? data.questions : [],
			});

			if (data.latest_result && !forceFreshAttempt) {
				setResult(data.latest_result);
				setSubmitted(true);
				setAnswers({});
				void testTelemetryRef.current.trackResultViewed(data.latest_result);
			} else {
				testTelemetryRef.current.resetSession();
				setResult(null);
				setSubmitted(false);
				let draftAnswers = {};
				if (!forceFreshAttempt) {
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
				void testTelemetryRef.current.trackStarted({
					attempt_number: data.current_attempt ?? null,
					question_count: data.questions?.length ?? 0,
					test_id: data.test_id ?? data.testId ?? null,
				});
			}

			if (data.time_limit_minutes && (!data.latest_result || forceFreshAttempt)) {
				setTimeRemaining(data.time_limit_minutes * 60);
				setStartTime(Date.now());
			} else if (!data.time_limit_minutes) {
				setTimeRemaining(null);
				setStartTime(null);
			}

			// În timpul testului nu dezvăluim varianta corectă (UI nu folosește answerIndex până la submit).
			// După trimitere afișăm mereu rezumatul: corect/greșit, răspunsul tău și (dacă e cazul) varianta corectă.
			setCurrentQuestionIndex(0);
			setFlaggedQuestions(new Set());
			setError(null);
		} catch (err) {
			if (abortController.signal.aborted) return;
			const errorMessage = handleApiError(err, 'fetchExam');
			setError(errorMessage || 'Testul nu a fost găsit');
		} finally {
			if (!abortController.signal.aborted) {
				setLoading(false);
			}
		}
	}, [examId, courseId]);

	useEffect(() => {
		setError(null);
		setExam(null);
		fetchExamData();
		return () => {
			examFetchAbortRef.current?.abort();
		};
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

	useEffect(() => {
		if (!exam || submitted) return;
		testTelemetryRef.current.trackAnswerSaved(answers, exam.questions?.length ?? 0);
	}, [exam, submitted, answers]);

	// Timer countdown
	useEffect(() => {
		if (!exam?.time_limit_minutes || submitted || !startTime) return;

		timerIntervalRef.current = setInterval(() => {
			const elapsed = Math.floor((Date.now() - startTime) / 1000);
			const remaining = (exam.time_limit_minutes * 60) - elapsed;

			if (remaining <= 0) {
				setTimeRemaining(0);
				clearInterval(timerIntervalRef.current);
				handleSubmit();
			} else {
				setTimeRemaining(remaining);
			}
		}, 1000);

		return () => {
			if (timerIntervalRef.current) {
				clearInterval(timerIntervalRef.current);
			}
		};
	}, [exam?.time_limit_minutes, submitted, startTime]);

	// Handle submit
	const handleSubmit = useCallback(async () => {
		if (submitting || submitted) return;
		setSubmitting(true);
		try {
			if (timerIntervalRef.current) {
				clearInterval(timerIntervalRef.current);
			}

			const attemptMeta =
				exam?.time_limit_minutes && startTime
					? { started_at: new Date(startTime).toISOString() }
					: null;
			const resultData = await examService.submitExam(examId, answers, courseId || null, attemptMeta);
			const submittedResult = resultData.result;
			const reviewQs = Array.isArray(submittedResult?.review_questions) ? submittedResult.review_questions : null;
			setResult(submittedResult);
			if (reviewQs && reviewQs.length > 0) {
				setExam((prev) => (prev ? { ...prev, questions: reviewQs } : prev));
				const displayAnswers = {};
				for (const q of reviewQs) {
					if (Array.isArray(q.user_answer_display_indices) && q.user_answer_display_indices.length > 0) {
						displayAnswers[q.id] = isMultiSelectChoiceQuestion(q)
							? q.user_answer_display_indices
							: q.user_answer_display_indices[0];
					} else if (Array.isArray(q.user_answer_indices) && q.user_answer_indices.length > 0) {
						displayAnswers[q.id] = isMultiSelectChoiceQuestion(q)
							? q.user_answer_indices
							: q.user_answer_indices[0];
					} else if (q.user_answer_index !== undefined && q.user_answer_index !== null) {
						displayAnswers[q.id] = q.user_answer_index;
					}
				}
				setAnswers(displayAnswers);
			} else if (submittedResult?.answers && typeof submittedResult.answers === 'object') {
				const questionList = exam?.questions || [];
				setAnswers(normalizeAnswersFromApi(submittedResult.answers, questionList));
			}
			setSubmitted(true);
			setConfirmSubmitOpen(false);
			void testTelemetryRef.current.trackSubmitted(submittedResult);
			try {
				sessionStorage.removeItem(buildExamDraftKey(user?.id, courseId, examId));
			} catch {
				/* ignore */
			}

			if (courseId && submittedResult?.passed) {
				const isFinal = String(exam?.type || '').toLowerCase() === 'final';
				try {
					const p = await courseProgressService.getCourseProgress(courseId);
					if (isFinal && p?.course_complete) {
						try {
							await coursesService.finishCourse(courseId);
						} catch (err) {
							if (err?.response?.status !== 409) {
								throw err;
							}
						}
						setShowCourseCongrats(true);
						try {
							const c = await coursesService.getById(courseId);
							const title = c?.title ?? c?.name;
							if (title) setCongratsCourseTitle(title);
						} catch {
							/* titlu opțional */
						}
					}
				} catch {
					/* progres opțional */
				}
			}

			// If exam is required and not passed, show blocking message
			if (exam?.is_required && !submittedResult.passed) {
				// Progress will be blocked by backend
			}
		} catch (err) {
			const errorMessage = handleApiError(err, 'submitExam');
			setError(errorMessage || 'Eroare la trimiterea testului');
		} finally {
			setSubmitting(false);
		}
	}, [examId, answers, exam, courseId, user?.id, submitted, submitting, startTime]);

	const requestSubmit = useCallback(() => {
		if (timeRemaining === 0) {
			handleSubmit();
			return;
		}
		setConfirmSubmitOpen(true);
	}, [timeRemaining, handleSubmit]);

	const handleContinueAfterExam = useCallback(async () => {
		if (!courseId || !result?.passed) return;
		try {
			await advanceAfterExamPassed({
				courseId,
				exam,
				navigate,
				onCongrats: () => setShowCourseCongrats(true),
			});
		} catch (err) {
			handleApiError(err, 'continueAfterExam');
		}
	}, [courseId, exam, navigate, result?.passed]);

	const handleCongratsClose = useCallback(() => {
		setShowCourseCongrats(false);
		navigate('/courses', { replace: true });
	}, [navigate]);

	// Handle retry
	const handleRetry = useCallback(async () => {
		if (!exam?.can_retake) {
			showWarning('Ai atins numărul maxim de încercări pentru acest test.');
			return;
		}
		setShowCourseCongrats(false);
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
		if (typeof question.is_correct === 'boolean') {
			return question.is_correct;
		}
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
		setAnswers(prev => ({
			...prev,
			[questionId]: answer
		}));
	}, []);

	// Toggle flag
	const toggleFlag = useCallback((questionId) => {
		setFlaggedQuestions(prev => {
			const newSet = new Set(prev);
			if (newSet.has(questionId)) {
				newSet.delete(questionId);
			} else {
				newSet.add(questionId);
			}
			return newSet;
		});
	}, []);

	// Scroll to question
	const scrollToQuestion = useCallback((index) => {
		if (!exam?.questions || index < 0 || index >= exam.questions.length) return;
		setCurrentQuestionIndex(index);
		if (isMobile) {
			examPageRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
			return;
		}
		const questionElement = document.getElementById(`question-${exam.questions[index].id}`);
		if (questionElement) {
			questionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}, [exam, isMobile]);

	// Calculate performance metrics
	const performanceMetrics = useMemo(() => {
		if (!result || !exam) return null;

		const officialTotal = Number(result.total_questions);
		const officialCorrect = Number(result.correct_answers_count);
		const hasOfficialQuestionStats = Number.isFinite(officialTotal)
			&& officialTotal >= 0
			&& Number.isFinite(officialCorrect)
			&& officialCorrect >= 0;
		const totalQuestions = hasOfficialQuestionStats ? officialTotal : exam.questions.length;
		const correctAnswers = hasOfficialQuestionStats
			? Math.min(officialCorrect, totalQuestions)
			: exam.questions.filter((q) => isQuestionCorrect(q)).length;
		const incorrectAnswers = Math.max(0, totalQuestions - correctAnswers);

		return {
			totalQuestions,
			correctAnswers,
			incorrectAnswers,
			percentage: result.percentage || 0,
			passed: result.passed || false,
		};
	}, [result, exam, visibleAnswers, isQuestionCorrect]);
	const needsManualReview = Boolean(result?.needs_manual_review || result?.status === 'pending_review');
	const showsPartialManualReview = Boolean(needsManualReview && exam?.manual_review_mode === 'partial');
	const isSequentialNavigation = (exam?.navigation_mode || 'sequential') !== 'free';
	const canShowInstantResults = Boolean(submitted && result && (( !needsManualReview && exam?.show_feedback_instant) || showsPartialManualReview));
	const showOnlySubmittedAnswers = Boolean(exam?.show_only_submitted_answers);
	const canShowCorrectAnswers = Boolean(canShowInstantResults && exam?.show_correct_answers && !showOnlySubmittedAnswers);
	const canShowExplanations = Boolean(
		canShowInstantResults && !showOnlySubmittedAnswers && (exam?.show_feedback_instant || exam?.show_correct_answers)
	);
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

	const answeredQuestionsCount = useMemo(() => {
		if (!exam?.questions) return 0;
		return exam.questions.filter((q) => isChoiceAnswered(q, answers[q.id])).length;
	}, [exam, answers]);
	const unansweredQuestionIndexes = useMemo(() => {
		if (!exam?.questions) return [];
		return exam.questions
			.map((q, idx) => (isChoiceAnswered(q, answers[q.id]) ? null : idx))
			.filter((idx) => idx !== null);
	}, [exam, answers]);

	const questionProgressPercent = exam?.questions?.length
		? Math.round((answeredQuestionsCount / exam.questions.length) * 100)
		: 0;

	// Get question status
	const getQuestionStatus = useCallback((questionId, index) => {
		if (submitted && result) {
			if (showOnlySubmittedAnswers) {
				const question = exam.questions.find(q => q.id === questionId);
				const isAnswered = question ? isChoiceAnswered(question, visibleAnswers[questionId] ?? answers[questionId]) : false;
				return isAnswered ? 'answered' : 'not-started';
			}
			const question = exam.questions.find(q => q.id === questionId);
			if (isTextAnswerQuestion(question)) {
				return question?.is_correct === true
					? 'completed'
					: (question?.is_correct === false ? 'incorrect' : 'pending');
			}
			if (!Array.isArray(question?.options) || question.options.length === 0) {
				return (question?.type === 'matching' || question?.type === 'ordering') ? (isQuestionCorrect(question) ? 'completed' : 'incorrect') : 'pending';
			}
			return isQuestionCorrect(question) ? 'completed' : 'incorrect';
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

	if (error || !exam) {
		return (
			<div className="student-exam-page">
				<div className="student-exam-error">
					<p>{error || 'Testul nu a fost găsit'}</p>
					{courseId ? (
						<Link to={`/courses/${courseId}`} className="student-exam-btn student-exam-btn-secondary">
							Înapoi la curs
						</Link>
					) : (
						<Link to="/courses" className="student-exam-btn student-exam-btn-secondary">
							Înapoi la mape
						</Link>
					)}
				</div>
			</div>
		);
	}

	const renderExamFeedbackItem = (q, idx) => {
		const userAnswer = q.user_answer ?? visibleAnswers[q.id];
		const userAnswerIndices = getUserChoiceDisplayIndices(q);
		const userAnswerLabels = getUserChoiceDisplayLabels(q, userAnswerIndices);
		const correctIndices = getCorrectChoiceIndices(q);
		const hasOptions = Array.isArray(q.options) && q.options.length > 0;
		const hasMatching = q.type === 'matching' && q.matching;
		const hasOrdering = q.type === 'ordering' && q.ordering;
		const hasTextAnswer = isTextAnswerQuestion(q);
		const isStructured = Boolean(hasMatching || hasOrdering);
		const isCorrect = showOnlySubmittedAnswers ? null : isQuestionCorrect(q);
		const matchingUserValues = Array.isArray(userAnswer) ? userAnswer : [];
		const orderingUserValues = Array.isArray(userAnswer) ? userAnswer : [];
		const statusLabel = showOnlySubmittedAnswers
			? 'Răspuns trimis'
			: (hasTextAnswer
			? (q.is_correct === true ? '✓ Corect' : (q.is_correct === false ? '✗ Incorect' : '⏳ În verificare'))
			: (isStructured
			? (isCorrect ? '✓ Corect' : '✗ Incorect')
			: (hasOptions ? (isCorrect ? '✓ Corect' : '✗ Incorect') : 'Tip fără opțiuni')));
		const feedbackToneClass = showOnlySubmittedAnswers ? 'submitted' : (isCorrect ? 'correct' : 'incorrect');
		const questionPreviewRaw = stripRichTextToPlain(q.text) || '';
		const questionPreview =
			questionPreviewRaw.length > 80 ? `${questionPreviewRaw.slice(0, 80)}…` : questionPreviewRaw;

		const feedbackBody = (
			<>
				<RichTextHtml
					html={q.text}
					className="student-exam-feedback-item-question"
					fallback={<div className="student-exam-feedback-item-question">Întrebare fără conținut</div>}
				/>
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
						{userAnswerLabels.length > 0 && (
							<div className="student-exam-feedback-item-user">
								<strong>Răspunsul tău:</strong>{' '}
								{userAnswerLabels.join('; ') || '—'}
							</div>
						)}
						{canShowCorrectAnswers && !isCorrect && (
							<div className="student-exam-feedback-item-correct">
								<strong>Răspuns corect:</strong>{' '}
								{(Array.isArray(q.correct_answer_labels) && q.correct_answer_labels.length > 0
									? q.correct_answer_labels
									: correctIndices.map((i) => q.options?.[i]).filter(Boolean)
								).join('; ') || '—'}
							</div>
						)}
					</div>
				)}
				{hasTextAnswer && (
					<div className="student-exam-feedback-item-answers">
						<div className="student-exam-feedback-item-user">
							<strong>Răspunsul tău:</strong>{' '}
							{typeof userAnswer === 'string' && userAnswer.trim() ? userAnswer : '—'}
						</div>
						{canShowCorrectAnswers && Array.isArray(q.reference_answers) && q.reference_answers.length > 0 && (
							<div className="student-exam-feedback-item-correct">
								<strong>Răspunsuri de referință:</strong> {q.reference_answers.join('; ')}
							</div>
						)}
					</div>
				)}
				{canShowExplanations && q.explanation && (
					<div className="student-exam-feedback-item-explanation">
						<strong>Explicație:</strong>{' '}
						<RichTextHtml html={q.explanation} className="student-exam-feedback-item-explanation-body" />
					</div>
				)}
			</>
		);

		if (isMobile) {
			return (
				<details
					key={q.id}
					className={`student-exam-feedback-item student-exam-feedback-item--collapsible ${feedbackToneClass}`}
					open={showOnlySubmittedAnswers ? false : !isCorrect}
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
			<div className="student-exam-body">
			{/* Back link */}
			{courseId ? (
				<Link to={`/courses/${courseId}`} className="student-exam-back-link">
					← Înapoi la curs
				</Link>
			) : (
				<Link to="/courses" className="student-exam-back-link">
					← Înapoi la catalog
				</Link>
			)}

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

				{mobileSingleQuestion && (
					<p className="student-exam-mobile-q-label">
						Întrebarea {currentQuestionIndex + 1} din {exam.questions.length}
					</p>
				)}

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

				{!isMobile && !submitted && exam.questions.length > 0 && (
					<div className="student-exam-desktop-meta">
						<div className="student-exam-desktop-meta-text">
							<span className="student-exam-desktop-meta-count">
								{answeredQuestionsCount} / {exam.questions.length} răspunsuri
							</span>
							{isSequentialNavigation && (
								<span className="student-exam-desktop-meta-seq">
									Întrebarea {currentQuestionIndex + 1} din {exam.questions.length}
								</span>
							)}
						</div>
						<div
							className="student-exam-desktop-progress"
							role="progressbar"
							aria-valuenow={questionProgressPercent}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-label="Progres răspunsuri"
						>
							<div
								className="student-exam-desktop-progress-fill"
								style={{ width: `${questionProgressPercent}%` }}
							/>
						</div>
					</div>
				)}
			</div>
			)}

			{!submitted && exam.questions.length === 0 && (
				<div className="student-exam-error" role="alert">
					<p>Acest test nu are întrebări disponibile. Contactează instructorul sau administratorul.</p>
				</div>
			)}

			{/* Navigator + Questions */}
			{!submitted && exam.questions.length > 0 && (
				<div className="student-exam-layout">
					{!isMobile && (
					<aside className="student-exam-nav" aria-label="Navigare întrebări">
						<div className="student-exam-nav-title">Întrebări</div>
						<div className="student-exam-nav-list">
							{exam.questions.map((q, idx) => {
								const status = getQuestionStatus(q.id, idx);
								const isFlagged = flaggedQuestions.has(q.id);
								const canJumpToQuestion =
									isMobile || !isSequentialNavigation || idx <= currentQuestionIndex;
								return (
									<button
										key={q.id}
										type="button"
										onClick={() => canJumpToQuestion && scrollToQuestion(idx)}
										className={`student-exam-nav-item ${status === 'current' ? 'current' : ''} ${status === 'answered' ? 'answered' : ''} ${isFlagged ? 'flagged' : ''}`}
										title={`Întrebarea ${idx + 1}`}
										aria-current={status === 'current' ? 'true' : undefined}
										disabled={!canJumpToQuestion}
									>
										{idx + 1}
									</button>
								);
							})}
						</div>
					</aside>
					)}
					<div className="student-exam-questions">
					{visibleQuestions.map((q, idx) => {
						const actualIndex =
							(mobileSingleQuestion || (isSequentialNavigation && !submitted))
								? currentQuestionIndex
								: idx;
							const hasOptions = Array.isArray(q.options) && q.options.length > 0;
							const hasMatching = q.type === 'matching' && q.matching;
							const hasOrdering = q.type === 'ordering' && q.ordering;
							const hasTextAnswer = isTextAnswerQuestion(q);
							const isFlagged = flaggedQuestions.has(q.id);

						return (
							<div
								key={q.id}
								id={`question-${q.id}`}
								className="student-exam-question"
							>
								<div className="student-exam-question-header">
									<div className="student-exam-question-number">
										{actualIndex + 1}
									</div>
									<div className="student-exam-question-content">
										<RichTextHtml
											html={q.text}
											className="student-exam-question-text"
											fallback={<div className="student-exam-question-text">Întrebare fără conținut</div>}
										/>
										<div className="student-exam-question-meta">
											<span className="student-exam-question-points">{q.points || 1} {q.points === 1 ? 'punct' : 'puncte'}</span>
											{!submitted && (
												<button
													onClick={() => toggleFlag(q.id)}
													className={`student-exam-question-flag ${isFlagged ? 'flagged' : ''}`}
													title={isFlagged ? 'Elimină marcaj' : 'Marchează pentru revizie'}
												>
													🚩
												</button>
											)}
										</div>
									</div>
								</div>

								{hasMatching || hasOrdering ? (
									<StructuredQuestionRenderer
										question={q}
										value={answers[q.id]}
										onChange={(next) => handleAnswerChange(q.id, next)}
										disabled={submitted}
									/>
								) : hasTextAnswer ? (
									<div className="student-exam-text-answer-block">
										<p className="student-exam-choice-hint">
											<span className="student-exam-choice-type">Răspuns scurt</span>
											{' — scrie răspunsul tău; va fi evaluat de instructor'}
										</p>
										<textarea
											className="student-exam-answer-textarea"
											value={typeof answers[q.id] === 'string' ? answers[q.id] : ''}
											onChange={(e) => handleAnswerChange(q.id, e.target.value)}
											placeholder={q.placeholder || 'Introdu răspunsul tău...'}
											disabled={submitted}
											rows={4}
										/>
									</div>
								) : hasOptions ? (
									<ChoiceQuestionOptions
										question={q}
										value={answers[q.id]}
										onChange={(next) => handleAnswerChange(q.id, next)}
										disabled={submitted}
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
						{isMobile && canShowInstantResults && result.percentage != null && !needsManualReview && (
							<div className="student-exam-result-score-badge" aria-label={`Scor ${result.percentage} procent`}>
								<span className="student-exam-result-score-badge-value">{result.percentage}%</span>
								<span className="student-exam-result-score-badge-label">scor final</span>
							</div>
						)}
						<div className="student-exam-result-title">
							{needsManualReview ? 'În așteptare evaluare manuală' : (result.passed ? 'Test promovat!' : 'Test nepromovat')}
						</div>
					</div>

					{showsPartialManualReview && (
						<p className="student-exam-result-notice">
							Rezultat provizoriu: vezi partea evaluată automat acum, iar răspunsurile deschise rămân în verificare manuală.
						</p>
					)}
					{!canShowInstantResults && !needsManualReview && (
						<p className="student-exam-result-notice">
							Răspunsurile au fost trimise. Rezultatul nu este afișat imediat pentru acest examen.
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
						<div className="student-exam-result-stat">
							<div className="student-exam-result-stat-label">Procentaj</div>
							<div className="student-exam-result-stat-value">{result.percentage}%</div>
						</div>
						{performanceMetrics && !showOnlySubmittedAnswers && (
							<>
								<div className="student-exam-result-stat">
									<div className="student-exam-result-stat-label">Corecte</div>
									<div className="student-exam-result-stat-value success">
										{performanceMetrics.correctAnswers}
									</div>
								</div>
								<div className="student-exam-result-stat">
									<div className="student-exam-result-stat-label">Incorecte</div>
									<div className="student-exam-result-stat-value error">
										{performanceMetrics.incorrectAnswers}
									</div>
								</div>
							</>
						)}
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

					{/* Blocking Message */}
					{exam.is_required && !result.passed && !needsManualReview && (
						<div className="student-exam-blocking-message">
							<div className="student-exam-blocking-icon">🔒</div>
							<div className="student-exam-blocking-content">
								<h3 className="student-exam-blocking-title">Progres blocat</h3>
								<p className="student-exam-blocking-text">
									Acest test este obligatoriu și trebuie promovat pentru a continua. 
									{exam.can_retake && exam.remaining_attempts > 0 && (
										<span> Mai ai {exam.remaining_attempts} {exam.remaining_attempts === 1 ? 'încercare' : 'încercări'} disponibile.</span>
									)}
								</p>
							</div>
						</div>
					)}
				</div>
			)}
			</div>

			<TestAttemptFooter
				currentIndex={currentQuestionIndex}
				total={exam.questions.length}
				onNavigate={scrollToQuestion}
				onSubmit={handleSubmit}
				submitting={submitting}
				submitted={submitted}
				backTo={courseId ? `/courses/${courseId}` : null}
				canSubmit={timeRemaining === 0 || exam.questions.some((q) => isChoiceAnswered(q, answers[q.id]))}
				confirmOpen={confirmSubmitOpen}
				answeredCount={answeredQuestionsCount}
				unansweredCount={unansweredQuestionIndexes.length}
				flaggedCount={flaggedQuestions.size}
				onRequestSubmit={requestSubmit}
				onConfirmSubmit={handleSubmit}
				onCancelConfirm={() => setConfirmSubmitOpen(false)}
				onJumpUnanswered={() => {
					const first = unansweredQuestionIndexes[0];
					setConfirmSubmitOpen(false);
					if (first != null) scrollToQuestion(first);
				}}
			>
				{submitted && result && exam.can_retake && !result.passed && !needsManualReview && (
					<button type="button" onClick={handleRetry} className="lms-btn-primary">
						{exam.remaining_attempts == null
							? 'Reîncearcă · fără limită de încercări'
							: `Reîncearcă · mai ai ${exam.remaining_attempts} ${exam.remaining_attempts === 1 ? 'încercare' : 'încercări'}`}
					</button>
				)}
			</TestAttemptFooter>

			<CourseCongratulationsModal
				open={showCourseCongrats}
				onClose={handleCongratsClose}
				courseTitle={congratsCourseTitle}
				closeButtonLabel="Înapoi la curs"
			/>
		</div>
	);
};

export default ExamPage;
