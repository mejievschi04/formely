export const toTeamKey = (teamId) => `team-${teamId}`;

/** orderKey: `dept-12` sau `none` */
export const toContainerDroppableId = (orderKey) => `container-${orderKey}`;

export function parseTeamKey(id) {
	if (typeof id !== 'string' || !id.startsWith('team-')) return null;
	const n = Number(id.slice(5));
	return Number.isFinite(n) ? n : null;
}

export function parseContainerKey(id) {
	if (typeof id !== 'string' || !id.startsWith('container-')) return null;
	return id.slice(10);
}

export function findOrderKeyForTeam(teamOrders, teamId) {
	for (const [key, list] of Object.entries(teamOrders || {})) {
		if ((list || []).some((t) => t.id === teamId)) return key;
	}
	return null;
}

export function departmentIdFromOrderKey(orderKey) {
	if (!orderKey || orderKey === 'none') return null;
	if (orderKey.startsWith('dept-')) return Number(orderKey.slice(5));
	return null;
}

export function resolveTargetOrderKey(overId, teamOrders) {
	if (typeof overId !== 'string') return null;
	const container = parseContainerKey(overId);
	if (container) return container;
	const teamId = parseTeamKey(overId);
	if (teamId != null) return findOrderKeyForTeam(teamOrders, teamId);
	return null;
}
