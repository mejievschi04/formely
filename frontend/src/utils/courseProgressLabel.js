/**
 * Textul progresului unui curs: „Finalizat” la 100%, altfel procentul rotunjit (ex. „67%”).
 */
export function courseProgressLabel(value) {
	const pct = Math.round(Math.min(100, Math.max(0, Number(value) || 0)));
	return pct >= 100 ? 'Finalizat' : `${pct}%`;
}

export default courseProgressLabel;
