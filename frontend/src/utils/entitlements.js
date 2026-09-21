/** @param {Record<string, unknown>|null|undefined} user */
export function getEntitlements(user) {
	return user?.entitlements || null;
}

/** @param {Record<string, unknown>|null|undefined} user @param {string} feature */
export function companyHasFeature(user, feature) {
	if (user?.is_platform_admin) return false;
	const features = user?.entitlements?.features;
	if (!features || typeof features !== 'object') {
		return false;
	}
	return Boolean(features[feature]);
}

export function isPlatformAdmin(user) {
	return Boolean(user?.is_platform_admin);
}

export function canAssignAnalyst(user) {
	return companyHasFeature(user, 'analyst_role');
}

export function formatSeatCap(max) {
	if (max == null || max === '') return '∞';
	return String(max);
}

export function seatSummary(user) {
	const seats = getEntitlements(user)?.seats;
	if (!seats) return null;
	return {
		planLabel: getEntitlements(user)?.plan_label || '',
		learnersUsed: seats.learners?.used ?? 0,
		learnersMax: seats.learners?.max ?? null,
		staffUsed: seats.staff?.used ?? 0,
		staffMax: seats.staff?.max ?? null,
	};
}
