/**
 * @param {Array} modules Course modules with lessons
 * @param {number|string} currentLessonId
 * @returns {number|null|undefined} next lesson id; null if current is last; undefined if unknown
 */
export function getNextLessonIdAfter(modules, currentLessonId) {
	if (!Array.isArray(modules) || modules.length === 0 || currentLessonId == null) {
		return undefined;
	}
	const cid = Number(currentLessonId);
	if (Number.isNaN(cid)) return undefined;

	const sortedModules = [...modules].sort((a, b) => (a.order || 0) - (b.order || 0));
	let foundCurrent = false;
	for (const mod of sortedModules) {
		const sortedLessons = [...(mod.lessons || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
		for (const lesson of sortedLessons) {
			if (foundCurrent) return Number(lesson.id);
			if (Number(lesson.id) === cid) foundCurrent = true;
		}
	}
	if (foundCurrent) return null;
	return undefined;
}

/**
 * @param {Array} modules Course modules with lessons
 * @param {number|string} currentLessonId
 * @returns {number|null|undefined} previous lesson id; null if current is first; undefined if unknown
 */
export function getPreviousLessonIdBefore(modules, currentLessonId) {
	if (!Array.isArray(modules) || modules.length === 0 || currentLessonId == null) {
		return undefined;
	}
	const cid = Number(currentLessonId);
	if (Number.isNaN(cid)) return undefined;

	const sortedModules = [...modules].sort((a, b) => (a.order || 0) - (b.order || 0));
	let previousId = null;
	for (const mod of sortedModules) {
		const sortedLessons = [...(mod.lessons || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
		for (const lesson of sortedLessons) {
			if (Number(lesson.id) === cid) return previousId;
			previousId = Number(lesson.id);
		}
	}
	return undefined;
}
