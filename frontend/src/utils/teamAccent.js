/**
 * Culori implicite pentru echipe (paletă UI când lipsește accent_color din API).
 * Păstrată în sync cu fallback-urile din admin (carduri, modale).
 */
export const TEAM_ACCENT_COLORS = [
	'#6366f1',
	'#ec4899',
	'#14b8a6',
	'#ea580c',
	'#8b5cf6',
	'#06b6d4',
	'#84cc16',
	'#f43f5e',
];

export const TEAM_ACCENT_NEUTRAL = '#94a3b8';

function readTeamAccentColor(team) {
	if (!team) return null;
	return team.accent_color || team.accentColor || null;
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

/** Culoare chip/swatch în tabele utilizatori și liste similare. */
export function teamAccent(team) {
	return teamAccentByTeamId(team);
}
