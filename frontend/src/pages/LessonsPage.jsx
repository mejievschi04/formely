import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, Fragment, useMemo } from 'react';
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

import { useAuth } from '../contexts/AuthContextShared.js';

import { useToast } from '../contexts/ToastContextShared.js';
import LessonBlocksPreview from '../components/admin/content-blocks/LessonBlocksPreview';
import CourseCongratulationsModal from '../components/student/CourseCongratulationsModal';
import { getLessonPosition, getNextLessonIdAfter, getPreviousLessonIdBefore, getRootLessons } from '../utils/lessonOrder';
import { normalizeRichTextMediaHtml } from '../utils/richTextContent';
import { useLessonTimeTracking } from '../hooks/useLessonTimeTracking';
import { useLessonReachedEnd } from '../hooks/useLessonReachedEnd';
import LessonReadTrackers from '../components/student/LessonReadTrackers';
import LessonPullRefresh from '../components/student/LessonPullRefresh';
import { filterPublishedCourseTests, isPublishedTestStatus } from '../utils/testVisibility';
import { isLessonMarkedComplete, preserveCompletedLessons } from '../utils/lessonProgress';
import { scrollAppToTop } from '../utils/scrollToTop';
import { normalizeLessonFromApi, lessonLegacyHtml } from '../utils/lessonContent';
import './LessonsPage.css';
import '../components/admin/lessons/callout/LessonCallout.css';
import { logger } from '../utils/logger';
import { courseProgressLabel } from '../utils/courseProgressLabel.js';

const renderTestStatusIcon = (passed) => (
	passed ? <Check size={14} weight="bold" aria-hidden /> : <NotePencil size={14} weight="duotone" aria-hidden />
);

const renderLessonIndexIcon = (index, completed) => (
	<div className={`lessons-page-sidebar-lesson-icon${completed ? ' has-check' : ''}`}>
		<span>{index + 1}</span>
		{completed ? <Check className="lessons-page-sidebar-lesson-check" size={11} weight="bold" aria-hidden /> : null}
	</div>
);

