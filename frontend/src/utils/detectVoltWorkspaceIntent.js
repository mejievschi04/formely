function normalize(text) {
	return String(text || '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

export function detectVoltWorkspaceIntent(prompt, context = {}) {
	const {
		courseId = null,
		testId = null,
		mapId = null,
		pathname = '',
		page = '',
	} = context;
	const t = normalize(prompt);
	const wantsMutate = /(creeaz|creaz|genereaz|fa-mi|fami|fa un|fa o|vreau|doresc|as vrea|scrie|adaug|modific|editeaz|rescrie|completeaz|actualizeaz|sterge|redenum)/.test(t);
	const onCourseBuilder = page === 'course_builder' || /\/admin\/courses\/\d+\/builder/.test(pathname || '');
	const onTestBuilder = page === 'test_builder' || Boolean(testId);
	const onMap = page === 'map' || Boolean(mapId);
	const analytics = /(statist|elevi|raport|excel|cati|rata de|finalizare|in risc|recomand)/.test(t);

	if (analytics && !wantsMutate) return 'answer';
	const explicitMap = /\b(mapa|traseu de curs|harta de curs)/.test(t);
	const explicitCourse = /\bcurs(?:ul|uri)?\b/.test(t);
	const courseCreation = /(?:creeaz\w*|creaz\w*|genereaz\w*|fa-mi|fami|fa|vreau|doresc|as vrea|scrie)\s+(?:sa\s+)?(?:imi\s+)?(?:un\s+)?(?:nou\s+)?curs\b/.test(t);

	// Explicit targets take precedence over the page and nested course requirements.
	if (explicitMap && wantsMutate) return mapId ? 'edit_map' : 'map';
	if (courseCreation) return 'create_course';
	if (explicitCourse && wantsMutate) return courseId ? 'edit_course' : 'create_course';
	if (/\b(test|quiz|intrebari)\b/.test(t) && wantsMutate) {
		return testId ? 'edit_test' : 'test';
	}
	if (onMap && wantsMutate) return mapId ? 'edit_map' : 'map';
	if (onTestBuilder && wantsMutate) return testId ? 'edit_test' : 'test';
	if (courseId && wantsMutate) return 'edit_course';
	if (['create_course', 'edit_course'].includes(context.pendingIntent)) return context.pendingIntent;
	if (onCourseBuilder && courseId && !analytics) return 'edit_course';
	if (onTestBuilder && testId && !analytics) return 'edit_test';
	if (onMap && mapId && !analytics) return 'edit_map';
	return 'answer';
}
