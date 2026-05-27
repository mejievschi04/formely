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