const LessonsPage = () => {
	const { courseId } = useParams();
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const { user } = useAuth();
	const isPlayerStaff = ['admin', 'instructor', 'analyst'].includes(user?.actualRole || user?.role || '');
	// La previzualizare, staff-ul vede și testele ciornă atașate (marcate „Ciornă”), ca să le poată deschide.
	const courseFetchParams = isPlayerStaff ? { include_draft_tests: 1 } : {};
	const isTestVisibleInPlayer = (status) => isPlayerStaff || isPublishedTestStatus(status);
	const testDraftSuffix = (status) => (isPublishedTestStatus(status) ? '' : ' · Ciornă');
	const { showToast } = useToast();
	const contentRef = useRef(null);
	const completedLessonIdsRef = useRef(new Set());

	const [course, setCourse] = useState(null);
	const modules = useMemo(
		() => [...(course?.modules || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
		[course?.modules]
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

	// Get lessonId from URL or auto-select first lesson
	const lessonIdFromUrl = searchParams.get('lesson');
	const [selectedLessonId, setSelectedLessonId] = useState(lessonIdFromUrl);

	useEffect(() => {
		if (courseId) {
			fetchCourseData();
		}
	}, [courseId]);

	useEffect(() => {
		setIsCompleted(false);
	}, [selectedLessonId]);

	// Auto-open first lesson when course loads (no lesson in URL)
	useEffect(() => {
		if (!loading && !selectedLessonId) {
			const firstRootLesson = rootLessons[0];
			if (firstRootLesson) {
				setSelectedLessonId(firstRootLesson.id);
				loadLesson(firstRootLesson.id);
				return;
			}
			const firstModule = modules[0];
			if (firstModule?.lessons?.length > 0) {
				const sortedLessons = [...firstModule.lessons].sort((a, b) => (a.order || 0) - (b.order || 0));
				const firstLesson = sortedLessons[0];
				if (firstLesson) {
					setSelectedLessonId(firstLesson.id);
					loadLesson(firstLesson.id);
					setExpandedModules(new Set([firstModule.id]));
				}
			}
		}
	}, [loading, modules, rootLessons, selectedLessonId]);

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

	const reachedEnd = useLessonReachedEnd({
		contentRef,
		lessonId: selectedLessonId,
		enabled: lessonReadyForTracking,
	});
	const canAdvanceLesson = reachedEnd;

	const fetchCourseData = async () => {
		try {
			setLoading(true);
			setError(null);
			
			const courseData = await coursesService.getById(courseId, courseFetchParams);
			setCourse(courseData);
			
			// Fetch progress if user is enrolled
			if (user?.id) {
				try {
					const progressData = await courseProgressService.getCourseProgress(courseId);
					setProgress((prev) => withRememberedCompletions(preserveCompletedLessons(prev, progressData)));
				} catch  {
					logger.log('No progress data available');
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
			const locked = err?.response?.status === 403 && err?.response?.data?.locked;
			showToast(locked ? (err.response.data.message || 'Lecția este blocată.') : 'Eroare la încărcarea lecției', 'error');
		} finally {
			setCurrentLessonLoading(false);
		}
	};

	const refreshOpenLesson = async () => {
		try {
			const courseData = await coursesService.getById(courseId, courseFetchParams);
			setCourse(courseData);
			let progressData = progress;
			if (user?.id) {
				try {
					progressData = await courseProgressService.getCourseProgress(courseId);
					setProgress((prev) => {
						progressData = withRememberedCompletions(preserveCompletedLessons(prev, progressData));
						return progressData;
					});
				} catch {
					// Progresul vechi rămâne pe ecran dacă reîncărcarea lui eșuează.
				}
			}
			if (selectedLessonId) {
				const lessonData = normalizeLessonFromApi(await lessonsService.getById(selectedLessonId));
				setCurrentLesson(lessonData);
				setIsCompleted(user?.id ? isLessonMarkedComplete(progressData, selectedLessonId) : false);
			}
		} catch {
			showToast('Nu s-a putut actualiza lecția', 'error');
		}
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
			let merged = progressData;
			setProgress((prev) => {
				merged = withRememberedCompletions(preserveCompletedLessons(prev, progressData));
				return merged;
			});
			return merged;
		} catch {
			return null;
		}
	}, [courseId, user?.id]);

	const completeCurrentLesson = useCallback(async ({ force = false } = {}) => {
		if (!selectedLessonId || !user?.id) return true;
		if (isCompleted && !force) return true;
		rememberCompletedLesson(selectedLessonId);
		try {
			setIsCompleting(true);
			const result = await courseProgressService.completeLesson(selectedLessonId);
			setIsCompleted(true);
			const stampComplete = (source) => {
				if (!source) return source;
				const id = Number(selectedLessonId);
				const patchRow = (row) => (
					Number(row?.id) === id || Number(row?.lesson_id) === id
						? { ...row, completed: true, progress_percentage: 100 }
						: row
				);
				return {
					...source,
					lessons: (source.lessons || []).map(patchRow),
					root_lessons: (source.root_lessons || []).map(patchRow),
					modules: (source.modules || []).map((mod) => ({
						...mod,
						lessons: (mod.lessons || []).map(patchRow),
					})),
				};
			};
			if (result?.progress) {
				setProgress((prev) => {
					const next = stampComplete(result.progress);
					const nextHasLessons = Boolean(next?.modules?.length || next?.root_lessons?.length);
					const prevHasLessons = Boolean(prev?.modules?.length || prev?.root_lessons?.length);
					if (!nextHasLessons && prevHasLessons) {
						return withRememberedCompletions(stampComplete({
							...prev,
							...next,
							modules: prev.modules,
							root_lessons: prev.root_lessons,
							course_level_tests: next.course_level_tests || prev.course_level_tests,
						}));
					}
					return withRememberedCompletions(next);
				});
			} else {
				setProgress((prev) => withRememberedCompletions(stampComplete(prev)));
				await refreshCourseProgress();
			}
			return true;
		} catch (err) {
			completedLessonIdsRef.current.delete(Number(selectedLessonId));
			const msg = err?.response?.data?.message || err?.message || 'Nu s-a putut marca lecția ca finalizată.';
			showToast(msg, 'error');
			return false;
		} finally {
			setIsCompleting(false);
		}
	}, [selectedLessonId, isCompleted, user?.id, refreshCourseProgress, showToast]);

	const rememberCompletedLesson = (lessonId) => {
		const id = Number(lessonId);
		if (Number.isFinite(id)) completedLessonIdsRef.current.add(id);
	};

	const withRememberedCompletions = (source) => {
		const ids = completedLessonIdsRef.current;
		if (!source || ids.size === 0) return source;
		const patch = (row, id) => (
			ids.has(Number(id))
				? { ...row, completed: true, progress_percentage: Math.max(100, Number(row?.progress_percentage) || 0) }
				: row
		);
		return {
			...source,
			lessons: (source.lessons || []).map((row) => patch(row, row.lesson_id ?? row.id)),
			root_lessons: (source.root_lessons || []).map((row) => patch(row, row.id)),
			modules: (source.modules || []).map((mod) => ({
				...mod,
				lessons: (mod.lessons || []).map((row) => patch(row, row.id)),
			})),
		};
	};

	const isLessonCompleted = (lessonId) => (
		completedLessonIdsRef.current.has(Number(lessonId)) || isLessonMarkedComplete(progress, lessonId)
	);

	const isLessonUnlockedForPlayer = (lessonId, lesson = null) => {
		if (isPlayerStaff) return true;
		if (lesson?.is_preview) return true;
		if (!progress) return true;
		const fromRoot = progress.root_lessons?.find((x) => Number(x.id) === Number(lessonId));
		if (fromRoot) return Boolean(fromRoot.unlocked);
		for (const mod of progress.modules || []) {
			const found = mod.lessons?.find((x) => Number(x.id) === Number(lessonId));
			if (found) return Boolean(found.unlocked);
		}
		return true;
	};

	const handleLessonClick = async (lessonId, lesson = null) => {
		const nextId = getNextLessonIdAfter(modules, selectedLessonId, rootLessons);
		const isImmediateNext = nextId != null && Number(nextId) === Number(lessonId);
		const leavingIncomplete = selectedLessonId
			&& Number(selectedLessonId) !== Number(lessonId)
			&& !isLessonCompleted(selectedLessonId);
		if (isImmediateNext && leavingIncomplete) {
			const ok = await completeCurrentLesson();
			if (!ok) return;
		} else if (!isLessonUnlockedForPlayer(lessonId, lesson)) {
			showToast('Lecția este blocată. Completează lecțiile anterioare.', 'error');
			return;
		}
		setSelectedLessonId(lessonId);
		setSidebarOpen(false);
		scrollAppToTop({ behavior: 'instant' });
	};



	const visibleCourseTests = (items) => (isPlayerStaff ? (Array.isArray(items) ? items : []) : filterPublishedCourseTests(items));
	const getModuleCourseTests = (m) => visibleCourseTests(m?.course_tests || m?.courseTests || m?.exams || []);
	const getLessonCourseTests = (l) => visibleCourseTests(l?.course_tests || l?.courseTests || []);
	const getProgressModule = (moduleId) =>
		progress?.modules?.find((x) => Number(x.id) === Number(moduleId));
	const getLessonTestProgress = (moduleId, lessonId, testId) => {
		if (moduleId == null) {
			const les = progress?.root_lessons?.find((x) => Number(x.id) === Number(lessonId));
			return les?.tests?.find((t) => Number(t.test_id) === Number(testId));
		}
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

	const handleNextLesson = async () => {
		if (!reachedEnd) return;
		const ok = await completeCurrentLesson({ force: true });
		if (!ok) return;

		const nextId = getNextLessonIdAfter(modules, selectedLessonId, rootLessons);
		if (nextId != null && !Number.isNaN(nextId)) {
			setSelectedLessonId(nextId);
			setSidebarOpen(false);
			scrollAppToTop({ behavior: 'instant' });
			return;
		}
		navigate(`/courses/${courseId}`);
	};

	const handlePreviousLesson = () => {
		const prevId = getPreviousLessonIdBefore(modules, selectedLessonId, rootLessons);
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
			let merged = p;
			setProgress((prev) => {
				merged = withRememberedCompletions(preserveCompletedLessons(prev, p));
				return merged;
			});
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
						className="lessons-page-btn lms-btn-primary lessons-page-btn-primary"
						onClick={() => navigate('/courses')}
					>
						Înapoi la cursuri
					</button>
				</div>
			</div>
		);
	}

	const totalLessons = rootLessons.length + modules.reduce((sum, module) => sum + (module.lessons?.length || 0), 0);
	const hasMultipleLessons = totalLessons > 1;
	const nextLessonTarget = selectedLessonId ? getNextLessonIdAfter(modules, selectedLessonId, rootLessons) : undefined;
	const previousLessonTarget = selectedLessonId ? getPreviousLessonIdBefore(modules, selectedLessonId, rootLessons) : undefined;
	const isLastLessonInCourse = nextLessonTarget === null;
	const hasPreviousLesson = previousLessonTarget != null && !Number.isNaN(previousLessonTarget);
	const hasNextLesson = typeof nextLessonTarget === 'number' && !Number.isNaN(nextLessonTarget);
	const lessonPosition = getLessonPosition(modules, selectedLessonId, rootLessons);

	return (
		<div className={`lessons-page-modern lessons-page-player-layout ${sidebarOpen ? 'lessons-page-sidebar-open' : ''}`}>
			<LessonPullRefresh onRefresh={refreshOpenLesson} />
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
							className="va-btn-back lessons-page-sidebar-back-btn"
							onClick={() => navigate(-1)}
						>
							<ArrowLeft size={20} weight="bold" aria-hidden />
							<span>Înapoi</span>
						</button>
						<button 
							className="lessons-page-sidebar-close-btn va-close-btn"
							onClick={() => setSidebarOpen(false)}
							aria-label="Închide meniul"
						>
							<X size={18} weight="bold" aria-hidden="true" />
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
								{Number(progress.progress_percentage) >= 100 ? 'Finalizat' : `${courseProgressLabel(progress.progress_percentage)} completat`}
							</span>
						</div>
					)}
				</div>

				<div className="lessons-page-sidebar-content">
					{rootLessons.length > 0 || modules.length > 0 ? (
						<div className="lessons-page-sidebar-modules">
							{rootLessons.length > 0 && (
								<div className="lessons-page-sidebar-root-lessons">
									{rootLessons.map((lesson, lessonIndex) => {
										const isCompleted = isLessonCompleted(lesson.id);
										const isActive = selectedLessonId === lesson.id;
										const lessonTests = getLessonCourseTests(lesson);

										return (
											<Fragment key={lesson.id}>
												<button
													type="button"
													className={`lessons-page-sidebar-lesson ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${!isLessonUnlockedForPlayer(lesson.id, lesson) ? 'locked' : ''}`}
													onClick={() => handleLessonClick(lesson.id, lesson)}
												>
													{renderLessonIndexIcon(lessonIndex, isCompleted)}
													<span className="lessons-page-sidebar-lesson-title">{lesson.title}</span>
												</button>
												{lessonTests.map((ct) => {
													const testId = ct.test_id ?? ct.test?.id;
													if (!testId) return null;
													const tp = getLessonTestProgress(null, lesson.id, testId);
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
																{' · Obligatoriu'}
																{testDraftSuffix(ct.test?.status ?? ct.status)}
															</span>
														</button>
													);
												})}
											</Fragment>
										);
									})}
								</div>
							)}
							{modules.map((module, moduleIndex) => {
								const isModuleExpanded = expandedModules.has(module.id);

								const sortedLessons = (module.lessons || []).sort((a, b) => (a.order || 0) - (b.order || 0));
								const isActive = selectedLessonId && sortedLessons.some(l => l.id === selectedLessonId);
								
								return (
									<div key={module.id} className={`lessons-page-sidebar-module ${isActive ? 'active' : ''}`}>
										<button
											type="button"
											className={`lessons-page-sidebar-module-header ${isModuleExpanded ? 'expanded' : ''}`}
											onClick={() => toggleModule(module.id)}
										>
											<div className="lessons-page-sidebar-module-info">
												<span className="lessons-page-sidebar-module-number">
													{moduleIndex + 1}
												</span>
												<span className="lessons-page-sidebar-module-title">
													{module.title}
												</span>
											</div>
											<CaretDown
												className={`lessons-page-sidebar-module-arrow ${isModuleExpanded ? 'expanded' : ''}`}
												size={16}
												weight="bold"
												aria-hidden
											/>
										</button>

										{isModuleExpanded && (
											<div className="lessons-page-sidebar-lessons">
												{sortedLessons.map((lesson, lessonIndex) => {
													const isCompleted = isLessonCompleted(lesson.id);
													const isActive = selectedLessonId === lesson.id;
													const lessonTests = getLessonCourseTests(lesson);

													return (
														<Fragment key={lesson.id}>
															<button
																type="button"
																className={`lessons-page-sidebar-lesson ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${!isLessonUnlockedForPlayer(lesson.id, lesson) ? 'locked' : ''}`}
																onClick={() => handleLessonClick(lesson.id, lesson)}
															>
																{renderLessonIndexIcon(lessonIndex, isCompleted)}
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
																			{' · Obligatoriu'}
																			{testDraftSuffix(ct.test?.status ?? ct.status)}
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
																{' · Obligatoriu'}
																{testDraftSuffix(ct.test?.status ?? ct.status)}
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
					{/* Course-level tests */}
					{Array.isArray(course?.exams) &&
						course.exams.filter((e) => !e.module_id && isTestVisibleInPlayer(e?.status)).length > 0 && (
						<div className="lessons-page-sidebar-tests-section">
							<div className="lessons-page-sidebar-tests-header">Teste la nivel de curs</div>
							<p className="lessons-page-sidebar-tests-hint">Legate de acest curs (nu examene independente)</p>
							{course.exams.filter((e) => !e.module_id && isTestVisibleInPlayer(e?.status)).map((exam) => {
								const tp = getCourseLevelTestProgress(exam.id);
								const passed = Boolean(tp?.passed);
								return (
									<button
										key={exam.id}
										type="button"
										className={`lessons-page-sidebar-lesson lessons-page-sidebar-test ${passed ? 'completed' : ''}`}
										onClick={() => navigate(`/courses/${courseId}/exams/${exam.id}`)}
									>
										<div className="lessons-page-sidebar-lesson-icon">{renderTestStatusIcon(passed)}</div>
										<span className="lessons-page-sidebar-lesson-title">
											{exam.title || 'Test'}
											{' · Obligatoriu'}
											{testDraftSuffix(exam.status)}
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
				{/* Mobil: cuprinsul + poziția în curs, lipite sub bara de sus */}
				<div className="lessons-page-context-bar">
					<button
						type="button"
						className="lessons-page-sidebar-toggle"
						onClick={() => setSidebarOpen(true)}
						aria-label="Deschide meniul lecțiilor"
					>
						<List size={20} weight="bold" aria-hidden />
						<span>Lecții</span>
					</button>
					{lessonPosition ? (
						<div className="lessons-page-context-progress">
							<span className="lessons-page-context-progress-label">
								Lecția {lessonPosition.index} din {lessonPosition.total}
							</span>
							<div
								className="lessons-page-context-progress-track"
								role="progressbar"
								aria-label="Poziția în curs"
								aria-valuemin={1}
								aria-valuemax={lessonPosition.total}
								aria-valuenow={lessonPosition.index}
							>
								<div
									className="lessons-page-context-progress-fill"
									style={{ width: `${Math.round((lessonPosition.index / lessonPosition.total) * 100)}%` }}
								/>
							</div>
						</div>
					) : null}
				</div>
				{currentLessonLoading ? (
					<div className="lessons-page-lesson-loading">
						<div className="lessons-page-spinner"></div>
						<p>Se încarcă lecția...</p>
					</div>
				) : currentLesson ? (
					<div className="lessons-page-lesson-viewer">
						{/* Lesson Header */}
						<div className="lessons-page-lesson-header">
							{lessonPosition?.module?.title ? (
								<p className="lessons-page-lesson-eyebrow">{lessonPosition.module.title}</p>
							) : null}
							<h1 className="lessons-page-lesson-viewer-title">{currentLesson.title}</h1>
							{currentLesson.description && (
								<p className="lessons-page-lesson-viewer-description">{currentLesson.description}</p>
							)}
						</div>

						{/* Lesson Content */}
						<div className="lessons-page-lesson-body" ref={contentRef}>
						<LessonReadTrackers>
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
						</LessonReadTrackers>
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
										className="lessons-page-nav-btn va-btn-back lessons-page-nav-btn--prev"
										disabled={!hasPreviousLesson || isCompleting || finalizingCourse}
										onClick={handlePreviousLesson}
										aria-label="Lecția anterioară"
										title="Lecția anterioară"
									>
										<ArrowLeft size={22} weight="bold" aria-hidden /><span>Anterioară</span>
									</button>
									{isLastLessonInCourse ? (
										<button
											className="lessons-page-btn lms-btn-primary lessons-page-btn-primary lessons-page-lesson-cta lessons-page-lesson-cta--finalize"
											type="button"
											disabled={finalizingCourse || isCompleting || !canAdvanceLesson}
											title={canAdvanceLesson ? undefined : 'Derulează până la finalul lecției'}
											onClick={handleFinalizeCourse}
										>
											{finalizingCourse ? (
												<span>Se procesează…</span>
											) : (
												<>
													<Check size={16} weight="bold" aria-hidden />
													<span>Urmează testul</span>
												</>
											)}
										</button>
									) : (
										<button
											type="button"
											className="lessons-page-nav-btn lms-btn-primary lessons-page-nav-btn--next"
											disabled={!hasNextLesson || isCompleting || finalizingCourse || !canAdvanceLesson}
											onClick={handleNextLesson}
											aria-label="Lecția următoare"
											title={canAdvanceLesson ? 'Lecția următoare' : 'Derulează până la finalul lecției'}
										>
											<span>Următoarea</span><ArrowRight size={22} weight="bold" aria-hidden />
										</button>
									)}
								</>
							) : (
								<button
									className="lessons-page-btn lms-btn-primary lessons-page-btn-primary lessons-page-lesson-cta"
									type="button"
									disabled={finalizingCourse || isCompleting || !canAdvanceLesson}
									title={canAdvanceLesson ? undefined : 'Derulează până la finalul lecției'}
									onClick={handleFinalizeCourse}
								>
									{finalizingCourse ? (
										<span>Se procesează…</span>
									) : (
										<>
											<Check size={16} weight="bold" aria-hidden />
											<span>Urmează testul</span>
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
