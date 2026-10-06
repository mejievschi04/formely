import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
	ArrowsClockwise,
	ChartBar,
	ChartPieSlice,
	CheckCircle,
	DownloadSimple,
	ListChecks,
	Users,
	WarningCircle,
} from '@phosphor-icons/react';
import {
	Bar,
	BarChart,
	Cell,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { adminService } from '../../../services/api';

import { useToast } from '../../../contexts/ToastContextShared.js';
import {
	buildStructuredExcelRows,
	downloadStructuredExcel,
	statisticsExcelFilename,
} from '../../../utils/statisticsExcelExport';
import { stripRichTextToPlain } from '../../../utils/richTextContent';
import RichTextHtml from '../../RichTextHtml';
import TestResultsPanel from './TestResultsPanel';
import { rowMatchesResultFilters } from './TestResultsPanelShared.js';
import './TestStatisticsPanel.css';

const TYPE_LABELS = {
	multiple_choice: 'Răspuns multiplu',
	single_choice: 'Răspuns unic',
	true_false: 'Adevărat / Fals',
	yes_no: 'Da / Nu',
	matching: 'Potrivire',
	ordering: 'Ordonare',
};

const SECTIONS = [
	{ id: 'overview', label: 'Prezentare generală', icon: ChartPieSlice },
	{ id: 'students', label: 'Utilizatori', icon: Users },
	{ id: 'items', label: 'Analiză întrebări', icon: ListChecks },
];

function typeLabel(type) {
	return TYPE_LABELS[type] || type || 'Întrebare';
}

function plainQuestionPreview(html, maxLen = 72) {
	const plain = stripRichTextToPlain(html);
	if (!plain) return '';
	return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain;
}

function buildScoreBuckets(results) {
	const buckets = [
		{ label: '0–49%', min: 0, max: 49, count: 0 },
		{ label: '50–69%', min: 50, max: 69, count: 0 },
		{ label: '70–84%', min: 70, max: 84, count: 0 },
		{ label: '85–100%', min: 85, max: 100, count: 0 },
	];

	results.forEach((row) => {
		const pct = Number(row?.percentage);
		if (!Number.isFinite(pct)) return;
		const bucket = buckets.find((b) => pct >= b.min && pct <= b.max);
		if (bucket) bucket.count += 1;
	});

	return buckets.map(({ label, count }) => ({ label, count }));
}

function KpiCard({ icon: Icon, label, value, hint, accent }) {
	return (
		<article className="test-stats__kpi" style={{ '--kpi-accent': accent }}>
			<div className="test-stats__kpi-top">
				<span className="test-stats__kpi-label">{label}</span>
				<span className="test-stats__kpi-icon" aria-hidden>
					<Icon size={18} weight="duotone" />
				</span>
			</div>
			<strong className="test-stats__kpi-value">{value}</strong>
			{hint ? <span className="test-stats__kpi-hint">{hint}</span> : null}
		</article>
	);
}

/**
 * Panou statistici test: prezentare generală, elevi, analiză pe întrebări.
 */
export default function TestStatisticsPanel({ testId, testTitle = 'Test' }) {
	const { error: showError } = useToast();
	const [section, setSection] = useState('overview');
	const [loading, setLoading] = useState(true);
	const [summary, setSummary] = useState(null);
	const [questionRows, setQuestionRows] = useState([]);
	const [resultRows, setResultRows] = useState([]);
	const [statusFilter, setStatusFilter] = useState('all');
	const [dateFrom, setDateFrom] = useState('');
	const [dateTo, setDateTo] = useState('');

	const loadStatistics = useCallback(async () => {
		if (!testId) return;
		setLoading(true);
		try {
			const [summaryRes, questionsRes, resultsRes] = await Promise.all([
				adminService.getTestStatisticsSummary(testId),
				adminService.getTestQuestionAnalytics(testId),
				adminService.getTestResults(testId),
			]);
			setSummary(summaryRes?.summary ?? null);
			setQuestionRows(Array.isArray(questionsRes) ? questionsRes : []);
			setResultRows(Array.isArray(resultsRes) ? resultsRes : []);
		} catch (e) {
			console.error('Failed to load test statistics:', e);
			setSummary(null);
			setQuestionRows([]);
			setResultRows([]);
			showError('Nu s-au putut încărca statisticile testului.');
		} finally {
			setLoading(false);
		}
	}, [testId, showError]);

	useEffect(() => {
		loadStatistics();
	}, [loadStatistics]);

	const passRate = summary?.attempts_count
		? Math.round((summary.pass_count / summary.attempts_count) * 100)
		: null;

	const passFailData = useMemo(() => {
		if (!summary?.attempts_count) return [];
		return [
			{ name: 'Promovați', value: summary.pass_count || 0, fill: '#10b981' },
			{ name: 'Nepromovați', value: summary.fail_count || 0, fill: '#ef4444' },
		].filter((row) => row.value > 0);
	}, [summary]);

	const scoreDistribution = useMemo(() => buildScoreBuckets(resultRows), [resultRows]);

	const sortedQuestions = useMemo(
		() => [...questionRows].sort((a, b) => {
			const aRate = a.correct_rate ?? 101;
			const bRate = b.correct_rate ?? 101;
			return aRate - bRate;
		}),
		[questionRows],
	);

	const hardestQuestion = sortedQuestions.find((q) => q.correct_rate != null) || null;
	const easiestQuestion = [...sortedQuestions].reverse().find((q) => q.correct_rate != null) || null;
	const skipTotal = questionRows.reduce((sum, q) => sum + (q.skipped_count || 0), 0);
	const answeredTotal = questionRows.reduce((sum, q) => sum + (q.answered_count || 0), 0);
	const skipRate = answeredTotal + skipTotal > 0
		? Math.round((skipTotal / (answeredTotal + skipTotal)) * 100)
		: null;

	const filteredResultRows = useMemo(
		() => resultRows.filter((row) => rowMatchesResultFilters(row, { statusFilter, dateFrom, dateTo })),
		[resultRows, statusFilter, dateFrom, dateTo],
	);

	const handleExport = () => {
		const slug = testTitle.toLowerCase().replace(/\s+/g, '-').slice(0, 40) || `test-${testId}`;
		const kpiEntries = summary ? [
			['Încercări', summary.attempts_count ?? 0],
			['Utilizatori unici', summary.unique_students ?? 0],
			['Rată promovare', passRate != null ? `${passRate}%` : '—'],
			['Medie procent', summary.average_percentage != null ? `${summary.average_percentage}%` : '—'],
			['Prag promovare', `${summary.passing_score ?? 70}%`],
		] : [];

		const studentRows = filteredResultRows.map((row) => [
			row.completed_at ? new Date(row.completed_at).toLocaleString('ro-RO') : '—',
			row.user?.name || '—',
			row.user?.email || '—',
			row.attempt_number ?? '—',
			row.score ?? 0,
			row.max_score ?? '—',
			row.percentage != null ? `${row.percentage}%` : '—',
			row.passed ? 'Promovat' : (row.needs_manual_review ? 'În așteptare' : 'Nepromovat'),
		]);

		const questionExportRows = sortedQuestions.map((q, index) => [
			index + 1,
			plainQuestionPreview(q.question_text, 500) || '—',
			typeLabel(q.question_type),
			q.presented_count ?? q.attempts ?? 0,
			q.answered_count ?? 0,
			q.skipped_count ?? 0,
			q.correct_rate != null ? `${Math.round(q.correct_rate)}%` : '—',
			q.difficulty_index != null ? Number(q.difficulty_index).toFixed(2) : '—',
		]);

		const rows = buildStructuredExcelRows({
			sheetLabel: `Statistici ${testTitle}`,
			periodFrom: dateFrom,
			periodTo: dateTo,
			kpiEntries,
			tableHeaders: ['Finalizat', 'Utilizator', 'Email', 'Încercare', 'Scor', 'Punctaj maxim', 'Procent', 'Stare'],
			tableRows: studentRows,
			extraSections: questionExportRows.length ? [{
				title: 'Analiză pe întrebări',
				headers: ['#', 'Întrebare', 'Tip', 'Prezentări', 'Răspunsuri', 'Omise', 'Rată corect', 'Dificultate'],
				rows: questionExportRows,
			}] : null,
			extraMeta: [['Test', testTitle]],
		});

		downloadStructuredExcel(statisticsExcelFilename(slug), `Statistici ${testTitle}`, rows);
	};

	const hasAttempts = Boolean(summary?.attempts_count);

	return (
		<div className="test-stats">
			<div className="test-stats__toolbar">
				<div className="test-stats__toolbar-copy">
					<h2>{testTitle}</h2>
					<p>
						Rezumat, rezultate pe elevi și analiză detaliată pe fiecare întrebare.
					</p>
				</div>
				<div className="test-stats__toolbar-actions">
					<nav className="test-stats__nav" role="tablist" aria-label="Secțiuni statistici">
						{SECTIONS.map(({ id, label, icon: Icon }) => (
							<button
								key={id}
								type="button"
								role="tab"
								aria-selected={section === id}
								className={`test-stats__nav-btn${section === id ? ' is-active' : ''}`}
								onClick={() => setSection(id)}
							>
								<Icon size={16} weight="bold" aria-hidden />
								{label}
							</button>
						))}
					</nav>
					<button
						type="button"
						className="test-stats__refresh"
						onClick={handleExport}
						disabled={loading || !hasAttempts}
					>
						<DownloadSimple size={16} weight="bold" aria-hidden />
						Exportă Excel
					</button>
					<button
						type="button"
						className="test-stats__refresh"
						onClick={loadStatistics}
						disabled={loading}
					>
						<ArrowsClockwise size={16} weight="bold" aria-hidden />
						{loading ? 'Se încarcă…' : 'Actualizează'}
					</button>
				</div>
			</div>

			{section === 'overview' ? (
				loading && !summary ? (
					<div className="test-stats__empty">
						<strong>Se încarcă datele…</strong>
						<span>Agregăm încercările și analiza pe întrebări.</span>
					</div>
				) : !hasAttempts ? (
					<div className="test-stats__empty">
						<strong>Nicio încercare încă</strong>
						<span>După ce elevii finalizează testul, vei vedea distribuția scorurilor și observații utile.</span>
					</div>
				) : (
					<>
						<div className="test-stats__kpis">
							<KpiCard icon={Users} label="Încercări" value={summary.attempts_count} hint={`${summary.unique_students} utilizatori unici`} accent="#6366f1" />
							<KpiCard icon={CheckCircle} label="Rată promovare" value={passRate != null ? `${passRate}%` : '—'} hint={`${summary.pass_count} promovați`} accent="#10b981" />
							<KpiCard icon={ChartBar} label="Medie" value={summary.average_percentage != null ? `${summary.average_percentage}%` : '—'} hint={`Scor mediu ${summary.average_score ?? '—'}`} accent="#8b5cf6" />
							<KpiCard icon={ChartPieSlice} label="Interval" value={`${summary.low_percentage ?? '—'}–${summary.high_percentage ?? '—'}%`} hint={`Prag ${summary.passing_score ?? 70}%`} accent="#0ea5e9" />
							{summary.pending_review_count > 0 ? (
								<KpiCard icon={WarningCircle} label="Verificare" value={summary.pending_review_count} hint="Încercări în așteptare" accent="#ea580c" />
							) : null}
						</div>

						<div className="test-stats__charts">
							<article className="test-stats__card">
								<div className="test-stats__card-head">
									<h3>Rezultat promovare</h3>
									<p>Proporție promovați față de nepromovați</p>
								</div>
								<div className="test-stats__chart-wrap">
									{passFailData.length > 0 ? (
										<ResponsiveContainer width="100%" height={220}>
											<PieChart>
												<Pie
													data={passFailData}
													dataKey="value"
													nameKey="name"
													innerRadius={52}
													outerRadius={78}
													paddingAngle={3}
												>
													{passFailData.map((entry) => (
														<Cell key={entry.name} fill={entry.fill} />
													))}
												</Pie>
												<Tooltip
													formatter={(value, name) => [`${value} încercări`, name]}
													contentStyle={{
														borderRadius: 10,
														border: '1px solid var(--border-primary)',
														background: 'var(--bg-elevated)',
													}}
												/>
											</PieChart>
										</ResponsiveContainer>
									) : (
										<div className="test-stats__empty">Fără date de afișat.</div>
									)}
								</div>
								<div className="test-stats__legend">
									{passFailData.map((row) => (
										<span key={row.name} className="test-stats__legend-item">
											<span className="test-stats__legend-dot" style={{ background: row.fill }} />
											{row.name}: {row.value}
										</span>
									))}
								</div>
							</article>

							<article className="test-stats__card">
								<div className="test-stats__card-head">
									<h3>Distribuție scoruri</h3>
									<p>Repartizare pe intervale de procentaj</p>
								</div>
								<div className="test-stats__chart-wrap">
									<ResponsiveContainer width="100%" height={220}>
										<BarChart data={scoreDistribution} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
											<XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="var(--text-tertiary)" />
											<YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="var(--text-tertiary)" />
											<Tooltip
												formatter={(value) => [`${value} elevi`, 'Încercări']}
												contentStyle={{
													borderRadius: 10,
													border: '1px solid var(--border-primary)',
													background: 'var(--bg-elevated)',
												}}
											/>
											<Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={48} />
										</BarChart>
									</ResponsiveContainer>
								</div>
							</article>
						</div>

						<div className="test-stats__insights">
							<div className="test-stats__insight">
								<span className="test-stats__insight-label">Cea mai dificilă întrebare</span>
								<div className="test-stats__insight-value">
									{plainQuestionPreview(hardestQuestion?.question_text) || '—'}
								</div>
								{hardestQuestion?.correct_rate != null ? (
									<div className="test-stats__insight-meta">{Math.round(hardestQuestion.correct_rate)}% răspunsuri corecte</div>
								) : null}
							</div>
							<div className="test-stats__insight">
								<span className="test-stats__insight-label">Cea mai ușoară întrebare</span>
								<div className="test-stats__insight-value">
									{plainQuestionPreview(easiestQuestion?.question_text) || '—'}
								</div>
								{easiestQuestion?.correct_rate != null ? (
									<div className="test-stats__insight-meta">{Math.round(easiestQuestion.correct_rate)}% răspunsuri corecte</div>
								) : null}
							</div>
							<div className="test-stats__insight">
								<span className="test-stats__insight-label">Răspunsuri omise</span>
								<div className="test-stats__insight-value">{skipRate != null ? `${skipRate}%` : '—'}</div>
								<div className="test-stats__insight-meta">{skipTotal} răspunsuri omise din totalul înregistrărilor pe întrebări</div>
							</div>
						</div>
					</>
				)
			) : null}

			{section === 'students' ? (
				<div className="test-stats__students-slot">
					<div className="test-stats__filters">
						<label>
							Stare
							<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
								<option value="all">Toate</option>
								<option value="passed">Promovați</option>
								<option value="failed">Nepromovați</option>
								<option value="pending">În așteptare</option>
							</select>
						</label>
						<label>
							De la
							<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
						</label>
						<label>
							Până la
							<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
						</label>
						<span className="test-stats__filters-count">{filteredResultRows.length} încercări filtrate</span>
					</div>
					<TestResultsPanel
						kind="test"
						entityId={testId}
						entityTitle={testTitle}
						showBreakdown
						embedded
						statusFilter={statusFilter}
						dateFrom={dateFrom}
						dateTo={dateTo}
					/>
				</div>
			) : null}

			{section === 'items' ? (
				loading && questionRows.length === 0 ? (
					<div className="test-stats__empty">
						<strong>Se încarcă analiza pe întrebări…</strong>
					</div>
				) : questionRows.length === 0 ? (
					<div className="test-stats__empty">
						<strong>Nu există întrebări analizate</strong>
						<span>Adaugă întrebări în test sau așteaptă primele încercări.</span>
					</div>
				) : (
					<div className="test-stats__items">
						{sortedQuestions.map((question, index) => {
							return (
								<article key={question.question_id || index} className="test-stats__item">
									<div className="test-stats__item-head">
										<h4 className="test-stats__item-title">
											<span className="test-stats__item-index">{index + 1}.</span>
											<RichTextHtml
												html={question.question_text}
												className="test-stats__item-title-html"
												as="span"
												fallback={<span>Întrebarea {index + 1}</span>}
											/>
										</h4>
										<div className="test-stats__item-badges">
											<span className="test-stats__badge is-type">{typeLabel(question.question_type)}</span>
										</div>
									</div>

									<div className="test-stats__item-metrics">
										<span>Prezentată: {question.presented_count ?? question.attempts ?? 0}×</span>
										<span>Răspunsuri: {question.answered_count ?? 0}</span>
										<span>Omise: {question.skipped_count ?? 0}</span>
										{question.average_points_earned != null ? (
											<span>Puncte medii: {Number(question.average_points_earned).toFixed(2)} / {question.points ?? 1}</span>
										) : null}
									</div>

									{Array.isArray(question.option_stats) && question.option_stats.length > 0 ? (
										<div className="test-stats__options">
											{question.option_stats.map((opt) => (
												<div
													key={opt.index}
													className={`test-stats__option${opt.is_correct ? ' is-correct' : ''}`}
												>
													<span className="test-stats__option-text">{stripRichTextToPlain(opt.text) || `Opțiunea ${opt.index + 1}`}</span>
													<div className="test-stats__option-bar-wrap">
														<div className="test-stats__option-bar">
															<div
																className="test-stats__option-bar-fill"
																style={{ width: `${Math.max(0, Math.min(100, opt.percentage || 0))}%` }}
															/>
														</div>
														<span className="test-stats__option-stat">
															{opt.count} · {opt.percentage}%
														</span>
													</div>
												</div>
											))}
										</div>
									) : null}
								</article>
							);
						})}
					</div>
				)
			) : null}
		</div>
	);
}
