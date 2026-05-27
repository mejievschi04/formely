/**
 * Export CSV pentru rapoarte statistică — UTF-8 BOM, rânduri aliniate pe număr de coloane (Excel).
 */

const BOM = '\uFEFF';

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeCsvCell(value) {
	if (value === null || value === undefined) return '';
	const s = String(value);
	if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

/**
 * @param {string[]} cells
 * @returns {string}
 */
export function csvJoinRow(cells) {
	return cells.map(escapeCsvCell).join(',');
}

/**
 * @param {string} filename Fără extensie sau cu .csv
 * @param {string[][]} rows
 */
export function downloadCsv(filename, rows) {
	const safeName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
	const content = BOM + rows.map((r) => csvJoinRow(r)).join('\r\n');
	const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.setAttribute('download', safeName);
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

/**
 * @param {string[]} cells
 * @param {number} width
 * @returns {string[]}
 */
function padRow(cells, width) {
	const r = cells.slice();
	while (r.length < width) r.push('');
	return r;
}

/**
 * @returns {string} YYYY-MM-DD
 */
export function csvExportDateStamp() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/**
 * Eticheta perioadă pentru antet CSV.
 * @param {string} periodFrom
 * @param {string} periodTo
 */
export function formatCsvPeriodLabel(periodFrom, periodTo) {
	if (periodFrom && periodTo) return `${periodFrom} → ${periodTo}`;
	if (periodFrom) return `De la ${periodFrom}`;
	if (periodTo) return `Până la ${periodTo}`;
	return 'Toată perioada (fără filtru date în export)';
}

/**
 * Construiește rânduri CSV: antet document, KPI opțional, tabel principal, secțiuni extra.
 *
 * @param {object} opts
 * @param {string} opts.sheetLabel
 * @param {string} [opts.periodFrom]
 * @param {string} [opts.periodTo]
 * @param {Array<[string, string|number]>} [opts.kpiEntries]
 * @param {string[]} opts.tableHeaders
 * @param {Array<string[]|number[]>} opts.tableRows — aceeași lungime ca tableHeaders
 * @param {Array<{ title: string, headers: string[], rows: Array<string[]|number[]> }>} [opts.extraSections]
 * @param {Array<[string, string|number]>} [opts.extraMeta] — linii după „Perioadă filtru”
 * @returns {string[][]}
 */
export function buildStructuredCsv({
	sheetLabel,
	periodFrom = '',
	periodTo = '',
	kpiEntries = null,
	tableHeaders,
	tableRows,
	extraSections = null,
	extraMeta = null,
}) {
	let width = Math.max(tableHeaders.length, 2);
	if (extraSections) {
		for (const s of extraSections) {
			width = Math.max(width, s.headers.length, ...s.rows.map((r) => r.length));
		}
	}

	const rows = [];
	const push = (cells) => rows.push(padRow(cells, width));

	push(['Formely – Statistică']);
	push(['Raport', sheetLabel]);
	push(['Generat', new Date().toISOString()]);
	push(['Perioadă filtru', formatCsvPeriodLabel(periodFrom, periodTo)]);
	if (extraMeta && extraMeta.length > 0) {
		extraMeta.forEach(([k, v]) => push([k, v]));
	}
	push([]);

	if (kpiEntries && kpiEntries.length > 0) {
		push(['Indicatori rezumat']);
		push(['Indicator', 'Valoare']);
		kpiEntries.forEach(([k, v]) => push([k, v]));
		push([]);
	}

	push(['Date detaliate']);
	push(tableHeaders);
	tableRows.forEach((r) => push(r));

	if (extraSections && extraSections.length > 0) {
		for (const sec of extraSections) {
			push([]);
			push([sec.title]);
			push(sec.headers);
			sec.rows.forEach((r) => push(r));
		}
	}

	return rows;
}

/**
 * Nume fișier sigur (fără caractere problematice).
 * @param {string} slug
 */
export function statisticsCsvFilename(slug) {
	const s = String(slug || 'export')
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9-]/gi, '')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	return `statistica-${s || 'export'}_${csvExportDateStamp()}`;
}
