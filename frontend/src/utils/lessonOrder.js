export function getRootLessons(courseOrLessons) {
	const lessons = Array.isArray(courseOrLessons)
		? courseOrLessons
		: courseOrLessons?.lessons || [];
	return [...lessons]
		.filter((lesson) => lesson?.module_id == null)
		.sort((a, b) => (a.order || 0) - (b.order || 0));
}

function iterateLessonsInOrder(modules, rootLessons, onLesson) {
	for (const lesson of rootLessons) {
		if (onLesson(lesson) === 'stop') return;
	}
	const sortedModules = [...modules].sort((a, b) => (a.order || 0) - (b.order || 0));
	for (const mod of sortedModules) {
		const sortedLessons = [...(mod.lessons || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
		for (const lesson of sortedLessons) {
			if (onLesson(lesson) === 'stop') return;
		}
	}
}

/**
 * @param {Array} modules Course modules with lessons
 * @param {number|string} currentLessonId
 * @param {Array} [rootLessons] Lessons without a module
 * @returns {number|null|undefined} next lesson id; null if current is last; undefined if unknown
 */
export function getNextLessonIdAfter(modules, currentLessonId, rootLessons = []) {
	if (currentLessonId == null) return undefined;
	const cid = Number(currentLessonId);
	if (Number.isNaN(cid)) return undefined;
	if (!Array.isArray(modules) && !Array.isArray(rootLessons)) return undefined;

	const sortedRootLessons = [...(rootLessons || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
	const sortedModules = Array.isArray(modules) ? modules : [];
	if (sortedRootLessons.length === 0 && sortedModules.length === 0) return undefined;

	let foundCurrent = false;
	let nextId;
	iterateLessonsInOrder(sortedModules, sortedRootLessons, (lesson) => {
		if (foundCurrent) {
			nextId = Number(lesson.id);
			return 'stop';
		}
		if (Number(lesson.id) === cid) foundCurrent = true;
	});
	if (nextId != null) return nextId;
	if (foundCurrent) return null;
	return undefined;
}

/**
 * @param {Array} modules Course modules with lessons
 * @param {number|string} currentLessonId
 * @param {Array} [rootLessons] Lessons without a module
 * @returns {number|null|undefined} previous lesson id; null if current is first; undefined if unknown
 */
export function getPreviousLessonIdBefore(modules, currentLessonId, rootLessons = []) {
	if (currentLessonId == null) return undefined;
	const cid = Number(currentLessonId);
	if (Number.isNaN(cid)) return undefined;
	if (!Array.isArray(modules) && !Array.isArray(rootLessons)) return undefined;

	const sortedRootLessons = [...(rootLessons || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
	const sortedModules = Array.isArray(modules) ? modules : [];
	if (sortedRootLessons.length === 0 && sortedModules.length === 0) return undefined;

	let previousId = null;
	let result;
	iterateLessonsInOrder(sortedModules, sortedRootLessons, (lesson) => {
		if (Number(lesson.id) === cid) {
			result = previousId;
			return 'stop';
		}
		previousId = Number(lesson.id);
	});
	if (result !== undefined) return result;
	return undefined;
}
