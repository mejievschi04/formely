import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
	ArrowLeft,
	ArrowRight,
	Books,
	Check,
	FileText,
	FilmSlate,
	WarningCircle,
} from '@phosphor-icons/react';
import { normalizeRichTextMediaHtml } from '../utils/richTextContent';
import { lessonsService, coursesService, courseProgressService } from '../services/api';

import { useAuth } from '../contexts/AuthContextShared.js';

import { useToast } from '../contexts/ToastContextShared.js';
import LessonBlocksPreview from '../components/admin/content-blocks/LessonBlocksPreview';
import CourseCongratulationsModal from '../components/student/CourseCongratulationsModal';
import { getNextLessonIdAfter, getPreviousLessonIdBefore, getRootLessons } from '../utils/lessonOrder';
import { useLessonTimeTracking } from '../hooks/useLessonTimeTracking';
import { useLessonReachedEnd } from '../hooks/useLessonReachedEnd';
import { isLessonMarkedComplete } from '../utils/lessonProgress';
import { scrollAppToTop } from '../utils/scrollToTop';
import { normalizeLessonFromApi, lessonLegacyHtml } from '../utils/lessonContent';
import LessonReadTrackers from '../components/student/LessonReadTrackers';
import LessonPullRefresh from '../components/student/LessonPullRefresh';
import './LessonPage.css';
import '../components/admin/lessons/callout/LessonCallout.css';
import { logger } from '../utils/logger';
import { isVoltEnabled } from '../utils/voltAvailability';

const STUDY_TOOL_OPTIONS = [
	{ id: 'summary', label: 'Rezumat' },
	{ id: 'explain', label: 'Explică simplu' },
	{ id: 'flashcards', label: 'Flashcards' },
	{ id: 'quiz', label: 'Quiz rapid' },
	{ id: 'study_plan', label: 'Plan recapitulare' },
];

const getLessonTypeContent = (contentType) => {
	if (contentType === 'video') return <><FilmSlate size={14} weight="duotone" aria-hidden /> Video</>;
	if (contentType === 'text') return <><FileText size={14} weight="duotone" aria-hidden /> Text</>;
	if (contentType === 'live') return <><WarningCircle size={14} weight="duotone" aria-hidden /> Live</>;
	return <><Books size={14} weight="duotone" aria-hidden /> Lecție</>;
};

