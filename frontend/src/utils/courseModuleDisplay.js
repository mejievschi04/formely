/**
 * Liste module + lecții la rădăcină pentru UI student/admin.
 * Fără module reale: lecțiile apar direct, fără grup „Lecții fără modul”.
 */

export function getSortedCourseModules(course) {
	return [...(course?.modules || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function getRootCourseLessons(course) {
	return [...(course?.lessons || [])]
		.filter((lesson) => lesson?.module_id == null)
		.sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * @param {object} course
 * @param {{ withCourseTestFields?: boolean }} [options]
 */
export function buildCourseModuleList(course, options = {}) {
	const { withCourseTestFields = false } = options;
	const sortedModules = getSortedCourseModules(course);
	const rootLessons = getRootCourseLessons(course);

	if (!rootLessons.length) {
		return sortedModules;
	}

	const hasModules = sortedModules.length > 0;
	const rootGroup = {
		id: `root-${course?.id || 'course'}`,
		title: hasModules ? 'Lecții fără modul' : '',
		order: -1,
		lessons: rootLessons,
		isRootLessonGroup: true,
		/** true când nu există module — UI afișează doar lecțiile */
		hideGroupHeader: !hasModules,
	};

	if (withCourseTestFields) {
		rootGroup.course_tests = [];
		rootGroup.courseTests = [];
	}

	return [rootGroup, ...sortedModules];
}
