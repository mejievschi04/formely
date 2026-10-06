/**
 * Ordered sidebar flow for course builder: lesson → its tests → next lesson → … → module tests.
 */

export function buildModuleFlowItems(module, getLessonAttachedTests, getModuleAttachedTests) {
	const items = [];
	const lessons = Array.isArray(module?.lessons) ? module.lessons : [];

	lessons.forEach((lesson, lessonIndex) => {
		items.push({
			type: 'lesson',
			key: `lesson-${lesson.id}`,
			lesson,
			lessonIndex,
		});
		getLessonAttachedTests(lesson.id).forEach((courseTest) => {
			items.push({
				type: 'test',
				key: `test-${courseTest.id}`,
				courseTest,
				anchorLessonId: lesson.id,
			});
		});
	});

	getModuleAttachedTests(module.id).forEach((courseTest) => {
		items.push({
			type: 'test',
			key: `test-${courseTest.id}`,
			courseTest,
			anchorLessonId: null,
		});
	});

	return items;
}

/** Flux unificat: teste curs → lecții → teste lecție (fără secțiune separată). */
export function buildRootOutlineFlow(rootLessons, getLessonAttachedTests, getCourseLevelAttachedTests) {
	const items = [];

	getCourseLevelAttachedTests().forEach((courseTest) => {
		items.push({
			type: 'test',
			key: `test-${courseTest.id}`,
			courseTest,
			anchorLessonId: null,
		});
	});

	rootLessons.forEach((lesson, lessonIndex) => {
		items.push({
			type: 'lesson',
			key: `lesson-${lesson.id}`,
			lesson,
			lessonIndex,
		});
		getLessonAttachedTests(lesson.id).forEach((courseTest) => {
			items.push({
				type: 'test',
				key: `test-${courseTest.id}`,
				courseTest,
				anchorLessonId: lesson.id,
			});
		});
	});

	return items;
}

/**
 * Poziție în flux (insertIndex = înainte de elementul de la acel index).
 */
export function resolvePlacementFromFlowInsert(
	flowItems,
	insertIndex,
	moduleId,
	movingCourseTestId,
	getLessonAttachedTests,
	getModuleAttachedTests,
	getCourseLevelAttachedTests = () => []
) {
	const withoutMoving = flowItems.filter(
		(item) => item.type !== 'test' || Number(item.courseTest.id) !== Number(movingCourseTestId)
	);
	const idx = Math.max(0, Math.min(insertIndex, withoutMoving.length));

	if (idx === 0) {
		if (moduleId != null) {
			return { moduleId, scope: 'module', scope_id: moduleId, order: 0 };
		}
		return { moduleId: null, scope: 'course', scope_id: null, order: 0 };
	}

	const prevItem = withoutMoving[idx - 1];

	if (prevItem.type === 'lesson') {
		const lessonId = prevItem.lesson.id;
		return { moduleId, scope: 'lesson', scope_id: lessonId, order: 0 };
	}

	if (prevItem.type === 'test') {
		const prevTest = prevItem.courseTest;
		const scope = prevTest.scope;
		let scopeId = prevTest.scope_id;
		let siblings;

		if (scope === 'lesson') {
			siblings = getLessonAttachedTests(scopeId);
		} else if (scope === 'module') {
			scopeId = moduleId;
			siblings = getModuleAttachedTests(moduleId);
		} else if (scope === 'course') {
			scopeId = null;
			siblings = getCourseLevelAttachedTests();
		} else {
			return null;
		}

		siblings = siblings.filter((row) => Number(row.id) !== Number(movingCourseTestId));
		const prevIdx = siblings.findIndex((row) => Number(row.id) === Number(prevTest.id));
		return {
			moduleId,
			scope,
			scope_id: scopeId,
			order: prevIdx === -1 ? siblings.length : prevIdx + 1,
		};
	}

	return null;
}

