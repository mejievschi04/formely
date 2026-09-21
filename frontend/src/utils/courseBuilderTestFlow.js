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

export function buildRootFlowItems(rootLessons, getLessonAttachedTests) {
	const items = [];

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

export function resolveTestDropOnLesson(moduleId, lessons, lessonId, position, getLessonAttachedTests, getModuleAttachedTests) {
	const lessonIndex = lessons.findIndex((lessonItem) => Number(lessonItem.id) === Number(lessonId));
	if (lessonIndex === -1) return null;

	if (position === 'after') {
		const lessonTests = getLessonAttachedTests(lessonId);
		return { moduleId, scope: 'lesson', scope_id: lessonId, order: lessonTests.length };
	}

	if (lessonIndex === 0) {
		const moduleTests = getModuleAttachedTests(moduleId);
		return { moduleId, scope: 'module', scope_id: moduleId, order: 0 };
	}

	const previousLesson = lessons[lessonIndex - 1];
	const previousLessonTests = getLessonAttachedTests(previousLesson.id);
	return {
		moduleId,
		scope: 'lesson',
		scope_id: previousLesson.id,
		order: previousLessonTests.length,
	};
}

export function resolveTestDropOnRootLesson(rootLessons, lessonId, position, getLessonAttachedTests) {
	const lessonIndex = rootLessons.findIndex((lessonItem) => Number(lessonItem.id) === Number(lessonId));
	if (lessonIndex === -1) return null;

	if (position === 'after') {
		const lessonTests = getLessonAttachedTests(lessonId);
		return { moduleId: null, scope: 'lesson', scope_id: lessonId, order: lessonTests.length };
	}

	if (lessonIndex === 0) {
		return null;
	}

	const previousLesson = rootLessons[lessonIndex - 1];
	const previousLessonTests = getLessonAttachedTests(previousLesson.id);
	return {
		moduleId: null,
		scope: 'lesson',
		scope_id: previousLesson.id,
		order: previousLessonTests.length,
	};
}

export function resolveTestDropOnTest(targetCourseTest, position, moduleId, getLessonAttachedTests, getModuleAttachedTests) {
	const { scope, scope_id: scopeId } = targetCourseTest;
	let siblings;
	if (scope === 'lesson') {
		siblings = getLessonAttachedTests(scopeId);
	} else if (scope === 'module') {
		siblings = getModuleAttachedTests(moduleId);
	} else {
		return null;
	}

	const targetIndex = siblings.findIndex((item) => Number(item.id) === Number(targetCourseTest.id));
	if (targetIndex === -1) return null;

	const order = position === 'before' ? targetIndex : targetIndex + 1;
	return { moduleId, scope, scope_id: scopeId, order };
}

export function resolveTestDropAtModuleEnd(moduleId, getModuleAttachedTests) {
	const moduleTests = getModuleAttachedTests(moduleId);
	return { moduleId, scope: 'module', scope_id: moduleId, order: moduleTests.length };
}

export function resolveTestDropAtRootEnd(rootLessons, getLessonAttachedTests) {
	if (!rootLessons.length) return null;
	const lastLesson = rootLessons[rootLessons.length - 1];
	const lessonTests = getLessonAttachedTests(lastLesson.id);
	return {
		moduleId: null,
		scope: 'lesson',
		scope_id: lastLesson.id,
		order: lessonTests.length,
	};
}
