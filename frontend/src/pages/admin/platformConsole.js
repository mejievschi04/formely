export const PLAN_LABELS = {
	instructor: 'Instructor',
	academie: 'Academie',
	business: 'Business',
};

export const STATUS_LABELS = {
	active: 'Activ',
	trial: 'Demo',
	suspended: 'Suspendat',
};

/** Zile academie în status trial — același număr ca pe site („Demo gratuit 15 zile”). */
export const ACADEMY_TRIAL_DAYS = 15;

export const REASON_LABELS = {
	trial_expired: 'Demo expirat',
	trial_ending: 'Demo se încheie în 7 zile',
	seats_full: 'Locuri cursanți ocupate',
	seats_high: 'Peste 85% locuri cursanți',
	staff_full: 'Locuri staff ocupate',
	suspended: 'Suspendată',
	watch: 'De urmărit',
};

export const FEATURE_LABELS = {
	ai_creator: 'AI Creator',
	ai_builder: 'AI Builder',
	ai_tutor: 'AI Tutor',
	ai_qa: 'AI QA',
	ai_stats: 'AI Stats',
	ai_test_generation: 'AI Teste',
	library: 'Bibliotecă',
	events: 'Evenimente',
	analyst_role: 'Rol analist',
};

export const emptyFeatures = () =>
	Object.keys(FEATURE_LABELS).reduce((acc, key) => {
		acc[key] = false;
		return acc;
	}, {});

export const slugify = (value) =>
	value
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

export function seats(used, max) {
	if (max == null) return `${used ?? 0} / ∞`;
	return `${used ?? 0} / ${max}`;
}

export function seatPercent(used, max) {
	if (max == null || max <= 0) return null;
	return Math.min(100, Math.round(((used ?? 0) / max) * 100));
}

export function featureList(features) {
	return Object.entries(features || {})
		.filter(([, enabled]) => enabled)
		.map(([key]) => FEATURE_LABELS[key] || key);
}

export function planSeatLabel(plan) {
	if (!plan) return '';
	if (plan.max_active_learners == null) return 'Peste 150 cursanți';
	return `Până la ${plan.max_active_learners} cursanți`;
}
