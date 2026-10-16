export const COURSE_START_DEFAULTS = {
	target_audience: '', level: 'incepator', style: 'practic', lesson_size: 'mediu',
	language: 'ro', modules_count: 2, lessons_per_module: 2,
};

// Recognize explicit preferences only. These are suggestions; manual choices win.
export function inferCourseStartPreferences(request) {
	const text = String(request || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
	const result = {};
	const negated = index => /(?:\bnu(?: vreau)?|\bnot|\bwithout|не)\s*$/u.test(text.slice(Math.max(0, index - 24), index));
	const pick = (key, candidates) => {
		let latest = -1;
		for (const [value, pattern] of candidates) {
			for (const match of text.matchAll(pattern)) {
				if (negated(match.index)) continue;
				if (match.index >= latest) { latest = match.index; result[key] = value; }
			}
		}
	};
	pick('language', [
		['en', /(?:\bin (?:limba )?(?:engleza|english)\b|\bin english\b|на английском)/gu],
		['ru', /(?:\bin (?:limba )?rusa\b|\bin russian\b|на русском)/gu],
		['ro', /(?:\bin (?:limba )?romana\b|\bin romanian\b|на румынском)/gu],
	]);
	pick('level', [
		['incepator', /(?:\bpentru incepatori\b|\bnivel (?:de )?incepator\b|\bfor beginners\b|для начинающих)/gu],
		['mediu', /(?:\bnivel (?:mediu|intermediar)\b|\bintermediate level\b|для среднего уровня)/gu],
		['avansat', /(?:\bpentru avansati\b|\bnivel avansat\b|\bcurs avansat\b|\bfor advanced\b|для продвинутых)/gu],
	]);
	pick('lesson_size', [
		['scurt', /(?:\blectii scurte\b|\bshort lessons\b|короткие уроки)/gu],
		['mediu', /(?:\blectii medii\b|\bmedium[- ]length lessons\b)/gu],
		['detaliat', /(?:\blectii detaliate\b|\bdetailed lessons\b|подробные уроки)/gu],
	]);
	pick('style', [
		['practic', /(?:\bcurs practic\b|\bstil practic\b|\bhands[- ]on course\b)/gu],
		['teoretic', /(?:\bcurs teoretic\b|\bstil teoretic\b|\btheoretical course\b)/gu],
		['mixt', /(?:\bstil mixt\b|\bteorie si practica\b|\btheory and practice\b)/gu],
	]);
	for (const [key, pattern] of [
		['modules_count', /\b(\d+)\s+(?:de\s+)?(?:module|modules)\b/gu],
		['lessons_per_module', /\b(\d+)\s+(?:de\s+)?(?:lectii (?:per|pe|in fiecare) modul|lessons per module)\b/gu],
	]) {
		for (const match of text.matchAll(pattern)) {
			if (!negated(match.index)) result[key] = Number(match[1]);
		}
	}
	return result;
}
