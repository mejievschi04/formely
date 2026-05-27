/**
 * Culori implicite pentru echipe (paletă UI când lipsește accent_color din API).
 * Păstrată în sync cu fallback-urile din admin (carduri, modale).
 */
export const TEAM_ACCENT_COLORS = [
	'#6366f1',
	'#ec4899',
	'#14b8a6',
	'#f59e0b',
	'#8b5cf6',
	'#06b6d4',
	'#84cc16',
	'#f43f5e',
];

export const TEAM_ACCENT_NEUTRAL = '#94a3b8';

/**
 * Culoare afișată în liste/chip-uri: doar API sau gri neutru.
 */
export function teamAccentNeutral(team) {
	return (team && team.accent_color) || TEAM_ACCENT_NEUTRAL;
}

/**
 * Culoare stabilă per echipă (id): API sau intrare din paletă după id.
 */
export function teamAccentByTeamId(team) {
	if (!team) return TEAM_ACCENT_NEUTRAL;
	return team.accent_color || TEAM_ACCENT_COLORS[(team.id || 0) % TEAM_ACCENT_COLORS.length];
}

/**
 * Culoare în grilă ordonată: API sau paletă după poziția din listă.
 */
export function teamAccentByListIndex(team, index) {
	return team?.accent_color || TEAM_ACCENT_COLORS[(Number(index) || 0) % TEAM_ACCENT_COLORS.length];
}
