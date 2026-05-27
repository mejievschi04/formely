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
import { getNextLessonIdAfter } from '../utils/lessonOrder';
import { useLessonTimeTracking } from '../hooks/useLessonTimeTracking';
import { isLessonMarkedComplete } from '../utils/lessonProgress';
import { scrollAppToTop } from '../utils/scrollToTop';
import { normalizeLessonFromApi, lessonLegacyHtml } from '../utils/lessonContent';
import './LessonPage.css';

const LESSON_MILESTONES = [25, 50, 75, 100];

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
	const [reachedMilestones, setReachedMilestones] = useState(() => new Set());

	useLessonTimeTracking(lessonId, {
		userId: user?.id,
		isCompleted,
		enabled: Boolean(user?.id && lessonId && !['admin', 'analyst'].includes(user?.actualRole || user?.role || '')),
	});

	const completeCurrentLesson = useCallback(async () => {
		if (!lessonId || isCompleted || !user?.id) return true;
		try {
			setIsCompleting(true);
			await courseProgressService.completeLesson(lessonId);
			setIsCompleted(true);
			return true;
		} catch (err) {
			const msg = err?.response?.data?.message || err?.message || 'Nu s-a putut marca lecția ca finalizată.';
			showToast(msg, 'error');
			return false;
		} finally {
			setIsCompleting(false);
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
		setReachedMilestones(new Set());
		sentMilestonesRef.current = new Set();
	}, [lessonId]);

	useEffect(() => {
		const pendingMilestones = LESSON_MILESTONES.filter(
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

	// Auto-complete on scroll
	useEffect(() => {
		if (!lesson || isCompleted || isCompleting) return;

	
		const checkCompletion = () => {
			if (isCompleted || isCompleting) return;

			const markers = Array.from(contentRef.current?.querySelectorAll('[data-lesson-milestone]') || []);
			if (!markers.length) return;

			const footerOffset = window.innerWidth <= 768 ? 72 : 0;
			const viewportBottom = window.innerHeight - footerOffset;
			const seen = [];

			markers.forEach((marker) => {
				const milestone = Number(marker.dataset.lessonMilestone);
				if (!Number.isFinite(milestone)) return;
				const rect = marker.getBoundingClientRect();
				if (rect.top <= viewportBottom) {
					seen.push(milestone);
				}
			});

			if (seen.length) {
				setReachedMilestones((prev) => {
					const next = new Set(prev);
					seen.forEach((value) => next.add(value));
					return next.size === prev.size ? prev : next;
				});
			}
		};

		// Throttle scroll events
		let ticking = false;
		const throttledScroll = () => {
			if (!ticking) {
				window.requestAnimationFrame(() => {
					checkCompletion();
					ticking = false;
				});
				ticking = true;
			}
		};

		const scrollRoot =
			contentRef.current?.closest('.va-shell-main') ||
			contentRef.current?.closest('.va-main');

		const onScroll = () => throttledScroll();
		if (scrollRoot) {
			scrollRoot.addEventListener('scroll', onScroll, { passive: true });
		}
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });

		const checkInitial = setTimeout(() => {
			checkCompletion();
		}, 500);

		if (contentRef.current) {
			checkCompletion();
		}

		return () => {
			if (scrollRoot) {
				scrollRoot.removeEventListener('scroll', onScroll);
			}
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onScroll);
			clearTimeout(checkInitial);
		};
	}, [lesson, isCompleted, isCompleting, reachedMilestones]);

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
					const progress = await courseProgressService.getCourseProgress(courseId);
					if (isLessonMarkedComplete(progress, lessonId)) {
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

	const nextLessonTarget = getNextLessonIdAfter(course?.modules, lessonId);
	const isLastLessonInCourse = nextLessonTarget === null;

	const handleNext = async () => {
		if (!isCompleted) {
			const ok = await completeCurrentLesson();
			if (!ok) return;
		}
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
						{LESSON_MILESTONES.map((milestone) => (
							<div
								key={`lesson-milestone-${milestone}`}
								className="lesson-progress-marker"
								data-lesson-milestone={milestone}
								style={{ top: `${milestone}%` }}
								aria-hidden="true"
							/>
						))}

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
					</div>

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
