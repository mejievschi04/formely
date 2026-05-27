/** Helpers pentru jurnalul de activitate — texte în română, fără coduri brute în UI. */

function stripHtml(html) {
	if (!html) return '';
	const tmp = document.createElement('DIV');
	tmp.innerHTML = html;
	return tmp.textContent || tmp.innerText || '';
}

/** Denumire afișată în română pentru fiecare cod de acțiune din jurnal. */
export const ACTION_LABELS_RO = {
	completed_course: 'Finalizare curs',
	completed_lesson: 'Finalizare lecție',
	completed_exam: 'Finalizare test (notă)',
	enrolled_course: 'Înscriere la curs',
	logged_in: 'Autentificare',
	session_started: 'Sesiune platformă (deschidere app)',
	logged_out: 'Deconectare',
	'telemetry.admin_course_created': 'Creare curs (administrator)',
	'telemetry.admin_course_version_published': 'Publicare versiune curs',
	'telemetry.admin_test_created': 'Creare test (administrator)',
	'telemetry.admin_test_published': 'Publicare test',
	'telemetry.learner_attempt_started': 'Începere încercare la test',
	'telemetry.learner_answer_saved': 'Salvare răspuns la test',
	'telemetry.learner_attempt_submitted': 'Trimitere încercare la test',
	'telemetry.learner_result_viewed': 'Vizualizare rezultat test',
	'telemetry.learner_retake_weak_areas_started': 'Reluare test pe zone slabe',
	'telemetry.learner_focus_seconds': 'Timp petrecut pe lecție (telemetrie)',
	'builder.upload_content_file': 'Încărcare fișier de conținut',
	'builder.create_module': 'Creare modul',
	'builder.create_lesson': 'Creare lecție',
	'builder.update_lesson': 'Actualizare lecție',
	'builder.create_content_block': 'Creare bloc de conținut',
	'builder.update_content_block': 'Actualizare bloc de conținut',
	'builder.delete_content_block': 'Ștergere bloc de conținut',
	'builder.reorder_content_blocks': 'Reordonare blocuri de conținut',
	'builder.submit_for_review': 'Trimitere curs spre verificare',
	'builder.publish_course': 'Publicare curs',
	'builder.reorder_modules': 'Reordonare module',
	'builder.reorder_lessons': 'Reordonare lecții',
	'builder.move_lesson': 'Mutare lecție',
	'builder.update_module_status': 'Actualizare stare modul',
	'builder.update_lesson_status': 'Actualizare stare lecție',
	'builder.update_lesson_preview': 'Actualizare previzualizare lecție',
	'builder.set_lesson_prerequisite': 'Setare condiționare între lecții',
	'builder.clone_course': 'Clonare curs',
	'builder.create_version': 'Creare versiune curs',
	'builder.restore_version': 'Restaurare versiune curs',
};

export function getActionLabelRo(action) {
	if (!action) return 'Acțiune nespecificată';
	if (ACTION_LABELS_RO[action]) return ACTION_LABELS_RO[action];
	return 'Activitate înregistrată în jurnal';
}

/** Etichete pentru evenimentele agregate din dashboard (câmpul `type`). */
export const DASHBOARD_ACTIVITY_TYPE_LABEL_RO = {
	enrollment: 'Înscriere',
	completion: 'Finalizare',
	lesson_completed: 'Lecție finalizată',
	learning_time: 'Timp de studiu',
	payment: 'Plată',
	course_created: 'Curs nou',
	user_registered: 'Utilizator nou',
	exam_submitted: 'Test trimis',
	test: 'Test',
	course_published: 'Curs publicat',
	user_invited: 'Invitație',
};

/** Linie scurtă pentru feed-ul din dashboard când nu există cod `action`. */
export function getDashboardActivityActionLabel(activity) {
	const raw = activity?.action;
	if (raw && typeof raw === 'string' && raw.trim()) {
		return getActionLabelRo(raw.trim());
	}
	const t = activity?.type;
	if (t && DASHBOARD_ACTIVITY_TYPE_LABEL_RO[t]) {
		return DASHBOARD_ACTIVITY_TYPE_LABEL_RO[t];
	}
	return 'Activitate în platformă';
}

/** Un singur rând, pe română simplu — fără nume de acțiuni din cod. */
export function getFriendlyLogLine(log) {
	const descRaw = log.description || '';
	const desc = stripHtml(descRaw).trim();
	const telemetryGeneric = /^Telemetry event:/i.test(desc);
	const nv = log.new_values && typeof log.new_values === 'object' ? log.new_values : {};
	const name = log.user?.name || 'Un utilizator';
	const action = log.action || '';

	if (action.startsWith('builder.')) {
		return `${name}: ${getActionLabelRo(action)}`;
	}

	if (desc && !telemetryGeneric) {
		return desc;
	}

	if (action === 'logged_in') {
		return `${name} s-a autentificat în platformă.`;
	}
	if (action === 'logged_out') {
		return `${name} s-a deconectat.`;
	}
	if (action === 'completed_course') {
		const title = nv.course_title || 'cursul';
		return `${name} a finalizat cursul „${title}”.`;
	}
	if (action === 'completed_lesson') {
		const title = nv.lesson_title || 'lecția';
		return `${name} a finalizat lecția "${title}".`;
	}
	if (action === 'completed_exam') {
		const ex = nv.exam_title || 'testul';
		const pct = nv.percentage;
		return pct != null
			? `${name} a finalizat testul „${ex}” și a obținut ${pct}%.`
			: `${name} a finalizat testul „${ex}”.`;
	}
	if (action === 'telemetry.learner_attempt_submitted') {
		const pct = nv.percentage ?? nv.score_percentage ?? nv.percent;
		const title = nv.test_title || nv.exam_title;
		if (title && pct != null) return `${name} a trimis testul „${title}” și a obținut ${pct}%.`;
		if (title) return `${name} a trimis testul „${title}”.`;
		if (pct != null) return `${name} a trimis testul și a obținut ${pct}%.`;
		return `${name} a trimis un test.`;
	}
	if (action === 'telemetry.learner_attempt_started') {
		return `${name} a început un test.`;
	}
	if (action === 'telemetry.learner_result_viewed') {
		return `${name} a vizualizat rezultatul unui test.`;
	}
	if (action === 'telemetry.learner_answer_saved') {
		return `${name} a salvat un răspuns la test.`;
	}
	if (action === 'telemetry.learner_retake_weak_areas_started') {
		return `${name} a reluat testul pe zone slabe.`;
	}
	if (action === 'telemetry.learner_focus_seconds') {
		const sec = nv.seconds;
		return sec ? `${name} a petrecut timp pe o lecție (${sec} secunde).` : `${name} a avansat la o lecție.`;
	}

	if (telemetryGeneric) {
		if (action) {
			return `${name}: ${getActionLabelRo(action)}`;
		}
		const rest = desc.replace(/^Telemetry event:\s*/i, '').trim();
		if (rest) {
			return `${name}: ${getActionLabelRo(`telemetry.${rest}`)}`;
		}
		return `${name} — activitate în platformă`;
	}
	return desc || `${name} — activitate în platformă`;
}
