const trimOrEmpty = (value) => String(value || '').trim();

export const buildCourseCreationPromptFromBrief = (briefPayload, manualPrompt = '') => {
	const requestedPrompt = trimOrEmpty(manualPrompt);
	if (!briefPayload) {
		return requestedPrompt;
	}

	const titleOrTopic = briefPayload.course_title || briefPayload.topic || 'Curs nou';
	const rows = [
		`Creează cursul complet pe baza acestui brief: ${titleOrTopic}.`,
		`Titlu dorit: ${briefPayload.course_title || '(alege tu un titlu potrivit)'}.`,
		`Temă/subiect: ${briefPayload.topic || '(neprecizat)'}. Public: ${briefPayload.target_audience || '(neprecizat)'}.`,
		`Nivel: ${briefPayload.level}; Stil: ${briefPayload.style}; Dimensiune lecții: ${briefPayload.lesson_size}.`,
		`Structură fixă: ${briefPayload.modules_count} module, ${briefPayload.lessons_per_module} lecții per modul.`,
		`Descriere: ${briefPayload.description || '(generează una profesională și clară)'}.`,
		'Fiecare lecție trebuie să fie predabilă: introducere, explicație, exemplu, exercițiu/aplicație și recapitulare.',
		'Păstrează tonul practic și coerent pe tot cursul. Dacă datele de mai sus sunt suficiente, nu cere clarificări și livrează direct cursul final.',
	];

	if (requestedPrompt) {
		rows.push(`Instrucțiuni suplimentare de la profesor: ${requestedPrompt}`);
	}

	return rows.join('\n');
};

