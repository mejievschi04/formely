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
	const wantsMutate = /(creeaz|genereaz|fa un|fa o|scrie|adaug|modific|editeaz|rescrie|completeaz|actualizeaz|sterge|redenum)/.test(t);
	const onCourseBuilder = page === 'course_builder' || /\/admin\/courses\/\d+\/builder/.test(pathname || '');
	const onTestBuilder = page === 'test_builder' || Boolean(testId);
	const onMap = page === 'map' || Boolean(mapId);
	const analytics = /(statist|elevi|raport|excel|cati|rata de|finalizare|in risc|recomand)/.test(t);

	if (analytics && !wantsMutate) return 'answer';
	if ((/(mapa|traseu de curs|harta de curs)/.test(t) && wantsMutate) || (onMap && wantsMutate)) {
		return mapId ? 'edit_map' : 'map';
	}
	if ((/(test|quiz|intrebari)/.test(t) && wantsMutate) || (onTestBuilder && wantsMutate && !/(curs|mapa)/.test(t))) {
		return testId ? 'edit_test' : 'test';
	}
	if (courseId && wantsMutate) return 'edit_course';
	if (/(curs)/.test(t) && wantsMutate) return 'create_course';
	if (onCourseBuilder && courseId && !analytics) return 'edit_course';
	if (onTestBuilder && testId && !analytics) return 'edit_test';
	if (onMap && mapId && !analytics) return 'edit_map';
	return 'answer';
}
