import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
	ArrowLeft,
	ArrowRight,
	CaretDown,
	Check,
	FileText,
	List,
	NotePencil,
	WarningCircle,
	X,
} from '@phosphor-icons/react';
import { coursesService, courseProgressService, lessonsService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import LessonBlocksPreview from '../components/admin/content-blocks/LessonBlocksPreview';
import CourseCongratulationsModal from '../components/student/CourseCongratulationsModal';
import { getNextLessonIdAfter, getPreviousLessonIdBefore, getRootLessons } from '../utils/lessonOrder';
import {
	advanceAfterLessonComplete,
	courseResumeLessonId,
	getPendingEndOfCourseTestId,
	normalizeCourseProgressPayload,
} from '../utils/courseFlowNavigation';
import { normalizeRichTextMediaHtml } from '../utils/richTextContent';
import { useLessonTimeTracking } from '../hooks/useLessonTimeTracking';
import { filterPublishedCourseTests, isPublishedTestStatus } from '../utils/testVisibility';
import { isLessonMarkedComplete } from '../utils/lessonProgress';
import { scrollAppToTop } from '../utils/scrollToTop';
import { normalizeLessonFromApi, lessonLegacyHtml } from '../utils/lessonContent';
import { buildCourseModuleList } from '../utils/courseModuleDisplay';
import './LessonsPage.css';

const LESSON_MILESTONES = [25, 50, 75, 100];

const renderTestStatusIcon = (passed) => (
	passed ? <Check size={14} weight="bold" aria-hidden /> : <NotePencil size={14} weight="duotone" aria-hidden />
);

const LessonsPage = () => {
	const { courseId } = useParams();
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const { user } = useAuth();
	const { showToast } = useToast();
	const contentRef = useRef(null);
	const sentMilestonesRef = useRef(new Set());
	
	const [course, setCourse] = useState(null);
	const [modules, setModules] = useState([]);
	const courseModules = useMemo(
		() => [...(course?.modules || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
		[course?.modules],
	);
	const rootLessons = useMemo(() => getRootLessons(course), [course]);
	const [progress, setProgress] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [currentLesson, setCurrentLesson] = useState(null);
	const [currentLessonLoading, setCurrentLessonLoading] = useState(false);
	const [isCompleted, setIsCompleted] = useState(false);
	const [isCompleting, setIsCompleting] = useState(false);
	const [expandedModules, setExpandedModules] = useState(new Set());
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [showCourseCongrats, setShowCourseCongrats] = useState(false);
	const [finalizingCourse, setFinalizingCourse] = useState(false);
	const [reachedMilestones, setReachedMilestones] = useState(() => new Set());

	// Get lessonId from URL or auto-select first lesson
	const lessonIdFromUrl = searchParams.get('lesson');
	const [selectedLessonId, setSelectedLessonId] = useState(lessonIdFromUrl);

	useEffect(() => {
		document.body.classList.add('student-lesson-player');
		return () => document.body.classList.remove('student-lesson-player');
	}, []);

	useEffect(() => {
		const title = course?.title ? String(course.title) : '';
		window.dispatchEvent(new CustomEvent('formely-lesson-course-title', { detail: title }));
		return () => {
			window.dispatchEvent(new CustomEvent('formely-lesson-course-title', { detail: '' }));
		};
	}, [course?.title]);

	useEffect(() => {
		const openLessonsMenu = () => setSidebarOpen(true);
		window.addEventListener('formely-open-lessons-sidebar', openLessonsMenu);
		return () => window.removeEventListener('formely-open-lessons-sidebar', openLessonsMenu);
	}, []);

	useEffect(() => {
		if (courseId) {
			fetchCourseData();
		}
	}, [courseId]);

	useEffect(() => {
		if (lessonIdFromUrl && String(lessonIdFromUrl) !== String(selectedLessonId ?? '')) {
			setSelectedLessonId(lessonIdFromUrl);
		}
	}, [lessonIdFromUrl, selectedLessonId]);

	useEffect(() => {
		setReachedMilestones(new Set());
		sentMilestonesRef.current = new Set();
	}, [selectedLessonId]);

	// Reia progresul (next_lesson) sau prima lecție — nu reseta la prima după test
	useEffect(() => {
		if (!loading && (courseModules.length > 0 || rootLessons.length > 0) && !selectedLessonId && !lessonIdFromUrl) {
			const resumeId = courseResumeLessonId(progress, courseModules, rootLessons);
			if (resumeId) {
				setSelectedLessonId(String(resumeId));
				loadLesson(resumeId);
				const moduleContainingLesson = modules.find((m) =>
					m.lessons?.some((l) => Number(l.id) === Number(resumeId))
				);
				if (moduleContainingLesson) {
					setExpandedModules(new Set([moduleContainingLesson.id]));
				}
			}
		}
	}, [loading, courseModules, rootLessons, modules, selectedLessonId, lessonIdFromUrl, progress?.next_lesson?.id]);

	// Expand module containing lesson when loading from URL (?lesson=1)
	useEffect(() => {
		if (!loading && modules.length > 0 && selectedLessonId) {
			const lessonId = parseInt(selectedLessonId, 10);
			const moduleContainingLesson = modules.find(m => 
				m.lessons?.some(l => (l.id === lessonId || l.id === selectedLessonId))
			);
			if (moduleContainingLesson) {
				setExpandedModules(prev => new Set([...prev, moduleContainingLesson.id]));
			}
		}
	}, [loading, modules, selectedLessonId]);

	// Load lesson when selectedLessonId changes
	useEffect(() => {
		if (selectedLessonId && courseId) {
			loadLesson(selectedLessonId);
		}
	}, [selectedLessonId, courseId]);

	// ?lesson= nu schimbă pathname — ScrollToTop global nu rulează; resetăm manual
	useLayoutEffect(() => {
		if (!selectedLessonId || currentLessonLoading) return;
		scrollAppToTop({ behavior: 'instant' });
	}, [selectedLessonId, currentLessonLoading]);

	useEffect(() => {
		if (selectedLessonId && progress) {
			setIsCompleted(isLessonMarkedComplete(progress, selectedLessonId));
		}
	}, [progress, selectedLessonId]);

	const lessonReadyForTracking =
		Boolean(
			user?.id &&
				selectedLessonId &&
				!currentLessonLoading &&
				currentLesson &&
				Number(currentLesson.id) === Number(selectedLessonId)
		);

	useLessonTimeTracking(selectedLessonId, {
		userId: user?.id,
		isCompleted,
		enabled: lessonReadyForTracking && !['admin', 'analyst'].includes(user?.actualRole || user?.role || ''),
	});

	const fetchCourseData = async () => {
		try {
			setLoading(true);
			setError(null);
			
			const courseData = await coursesService.getById(courseId);
			setCourse(courseData);
			
			setModules(buildCourseModuleList(courseData, { withCourseTestFields: true }));
			
			// Fetch progress if user is enrolled
			if (user?.id) {
				try {
					const progressData = await courseProgressService.getCourseProgress(courseId);
					setProgress(progressData);
				} catch (err) {
					console.log('No progress data available');
				}
			}
		} catch (err) {
			console.error('Error fetching course:', err);
			setError('Nu s-a putut încărca cursul');
			showToast('Eroare la încărcarea cursului', 'error');
		} finally {
			setLoading(false);
		}
	};

	const loadLesson = async (lessonId) => {
		try {
			setCurrentLessonLoading(true);
			const lessonData = normalizeLessonFromApi(await lessonsService.getById(lessonId));
			setCurrentLesson(lessonData);
			
			setIsCompleted(user?.id ? isLessonMarkedComplete(progress, lessonId) : false);
			
			// Update URL without navigation
			window.history.replaceState({}, '', `/courses/${courseId}?lesson=${lessonId}`);
		} catch (err) {
			console.error('Error loading lesson:', err);
			showToast('Eroare la încărcarea lecției', 'error');
		} finally {
			setCurrentLessonLoading(false);
		}
	};

	const handleLessonClick = (lessonId) => {
		setSelectedLessonId(lessonId);
		setSidebarOpen(false); // Close sidebar on mobile when selecting lesson
		scrollAppToTop({ behavior: 'instant' });
	};

	const toggleModule = (moduleId) => {
		const newExpanded = new Set(expandedModules);
		if (newExpanded.has(moduleId)) {
			newExpanded.delete(moduleId);
		} else {
			newExpanded.add(moduleId);
		}
		setExpandedModules(newExpanded);
	};

	const refreshCourseProgress = useCallback(async () => {
		if (!user?.id || !courseId) return null;
		try {
			const progressData = await courseProgressService.getCourseProgress(courseId);
			setProgress(progressData);
			return progressData;
		} catch {
			return null;
		}
	}, [courseId, user?.id]);

	const completeCurrentLesson = useCallback(async () => {
		if (!selectedLessonId || !user?.id) return null;
		if (isCompleted) return { progress };
		try {
			setIsCompleting(true);
			const result = await courseProgressService.completeLesson(selectedLessonId);
			setIsCompleted(true);
			if (result?.progress) {
				setProgress(result.progress);
			} else {
				await refreshCourseProgress();
			}
			return result;
		} catch (err) {
			const msg = err?.response?.data?.message || err?.message || 'Nu s-a putut marca lecția ca finalizată.';
			showToast(msg, 'error');
			return null;
		} finally {
			setIsCompleting(false);
		}
	}, [selectedLessonId, isCompleted, user?.id, progress, refreshCourseProgress, showToast]);

	const isLessonCompleted = (lessonId) => isLessonMarkedComplete(progress, lessonId);

	const getModuleProgress = (module) => {
		if (!progress || !module.lessons) return { completed: 0, total: 0, percentage: 0 };
		
		const total = module.lessons.length;
		const completed = module.lessons.filter(lesson => isLessonCompleted(lesson.id)).length;
		const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
		
		return { completed, total, percentage };
	};

	const getModuleCourseTests = (m) =>
		filterPublishedCourseTests(m?.course_tests || m?.courseTests || []);
	const getCourseLevelTests = () =>
		filterPublishedCourseTests(course?.course_tests || course?.courseTests || []);
	const getLessonCourseTests = (l) => filterPublishedCourseTests(l?.course_tests || l?.courseTests || []);
	const getProgressModule = (moduleId) =>
		progress?.modules?.find((x) => Number(x.id) === Number(moduleId));
	const getLessonTestProgress = (moduleId, lessonId, testId) => {
		const mod = getProgressModule(moduleId);
		const les = mod?.lessons?.find((x) => Number(x.id) === Number(lessonId));
		return les?.tests?.find((t) => Number(t.test_id) === Number(testId));
	};
	const getModuleTestProgress = (moduleId, testId) => {
		const mod = getProgressModule(moduleId);
		return mod?.tests?.find((t) => Number(t.test_id) === Number(testId));
	};
	const getCourseLevelTestProgress = (testId) =>
		progress?.course_level_tests?.find((t) => Number(t.test_id) === Number(testId));

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
					const response = await courseProgressService.updateLessonProgress(selectedLessonId, {
						milestone,
						milestone_reached: milestone,
						progress_percentage: milestone,
						completed: milestone >= 100,
					});

					if (cancelled) return;

					if (response?.completed || response?.auto_completed || milestone >= 100) {
						setIsCompleted(true);
						if (user?.id && !cancelled) {
							await refreshCourseProgress();
						}
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
	}, [selectedLessonId, reachedMilestones, courseId, user?.id, refreshCourseProgress]);

	// Scroll milestones — only for the lesson we're actually viewing
	useEffect(() => {
		if (!currentLesson || isCompleted || isCompleting) return;
		// Must match: avoid completing the wrong lesson when switching (selectedLessonId updates before currentLesson)
		if (currentLesson.id !== selectedLessonId) return;

	
		const checkCompletion = () => {
			if (isCompleted || isCompleting) return;
			if (currentLesson?.id !== selectedLessonId) return;

			const markers = Array.from(contentRef.current?.querySelectorAll('[data-lesson-milestone]') || []);
			if (!markers.length) return;

			const footerOffset = window.matchMedia('(max-width: 768px)').matches ? 72 : 0;
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
	}, [currentLesson, selectedLessonId, isCompleted, isCompleting, reachedMilestones]);

	const handleNextLesson = async () => {
		let progressPayload = null;
		if (!isCompleted) {
			progressPayload = await completeCurrentLesson();
			if (progressPayload === null) return;
		}
		const payload = progressPayload ?? progress;
		const nextId = getNextLessonIdAfter(courseModules, selectedLessonId, rootLessons);
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
			lessonId: selectedLessonId,
			modules: courseModules,
			rootLessons,
			navigate,
			progressPayload: examId
				? { ...normalizeCourseProgressPayload(payload), next_exam: { id: examId } }
				: payload,
			lessonPageMode: false,
			onCongrats: () => setShowCourseCongrats(true),
			onFinalize: handleFinalizeCourse,
		});
	};

	const handlePreviousLesson = () => {
		const prevId = getPreviousLessonIdBefore(courseModules, selectedLessonId, rootLessons);
		if (prevId != null && !Number.isNaN(prevId)) {
			handleLessonClick(prevId);
		}
	};

	const handleFinalizeCourse = async () => {
		if (finalizingCourse) return;
		setFinalizingCourse(true);
		try {
			if (!user?.id) {
				navigate(`/courses/${courseId}`);
				return;
			}
			if (selectedLessonId && !isCompleted) {
				const ok = await completeCurrentLesson();
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

	if (loading) {
		return (
			<div className="lessons-page-modern">
				<div className="lessons-page-loading">
					<div className="lessons-page-spinner"></div>
					<p>Se încarcă cursul...</p>
				</div>
			</div>
		);
	}

	if (error || !course) {
		return (
			<div className="lessons-page-modern">
				<div className="lessons-page-error">
					<div className="lessons-page-error-icon">
						<WarningCircle size={24} weight="duotone" aria-hidden />
					</div>
					<h2>Eroare</h2>
					<p>{error || 'Cursul nu a fost găsit'}</p>
					<button
						className="lessons-page-btn lessons-page-btn-primary"
						onClick={() => navigate('/courses')}
					>
						Înapoi la cursuri
					</button>
				</div>
			</div>
		);
	}

	const totalLessons = rootLessons.length + courseModules.reduce((sum, module) => sum + (module.lessons?.length || 0), 0);
	const hasMultipleLessons = totalLessons > 1;
	const nextLessonTarget = selectedLessonId ? getNextLessonIdAfter(courseModules, selectedLessonId, rootLessons) : undefined;
	const previousLessonTarget = selectedLessonId ? getPreviousLessonIdBefore(courseModules, selectedLessonId, rootLessons) : undefined;
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
	const hasPreviousLesson = previousLessonTarget != null && !Number.isNaN(previousLessonTarget);
	const hasNextLesson =
		(typeof nextLessonTarget === 'number' && !Number.isNaN(nextLessonTarget)) || Boolean(pendingExamId);
	const nextButtonLabel = pendingExamId
		? 'Continuă la test'
		: typeof nextLessonTarget === 'number'
			? 'Lecția următoare'
			: 'Continuă';

	return (
		<div className={`lessons-page-modern lessons-page-player-layout ${sidebarOpen ? 'lessons-page-sidebar-open' : ''}`}>
			<CourseCongratulationsModal
				open={showCourseCongrats}
				courseTitle={course?.title}
				onClose={handleCongratsClose}
			/>
			{/* Mobile overlay when sidebar open */}
			{sidebarOpen && (
				<div 
					className="lessons-page-sidebar-overlay" 
					onClick={() => setSidebarOpen(false)}
					aria-hidden="true"
				/>
			)}
			{/* Sidebar - Lessons Menu */}
			<aside className="lessons-page-sidebar">
				<div className="lessons-page-sidebar-header">
					<div className="lessons-page-sidebar-header-actions">
						<button 
							className="lessons-page-sidebar-back-btn"
							onClick={() => navigate(-1)}
						>
							<ArrowLeft size={20} weight="bold" aria-hidden />
							<span>Înapoi</span>
						</button>
						<button 
							className="lessons-page-sidebar-close-btn"
							onClick={() => setSidebarOpen(false)}
							aria-label="Închide meniul"
						>
							<X size={24} weight="bold" aria-hidden />
						</button>
					</div>
					<h2 className="lessons-page-sidebar-title">{course.title}</h2>
					{progress && (
						<div className="lessons-page-sidebar-progress">
							<div className="lessons-page-sidebar-progress-bar">
								<div 
									className="lessons-page-sidebar-progress-fill" 
									style={{ width: `${progress.progress_percentage || 0}%` }}
								></div>
							</div>
							<span className="lessons-page-sidebar-progress-text">
								{progress.progress_percentage || 0}% completat
							</span>
						</div>
					)}
				</div>

				<div className="lessons-page-sidebar-content">
					{modules.length > 0 ? (
						<div className="lessons-page-sidebar-modules">
							{modules.map((module, moduleIndex) => {
								const isModuleExpanded = expandedModules.has(module.id);
								const sortedLessons = (module.lessons || []).sort((a, b) => (a.order || 0) - (b.order || 0));
								const isActive = selectedLessonId && sortedLessons.some(l => l.id === selectedLessonId);
								const showLessons = module.hideGroupHeader || isModuleExpanded;

								return (
									<div
										key={module.id}
										className={`lessons-page-sidebar-module ${module.hideGroupHeader ? 'lessons-page-sidebar-module--flat' : ''} ${isActive ? 'active' : ''}`}
									>
										{!module.hideGroupHeader && (
											<button
												type="button"
												className={`lessons-page-sidebar-module-header ${isModuleExpanded ? 'expanded' : ''}`}
												onClick={() => toggleModule(module.id)}
											>
												<div className="lessons-page-sidebar-module-info">
													<span className="lessons-page-sidebar-module-number">
														{module.isRootLessonGroup ? '•' : moduleIndex + 1}
													</span>
													<span className="lessons-page-sidebar-module-title">{module.title}</span>
												</div>
												<CaretDown
													className={`lessons-page-sidebar-module-arrow ${isModuleExpanded ? 'expanded' : ''}`}
													size={16}
													weight="bold"
													aria-hidden
												/>
											</button>
										)}

										{showLessons && (
											<div className="lessons-page-sidebar-lessons">
												{sortedLessons.map((lesson, lessonIndex) => {
													const isCompleted = isLessonCompleted(lesson.id);
													const isActive = selectedLessonId === lesson.id;
													const lessonTests = getLessonCourseTests(lesson);

													return (
														<Fragment key={lesson.id}>
															<button
																type="button"
																className={`lessons-page-sidebar-lesson ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
																onClick={() => handleLessonClick(lesson.id)}
															>
																<div className="lessons-page-sidebar-lesson-icon">
																	{isCompleted ? (
																		<Check size={16} weight="bold" aria-hidden />
																	) : (
																		<span>{lessonIndex + 1}</span>
																	)}
																</div>
																<span className="lessons-page-sidebar-lesson-title">{lesson.title}</span>
															</button>
															{lessonTests.map((ct) => {
																const testId = ct.test_id ?? ct.test?.id;
																if (!testId) return null;
																const tp = getLessonTestProgress(module.id, lesson.id, testId);
																const passed = Boolean(tp?.passed);
																return (
																	<button
																		key={`lesson-${lesson.id}-test-${testId}`}
																		type="button"
																		className={`lessons-page-sidebar-lesson lessons-page-sidebar-test lessons-page-sidebar-nested-test ${passed ? 'completed' : ''}`}
																		onClick={() => navigate(`/courses/${courseId}/exams/${testId}`)}
																	>
																		<div className="lessons-page-sidebar-lesson-icon">{renderTestStatusIcon(passed)}</div>
																		<span className="lessons-page-sidebar-lesson-title">
																			{ct.test?.title || 'Test'}
																			{ct.required ? ' *' : ''}
																		</span>
																	</button>
																);
															})}
														</Fragment>
													);
												})}
												{/* Module-level tests (API: course_tests snake_case) */}
												{getModuleCourseTests(module).map((ct) => {
													const testId = ct.test_id ?? ct.test?.id;
													if (!testId) return null;
													const tp = getModuleTestProgress(module.id, testId);
													const passed = Boolean(tp?.passed);
													return (
														<button
															key={`mod-test-${testId}`}
															type="button"
															className={`lessons-page-sidebar-lesson lessons-page-sidebar-test ${passed ? 'completed' : ''}`}
															onClick={() => navigate(`/courses/${courseId}/exams/${testId}`)}
														>
															<div className="lessons-page-sidebar-lesson-icon">{renderTestStatusIcon(passed)}</div>
															<span className="lessons-page-sidebar-lesson-title">
																{ct.test?.title || 'Test'}
																{ct.required ? ' *' : ''}
															</span>
														</button>
													);
												})}
											</div>
										)}
									</div>
								);
							})}
						</div>
					) : (
						<div className="lessons-page-sidebar-empty">
							<p>Nu există lecții disponibile</p>
						</div>
					)}
					{/* Course-level tests (doar Test / course_test — nu examene Admin → Examene) */}
					{getCourseLevelTests().length > 0 && (
						<div className="lessons-page-sidebar-tests-section">
							<div className="lessons-page-sidebar-tests-header">Teste la nivel de curs</div>
							<p className="lessons-page-sidebar-tests-hint">Teste din curs. Examenele independente sunt în Cursuri → Examene.</p>
							{getCourseLevelTests().map((ct) => {
								const testId = ct.test_id ?? ct.test?.id;
								if (!testId) return null;
								const tp = getCourseLevelTestProgress(testId);
								const passed = Boolean(tp?.passed);
								return (
									<button
										key={`course-test-${testId}`}
										type="button"
										className={`lessons-page-sidebar-lesson lessons-page-sidebar-test ${passed ? 'completed' : ''}`}
										onClick={() => navigate(`/courses/${courseId}/exams/${testId}`)}
									>
										<div className="lessons-page-sidebar-lesson-icon">{renderTestStatusIcon(passed)}</div>
										<span className="lessons-page-sidebar-lesson-title">
											{ct.test?.title || 'Test'}
											{ct.required ? ' *' : ''}
										</span>
									</button>
								);
							})}
						</div>
					)}
				</div>
			</aside>

			{/* Main Content - Lesson Viewer */}
			<main className="lessons-page-main-content">
				{/* Mobile: toggle sidebar button */}
				<button
					type="button"
					className="lessons-page-sidebar-toggle"
					onClick={() => setSidebarOpen(true)}
					aria-label="Deschide meniul lecțiilor"
				>
					<List size={24} weight="bold" aria-hidden />
					<span>Lecții</span>
				</button>
				{currentLessonLoading ? (
					<div className="lessons-page-lesson-loading">
						<div className="lessons-page-spinner"></div>
						<p>Se încarcă lecția...</p>
					</div>
				) : currentLesson ? (
					<div className="lessons-page-lesson-viewer">
						{/* Lesson Header */}
						<div className="lessons-page-lesson-header">
							<h1 className="lessons-page-lesson-viewer-title">{currentLesson.title}</h1>
							{currentLesson.description && (
								<p className="lessons-page-lesson-viewer-description">{currentLesson.description}</p>
							)}
						</div>

						{/* Lesson Content */}
						<div className="lessons-page-lesson-body" ref={contentRef}>
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
								const blocks = currentLesson.content_blocks ?? currentLesson.contentBlocks ?? [];
								const hasBlocks = Array.isArray(blocks) && blocks.length > 0;
								const legacyHtml = lessonLegacyHtml(currentLesson);

								if (hasBlocks) {
									return (
										<div className="lessons-page-lesson-blocks">
											<LessonBlocksPreview blocks={blocks} variant="student" />
										</div>
									);
								}
								if (legacyHtml.trim()) {
									return (
										<div
											className="lessons-page-lesson-content-text"
											dangerouslySetInnerHTML={{ __html: normalizeRichTextMediaHtml(legacyHtml) }}
										/>
									);
								}
								return (
									<div className="lessons-page-empty-content">
										<div className="lessons-page-empty-icon">
											<FileText size={64} weight="duotone" aria-hidden />
										</div>
										<h3>Lecția nu are conținut configurat</h3>
										<p>Conținutul lecției va fi disponibil în curând.</p>
									</div>
								);
							})()}
						</div>

						<div
							className={[
								'lessons-page-lesson-actions',
								hasMultipleLessons ? 'lessons-page-lesson-actions--nav' : '',
							]
								.filter(Boolean)
								.join(' ')}
						>
							{hasMultipleLessons ? (
								<>
									<button
										type="button"
										className="lessons-page-nav-btn lessons-page-nav-btn--prev"
										disabled={!hasPreviousLesson || isCompleting || finalizingCourse}
										onClick={handlePreviousLesson}
										aria-label="Lecția anterioară"
										title="Lecția anterioară"
									>
										<ArrowLeft size={22} weight="bold" aria-hidden />
										<span className="lessons-page-nav-btn__label">Lecția anterioară</span>
									</button>
									{isLastLessonInCourse ? (
										<button
											className="lessons-page-btn lessons-page-btn-primary lessons-page-lesson-cta lessons-page-lesson-cta--finalize"
											type="button"
											disabled={finalizingCourse || isCompleting}
											onClick={handleFinalizeCourse}
										>
											{finalizingCourse ? (
												<span>Se procesează…</span>
											) : (
												<>
													<Check size={16} weight="bold" aria-hidden />
													<span>Finalizează</span>
												</>
											)}
										</button>
									) : (
										<button
											type="button"
											className="lessons-page-nav-btn lessons-page-nav-btn--next"
											disabled={!hasNextLesson || isCompleting || finalizingCourse}
											onClick={handleNextLesson}
											aria-label="Lecția următoare"
											title="Lecția următoare"
										>
											<span className="lessons-page-nav-btn__label">{nextButtonLabel}</span>
											<ArrowRight size={22} weight="bold" aria-hidden />
										</button>
									)}
								</>
							) : (
								<button
									className="lessons-page-btn lessons-page-btn-primary lessons-page-lesson-cta"
									type="button"
									disabled={finalizingCourse || isCompleting}
									onClick={handleFinalizeCourse}
								>
									{finalizingCourse ? (
										<span>Se procesează…</span>
									) : (
										<>
											<Check size={16} weight="bold" aria-hidden />
											<span>Finalizează</span>
										</>
									)}
								</button>
							)}
						</div>
					</div>
				) : (
					<div className="lessons-page-no-lesson">
						<div className="lessons-page-empty-icon">
							<FileText size={64} weight="duotone" aria-hidden />
						</div>
						<h3>Selectează o lecție</h3>
						<p>Selectează o lecție din meniul din stânga pentru a începe.</p>
					</div>
				)}
			</main>
		</div>
	);
};

export default LessonsPage;
