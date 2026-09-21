import React, { useCallback, useState } from 'react';
import { DownloadSimple, Lightning, Sparkle } from '@phosphor-icons/react';
import { adminService } from '../../../services/api';
import {
	buildStructuredExcelRows,
	downloadStructuredExcel,
	statisticsExcelFilename,
} from '../../../utils/statisticsExcelExport';
import { isAiEnabled, notifyAiComingSoon, canUseAiFeature, notifyAiPlanLocked } from '../../../utils/aiAvailability';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import './AIStatisticsExportPanel.css';

const EXAMPLE_PROMPTS = [
	'Top 10 studenți după scor la teste',
	'Rezultate teste promovate din ultima lună',
	'Progres elevilor cu email și cursuri finalizate',
	'Sumar cursuri: câți elevi înscriși și rata de finalizare',
	'Toate înscrierile cu procent progres și timp petrecut',
];

const AIStatisticsExportPanel = ({ dateFrom: initialDateFrom = '', dateTo: initialDateTo = '' }) => {
	const { showToast } = useToast();
	const { user } = useAuth();
	const aiAllowed = canUseAiFeature(user, 'ai_stats');
	const [prompt, setPrompt] = useState('');
	const [dateFrom, setDateFrom] = useState(initialDateFrom);
	const [dateTo, setDateTo] = useState(initialDateTo);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [exportData, setExportData] = useState(null);

	const handleGenerate = useCallback(async () => {
		if (!isAiEnabled()) {
			notifyAiComingSoon(showToast);
			return;
		}
		if (!aiAllowed) {
			notifyAiPlanLocked(showToast);
			return;
		}
		const trimmed = prompt.trim();
		if (trimmed.length < 3) {
			setError('Descrie ce date vrei în export (minim 3 caractere).');
			return;
		}

		try {
			setLoading(true);
			setError('');
			const payload = { prompt: trimmed };
			if (dateFrom) payload.date_from = dateFrom;
			if (dateTo) payload.date_to = dateTo;
			const res = await adminService.generateStatisticsExportWithAi(payload);
			setExportData(res);
		} catch (e) {
			const message = e?.response?.data?.error || e?.message || 'Nu s-a putut genera exportul.';
			setError(message);
			setExportData(null);
		} finally {
			setLoading(false);
		}
	}, [prompt, dateFrom, dateTo, showToast, aiAllowed]);

	const handleDownload = useCallback(() => {
		if (!exportData?.headers?.length) return;

		const kpiEntries = (exportData.kpis || []).map(([label, value]) => [label, value]);
		const extraMeta = [
			['Tip raport', exportData.dataset_label || exportData.dataset || '—'],
		];
		if (exportData.summary) {
			extraMeta.push(['Rezumat Formely AI', exportData.summary]);
		}

		const rows = buildStructuredExcelRows({
			sheetLabel: exportData.title || 'Export Formely AI',
			periodFrom: exportData.filters_applied?.date_from || dateFrom,
			periodTo: exportData.filters_applied?.date_to || dateTo,
			kpiEntries: kpiEntries.length ? kpiEntries : null,
			extraMeta,
			tableHeaders: exportData.headers,
			tableRows: exportData.rows || [],
		});

		const slug = exportData.filename_slug || exportData.dataset || 'formely-export';
		downloadStructuredExcel(statisticsExcelFilename(slug), exportData.title || 'Export Formely AI', rows);
		showToast('Export Excel descărcat.', 'success');
	}, [exportData, dateFrom, dateTo, showToast]);

	const previewRows = (exportData?.rows || []).slice(0, 8);

	if (!isAiEnabled() || !aiAllowed) {
		return null;
	}

	return (
		<div className="formely-ai-export-panel">
			<div className="formely-ai-export-hero">
				<div className="formely-ai-export-hero-icon" aria-hidden>
					<Sparkle size={28} weight="duotone" />
				</div>
				<div>
					<h2 className="admin-statistics-section-heading">Export cu Formely AI</h2>
					<p className="formely-ai-export-subtitle">
						Scrie ce date vrei — Formely AI alege sursa potrivită, extrage datele din platformă și pregătește Excel.
					</p>
				</div>
			</div>

			<label className="formely-ai-export-label" htmlFor="formely-export-prompt">
				Ce vrei în export?
			</label>
			<div className="formely-ai-export-filters">
				<label>
					<span>De la</span>
					<input
						type="date"
						value={dateFrom}
						onChange={(e) => setDateFrom(e.target.value)}
						disabled={loading}
					/>
				</label>
				<label>
					<span>Până la</span>
					<input
						type="date"
						value={dateTo}
						onChange={(e) => setDateTo(e.target.value)}
						disabled={loading}
					/>
				</label>
			</div>
			<textarea
				id="formely-export-prompt"
				className="formely-ai-export-textarea"
				rows={4}
				value={prompt}
				onChange={(e) => setPrompt(e.target.value)}
				placeholder="Ex: Top 10 elevi după scor la teste din ultima lună, cu email și cursuri finalizate"
				disabled={loading}
			/>

			<div className="formely-ai-export-examples">
				<span className="formely-ai-export-examples-label">Exemple rapide:</span>
				<div className="formely-ai-export-chips">
					{EXAMPLE_PROMPTS.map((example) => (
						<button
							key={example}
							type="button"
							className="formely-ai-export-chip"
							onClick={() => setPrompt(example)}
							disabled={loading}
						>
							{example}
						</button>
					))}
				</div>
			</div>

			<div className="formely-ai-export-actions">
				<button
					type="button"
					className="admin-btn admin-btn-primary formely-ai-export-generate-btn"
					onClick={handleGenerate}
					disabled={loading || prompt.trim().length < 3}
				>
					<Lightning size={18} weight="fill" aria-hidden />
					{loading ? 'Formely AI analizează...' : 'Generează export'}
				</button>
				{exportData ? (
					<button
						type="button"
						className="admin-btn admin-btn-secondary"
						onClick={handleDownload}
						disabled={!exportData.rows?.length}
					>
						<DownloadSimple size={18} weight="bold" aria-hidden />
						Descarcă Excel
					</button>
				) : null}
			</div>

			{error ? <div className="formely-ai-export-error" role="alert">{error}</div> : null}

			{exportData ? (
				<div className="formely-ai-export-result">
					<div className="formely-ai-export-result-header">
						<div>
							<h3>{exportData.title}</h3>
							<p>{exportData.summary}</p>
						</div>
						<span className="formely-ai-export-badge">
							{exportData.row_count ?? 0} rânduri · {exportData.dataset_label}
						</span>
					</div>

					{exportData.kpis?.length ? (
						<div className="formely-ai-export-kpis">
							{exportData.kpis.map(([label, value]) => (
								<div key={label} className="formely-ai-export-kpi">
									<span>{label}</span>
									<strong>{value}</strong>
								</div>
							))}
						</div>
					) : null}

					{previewRows.length ? (
						<div className="formely-ai-export-preview-wrap">
							<table className="formely-ai-export-preview-table">
								<thead>
									<tr>
										{exportData.headers.map((header) => (
											<th key={header}>{header}</th>
										))}
									</tr>
								</thead>
								<tbody>
									{previewRows.map((row, rowIndex) => (
										<tr key={`preview-${rowIndex}`}>
											{row.map((cell, cellIndex) => (
												<td key={`${rowIndex}-${cellIndex}`}>{cell ?? '—'}</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
							{(exportData.row_count ?? 0) > previewRows.length ? (
								<p className="formely-ai-export-preview-note">
									Previzualizare primele {previewRows.length} din {exportData.row_count} rânduri.
								</p>
							) : null}
						</div>
					) : (
						<div className="admin-statistics-student-empty">
							Nu s-au găsit date pentru cererea ta. Încearcă o altă formulare sau altă perioadă.
						</div>
					)}
				</div>
			) : null}
		</div>
	);
};

export default AIStatisticsExportPanel;
