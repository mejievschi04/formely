import * as XLSX from 'xlsx';

function normalizeCell(value) {
	if (value === null || value === undefined) return '';
	return value;
}

function safeSheetName(name) {
	return String(name || 'Raport')
		.replace(/[\\/*?:[\]]/g, ' ')
		.trim()
		.slice(0, 31) || 'Raport';
}

function downloadWorkbook(filename, workbook) {
	const safeName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
	XLSX.writeFile(workbook, safeName, { compression: true });
}

function padRow(cells, width) {
	const row = cells.slice();
	while (row.length < width) row.push('');
	return row;
}

function computeColumnWidths(rows) {
	if (!Array.isArray(rows) || rows.length === 0) return [];
	const colCount = Math.max(...rows.map((row) => row.length));
	return Array.from({ length: colCount }, (_, colIndex) => {
		let maxLen = 10;
		rows.forEach((row) => {
			const value = row[colIndex];
			const len = String(value ?? '').length;
			if (len > maxLen) maxLen = len;
		});
		return { wch: Math.min(Math.max(maxLen + 2, 10), 36) };
	});
}

function findMainTableRange(rows) {
	const titleRowIndex = rows.findIndex((row) => String(row?.[0] || '').trim() === 'Date detaliate');
	if (titleRowIndex === -1) return null;
	const headerRowIndex = titleRowIndex + 1;
	const header = rows[headerRowIndex] || [];
	if (!header.length) return null;

	let endRowIndex = rows.length - 1;
	for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
		const isBlank = rows[i].every((cell) => String(cell ?? '').trim() === '');
		const firstCell = String(rows[i]?.[0] || '').trim();
		const looksLikeSectionTitle =
			firstCell && rows[i].slice(1).every((cell) => String(cell ?? '').trim() === '');

		if (isBlank && i + 2 < rows.length) {
			endRowIndex = i - 1;
			break;
		}

		if (looksLikeSectionTitle && i > headerRowIndex + 1) {
			endRowIndex = i - 1;
			break;
		}
	}

	return {
		s: { r: headerRowIndex, c: 0 },
		e: { r: endRowIndex, c: Math.max(header.length - 1, 0) },
	};
}

export function excelExportDateStamp() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function formatExcelPeriodLabel(periodFrom, periodTo) {
	if (periodFrom && periodTo) return `${periodFrom} -> ${periodTo}`;
	if (periodFrom) return `De la ${periodFrom}`;
	if (periodTo) return `Până la ${periodTo}`;
	return 'Toată perioada (fără filtru de date în export)';
}

export function buildStructuredExcelRows({
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
		for (const section of extraSections) {
			width = Math.max(width, section.headers.length, ...section.rows.map((row) => row.length));
		}
	}

	const rows = [];
	const push = (cells) => rows.push(padRow(cells.map(normalizeCell), width));

	push(['Formely - Statistica']);
	push(['Raport', sheetLabel]);
	push(['Generat la', new Date().toLocaleString('ro-RO')]);
	push(['Perioada filtru', formatExcelPeriodLabel(periodFrom, periodTo)]);
	if (extraMeta && extraMeta.length > 0) {
		extraMeta.forEach(([label, value]) => push([label, value]));
	}
	push([]);

	if (kpiEntries && kpiEntries.length > 0) {
		push(['Indicatori rezumat']);
		push(['Indicator', 'Valoare']);
		kpiEntries.forEach(([label, value]) => push([label, value]));
		push([]);
	}

	push(['Date detaliate']);
	push(tableHeaders);
	tableRows.forEach((row) => push(row));

	if (extraSections && extraSections.length > 0) {
		extraSections.forEach((section) => {
			push([]);
			push([section.title]);
			push(section.headers);
			section.rows.forEach((row) => push(row));
		});
	}

	return rows;
}

export function downloadStructuredExcel(filename, sheetLabel, rows) {
	const workbook = XLSX.utils.book_new();
	const worksheet = XLSX.utils.aoa_to_sheet(rows);
	worksheet['!cols'] = computeColumnWidths(rows);

	const tableRange = findMainTableRange(rows);
	if (tableRange) {
		worksheet['!autofilter'] = { ref: XLSX.utils.encode_range(tableRange) };
	}

	XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheetLabel));
	downloadWorkbook(filename, workbook);
}

export function statisticsExcelFilename(slug) {
	const s = String(slug || 'export')
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9-]/gi, '')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	return `statistica-${s || 'export'}_${excelExportDateStamp()}`;
}
