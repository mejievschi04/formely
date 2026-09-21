/**
 * Culori implicite pentru echipe (paletă UI când lipsește accent_color din API).
 * Păstrată în sync cu fallback-urile din admin (carduri, modale).
 */
export const TEAM_ACCENT_COLORS = [
	'#0891b2',
	'#22d3ee',
	'#0e7490',
	'#155e75',
	'#38bdf8',
	'#0284c7',
	'#67e8f9',
	'#0f172a',
];

export const TEAM_ACCENT_NEUTRAL = '#94a3b8';

function readTeamAccentColor(team) {
	if (!team) return null;
	return team.accent_color || team.accentColor || null;
}

/**
 * Culoare afișată în liste/chip-uri: doar API sau gri neutru.
 */
export function teamAccentNeutral(team) {
	return readTeamAccentColor(team) || TEAM_ACCENT_NEUTRAL;
}

/**
 * Culoare stabilă per echipă (id): API sau intrare din paletă după id.
 */
export function teamAccentByTeamId(team) {
	if (!team) return TEAM_ACCENT_NEUTRAL;
	return readTeamAccentColor(team) || TEAM_ACCENT_COLORS[(team.id || 0) % TEAM_ACCENT_COLORS.length];
}

/**
 * Culoare în grilă ordonată: API sau paletă după poziția din listă.
 */
export function teamAccentByListIndex(team, index) {
	return readTeamAccentColor(team) || TEAM_ACCENT_COLORS[(Number(index) || 0) % TEAM_ACCENT_COLORS.length];
}
