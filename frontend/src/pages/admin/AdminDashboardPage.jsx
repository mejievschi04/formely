import React, { useMemo, useState, useEffect } from 'react';
import { adminService } from '../../services/api';
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import './AdminDashboardPage.css';

const PERIOD_OPTIONS = [
	{ value: '7d', label: 'Ultimele 7 zile' },
	{ value: '14d', label: 'Ultimele 14 zile' },
	{ value: '30d', label: 'Ultimele 30 zile' },
	{ value: '90d', label: 'Ultimele 90 zile' },
	{ value: 'all', label: 'Full time' },
];

const numberFormatter = new Intl.NumberFormat('ro-RO');

const readMetricValue = (source, fallback = 0) => {
	const raw = source && typeof source === 'object' && 'value' in source ? source.value : source;
	if (raw === null || raw === undefined || raw === '') return fallback;
	if (typeof raw === 'number') return raw;

	const normalized = String(raw).replace(/\s/g, '').replace(/,/g, '').replace('%', '');
	const parsed = Number(normalized);

	return Number.isFinite(parsed) ? parsed : fallback;
};

const formatNumber = (value, options) => numberFormatter.format(readMetricValue(value, 0), options);

const formatPercent = (value) => {
	if (typeof value === 'string' && value.includes('%')) return value;
	return `${readMetricValue(value, 0).toLocaleString('ro-RO', { maximumFractionDigits: 1 })}%`;
};

const getPeriodLabel = (selectedPeriod) => (
	PERIOD_OPTIONS.find((p) => p.value === selectedPeriod)?.label || 'Perioadă'
);

