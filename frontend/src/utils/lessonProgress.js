/** Găsește progresul unei lecții din răspunsul /courses/:id/progress (flat sau nested). */
export function getLessonProgressEntry(progress, lessonId) {
	if (!progress || lessonId == null) return null;
	const id = Number(lessonId);
	if (!Number.isFinite(id)) return null;

	const fromFlat = (progress.lessons || []).find((l) => Number(l.lesson_id) === id);
	if (fromFlat) return fromFlat;

	for (const mod of progress.modules || []) {
		const les = (mod.lessons || []).find((l) => Number(l.id) === id);
		if (les) {
			return {
				lesson_id: les.id,
				completed: Boolean(les.completed),
				progress_percentage: les.progress_percentage ?? 0,
			};
		}
	}

	const root = (progress.root_lessons || []).find((l) => Number(l.id) === id);
	if (root) {
		return {
			lesson_id: root.id,
			completed: Boolean(root.completed),
			progress_percentage: root.progress_percentage ?? 0,
		};
	}

	return null;
}

export function isLessonMarkedComplete(progress, lessonId) {
	const entry = getLessonProgressEntry(progress, lessonId);
	return Boolean(entry?.completed) || Number(entry?.progress_percentage) >= 100;
}

function rowIsComplete(row) {
	return Boolean(row?.completed) || Number(row?.progress_percentage) >= 100;
}

/**
 * O reîncărcare pornită înainte de finalizare nu are voie să șteargă bifele deja puse.
 */
export function preserveCompletedLessons(previous, incoming) {
	if (!incoming) return previous ?? incoming;
	if (!previous) return incoming;

	const done = new Set();
	const remember = (id, row) => {
		const numeric = Number(id);
		if (Number.isFinite(numeric) && rowIsComplete(row)) done.add(numeric);
	};
	(previous.lessons || []).forEach((row) => remember(row.lesson_id ?? row.id, row));
	(previous.root_lessons || []).forEach((row) => remember(row.id, row));
	(previous.modules || []).forEach((mod) => {
		(mod.lessons || []).forEach((row) => remember(row.id, row));
	});
	if (done.size === 0) return incoming;

	const patch = (row, id) => (
		done.has(Number(id))
			? { ...row, completed: true, progress_percentage: Math.max(100, Number(row?.progress_percentage) || 0) }
			: row
	);

	return {
		...incoming,
		progress_percentage: Math.max(Number(previous.progress_percentage) || 0, Number(incoming.progress_percentage) || 0),
		lessons: (incoming.lessons || []).map((row) => patch(row, row.lesson_id ?? row.id)),
		root_lessons: (incoming.root_lessons || []).map((row) => patch(row, row.id)),
		modules: (incoming.modules || []).map((mod) => ({
			...mod,
			lessons: (mod.lessons || []).map((row) => patch(row, row.id)),
		})),
	};
}