const LessonPage = () => {
	const { courseId, lessonId } = useParams();
	const navigate = useNavigate();
	const { user } = useAuth();
	const { showToast } = useToast();
	const contentRef = useRef(null);
	
	const [lesson, setLesson] = useState(null);
	const [course, setCourse] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [errorLocked, setErrorLocked] = useState(false);
	const [isCompleted, setIsCompleted] = useState(false);
	const [showCourseCongrats, setShowCourseCongrats] = useState(false);
	const [finalizingCourse, setFinalizingCourse] = useState(false);
	const [studyToolLoading, setStudyToolLoading] = useState('');
	const [studyToolResult, setStudyToolResult] = useState(null);
	const [studyToolError, setStudyToolError] = useState('');

	useLessonTimeTracking(lessonId, {
		userId: user?.id,
		isCompleted,
		enabled: Boolean(user?.id && lessonId && !['admin', 'analyst'].includes(user?.actualRole || user?.role || '')),
	});

	const reachedEnd = useLessonReachedEnd({
		contentRef,
		lessonId,
		enabled: Boolean(lesson && !loading),
	});
	const canAdvanceLesson = reachedEnd;

	const completeCurrentLesson = useCallback(async ({ force = false } = {}) => {
		if (!lessonId || !user?.id) return true;
		if (isCompleted && !force) return true;
		try {
			await courseProgressService.completeLesson(lessonId);
			setIsCompleted(true);
			return true;
		} catch (err) {
			const msg = err?.response?.data?.message || err?.message || 'Nu s-a putut marca lecția ca finalizată.';
			showToast(msg, 'error');
			return false;
		}
	}, [lessonId, isCompleted, user?.id, showToast]);

	useEffect(() => {
		if (lessonId && courseId) {
			fetchLessonData();
		}
	}, [lessonId, courseId]);

	useLayoutEffect(() => {
		if (!lessonId || loading) return;
		scrollAppToTop({ behavior: 'instant' });
	}, [lessonId, loading]);

	useEffect(() => {
		setIsCompleted(false);
	}, [lessonId]);

	const fetchLessonData = async ({ silent = false } = {}) => {
		try {
			if (!silent) setLoading(true);
			setError(null);
			setErrorLocked(false);
			
			// Fetch lesson
			const lessonData = normalizeLessonFromApi(await lessonsService.getById(lessonId));
			setLesson(lessonData);
			
			// Fetch course for context
			try {
				const courseData = await coursesService.getById(courseId);
				setCourse(courseData);
			} catch  {
				logger.log('Could not fetch course data');
			}
			
			// Check if lesson is already completed
			if (user?.id) {
				try {
					const progress = await courseProgressService.getCourseProgress(courseId);
					if (isLessonMarkedComplete(progress, lessonId)) {
						setIsCompleted(true);
					}
				} catch  {
					logger.log('Could not fetch progress data');
				}
			}
		} catch (err) {
			console.error('Error fetching lesson:', err);
			if (silent) {
				showToast('Nu s-a putut actualiza lecția', 'error');
				return;
			}
			const locked = err?.response?.status === 403 && err?.response?.data?.locked;
			const message = locked
				? (err.response.data.message || 'Lecția este blocată. Completează lecțiile anterioare.')
				: (err?.response?.data?.message || 'Nu s-a putut încărca lecția');
			// mesajul apare pe pagină; o notificare în plus doar l-ar repeta
			setError(message);
			setErrorLocked(Boolean(locked));
		} finally {
			if (!silent) setLoading(false);
		}
	};

	const rootLessons = getRootLessons(course);
	const nextLessonTarget = getNextLessonIdAfter(course?.modules, lessonId, rootLessons);
	const previousLessonTarget = getPreviousLessonIdBefore(course?.modules, lessonId, rootLessons);
	const isLastLessonInCourse = nextLessonTarget === null;

	const handleNext = async () => {
		if (!reachedEnd) return;
		const ok = await completeCurrentLesson({ force: true });
		if (!ok) return;
		if (typeof nextLessonTarget === 'number') {
			navigate(`/courses/${courseId}/lessons/${nextLessonTarget}`);
			return;
		}
		navigate(`/courses/${courseId}`);
	};

	const handleFinalizeCourse = async () => {
		if (finalizingCourse) return;
		setFinalizingCourse(true);
		try {
			if (!user?.id) {
				navigate(`/courses/${courseId}`);
				return;
			}
			if (!isCompleted) {
				const ok = await completeCurrentLesson();
				if (!ok) return;
			}
			const p = await courseProgressService.getCourseProgress(courseId);
			if (p?.next_exam?.id) {
				navigate(`/courses/${courseId}/exams/${p.next_exam.id}`);
				return;
			}
			if (p?.course_complete) {
				setShowCourseCongrats(true);
				return;
			}
			try {
				await coursesService.finishCourse(courseId);
			} catch (err) {
				const status = err?.response?.status;
				const nextId = err?.response?.data?.next_test_id;
				if (status === 409 && nextId) {
					navigate(`/courses/${courseId}/exams/${nextId}`);
					return;
				}
				throw err;
			}
			setShowCourseCongrats(true);
		} catch (err) {
			console.error('Finalize course:', err);
			showToast('Nu s-a putut finaliza cursul. Încearcă din nou.', 'error');
		} finally {
			setFinalizingCourse(false);
		}
	};

	const handleCongratsClose = () => {
		setShowCourseCongrats(false);
		navigate('/courses');
	};

	const handleStudyTool = async (tool) => {
		if (!lessonId || studyToolLoading) return;
		try {
			setStudyToolLoading(tool);
			setStudyToolError('');
			const response = await lessonsService.generateStudyTool(lessonId, tool);
			setStudyToolResult(response);
		} catch (err) {
			const message = err?.response?.data?.error || err?.message || 'Nu s-a putut genera instrumentul de studiu.';
			setStudyToolError(message);
			showToast(message, 'error');
		} finally {
			setStudyToolLoading('');
		}
	};

	const renderStudyToolResult = () => {
		const result = studyToolResult?.result;
		if (!result) return null;

		if (studyToolResult.tool === 'flashcards') {
			return (
				<div className="lesson-study-result-grid">
					{(result.flashcards || []).map((card, index) => (
						<div className="lesson-study-flashcard" key={`${card.front}-${index}`}>
							<strong>{card.front}</strong>
							<p>{card.back}</p>
						</div>
					))}
				</div>
			);
		}

		if (studyToolResult.tool === 'quiz') {
			return (
				<div className="lesson-study-quiz-list">
					{(result.questions || []).map((question, index) => (
						<div className="lesson-study-question" key={`${question.question}-${index}`}>
							<strong>{index + 1}. {question.question}</strong>
							<ul>
								{(question.options || []).map((option, optionIndex) => (
									<li key={`${option}-${optionIndex}`} className={optionIndex === question.correct_index ? 'is-correct' : ''}>
										{option}
									</li>
								))}
							</ul>
							{question.explanation && <p>{question.explanation}</p>}
						</div>
					))}
				</div>
			);
		}

		if (studyToolResult.tool === 'study_plan') {
			return (
				<div className="lesson-study-plan">
					{(result.steps || []).map((step, index) => (
						<div className="lesson-study-plan-step" key={`${step.label}-${index}`}>
							<span>{step.minutes ? `${step.minutes} min` : `${index + 1}`}</span>
							<div>
								<strong>{step.label}</strong>
								<p>{step.instruction}</p>
							</div>
						</div>
					))}
					{result.review_focus?.length ? (
						<div className="lesson-study-list-section">
							<strong>Focus recapitulare</strong>
							<ul>{result.review_focus.map((item) => <li key={item}>{item}</li>)}</ul>
						</div>
					) : null}
				</div>
			);
		}

		return (
			<div className="lesson-study-text-result">
				{result.summary && <p>{result.summary}</p>}
				{result.simple_explanation && <p>{result.simple_explanation}</p>}
				{result.analogy && <p><strong>Analogic:</strong> {result.analogy}</p>}
				{result.key_points?.length ? (
					<div className="lesson-study-list-section">
						<strong>Idei cheie</strong>
						<ul>{result.key_points.map((item) => <li key={item}>{item}</li>)}</ul>
					</div>
				) : null}
				{result.steps?.length ? (
					<div className="lesson-study-list-section">
						<strong>Pași</strong>
						<ul>{result.steps.map((item) => <li key={item}>{item}</li>)}</ul>
					</div>
				) : null}
				{result.common_confusions?.length ? (
					<div className="lesson-study-list-section">
						<strong>Confuzii comune</strong>
						<ul>{result.common_confusions.map((item) => <li key={item}>{item}</li>)}</ul>
					</div>
				) : null}
				{result.takeaway && <p className="lesson-study-takeaway">{result.takeaway}</p>}
			</div>
		);
	};

	if (loading) {
		return (
			<div className="lesson-page-modern">
				<div className="lesson-page-loading">
					<div className="lesson-page-spinner"></div>
					<p>Se încarcă lecția...</p>
				</div>
			</div>
		);
	}

	if (error || !lesson) {
		return (
			<div className="lesson-page-modern">
				<div className="lesson-page-error">
					<div className="lesson-page-error-icon">
						<WarningCircle size={24} weight="duotone" aria-hidden />
					</div>
					<h2>{errorLocked ? 'Lecție blocată' : error ? 'Lecția nu s-a putut încărca' : 'Lecție negăsită'}</h2>
					<p>{error || 'Lecția nu a fost găsită.'}</p>
					<button
						className="lesson-page-btn lms-btn-primary lesson-page-btn-primary"
						onClick={() => navigate(`/courses/${courseId}`)}
					>
						Înapoi la curs
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="lesson-page-modern">
			<LessonPullRefresh onRefresh={() => fetchLessonData({ silent: true })} />
			<CourseCongratulationsModal
				open={showCourseCongrats}
				courseTitle={course?.title}
				onClose={handleCongratsClose}
			/>
			{/* Header */}
			<div className="lesson-page-header">
				<div className="lesson-page-header-content">
					<button 
						className="va-btn-back lesson-page-back-btn"
						onClick={() => navigate(`/courses/${courseId}`)}
					>
						<ArrowLeft size={20} weight="bold" aria-hidden />
						<span>Înapoi la curs</span>
					</button>
					
					{course && (
						<div className="lesson-page-course-info">
							<span className="lesson-page-course-name">{course.title}</span>
						</div>
					)}
				</div>
			</div>

			{/* Main Content */}
			<div className="lesson-page-content">
				<div className="lesson-page-main">
					{/* Lesson Header */}
					<div className="lesson-page-title-section">
						<h1 className="lesson-page-title">{lesson.title}</h1>
						{lesson.description && (
							<p className="lesson-page-description">{lesson.description}</p>
						)}
						<div className="lesson-page-meta">
							{lesson.content_type && (
								<div className="lesson-page-meta-item">
									<span className="lesson-page-type-badge">
										{getLessonTypeContent(lesson.content_type)}
									</span>
								</div>
							)}
						</div>
					</div>

					{/* Lesson Content */}
					<div className="lesson-page-body" ref={contentRef}>
						<LessonReadTrackers>
						{(() => {
							const blocks = lesson.content_blocks ?? lesson.contentBlocks ?? [];
							const hasBlocks = Array.isArray(blocks) && blocks.length > 0;
							const legacyHtml = lessonLegacyHtml(lesson);

							if (hasBlocks) {
								return (
									<div className="lesson-page-blocks">
										<LessonBlocksPreview blocks={blocks} variant="student" />
									</div>
								);
							}
							if (legacyHtml.trim()) {
								const html = normalizeRichTextMediaHtml(legacyHtml);
								return (
									<div
										className="lesson-page-content-text"
										dangerouslySetInnerHTML={{ __html: html }}
									/>
								);
							}
							return (
								<div className="lesson-page-empty-content">
									<div className="lesson-page-empty-icon">
										<FileText size={64} weight="duotone" aria-hidden />
									</div>
									<h3>Lecția nu are conținut configurat</h3>
									<p>Conținutul lecției va fi disponibil în curând.</p>
								</div>
							);
						})()}
						</LessonReadTrackers>
					</div>

					{user?.actualRole === 'admin' && user?.role === 'admin' && isVoltEnabled('ai_tutor') && (
					<section className="lesson-study-tools">
						<div className="lesson-study-header">
							<div>
								<span className="lesson-study-eyebrow">Formely AI Study Tools</span>
								<h2>Învață mai ușor lecția</h2>
								<p>Generează rezumat, explicații, flashcards, quiz sau plan de recapitulare din conținutul lecției.</p>
							</div>
						</div>

						<div className="lesson-study-actions">
							{STUDY_TOOL_OPTIONS.map((option) => (
								<button
									key={option.id}
									type="button"
									className="lesson-study-tool-btn"
									onClick={() => handleStudyTool(option.id)}
									disabled={Boolean(studyToolLoading)}
								>
									{studyToolLoading === option.id ? 'Se generează...' : option.label}
								</button>
							))}
						</div>

						{studyToolError ? (
							<div className="lesson-study-error" role="alert">{studyToolError}</div>
						) : null}

						{studyToolResult?.result ? (
							<div className="lesson-study-result">
								<div className="lesson-study-result-header">
									<h3>{studyToolResult.result.title || 'Rezultat Formely AI'}</h3>
									<span>{STUDY_TOOL_OPTIONS.find((option) => option.id === studyToolResult.tool)?.label || 'Formely AI'}</span>
								</div>
								{renderStudyToolResult()}
							</div>
						) : null}
					</section>
					)}

					<div className="lesson-page-actions" role="navigation" aria-label="Navigare lecții">
						<button type="button" className="lesson-page-btn lesson-page-btn-secondary" disabled={previousLessonTarget == null || finalizingCourse} onClick={() => navigate(`/courses/${courseId}/lessons/${previousLessonTarget}`)}><ArrowLeft size={20} weight="bold" aria-hidden /><span>Anterioară</span></button>
						<button
							type="button"
							className="lesson-page-btn lms-btn-primary lesson-page-btn-primary"
							disabled={finalizingCourse || !canAdvanceLesson}
							title={canAdvanceLesson ? undefined : 'Derulează până la finalul lecției'}
							onClick={isLastLessonInCourse ? handleFinalizeCourse : handleNext}
						>
							{isLastLessonInCourse ? (
								finalizingCourse ? (
									<span>Se procesează…</span>
								) : (
									<>
										<Check size={18} weight="bold" aria-hidden />
										<span>Urmează testul</span>
									</>
								)
							) : (
								<>
									<span>Următoarea lecție</span>
									<ArrowRight size={18} weight="bold" aria-hidden />
								</>
							)}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default LessonPage;