const AdminDashboardPage = () => {
	const [dashboardData, setDashboardData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [selectedPeriod, setSelectedPeriod] = useState('14d');

	useEffect(() => {
		let cancelled = false;

		const fetchDashboard = async () => {
			try {
				setLoading(true);
				const data = await adminService.getDashboard({ period: selectedPeriod });
				if (!cancelled) {
					setDashboardData(data);
				}
			} catch (err) {
				console.error('Eroare la încărcarea dashboard-ului:', err);
				if (!cancelled) {
					setDashboardData(null);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		};

		fetchDashboard();

		return () => {
			cancelled = true;
		};
	}, [selectedPeriod]);

	const kpis = dashboardData?.kpis || {};
	const chartData = useMemo(
		() => (Array.isArray(dashboardData?.chart_data) ? dashboardData.chart_data : []),
		[dashboardData?.chart_data]
	);
	const courseTestStats = dashboardData?.course_test_stats ?? {};
	const courseStats = courseTestStats?.courses ?? {};
	const testsStats = courseTestStats?.tests ?? {};
	const learningFunnel = useMemo(
		() => (dashboardData?.learning_funnel ?? {}),
		[dashboardData?.learning_funnel]
	);
	const totalUsersNum = readMetricValue(kpis.total_users);
	const activeUsersNum = readMetricValue(kpis.active_users);
	const newUsers = readMetricValue(kpis.new_users);
	const completionRate = kpis.completion_rate?.value || formatPercent(kpis.completion_rate);
	const avgLearningMinutes = readMetricValue(kpis.avg_learning_minutes);
	const avgLearningMinutesTotal = readMetricValue(kpis.avg_learning_minutes_total);
	const learningSessionsPeriod = Number(kpis.avg_learning_minutes?.sessions_count ?? 0);
	const totalCourses = readMetricValue(courseStats.total ?? kpis.total_courses);
	const publishedCourses = readMetricValue(courseStats.published ?? kpis.total_courses);
	const draftCourses = readMetricValue(courseStats.draft);
	const totalTests = readMetricValue(testsStats.total);
	const publishedTests = readMetricValue(testsStats.published);
	const draftTests = readMetricValue(testsStats.draft);
	const normalizedSeries = useMemo(
		() => chartData.slice(-14).map((point, index) => ({
			label: point.label || point.date || `${index + 1}`,
			totalUsers: readMetricValue(point.total_users ?? point.users ?? point.value),
			activeUsers: readMetricValue(point.active_users ?? point.active),
			newUsers: readMetricValue(point.new_users),
			enrollments: readMetricValue(point.enrollments),
			learningMinutes: readMetricValue(point.learning_minutes),
		})),
		[chartData]
	);

	const hourlyActivity = useMemo(() => {
		const source = Array.isArray(dashboardData?.hourly_activity) ? dashboardData.hourly_activity : [];
		const hourlyMap = new Map();

		source.forEach((item) => {
			const rawHour = Number(item.hour ?? item.label ?? item.bucket ?? -1);
			if (!Number.isFinite(rawHour) || rawHour < 0 || rawHour > 23) return;

			hourlyMap.set(rawHour, {
				sesiuni: Math.max(0, readMetricValue(item.sessions ?? item.visits ?? item.lessons)),
				elevi: Math.max(0, readMetricValue(item.users ?? item.active_users)),
			});
		});

		return Array.from({ length: 24 }, (_, hour) => {
			const row = hourlyMap.get(hour);
			const ora = `${hour}`.padStart(2, '0');
			return {
				hour,
				ora,
				label: `${ora}:00`,
				sesiuni: row?.sesiuni ?? 0,
				elevi: row?.elevi ?? 0,
			};
		});
	}, [dashboardData?.hourly_activity]);

	const hourlyPeak = useMemo(() => {
		let best = null;
		for (const row of hourlyActivity) {
			if (row.sesiuni <= 0) continue;
			if (!best || row.sesiuni > best.sesiuni) best = row;
		}
		return best;
	}, [hourlyActivity]);

	const hourlySessionsTotal = useMemo(
		() => hourlyActivity.reduce((sum, row) => sum + row.sesiuni, 0),
		[hourlyActivity]
	);

	const funnelBarData = useMemo(() => ([
		{ key: 'enrolled', label: 'Înscrieri active', short: 'Înscrieri', count: readMetricValue(learningFunnel.enrolled), fill: '#64748b' },
		{ key: 'started', label: 'Cu început înregistrat', short: 'Început', count: readMetricValue(learningFunnel.started), fill: '#3b82f6' },
		{ key: 'p25', label: 'Progres ≥ 25%', short: '≥25%', count: readMetricValue(learningFunnel.progress_25), fill: '#8b5cf6' },
		{ key: 'p50', label: 'Progres ≥ 50%', short: '≥50%', count: readMetricValue(learningFunnel.progress_50), fill: '#ca8a04' },
		{ key: 'p75', label: 'Progres ≥ 75%', short: '≥75%', count: readMetricValue(learningFunnel.progress_75), fill: '#f97316' },
		{ key: 'completed', label: 'Finalizat curs', short: 'Finalizat', count: readMetricValue(learningFunnel.completed), fill: '#22c55e' },
	]), [learningFunnel]);

	const funnelTotal = useMemo(
		() => funnelBarData.reduce((sum, row) => sum + row.count, 0),
		[funnelBarData]
	);
	const hasChartData = normalizedSeries.some((row) => row.totalUsers > 0 || row.activeUsers > 0 || row.newUsers > 0);
	const hasHourlyData = hourlyActivity.some((h) => h.sesiuni > 0 || h.elevi > 0);
	const firstLabel = normalizedSeries[0]?.label || '-';
	const lastLabel = normalizedSeries[normalizedSeries.length - 1]?.label || '-';
	const periodLabel = getPeriodLabel(selectedPeriod);

	const renderPeriodSelect = () => (
		<select
			className="clean-card-period-select"
			value={selectedPeriod}
			onChange={(e) => setSelectedPeriod(e.target.value)}
			aria-label="Perioada raportului"
		>
			{PERIOD_OPTIONS.map((option) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	);

	const renderTooltip = ({ active, payload, label }) => {
		if (!active || !Array.isArray(payload) || payload.length === 0) return null;

		return (
			<div className="dashboard-chart-tooltip">
				<p className="dashboard-chart-tooltip-title">Perioadă: {label}</p>
				{payload.map((entry) => (
					<p key={entry.name} className="dashboard-chart-tooltip-row">
						<span>{entry.name}</span>
						<strong>{numberFormatter.format(Number(entry.value || 0))}</strong>
					</p>
				))}
			</div>
		);
	};

	const renderFunnelTooltip = ({ active, payload }) => {
		if (!active || !payload?.[0]) return null;
		const row = payload[0].payload;

		return (
			<div className="dashboard-chart-tooltip">
				<p className="dashboard-chart-tooltip-title">{row.label}</p>
				<p className="dashboard-chart-tooltip-row">
					<span>Rânduri course_user</span>
					<strong>{numberFormatter.format(Number(row.count || 0))}</strong>
				</p>
				<p className="dashboard-chart-tooltip-hint">
					Pragurile de progres sunt cumulative.
				</p>
			</div>
		);
	};

	const renderHourlyTooltip = ({ active, payload }) => {
		if (!active || !payload?.[0]?.payload) return null;
		const row = payload[0].payload;

		return (
			<div className="dashboard-chart-tooltip">
				<p className="dashboard-chart-tooltip-title">Ora {row.label}</p>
				<p className="dashboard-chart-tooltip-row">
					<span>Sesiuni</span>
					<strong>{numberFormatter.format(Number(row.sesiuni || 0))}</strong>
				</p>
				<p className="dashboard-chart-tooltip-row">
					<span>Elevi unici</span>
					<strong>{numberFormatter.format(Number(row.elevi || 0))}</strong>
				</p>
			</div>
		);
	};

	if (loading) {
		return (
			<div className="admin-dashboard-page">
				<div className="admin-dashboard-loading">
					<div className="admin-dashboard-spinner"></div>
					<p>Se încarcă dashboard-ul...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="admin-dashboard-page admin-dashboard-clean">
			<header className="admin-dashboard-clean-header">
				<div>
					<h1 className="admin-dashboard-clean-title">Panou de control</h1>
					<p className="admin-dashboard-clean-subtitle">
						Metrici conectate la elevi, cursuri, teste și activitate reală din platformă.
					</p>
					<p className="admin-dashboard-clean-meta">
						Utilizatori noi: <strong>{formatNumber(newUsers)}</strong> · Cursuri în sistem: <strong>{formatNumber(totalCourses)}</strong>
					</p>
				</div>
				<div className="admin-dashboard-clean-actions">
					{renderPeriodSelect()}
				</div>
			</header>

			<section className="admin-dashboard-clean-hero">
				<article className="hero-stat">
					<p className="hero-stat-label">Total elevi</p>
					<p className="hero-stat-value">{formatNumber(totalUsersNum)}</p>
					<p className="hero-stat-meta">Înregistrați în platformă</p>
				</article>
				<article className="hero-stat">
					<p className="hero-stat-label">Elevi activi</p>
					<p className="hero-stat-value">{formatNumber(activeUsersNum)}</p>
					<p className="hero-stat-meta">Activitate în {periodLabel.toLowerCase()}</p>
				</article>
				<article className="hero-stat hero-stat-green">
					<p className="hero-stat-label">Cursuri publicate</p>
					<p className="hero-stat-value">{formatNumber(publishedCourses)}</p>
					<p className="hero-stat-meta">Total: {formatNumber(totalCourses)} · Draft: {formatNumber(draftCourses)}</p>
				</article>
				<article className="hero-stat">
					<p className="hero-stat-label">Teste publicate</p>
					<p className="hero-stat-value">{formatNumber(publishedTests)}</p>
					<p className="hero-stat-meta">Total: {formatNumber(totalTests)} · Draft: {formatNumber(draftTests)}</p>
				</article>
				<article className="hero-stat hero-stat-cyan">
					<p className="hero-stat-label">Rată finalizare</p>
					<p className="hero-stat-value">{completionRate}</p>
					<p className="hero-stat-meta">Calculată din înscrieri finalizate</p>
				</article>
				<article className="hero-stat hero-stat-blue">
					<p className="hero-stat-label">Medie minute</p>
					<p className="hero-stat-value">
						{avgLearningMinutes.toLocaleString('ro-RO', { maximumFractionDigits: 1 })}
					</p>
					<p className="hero-stat-meta">
						{learningSessionsPeriod > 0
							? `${formatNumber(learningSessionsPeriod)} sesiuni în ${periodLabel.toLowerCase()}`
							: `Medie lecție (total): ${avgLearningMinutesTotal.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} min`}
					</p>
				</article>
			</section>

			<section className="admin-dashboard-clean-grid">
				<article className="clean-card">
					<header className="clean-card-header">
						<h2>Total elevi în platformă</h2>
						<span>{periodLabel}</span>
					</header>
					<div className="chart-modern-line">
						<div className="chart-rechart-wrap">
							<ResponsiveContainer width="100%" height={228} minWidth={280} minHeight={220}>
								<AreaChart data={normalizedSeries} margin={{ top: 6, right: 10, left: -22, bottom: 0 }}>
									<defs>
										<linearGradient id="overviewAreaFill" x1="0" y1="0" x2="0" y2="1">
											<stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.24} />
											<stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.04} />
										</linearGradient>
									</defs>
									<CartesianGrid stroke="var(--border-primary)" strokeDasharray="3 3" />
									<XAxis dataKey="label" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickLine={false} axisLine={false} />
									<YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
									<Tooltip content={renderTooltip} />
									<Area type="monotone" dataKey="totalUsers" stroke="var(--color-primary)" strokeWidth={2.2} fill="url(#overviewAreaFill)" name="Total elevi" />
								</AreaChart>
							</ResponsiveContainer>
						</div>
						<div className="chart-modern-footer">
							<span>{firstLabel}</span>
							<span>{lastLabel}</span>
						</div>
						{!hasChartData ? <p className="chart-modern-empty">Nu există date pentru perioada selectată.</p> : null}
					</div>
				</article>

				<article className="clean-card clean-card-funnel">
					<header className="clean-card-header">
						<div className="clean-card-header-text">
							<h2>Progres înscrieri la cursuri</h2>
							<p className="clean-card-funnel-sub">
								Date reale din înscrieri. Pragurile de progres sunt cumulative.
							</p>
						</div>
						<span className="clean-card-header-badge">Live</span>
					</header>
					<div className="funnel-chart-block">
						{funnelTotal === 0 ? (
							<p className="chart-modern-empty">Nu există încă înscrieri în baza de date.</p>
						) : (
							<div className="funnel-chart-row">
								<div className="chart-rechart-wrap funnel-chart-rechart">
									<ResponsiveContainer width="100%" height={236} minWidth={260} minHeight={220}>
										<BarChart
											layout="vertical"
											data={funnelBarData}
											margin={{ top: 6, right: 20, left: 4, bottom: 4 }}
											barCategoryGap={10}
										>
											<CartesianGrid stroke="var(--border-primary)" strokeDasharray="3 3" horizontal vertical={false} />
											<XAxis type="number" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
											<YAxis type="category" dataKey="short" width={72} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickLine={false} axisLine={false} />
											<Tooltip content={renderFunnelTooltip} cursor={{ fill: 'color-mix(in srgb, var(--color-primary) 8%, transparent)' }} />
											<Bar dataKey="count" name="Înscrieri" radius={[0, 6, 6, 0]} maxBarSize={24}>
												{funnelBarData.map((entry) => (
													<Cell key={entry.key} fill={entry.fill} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
												))}
											</Bar>
										</BarChart>
									</ResponsiveContainer>
								</div>
								<ul className="funnel-legend" aria-label="Valori pe etapă">
									{funnelBarData.map((row) => (
										<li key={row.key}>
											<span className="funnel-legend-swatch" style={{ backgroundColor: row.fill }} aria-hidden />
											<span className="funnel-legend-label">{row.label}</span>
											<strong className="funnel-legend-value">{formatNumber(row.count)}</strong>
										</li>
									))}
								</ul>
							</div>
						)}
						<div className="funnel-kpi-foot">
							<span>Rată finalizare KPI: <strong>{completionRate}</strong></span>
							<span className="funnel-kpi-foot-sep" aria-hidden>·</span>
							<span>Total elevi: <strong>{formatNumber(totalUsersNum)}</strong></span>
						</div>
					</div>
				</article>

				<article className="clean-card">
					<header className="clean-card-header">
						<h2>Activitate elevi</h2>
						<span>{periodLabel}</span>
					</header>
					<div className="chart-modern-line chart-modern-line-multi">
						<div className="chart-rechart-wrap">
							<ResponsiveContainer width="100%" height={228} minWidth={280} minHeight={220}>
								<LineChart data={normalizedSeries} margin={{ top: 6, right: 10, left: -22, bottom: 0 }}>
									<CartesianGrid stroke="var(--border-primary)" strokeDasharray="3 3" vertical={false} />
									<XAxis dataKey="label" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
									<YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickLine={false} axisLine={false} width={38} />
									<Tooltip content={renderTooltip} />
									<Line type="monotone" dataKey="activeUsers" name="Elevi activi" stroke="var(--color-primary)" strokeWidth={2.6} dot={false} activeDot={{ r: 4 }} />
									<Line type="monotone" dataKey="newUsers" name="Elevi noi" stroke="var(--text-secondary)" strokeWidth={2.1} dot={false} activeDot={{ r: 3.5 }} />
									<Line type="monotone" dataKey="enrollments" name="Înscrieri noi" stroke="var(--color-success)" strokeWidth={2.1} dot={false} activeDot={{ r: 3.5 }} />
								</LineChart>
							</ResponsiveContainer>
						</div>
						<div className="chart-modern-footer">
							<span>{firstLabel}</span>
							<span>{lastLabel}</span>
						</div>
						<div className="chart-modern-legend">
							<span><i className="legend-dot legend-users" />Elevi activi</span>
							<span><i className="legend-dot legend-active" />Elevi noi</span>
							<span><i className="legend-dot legend-success" />Înscrieri noi</span>
						</div>
						{!hasChartData ? <p className="chart-modern-empty">Nu există date pentru perioada selectată.</p> : null}
					</div>
				</article>

				<article className="clean-card clean-card-hourly-popularity">
					<header className="clean-card-header">
						<div className="clean-card-header-text">
							<h2>Popularitate pe ore</h2>
							<p className="clean-card-funnel-sub">
								Sesiuni elevi (deschideri platformă) pe orele zilei · {periodLabel}
							</p>
						</div>
						{hasHourlyData ? (
							<span className="clean-card-header-badge">
								{hourlyPeak
									? `Vârf ${hourlyPeak.label} · ${formatNumber(hourlyPeak.sesiuni)} sesiuni`
									: `${formatNumber(hourlySessionsTotal)} sesiuni`}
							</span>
						) : (
							<span className="clean-card-header-badge">24 intervale</span>
						)}
					</header>
					<div className="chart-modern-line hourly-popularity-chart">
						<div className="chart-rechart-wrap">
							<ResponsiveContainer width="100%" height={240} minWidth={280} minHeight={220}>
								<AreaChart data={hourlyActivity} margin={{ top: 10, right: 12, left: 2, bottom: 0 }}>
									<defs>
										<linearGradient id="hourlyVisitsGradient" x1="0" y1="0" x2="0" y2="1">
											<stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
											<stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.04} />
										</linearGradient>
									</defs>
									<CartesianGrid stroke="var(--border-primary)" strokeDasharray="3 3" vertical={false} />
									<XAxis
										dataKey="ora"
										tickFormatter={(h) => `${h}:00`}
										tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
										tickLine={false}
										axisLine={false}
										interval={1}
										minTickGap={18}
									/>
									<YAxis
										tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
										tickLine={false}
										axisLine={false}
										width={44}
										allowDecimals={false}
									/>
									<Tooltip content={renderHourlyTooltip} />
									<Area
										type="monotone"
										dataKey="sesiuni"
										name="Sesiuni"
										stroke="var(--color-primary)"
										strokeWidth={2.5}
										fill="url(#hourlyVisitsGradient)"
										dot={{ r: 3, fill: 'var(--color-primary)', strokeWidth: 0 }}
										activeDot={{ r: 5, fill: 'var(--color-primary)', stroke: 'var(--bg-elevated)', strokeWidth: 2 }}
									/>
								</AreaChart>
							</ResponsiveContainer>
						</div>
						<div className="chart-modern-footer hourly-popularity-footer">
							<span>00:00</span>
							<span>12:00</span>
							<span>23:00</span>
						</div>
						<div className="chart-modern-legend">
							<span><i className="legend-dot legend-users-2" />Sesiuni elevi (deschideri app)</span>
						</div>
						{!hasHourlyData ? (
							<p className="chart-modern-empty">Nu există sesiuni înregistrate în perioada selectată.</p>
						) : null}
					</div>
				</article>
			</section>
		</div>
	);
};

export default AdminDashboardPage;
