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
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import LessonBlocksPreview from '../components/admin/content-blocks/LessonBlocksPreview';
import CourseCongratulationsModal from '../components/student/CourseCongratulationsModal';
import LessonTutorChat from '../components/student/LessonTutorChat';
import { companyHasFeature } from '../utils/entitlements';
import { canUseAiFeature } from '../utils/aiAvailability';
import LessonReadTrackers from '../components/student/LessonReadTrackers';
import { getNextLessonIdAfter, getRootLessons } from '../utils/lessonOrder';
import {
	advanceAfterLessonComplete,
	getPendingEndOfCourseTestId,
	normalizeCourseProgressPayload,
} from '../utils/courseFlowNavigation';
import { useLessonTimeTracking } from '../hooks/useLessonTimeTracking';
import { useLessonReadCompletion } from '../hooks/useLessonReadCompletion';
import { LESSON_READ_MILESTONES } from '../utils/lessonReadCompletion';
import { isLessonMarkedComplete } from '../utils/lessonProgress';
import { scrollAppToTop } from '../utils/scrollToTop';
import { normalizeLessonFromApi, lessonLegacyHtml } from '../utils/lessonContent';
import './LessonPage.css';

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
	const sentMilestonesRef = useRef(new Set());
	
	const [lesson, setLesson] = useState(null);
	const [course, setCourse] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [isCompleted, setIsCompleted] = useState(false);
	const [isCompleting, setIsCompleting] = useState(false);
	const [showCourseCongrats, setShowCourseCongrats] = useState(false);
	const [finalizingCourse, setFinalizingCourse] = useState(false);
	const [progress, setProgress] = useState(null);
	const [studyToolLoading, setStudyToolLoading] = useState('');
	const [studyToolResult, setStudyToolResult] = useState(null);
	const [studyToolError, setStudyToolError] = useState('');

	useEffect(() => {
		setStudyToolResult(null);
		setStudyToolError('');
		setStudyToolLoading('');
	}, [lessonId]);

	useLessonTimeTracking(lessonId, {
		userId: user?.id,
		isCompleted,
		enabled: Boolean(user?.id && lessonId && !['admin', 'analyst'].includes(user?.actualRole || user?.role || '')),
	});

	const { reachedMilestones } = useLessonReadCompletion({
		contentRef,
		lessonId,
		enabled: Boolean(lesson && user?.id && !isCompleted && !isCompleting && !loading),
	});

	const completeCurrentLesson = useCallback(async () => {
		if (!lessonId || isCompleted || !user?.id) return { ok: true, payload: null };
		try {
			setIsCompleting(true);
			const result = await courseProgressService.completeLesson(lessonId);
			setIsCompleted(true);
			if (result?.progress) {
				setProgress(result.progress);
			}
			return { ok: true, payload: result };
		} catch (err) {
			const msg = err?.response?.data?.message || err?.message || 'Nu s-a putut marca lecția ca finalizată.';
			showToast(msg, 'error');
			return { ok: false, payload: null };
		} finally {
			setIsCompleting(false);
		}
	}, [lessonId, isCompleted, user?.id, showToast]);

	useEffect(() => {
		if (lessonId && courseId) {
			fetchLessonData();
		}
	}, [lessonId, courseId]);

	useEffect(() => {
		document.body.classList.add('student-lesson-player');
		return () => document.body.classList.remove('student-lesson-player');
	}, []);

	useLayoutEffect(() => {
		if (!lessonId || loading) return;
		scrollAppToTop({ behavior: 'instant' });
	}, [lessonId, loading]);

	useEffect(() => {
		setReachedMilestones(new Set());
		sentMilestonesRef.current = new Set();
	}, [lessonId]);

	useEffect(() => {
		const pendingMilestones = LESSON_READ_MILESTONES.filter(
			(milestone) => reachedMilestones.has(milestone) && !sentMilestonesRef.current.has(milestone)
		);

		if (!pendingMilestones.length) return;

		pendingMilestones.forEach((milestone) => sentMilestonesRef.current.add(milestone));

		let cancelled = false;

		const syncMilestones = async () => {
			for (const milestone of pendingMilestones) {
				try {
					const response = await courseProgressService.updateLessonProgress(lessonId, {
						milestone,
						milestone_reached: milestone,
						progress_percentage: milestone,
						completed: milestone >= 100,
					});

					if (cancelled) return;

					if (response?.completed || response?.auto_completed || milestone >= 100) {
						setIsCompleted(true);
					}
				} catch (err) {
					if (cancelled) return;
					sentMilestonesRef.current.delete(milestone);
				}
			}
		};

		syncMilestones();

		return () => {
			cancelled = true;
		};
	}, [lessonId, reachedMilestones]);

	const fetchLessonData = async () => {
		try {
			setLoading(true);
			setError(null);
			
			// Fetch lesson
			const lessonData = normalizeLessonFromApi(await lessonsService.getById(lessonId));
			setLesson(lessonData);
			
			// Fetch course for context
			try {
				const courseData = await coursesService.getById(courseId);
				setCourse(courseData);
			} catch (err) {
				console.log('Could not fetch course data');
			}
			
			// Check if lesson is already completed
			if (user?.id) {
				try {
					const progressData = await courseProgressService.getCourseProgress(courseId);
					setProgress(progressData);
					if (isLessonMarkedComplete(progressData, lessonId)) {
						setIsCompleted(true);
					}
				} catch (err) {
					console.log('Could not fetch progress data');
				}
			}
		} catch (err) {
			console.error('Error fetching lesson:', err);
			setError('Nu s-a putut încărca lecția');
			showToast('Eroare la încărcarea lecției', 'error');
		} finally {
			setLoading(false);
		}
	};

	const courseModules = [...(course?.modules || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
	const rootLessons = getRootLessons(course);
	const nextLessonTarget = getNextLessonIdAfter(courseModules, lessonId, rootLessons);
	const progressSnapshot = normalizeCourseProgressPayload(progress);
	const pendingExamId =
		progressSnapshot?.next_exam?.id ||
		(nextLessonTarget === null
			? getPendingEndOfCourseTestId({
					course,
					modules: courseModules,
					rootLessons,
					progress: progressSnapshot,
				})
			: null);
	const isLastLessonInCourse = nextLessonTarget === null && !pendingExamId;
	const nextButtonLabel = pendingExamId
		? 'Continuă la test'
		: typeof nextLessonTarget === 'number'
			? 'Lecția următoare'
			: 'Continuă';

	const handleNext = async () => {
		let progressPayload = null;
		if (!isCompleted) {
			const { ok, payload } = await completeCurrentLesson();
			if (!ok) return;
			progressPayload = payload;
		}
		const payload = progressPayload;
		const nextId = getNextLessonIdAfter(courseModules, lessonId, rootLessons);
		const examId =
			payload?.next_exam?.id ||
			(nextId === null
				? getPendingEndOfCourseTestId({
						course,
						modules: courseModules,
						rootLessons,
						progress: payload,
					})
				: null);
		await advanceAfterLessonComplete({
			courseId,
			lessonId,
			modules: courseModules,
			rootLessons,
			navigate,
			progressPayload: examId
				? { ...normalizeCourseProgressPayload(payload), next_exam: { id: examId } }
				: payload,
			lessonPageMode: true,
			onCongrats: () => setShowCourseCongrats(true),
			onFinalize: handleFinalizeCourse,
		});
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
				const { ok } = await completeCurrentLesson();
				if (!ok) return;
			}
			const p = await courseProgressService.getCourseProgress(courseId);
			setProgress(p);
			const pendingId =
				p?.next_exam?.id ||
				getPendingEndOfCourseTestId({
					course,
					modules: courseModules,
					rootLessons,
					progress: p,
				});
			if (pendingId) {
				navigate(`/courses/${courseId}/exams/${pendingId}`);
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
					{(result.flashcards || result.cards || []).map((card, index) => (
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
						<div className="lesson-study-question" key={`${question.question || question.prompt}-${index}`}>
							<strong>{index + 1}. {question.question || question.prompt}</strong>
							<ul>
								{(question.options || []).map((option, optionIndex) => (
									<li key={`${option}-${optionIndex}`} className={optionIndex === question.correct_index ? 'is-correct' : ''}>
										{option}
									</li>
								))}
							</ul>
							{question.correct_answer ? <p className="lesson-study-answer">Răspuns: {question.correct_answer}</p> : null}
							{question.explanation && <p>{question.explanation}</p>}
						</div>
					))}
				</div>
			);
		}

		if (studyToolResult.tool === 'study_plan') {
			return (
				<div className="lesson-study-plan">
					{result.overview ? <p>{result.overview}</p> : null}
					{(result.steps || []).map((step, index) => (
						<div className="lesson-study-plan-step" key={`${step.label || step.title}-${index}`}>
							<span>{step.minutes ? `${step.minutes} min` : `${index + 1}`}</span>
							<div>
								<strong>{step.label || step.title}</strong>
								<p>{step.instruction || step.action}</p>
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
				{result.overview && !result.summary && <p>{result.overview}</p>}
				{result.simple_explanation && <p>{result.simple_explanation}</p>}
				{result.analogy && <p><strong>Analogic:</strong> {result.analogy}</p>}
				{result.key_points?.length ? (
					<div className="lesson-study-list-section">
						<strong>Idei cheie</strong>
						<ul>{result.key_points.map((item) => <li key={item}>{item}</li>)}</ul>
					</div>
				) : null}
				{result.steps?.length && typeof result.steps[0] === 'string' ? (
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
					<h2>Eroare</h2>
					<p>{error || 'Lecția nu a fost găsită'}</p>
					<button
						className="lesson-page-btn lesson-page-btn-primary"
						onClick={() => navigate(`/courses/${courseId}`)}
					>
						Înapoi la curs
					</button>
				</div>
			</div>
		);
	}

	const isStudentLearner = user?.id && !['admin', 'analyst'].includes(user?.actualRole || user?.role || '');
	const tutorEnabled = course?.settings?.ai_tutor?.enabled !== false
		&& companyHasFeature(user, 'ai_tutor')
		&& canUseAiFeature(user, 'ai_tutor');

	return (
		<div className="lesson-page-modern">
			<CourseCongratulationsModal
				open={showCourseCongrats}
				courseTitle={course?.title}
				onClose={handleCongratsClose}
			/>
			{/* Header */}
			<div className="lesson-page-header">
				<div className="lesson-page-header-content">
					<button 
						className="lesson-page-back-btn"
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

					{tutorEnabled ? (
					<section className="lesson-study-tools">
						<div className="lesson-study-header">
							<div>
								<span className="lesson-study-eyebrow">Formely Study Tools</span>
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
									<span>{STUDY_TOOL_OPTIONS.find((option) => option.id === studyToolResult.tool)?.label || 'AI'}</span>
								</div>
								{renderStudyToolResult()}
							</div>
						) : null}
					</section>
					) : null}

					<div className="lesson-page-actions">
						{isCompleted && (
							<div className="lesson-page-completed-badge">
								<Check size={20} weight="bold" aria-hidden />
								<span>Lecție completată</span>
							</div>
						)}
						
						<button
							type="button"
							className="lesson-page-btn lesson-page-btn-secondary"
							disabled={finalizingCourse}
							onClick={isLastLessonInCourse ? handleFinalizeCourse : handleNext}
						>
							{isLastLessonInCourse ? (
								finalizingCourse ? (
									<span>Se procesează…</span>
								) : (
									<>
										<Check size={18} weight="bold" aria-hidden />
										<span>Finalizează</span>
									</>
								)
							) : (
								<>
									<span>{nextButtonLabel}</span>
									<ArrowRight size={18} weight="bold" aria-hidden />
								</>
							)}
						</button>
					</div>
				</div>
			</div>
			{isStudentLearner ? (
				<LessonTutorChat
					lessonId={Number(lessonId)}
					courseId={Number(courseId)}
					courseTitle={course?.title}
					lessonTitle={lesson?.title}
					enabled={tutorEnabled}
				/>
			) : null}
		</div>
	);
};

export default LessonPage;
