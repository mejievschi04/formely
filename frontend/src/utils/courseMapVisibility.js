function normalizeMapLabel(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{M}/gu, '');
}

/** Mapă sistem (bucket admin) — ascunsă studenților, vizibilă în admin. */
export function isSystemCourseMap(map) {
	if (!map) return true;
	if (map.is_virtual || String(map.id) === 'unassigned') return true;
	const name = normalizeMapLabel(map.name);
	if (!name) return false;
	if (name === 'fara mapa' || name.includes('fara mapa')) return true;
	if (name === 'cursuri fara mapa' || name.startsWith('cursuri fara mapa')) return true;
	return false;
}

export function isStudentVisibleMap(map) {
	if (!map || map.id == null) return false;
	return !isSystemCourseMap(map);
}
