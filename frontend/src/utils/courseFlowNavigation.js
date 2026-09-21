import { courseProgressService, coursesService } from '../services/api';
import { getNextLessonIdAfter } from './lessonOrder';
import { filterPublishedCourseTests } from './testVisibility';

/** Progres din răspunsul completeLesson sau din GET /progress */
export function normalizeCourseProgressPayload(payload) {
	if (!payload) return null;
	if (payload.progress && typeof payload.progress === 'object') {
		return payload.progress;
	}
	return payload;
}

/**
 * După o lecție sau test: următorul pas în fluxul cursului.
 * Prioritate: test obligatoriu → lecția următoare (API) → lecția următoare (ordine) → finalizare.
 */
export function resolveStudentCourseStep(progressPayload, { modules, currentLessonId, rootLessons = [] } = {}) {
	const progress = normalizeCourseProgressPayload(progressPayload);

	if (progress?.next_exam?.id) {
		return { type: 'exam', examId: Number(progress.next_exam.id) };
	}

	if (progress?.course_complete) {
		return { type: 'congrats' };
	}

	const resumeLessonId = progress?.next_lesson?.id;
	if (resumeLessonId != null && !Number.isNaN(Number(resumeLessonId))) {
		return { type: 'lesson', lessonId: Number(resumeLessonId) };
	}

	const nextFromOrder = getNextLessonIdAfter(modules, currentLessonId, rootLessons);
	if (typeof nextFromOrder === 'number' && !Number.isNaN(nextFromOrder)) {
		return { type: 'lesson', lessonId: nextFromOrder };
	}

	if (nextFromOrder === null) {
		return { type: 'finish' };
	}

	return { type: 'course' };
}

export async function loadCourseProgressWithNavigation(courseId, existingProgress) {
	const base = normalizeCourseProgressPayload(existingProgress);
	if (base?.next_lesson != null || base?.next_exam != null || base?.course_complete != null) {
		return base;
	}
	try {
		return await courseProgressService.getCourseProgress(courseId);
	} catch {
		return base;
	}
}

/**
 * Navigare după finalizarea unei lecții sau revenirea de la test.
 */
export async function advanceAfterLessonComplete({
	courseId,
	lessonId,
	modules,
	rootLessons = [],
	navigate,
	progressPayload,
	lessonPageMode = false,
	onCongrats,
	onFinalize,
}) {
	const progress = await loadCourseProgressWithNavigation(courseId, progressPayload);
	const step = resolveStudentCourseStep(progress, { modules, currentLessonId: lessonId, rootLessons });

	switch (step.type) {
		case 'exam':
			navigate(`/courses/${courseId}/exams/${step.examId}`);
			return step;
		case 'lesson':
			if (lessonPageMode) {
				navigate(`/courses/${courseId}/lessons/${step.lessonId}`);
			} else {
				navigate(`/courses/${courseId}?lesson=${step.lessonId}`);
			}
			return step;
		case 'congrats':
			if (onCongrats) await onCongrats();
			return step;
		case 'finish':
			if (onFinalize) await onFinalize();
			return step;
		default:
			navigate(`/courses/${courseId}`);
			return step;
	}
}

/** După test promovat: continuă fluxul sau finalizează cursul. */
export async function advanceAfterExamPassed({
	courseId,
	exam,
	navigate,
	onCongrats,
}) {
	const progress = await courseProgressService.getCourseProgress(courseId);
	const isFinal = String(exam?.type || '').toLowerCase() === 'final';

	if (isFinal || progress?.course_complete) {
		if (progress?.course_complete) {
			try {
				await coursesService.finishCourse(courseId);
			} catch (err) {
				const status = err?.response?.status;
				if (status !== 409) {
					throw err;
				}
			}
		}
		if (onCongrats) await onCongrats();
		return { type: 'congrats', progress };
	}

	const step = resolveStudentCourseStep(progress);
	if (step.type === 'lesson') {
		navigate(`/courses/${courseId}?lesson=${step.lessonId}`);
		return step;
	}
	if (step.type === 'exam') {
		navigate(`/courses/${courseId}/exams/${step.examId}`);
		return step;
	}
	if (step.type === 'finish' || step.type === 'congrats') {
		if (onCongrats) await onCongrats();
		return step;
	}

	const fallbackLessonId = progress?.next_lesson?.id;
	if (fallbackLessonId) {
		navigate(`/courses/${courseId}?lesson=${fallbackLessonId}`);
	} else {
		navigate(`/courses/${courseId}`);
	}
	return step;
}

