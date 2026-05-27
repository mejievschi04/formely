/** Test/exam linked to a course is visible to learners only when published. */
export function isPublishedTestStatus(status) {
	return String(status ?? 'draft').toLowerCase() === 'published';
}

/** course_tests rows or legacy course.exams entries */
export function filterPublishedCourseTests(items) {
	if (!Array.isArray(items)) return [];
	return items.filter((item) => {
		const status = item?.test?.status ?? item?.status;
		return isPublishedTestStatus(status);
	});
}
