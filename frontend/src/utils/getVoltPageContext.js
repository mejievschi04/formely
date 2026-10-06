export function getVoltPageContext(location = {}) {
	const pathname = String(location.pathname || '');
	const search = String(location.search || '');
	const params = new URLSearchParams(search);
	const courseMatch = pathname.match(/^\/admin\/courses\/(\d+)\/builder/);
	const testMatch = pathname.match(/^\/admin\/tests\/(\d+)\/builder/);
	const mapMatch = pathname.match(/^\/admin\/maps\/(\d+)/);
	const onMapsList = pathname.startsWith('/admin/content') && params.get('view') === 'maps';

	let page = 'other';
	if (courseMatch) page = 'course_builder';
	else if (testMatch) page = 'test_builder';
	else if (mapMatch) page = 'map';
	else if (onMapsList) page = 'maps_list';

	return {
		pathname,
		page,
		courseId: courseMatch ? Number(courseMatch[1]) : null,
		testId: testMatch ? Number(testMatch[1]) : null,
		mapId: mapMatch ? Number(mapMatch[1]) : null,
		onMapsList,
	};
}

export function describeVoltPageContext(context) {
	if (context.page === 'course_builder') return 'Editezi cursul deschis în builder. Confirmă înainte să aplic modificări.';
	if (context.page === 'test_builder') return 'Editezi testul deschis. Îți arăt propunerea și aplic doar după confirmare.';
	if (context.page === 'map') return 'Editezi mapa deschisă. Îți arăt propunerea și aplic doar după confirmare.';
	if (context.page === 'maps_list') return 'Ești în lista de mape. Pot crea o mapă nouă după ce confirmi.';
	return 'Pot crea sau edita cursuri, mape și teste. Aplic schimbările doar după ce confirmi.';
}
