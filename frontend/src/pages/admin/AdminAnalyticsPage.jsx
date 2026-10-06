import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	ArrowLeft,
	ArrowUpRight,
	ArrowDownRight,
	ChartBar,
	ChartLineUp,
	CheckCircle,
	Lightbulb,
	PlusCircle,
	Users,
	WarningCircle,
	Info,
} from '@phosphor-icons/react';
import {
	AreaChart,
	Area,
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	Legend,
	PieChart,
	Pie,
	Cell,
} from 'recharts';
import { adminService } from '../../services/api';
import './AdminAnalyticsPage.css';

const PERIOD_MAP = { '7d': '7d', '30d': '30d', '90d': '90d' };

const AdminAnalyticsPage = () => {
	const navigate = useNavigate();
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [period, setPeriod] = useState('30d');
	const [activityFilter, setActivityFilter] = useState('all');

	useEffect(() => {
		const fetchData = async () => {
			try {
				setLoading(true);
				const res = await adminService.getDashboard({
					period: PERIOD_MAP[period] || 'month',
				});
				setData(res);
			} catch (err) {
				console.error('Eroare la încărcarea analiticii:', err);
			} finally {
				setLoading(false);
			}
		};
		fetchData();
	}, [period]);

	const kpis = data?.kpis || {};
	const chartData = data?.chart_data || [];
	const learningFunnelApi = data?.learning_funnel || {};
	const userSegmentsApi = data?.user_segments || {};
	const topCourses = data?.top_courses || [];
	const problematicCourses = data?.problematic_courses || [];
	const recentActivities = data?.recent_activities || [];

	const totalUsers = parseInt(String(kpis.total_users?.value || 0).replace(/,/g, '')) || 0;
	const activeUsers = parseInt(String(kpis.active_users?.value || 0).replace(/,/g, '')) || 0;

	const completionRate = parseFloat(String(kpis.completion_rate?.value || 0).replace('%', '')) || 0;
	const engagement = parseFloat(String(kpis.engagement?.value || 0).replace('%', '')) || 0;
	const newEnrollments = parseInt(String(kpis.new_enrollments?.value || 0).replace(/,/g, '')) || 0;

	// Chart data for Recharts
	const chartDataFormatted = chartData.map((d) => ({
		date: new Date(d.date).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' }),
		fullDate: d.date,
		enrollments: d.enrollments || 0,
		users: d.users || 0,
		engagement: engagement,
	}));

	// Learning funnel - din API (date reale)
	const funnelData = [
		{ name: 'Înscriși', value: learningFunnelApi.enrolled ?? 0, fill: '#6366f1' },
		{ name: 'Au început', value: learningFunnelApi.started ?? 0, fill: '#8b5cf6' },
		{ name: '25%+', value: learningFunnelApi.progress_25 ?? 0, fill: '#a855f7' },
		{ name: '50%+', value: learningFunnelApi.progress_50 ?? 0, fill: '#c084fc' },
		{ name: '75%+', value: learningFunnelApi.progress_75 ?? 0, fill: '#d8b4fe' },
		{ name: 'Finalizat', value: learningFunnelApi.completed ?? 0, fill: '#10b981' },
	];

	// User segments - din API (date reale)
	const segmentsRaw = [
		{ name: 'Noi (30z)', value: userSegmentsApi.new ?? 0, color: '#6366f1' },
		{ name: 'În risc', value: userSegmentsApi.at_risk ?? 0, color: '#ef4444' },
		{ name: 'Implicați', value: userSegmentsApi.highly_engaged ?? 0, color: '#10b981' },
		{ name: 'Inactivi', value: userSegmentsApi.inactive ?? 0, color: '#94a3b8' },
	];
	const segments = segmentsRaw.some((s) => s.value > 0) ? segmentsRaw : [{ name: 'Fără date', value: 1, color: '#94a3b8' }];

	const filteredActivities =
		activityFilter === 'all'
			? recentActivities
			: recentActivities.filter((a) => a.type === activityFilter);

	if (loading) {
		return (
			<div className="analytics-page">
				<div className="analytics-loading">
					<div className="analytics-spinner" />
					<p>Se încarcă analiza...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="analytics-page">
			{/* Header */}
			<header className="analytics-header">
				<div className="analytics-header-content">
					<div>
						<h1 className="analytics-title">Analiză Avansată</h1>
						<p className="analytics-subtitle">
							Statistici detaliate și insight-uri pentru optimizarea platformei
						</p>
					</div>
					<div className="analytics-header-actions">
						<div className="analytics-period-tabs">
							{['7d', '30d', '90d'].map((p) => (
								<button
									key={p}
									className={`analytics-period-btn ${period === p ? 'active' : ''}`}
									onClick={() => setPeriod(p)}
								>
									{p === '7d' ? '7 zile' : p === '30d' ? '30 zile' : '90 zile'}
								</button>
							))}
						</div>
						<button
							className="analytics-back-btn va-btn-back admin-back-btn"
							onClick={() => navigate('/admin')}
						>
							<ArrowLeft size={14} weight="bold" aria-hidden /> Dashboard
						</button>
					</div>
				</div>
			</header>

			{/* KPI Cards */}
			<section className="analytics-kpis">
				<KpiCard
					label="Utilizatori totali"
					value={totalUsers.toLocaleString()}
					trend={kpis.total_users?.trend}
					trendValue={kpis.total_users?.trendValue}
					icon="users"
				/>
				<KpiCard
					label="Utilizatori activi"
					value={activeUsers.toLocaleString()}
					trend={kpis.active_users?.trend}
					trendValue={kpis.active_users?.trendValue}
					icon="activity"
				/>
				<KpiCard
					label="Rata finalizare"
					value={`${completionRate.toFixed(1)}%`}
					trend={kpis.completion_rate?.trend}
					trendValue={kpis.completion_rate?.trendValue}
					icon="check"
				/>
				<KpiCard
					label="Implicare medie"
					value={`${engagement.toFixed(1)}%`}
					trend={kpis.engagement?.trend}
					trendValue={kpis.engagement?.trendValue}
					icon="chart"
				/>
				<KpiCard
					label="Înscrieri noi"
					value={newEnrollments.toLocaleString()}
					trend={kpis.new_enrollments?.trend}
					trendValue={kpis.new_enrollments?.trendValue}
					icon="enroll"
				/>
			</section>

			{/* Charts Row 1 */}
			<section className="analytics-charts-row">
				<div className="analytics-card analytics-card-wide">
					<div className="analytics-card-header">
						<div>
							<h3>Evoluția înscrierilor și utilizatori noi</h3>
							<p>Activitate în perioada selectată</p>
						</div>
					</div>
					<div className="analytics-chart-container">
						<ResponsiveContainer width="100%" height={280}>
							<AreaChart data={chartDataFormatted}>
								<defs>
									<linearGradient id="colorEnrollments" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
										<stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
									</linearGradient>
									<linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
										<stop offset="95%" stopColor="#10b981" stopOpacity={0} />
									</linearGradient>
								</defs>
								<CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
								<XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={12} />
								<YAxis stroke="var(--text-tertiary)" fontSize={12} />
								<Tooltip
									contentStyle={{
										background: 'var(--bg-elevated)',
										border: '1px solid var(--border-primary)',
										borderRadius: 'var(--radius-lg)',
									}}
									labelStyle={{ color: 'var(--text-primary)' }}
								/>
								<Legend />
								<Area
									type="monotone"
									dataKey="enrollments"
									name="Înscrieri"
									stroke="#6366f1"
									fillOpacity={1}
									fill="url(#colorEnrollments)"
									strokeWidth={2}
								/>
								<Area
									type="monotone"
									dataKey="users"
									name="Utilizatori noi"
									stroke="#10b981"
									fillOpacity={1}
									fill="url(#colorUsers)"
									strokeWidth={2}
								/>
							</AreaChart>
						</ResponsiveContainer>
					</div>
				</div>
			</section>

			{/* Charts Row 2 - Funnel + Segments */}
			<section className="analytics-charts-grid">
				<div className="analytics-card">
					<div className="analytics-card-header">
						<div>
							<h3>Funnel de învățare</h3>
							<p>Progresie prin etape</p>
						</div>
					</div>
					<div className="analytics-chart-container analytics-chart-bar">
						<ResponsiveContainer width="100%" height={260}>
							<BarChart data={funnelData} layout="vertical" margin={{ left: 20, right: 20 }}>
								<CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
								<XAxis type="number" stroke="var(--text-tertiary)" fontSize={12} />
								<YAxis type="category" dataKey="name" stroke="var(--text-tertiary)" fontSize={12} width={90} />
								<Tooltip
									contentStyle={{
										background: 'var(--bg-elevated)',
										border: '1px solid var(--border-primary)',
										borderRadius: 'var(--radius-lg)',
									}}
								/>
								<Bar dataKey="value" name="Utilizatori" radius={[0, 4, 4, 0]} />
							</BarChart>
						</ResponsiveContainer>
					</div>
				</div>

				<div className="analytics-card">
					<div className="analytics-card-header">
						<div>
							<h3>Segmente utilizatori</h3>
							<p>Distribuție pe categorii</p>
						</div>
					</div>
					<div className="analytics-chart-container analytics-chart-pie">
						<ResponsiveContainer width="100%" height={260}>
							<PieChart>
								<Pie
									data={segments}
									cx="50%"
									cy="50%"
									innerRadius={60}
									outerRadius={90}
									paddingAngle={2}
									dataKey="value"
									nameKey="name"
									label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
								>
									{segments.map((entry, index) => (
										<Cell key={index} fill={entry.color} />
									))}
								</Pie>
								<Tooltip
									contentStyle={{
										background: 'var(--bg-elevated)',
										border: '1px solid var(--border-primary)',
										borderRadius: 'var(--radius-lg)',
									}}
									formatter={(value) => [value.toLocaleString(), 'Utilizatori']}
								/>
							</PieChart>
						</ResponsiveContainer>
					</div>
				</div>
			</section>

			{/* Top Courses + Problematic */}
			<section className="analytics-charts-grid">
				<div className="analytics-card">
					<div className="analytics-card-header">
						<div>
							<h3>Top cursuri</h3>
							<p>După înscrieri în perioada selectată</p>
						</div>
					</div>
					<div className="analytics-top-courses">
						{topCourses.length > 0 ? (
							<ResponsiveContainer width="100%" height={220}>
								<BarChart
									data={topCourses.map((c) => ({
										name: c.title?.length > 25 ? c.title.slice(0, 25) + '…' : c.title,
										enrollments: c.enrollments || 0,
										completion: c.completion_rate || 0,
									}))}
									layout="vertical"
									margin={{ left: 10, right: 20 }}
								>
									<CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
									<XAxis type="number" stroke="var(--text-tertiary)" fontSize={11} />
									<YAxis type="category" dataKey="name" stroke="var(--text-tertiary)" fontSize={11} width={120} />
									<Tooltip
										contentStyle={{
											background: 'var(--bg-elevated)',
											border: '1px solid var(--border-primary)',
											borderRadius: 'var(--radius-lg)',
										}}
									/>
									<Bar dataKey="enrollments" name="Înscrieri" fill="#6366f1" radius={[0, 4, 4, 0]} />
								</BarChart>
							</ResponsiveContainer>
						) : (
							<div className="analytics-empty">Nu există date pentru cursuri</div>
						)}
					</div>
				</div>

				<div className="analytics-card">
					<div className="analytics-card-header">
						<div>
							<h3>Cursuri care necesită atenție</h3>
							<p>Rată scăzută de finalizare sau abandon ridicat</p>
						</div>
					</div>
					<div className="analytics-problematic">
						{problematicCourses.length > 0 ? (
							<ul className="analytics-problematic-list">
								{problematicCourses.slice(0, 5).map((c) => (
									<li
										key={c.id}
										className="analytics-problematic-item"
										onClick={() => navigate(`/admin/courses/${c.id}`)}
									>
										<span className="analytics-problematic-title">{c.title}</span>
										<div className="analytics-problematic-meta">
											<span className="analytics-badge analytics-badge-warn">
												Finalizare: {c.completion_rate}%
											</span>
											<span className="analytics-badge analytics-badge-danger">
												Abandon: {c.dropoff_rate}%
											</span>
										</div>
									</li>
								))}
							</ul>
						) : (
							<div className="analytics-empty">Toate cursurile au performanță bună</div>
						)}
					</div>
				</div>
			</section>

			{/* Volt recommendations */}
			{(problematicCourses.length > 0 || completionRate < 70) && (
				<section className="analytics-section">
					<h2 className="analytics-section-title">Recomandări Formely AI</h2>
					<div className="analytics-ai-grid">
						{problematicCourses.slice(0, 2).map((c) => (
							<div
								key={c.id}
								className="analytics-ai-card analytics-ai-card-risk"
								onClick={() => navigate(`/admin/courses/${c.id}`)}
							>
								<div className="analytics-ai-icon"><WarningCircle size={18} weight="duotone" aria-hidden /></div>
								<div className="analytics-ai-content">
									<h4>Cursul „{c.title}” are risc ridicat de abandon</h4>
									<p>Rată abandon: {c.dropoff_rate}% • Finalizare: {c.completion_rate}%</p>
									<span className="analytics-ai-action">Vezi analiza <ArrowUpRight size={14} weight="bold" aria-hidden /></span>
								</div>
							</div>
						))}
						{completionRate < 70 && (
							<div className="analytics-ai-card analytics-ai-card-optimize">
								<div className="analytics-ai-icon"><Lightbulb size={18} weight="duotone" aria-hidden /></div>
								<div className="analytics-ai-content">
									<h4>Rata de finalizare poate fi îmbunătățită</h4>
									<p>Rata actuală: {completionRate.toFixed(1)}%. Consideră micro-learning și quiz-uri scurte.</p>
									<span className="analytics-ai-action" onClick={() => navigate('/admin/courses')}>
										Vezi cursuri <ArrowUpRight size={14} weight="bold" aria-hidden />
									</span>
								</div>
							</div>
						)}
					</div>
				</section>
			)}

			{/* Activity Feed */}
			<section className="analytics-section">
				<div className="analytics-section-header">
					<div>
						<h2 className="analytics-section-title">Feed activitate</h2>
						<p className="analytics-section-subtitle">Evenimente recente pe platformă</p>
					</div>
					<div className="analytics-activity-filters">
						{['all', 'completion', 'exam_submitted'].map((f) => (
							<button
								key={f}
								className={`analytics-filter-btn ${activityFilter === f ? 'active' : ''}`}
								onClick={() => setActivityFilter(f)}
							>
								{f === 'all' ? 'Toate' : f === 'completion' ? 'Finalizări' : 'Teste'}
							</button>
						))}
					</div>
				</div>
				<div className="analytics-activity-feed">
					{filteredActivities.length > 0 ? (
						filteredActivities.slice(0, 12).map((a, i) => (
							<div key={a.id || i} className="analytics-activity-item">
								<span className="analytics-activity-icon">
									{a.type === 'completion'
										? <CheckCircle size={16} weight="duotone" aria-hidden />
										: a.type === 'exam_submitted'
											? <ChartBar size={16} weight="duotone" aria-hidden />
											: <Info size={16} weight="duotone" aria-hidden />}
								</span>
								<div className="analytics-activity-content">
									<p>{a.description || a.message || 'Activitate'}</p>
									<time>
										{a.created_at
											? new Date(a.created_at).toLocaleDateString('ro-RO', {
													day: '2-digit',
													month: 'short',
													hour: '2-digit',
													minute: '2-digit',
											  })
											: 'Recentă'}
									</time>
								</div>
							</div>
						))
					) : (
						<div className="analytics-empty">Nu există activitate recentă</div>
					)}
				</div>
			</section>
		</div>
	);
};

function KpiCard({ label, value, trend, trendValue, icon }) {
	const renderIcon = () => {
		if (icon === 'users') return <Users size={24} weight="duotone" aria-hidden />;
		if (icon === 'activity') return <ChartLineUp size={24} weight="duotone" aria-hidden />;
		if (icon === 'check') return <CheckCircle size={24} weight="duotone" aria-hidden />;
		if (icon === 'chart') return <ChartBar size={24} weight="duotone" aria-hidden />;
		if (icon === 'enroll') return <PlusCircle size={24} weight="duotone" aria-hidden />;
		return null;
	};

	return (
		<div className="analytics-kpi-card">
			<div className="analytics-kpi-icon">
				{renderIcon()}
			</div>
			<div className="analytics-kpi-content">
				<span className="analytics-kpi-label">{label}</span>
				<span className="analytics-kpi-value">{value}</span>
				{trendValue && (
					<span className={`analytics-kpi-trend ${trend === 'up' ? 'up' : 'down'}`}>
						{trend === 'up' ? <ArrowUpRight size={14} weight="bold" aria-hidden /> : <ArrowDownRight size={14} weight="bold" aria-hidden />} {trendValue}
					</span>
				)}
			</div>
		</div>
	);
}

export default AdminAnalyticsPage;