export function courseResumeLessonId(progress, modules, rootLessons = []) {
	const p = normalizeCourseProgressPayload(progress);
	if (p?.next_lesson?.id != null) {
		return Number(p.next_lesson.id);
	}
	const sortedRoots = [...(rootLessons || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
	if (sortedRoots[0]?.id != null) {
		return Number(sortedRoots[0].id);
	}
	const firstModule = modules?.[0];
	const firstLesson = firstModule?.lessons
		?.slice()
		.sort((a, b) => (a.order || 0) - (b.order || 0))?.[0];
	return firstLesson?.id != null ? Number(firstLesson.id) : null;
}

function testIdFromCourseTest(item) {
	const id = item?.test_id ?? item?.test?.id ?? item?.id;
	const n = Number(id);
	return Number.isFinite(n) && n > 0 ? n : null;
}

function collectPassedTestIds(progress) {
	const passed = new Set();
	const p = normalizeCourseProgressPayload(progress);
	if (!p) return passed;

	const pushIfPassed = (item) => {
		if (!item?.passed) return;
		const id = Number(item.test_id ?? item.id);
		if (Number.isFinite(id) && id > 0) passed.add(id);
	};

	(p.course_level_tests || []).forEach(pushIfPassed);
	(p.root_lessons || []).forEach((lesson) => (lesson?.tests || []).forEach(pushIfPassed));
	(p.modules || []).forEach((mod) => {
		(mod?.tests || []).forEach(pushIfPassed);
		(mod?.lessons || []).forEach((lesson) => (lesson?.tests || []).forEach(pushIfPassed));
	});

	return passed;
}

/**
 * Test publicat rămas după ultima lecție (nivel lecție / modul / curs).
 * Folosit când API-ul încă nu a pus next_exam (lecția curentă nu e marcată complete).
 */
export function getPendingEndOfCourseTestId({ course, modules = [], rootLessons = [], progress } = {}) {
	const fromApi = Number(normalizeCourseProgressPayload(progress)?.next_exam?.id);
	if (Number.isFinite(fromApi) && fromApi > 0) {
		return fromApi;
	}

	const passed = collectPassedTestIds(progress);
	const seen = new Set();
	const pending = [];

	const pushTests = (items) => {
		filterPublishedCourseTests(items || []).forEach((item) => {
			const id = testIdFromCourseTest(item);
			if (!id || seen.has(id) || passed.has(id)) return;
			seen.add(id);
			pending.push(id);
		});
	};

	iterateCourseTestsInFlow(modules, rootLessons, course, pushTests);

	return pending[0] ?? null;
}

function iterateCourseTestsInFlow(modules, rootLessons, course, pushTests) {
	const roots = [...(rootLessons || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
	roots.forEach((lesson) => {
		pushTests(lesson?.course_tests || lesson?.courseTests || []);
	});

	[...(modules || [])]
		.sort((a, b) => (a.order || 0) - (b.order || 0))
		.forEach((mod) => {
			[...(mod?.lessons || [])]
				.sort((a, b) => (a.order || 0) - (b.order || 0))
				.forEach((lesson) => {
					pushTests(lesson?.course_tests || lesson?.courseTests || []);
				});
			pushTests(mod?.course_tests || mod?.courseTests || []);
		});

	pushTests(course?.course_tests || course?.courseTests || []);
}
