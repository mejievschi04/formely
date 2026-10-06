/** Formely: planul academiei vine pe user.entitlements (de la /auth/me și /auth/login). */

/** @param {Record<string, unknown>|null|undefined} user @param {string} feature */
export function companyHasFeature(user, feature) {
	if (user?.is_platform_admin) return false;
	const features = user?.entitlements?.features;
	// Fără informații de plan (ex. sesiune veche) nu ascundem nimic; backend-ul tot verifică.
	if (!features || typeof features !== 'object') return true;
	return Boolean(features[feature]);
}

/** Funcția de plan care deblochează o rută din meniu (dacă există). */
const FEATURE_BY_PATH = {
	'/events': 'events',
	'/admin/events': 'events',
	'/library': 'library',
};

/** Păstrează în meniu doar intrările incluse în planul academiei. */
export function filterNavByPlan(user, items) {
	return items.filter((item) => {
		const feature = item && FEATURE_BY_PATH[item.path];
		return !feature || companyHasFeature(user, feature);
	});
}
