import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminService } from '../../services/api';
import {
	buildStructuredExcelRows,
	downloadStructuredExcel,
	statisticsExcelFilename,
} from '../../utils/statisticsExcelExport';
import './AdminStatisticsHubPage.css';

const MENU_ITEMS = [
	{ id: 'student-progress', label: 'Progresul elevilor' },
	{ id: 'course-progress', label: 'Progres cursuri' },
	{ id: 'test-progress', label: 'Progres teste' },
	{ id: 'students', label: 'Elevi' },
	{ id: 'courses', label: 'Cursuri' },
	{ id: 'tests', label: 'Teste' },
	{ id: 'top-students', label: 'Top 10 studenți' },
];

const formatLearningDuration = (totalSeconds) => {
	const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m`;
	return `${s}s`;
};

const AdminStatisticsHubPage = () => {
	const [active, setActive] = useState('student-progress');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [statsData, setStatsData] = useState(null);
	const [dateFrom, setDateFrom] = useState('');
	const [dateTo, setDateTo] = useState('');
	const [testsViewMode, setTestsViewMode] = useState('tests');
	const [testsSearch, setTestsSearch] = useState('');
	const formatDateShort = (value) => {
		if (!value) return '—';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '—';
		return date.toLocaleDateString('en-US');
	};
	const activeItem = MENU_ITEMS.find((item) => item.id === active);

	useEffect(() => {
		const sectionsUsingStatistics = new Set(['student-progress', 'course-progress', 'test-progress', 'top-students', 'students', 'courses', 'tests']);
		if (!sectionsUsingStatistics.has(active)) return;
		const load = async () => {
			try {
				setLoading(true);
				setError('');
				const params = {};
				if (dateFrom) params.date_from = dateFrom;
				if (dateTo) params.date_to = dateTo;
				const res = await adminService.getStatisticsCourseTestDetail(params);
				setStatsData(res || null);
			} catch (e) {
				const detail = e?.response?.data?.message || e?.message;
				console.error('Failed to load statistics report:', detail || e);
				setError('Nu s-a putut încărca raportul de progres.');
			} finally {
				setLoading(false);
			}
		};
		load();
	}, [active, dateFrom, dateTo]);

	const reportRows = useMemo(() => {
		const enrollments = statsData?.enrollments || [];
		const students = statsData?.students || [];
		const tests = statsData?.test_results || [];
		const studentsMap = new Map(students.map((s) => [s.id, s]));
		const byUser = new Map();

		enrollments.forEach((e) => {
			if (!byUser.has(e.user_id)) {
				byUser.set(e.user_id, {
					user_id: e.user_id,
					coursesCompleted: 0,
					lessonsCompleted: 0,
					testsCompleted: 0,
					learningSeconds: 0,
				});
			}
			const row = byUser.get(e.user_id);
			if (e.completed_at) row.coursesCompleted += 1;
			row.lessonsCompleted += Number(e.lessons_completed ?? 0);
			row.learningSeconds += Number(e.time_spent_seconds ?? 0);
		});

		tests.forEach((t) => {
			if (!byUser.has(t.user_id)) {
				byUser.set(t.user_id, {
					user_id: t.user_id,
					coursesCompleted: 0,
					lessonsCompleted: 0,
					testsCompleted: 0,
					learningSeconds: 0,
				});
			}
			const row = byUser.get(t.user_id);
			row.testsCompleted += 1;
		});

		return Array.from(byUser.values()).map((row) => {
			const student = studentsMap.get(row.user_id) || {};
			const userTests = tests.filter((t) => t.user_id === row.user_id);
			const avg = userTests.length
				? Math.round(
					(userTests.reduce((sum, t) => sum + Number(t.percentage ?? 0), 0) / userTests.length) * 10
				) / 10
				: 0;
			return {
				id: row.user_id,
				name: student.name || `Utilizator #${row.user_id}`,
				email: student.email || '—',
				coursesCompleted: row.coursesCompleted,
				lessonsCompleted: row.lessonsCompleted,
				testsCompleted: row.testsCompleted,
				avgScore: avg,
				registeredAt: student.created_at || null,
				learningSeconds: row.learningSeconds ?? 0,
			};
		});
	}, [statsData]);

	const kpis = useMemo(() => {
		const totalLearners = reportRows.length;
		const avgCourses = totalLearners
			? Math.round((reportRows.reduce((sum, r) => sum + r.coursesCompleted, 0) / totalLearners) * 10) / 10
			: 0;
		const avgLessons = totalLearners
			? Math.round((reportRows.reduce((sum, r) => sum + r.lessonsCompleted, 0) / totalLearners) * 10) / 10
			: 0;
		const avgTests = totalLearners
			? Math.round((reportRows.reduce((sum, r) => sum + r.testsCompleted, 0) / totalLearners) * 10) / 10
			: 0;
		const avgLearningSeconds = totalLearners
			? Math.round(reportRows.reduce((sum, r) => sum + (r.learningSeconds || 0), 0) / totalLearners)
			: 0;
		return { totalLearners, avgCourses, avgLessons, avgTests, avgLearningSeconds };
	}, [reportRows]);

	const exportStudentProgressCsv = useCallback(() => {
		const rows = buildStructuredExcelRows({
			sheetLabel: 'Progres elevi',
			periodFrom: dateFrom,
			periodTo: dateTo,
			kpiEntries: [
				['Total elevi', kpis.totalLearners],
				['Cursuri finalizate (medie / elev)', kpis.avgCourses],
				['Lecții finalizate (medie / elev)', kpis.avgLessons],
				['Teste finalizate (medie / elev)', kpis.avgTests],
				['Timp studiu — medie (secunde)', kpis.avgLearningSeconds],
				['Timp studiu — medie (afișat)', formatLearningDuration(kpis.avgLearningSeconds)],
			],
			tableHeaders: [
				'ID utilizator',
				'Nume complet',
				'Email',
				'Cursuri finalizate',
				'Lecții finalizate',
				'Teste finalizate',
				'Scor mediu (%)',
				'Timp studiu (afișat)',
				'Timp studiu (secunde)',
				'Data înregistrării',
			],
			tableRows: reportRows.map((r) => [
				r.id,
				r.name,
				r.email,
				r.coursesCompleted,
				r.lessonsCompleted,
				r.testsCompleted,
				r.avgScore,
				formatLearningDuration(r.learningSeconds),
				r.learningSeconds,
				r.registeredAt ? new Date(r.registeredAt).toLocaleString('ro-RO') : '',
			]),
		});
		downloadStructuredExcel(statisticsExcelFilename('progres-elevi'), 'Progres elevi', rows);
	}, [dateFrom, dateTo, kpis, reportRows]);

	const renderStudentProgress = () => (
		<div className="admin-statistics-student-progress">
			<header className="admin-statistics-student-head">
				<div>
					<h2 className="admin-statistics-section-heading">Raport progres elevi</h2>
					<p className="admin-statistics-section-desc">
						Lista elevilor activi în perioada selectată, cu progres pe cursuri, lecții și teste.
					</p>
				</div>
				<div className="admin-statistics-top-actions">
					<button
						type="button"
						className="lms-btn-secondary lms-btn-sm"
						onClick={exportStudentProgressCsv}
						disabled={loading || Boolean(error)}
					>
						Export Excel
					</button>
				</div>
			</header>

			<div className="admin-statistics-toolbar" role="group" aria-label="Filtru perioadă">
				<label className="admin-statistics-filter">
					<span className="va-input-label">Dată început</span>
					<input
						type="date"
						className="va-input"
						value={dateFrom}
						onChange={(e) => setDateFrom(e.target.value)}
					/>
				</label>
				<label className="admin-statistics-filter">
					<span className="va-input-label">Dată sfârșit</span>
					<input
						type="date"
						className="va-input"
						value={dateTo}
						onChange={(e) => setDateTo(e.target.value)}
					/>
				</label>
			</div>

			<div className="admin-statistics-student-kpis">
				<article>
					<span>Total elevi</span>
					<strong>{kpis.totalLearners}</strong>
				</article>
				<article>
					<span>Cursuri (medie)</span>
					<strong>{kpis.avgCourses}</strong>
				</article>
				<article>
					<span>Lectii (medie)</span>
					<strong>{kpis.avgLessons}</strong>
				</article>
				<article>
					<span>Teste (medie)</span>
					<strong>{kpis.avgTests}</strong>
				</article>
				<article>
					<span>Timp studiu (medie)</span>
					<strong>{formatLearningDuration(kpis.avgLearningSeconds)}</strong>
				</article>
			</div>

			<div className="admin-users-table-wrapper admin-statistics-table-clip">
				<table className="admin-users-table admin-statistics-student-table">
					<thead>
						<tr>
							<th>Nume complet</th>
							<th>Cursuri finalizate</th>
							<th>Lectii finalizate</th>
							<th>Teste finalizate</th>
							<th>Scor mediu (%)</th>
							<th>Timp studiu</th>
							<th>Data inregistrarii</th>
						</tr>
					</thead>
					<tbody>
						{reportRows.map((row) => (
							<tr key={row.id}>
								<td>
									<div className="admin-statistics-student-person">
										<strong>{row.name}</strong>
										<span>{row.email}</span>
									</div>
								</td>
								<td>{row.coursesCompleted}</td>
								<td>{row.lessonsCompleted}</td>
								<td>{row.testsCompleted}</td>
								<td>{row.avgScore}%</td>
								<td>{formatLearningDuration(row.learningSeconds)}</td>
								<td>{row.registeredAt ? new Date(row.registeredAt).toLocaleString() : '—'}</td>
							</tr>
						))}
					</tbody>
				</table>
				{loading ? <div className="admin-statistics-student-empty">Se încarcă datele...</div> : null}
				{!loading && !error && reportRows.length === 0 ? (
					<div className="admin-statistics-student-empty">Nu există date pentru filtrul selectat.</div>
				) : null}
				{!loading && error ? <div className="admin-statistics-student-empty">{error}</div> : null}
			</div>
		</div>
	);

	const courseProgressRows = useMemo(() => {
		const courses = statsData?.courses || [];
		const enrollments = statsData?.enrollments || [];
		const tests = statsData?.test_results || [];

		return courses.map((course) => {
			const courseEnrollments = enrollments.filter((e) => e.course_id === course.id);
			const enrolledCount = courseEnrollments.length;
			const completedCount = courseEnrollments.filter((e) => e.completed_at).length;
			const avgProgress = enrolledCount
				? Math.round(
					(courseEnrollments.reduce((sum, e) => sum + Number(e.progress_percentage ?? 0), 0) / enrolledCount) * 10
				) / 10
				: 0;
			const completionRate = enrolledCount ? Math.round((completedCount / enrolledCount) * 100) : 0;
			const courseTests = tests.filter((t) => t.course_id === course.id);
			const avgScore = courseTests.length
				? Math.round((courseTests.reduce((sum, t) => sum + Number(t.percentage ?? 0), 0) / courseTests.length) * 10) / 10
				: 0;
			const totalLearningSec = courseEnrollments.reduce((sum, e) => sum + Number(e.time_spent_seconds ?? 0), 0);
			const avgLearningSec = enrolledCount ? Math.round(totalLearningSec / enrolledCount) : 0;
			return {
				id: course.id,
				title: course.title || `Curs #${course.id}`,
				enrolledCount,
				completedCount,
				avgProgress,
				completionRate,
				avgScore,
				updatedAt: course.updated_at || course.created_at || null,
				totalLearningTime: formatLearningDuration(totalLearningSec),
				avgLearningTime: formatLearningDuration(avgLearningSec),
			};
		});
	}, [statsData]);

	const courseKpis = useMemo(() => {
		const totalCourses = courseProgressRows.length;
		const avgEnrollments = totalCourses
			? Math.round((courseProgressRows.reduce((sum, r) => sum + r.enrolledCount, 0) / totalCourses) * 10) / 10
			: 0;
		const avgCompletion = totalCourses
			? Math.round((courseProgressRows.reduce((sum, r) => sum + r.completionRate, 0) / totalCourses) * 10) / 10
			: 0;
		const avgScore = totalCourses
			? Math.round((courseProgressRows.reduce((sum, r) => sum + r.avgScore, 0) / totalCourses) * 10) / 10
			: 0;
		return { totalCourses, avgEnrollments, avgCompletion, avgScore };
	}, [courseProgressRows]);

	const exportCourseProgressCsv = useCallback(() => {
		const rows = buildStructuredExcelRows({
			sheetLabel: 'Progres cursuri',
			periodFrom: dateFrom,
			periodTo: dateTo,
			kpiEntries: [
				['Total cursuri', courseKpis.totalCourses],
				['Înscrieri (medie / curs)', courseKpis.avgEnrollments],
				['Finalizare medie (%)', courseKpis.avgCompletion],
				['Scor teste mediu (%)', courseKpis.avgScore],
			],
			tableHeaders: [
				'ID curs',
				'Titlu curs',
				'Înscriși',
				'Finalizați',
				'Progres mediu (%)',
				'Rată finalizare (%)',
				'Scor mediu teste (%)',
				'Timp studiu total',
				'Timp mediu / elev',
				'Ultima actualizare',
			],
			tableRows: courseProgressRows.map((r) => [
				r.id,
				r.title,
				r.enrolledCount,
				r.completedCount,
				r.avgProgress,
				r.completionRate,
				r.avgScore,
				r.totalLearningTime,
				r.avgLearningTime,
				r.updatedAt ? new Date(r.updatedAt).toLocaleString('ro-RO') : '',
			]),
		});
		downloadStructuredExcel(statisticsExcelFilename('progres-cursuri'), 'Progres cursuri', rows);
	}, [courseKpis, courseProgressRows, dateFrom, dateTo]);

	const renderCourseProgress = () => (
		<div className="admin-statistics-student-progress">
			<header className="admin-statistics-student-head">
				<div>
					<h2 className="admin-statistics-section-heading">Raport progres cursuri</h2>
					<p className="admin-statistics-section-desc">
						Vizualizare agregată pe cursuri: înscrieri, finalizare, progres mediu și rezultate teste.
					</p>
				</div>
				<div className="admin-statistics-top-actions">
					<button
						type="button"
						className="lms-btn-secondary lms-btn-sm"
						onClick={exportCourseProgressCsv}
						disabled={loading || Boolean(error)}
					>
						Export Excel
					</button>
				</div>
			</header>

			<div className="admin-statistics-toolbar" role="group" aria-label="Filtru perioadă">
				<label className="admin-statistics-filter">
					<span className="va-input-label">Dată început</span>
					<input
						type="date"
						className="va-input"
						value={dateFrom}
						onChange={(e) => setDateFrom(e.target.value)}
					/>
				</label>
				<label className="admin-statistics-filter">
					<span className="va-input-label">Dată sfârșit</span>
					<input
						type="date"
						className="va-input"
						value={dateTo}
						onChange={(e) => setDateTo(e.target.value)}
					/>
				</label>
			</div>

			<div className="admin-statistics-student-kpis">
				<article>
					<span>Total cursuri</span>
					<strong>{courseKpis.totalCourses}</strong>
				</article>
				<article>
					<span>Inscrieri (medie/curs)</span>
					<strong>{courseKpis.avgEnrollments}</strong>
				</article>
				<article>
					<span>Finalizare (medie %)</span>
					<strong>{courseKpis.avgCompletion}%</strong>
				</article>
				<article>
					<span>Scor teste (medie %)</span>
					<strong>{courseKpis.avgScore}%</strong>
				</article>
			</div>

			<div className="admin-users-table-wrapper admin-statistics-table-clip">
				<table className="admin-users-table admin-statistics-student-table">
					<thead>
						<tr>
							<th>Curs</th>
							<th>Inscrisi</th>
							<th>Finalizati</th>
							<th>Progres mediu (%)</th>
							<th>Rata finalizare (%)</th>
							<th>Scor mediu teste (%)</th>
							<th>Timp studiu (total)</th>
							<th>Timp mediu / elev</th>
							<th>Ultima actualizare</th>
						</tr>
					</thead>
					<tbody>
						{courseProgressRows.map((row) => (
							<tr key={row.id}>
								<td><strong>{row.title}</strong></td>
								<td>{row.enrolledCount}</td>
								<td>{row.completedCount}</td>
								<td>{row.avgProgress}%</td>
								<td>{row.completionRate}%</td>
								<td>{row.avgScore}%</td>
								<td>{row.totalLearningTime}</td>
								<td>{row.avgLearningTime}</td>
								<td>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}</td>
							</tr>
						))}
					</tbody>
				</table>
				{loading ? <div className="admin-statistics-student-empty">Se încarcă datele...</div> : null}
				{!loading && !error && courseProgressRows.length === 0 ? (
					<div className="admin-statistics-student-empty">Nu există date pentru filtrul selectat.</div>
				) : null}
				{!loading && error ? <div className="admin-statistics-student-empty">{error}</div> : null}
			</div>
		</div>
	);

	const testProgressRows = useMemo(() => {
		const tests = statsData?.test_results || [];
		const byTest = new Map();
		tests.forEach((row) => {
			const key = row.test_id;
			if (!byTest.has(key)) {
				byTest.set(key, {
					test_id: row.test_id,
					test_title: row.test_title || `Test #${row.test_id}`,
					attempts: 0,
					passed: 0,
					avgScoreSum: 0,
					lastAt: null,
				});
			}
			const agg = byTest.get(key);
			agg.attempts += 1;
			agg.passed += row.passed ? 1 : 0;
			agg.avgScoreSum += Number(row.percentage ?? 0);
			if (!agg.lastAt || (row.completed_at && new Date(row.completed_at) > new Date(agg.lastAt))) {
				agg.lastAt = row.completed_at || agg.lastAt;
			}
		});

		return Array.from(byTest.values()).map((r) => ({
			id: r.test_id,
			title: r.test_title,
			attempts: r.attempts,
			passed: r.passed,
			passRate: r.attempts ? Math.round((r.passed / r.attempts) * 100) : 0,
			avgScore: r.attempts ? Math.round((r.avgScoreSum / r.attempts) * 10) / 10 : 0,
			lastAt: r.lastAt,
		}));
	}, [statsData]);

	const testKpis = useMemo(() => {
		const totalTests = testProgressRows.length;
		const totalAttempts = testProgressRows.reduce((sum, r) => sum + r.attempts, 0);
		const avgPassRate = totalTests
			? Math.round((testProgressRows.reduce((sum, r) => sum + r.passRate, 0) / totalTests) * 10) / 10
			: 0;
		const avgScore = totalTests
			? Math.round((testProgressRows.reduce((sum, r) => sum + r.avgScore, 0) / totalTests) * 10) / 10
			: 0;
		return { totalTests, totalAttempts, avgPassRate, avgScore };
	}, [testProgressRows]);

	const exportTestProgressCsv = useCallback(() => {
		const rows = buildStructuredExcelRows({
			sheetLabel: 'Progres teste',
			periodFrom: dateFrom,
			periodTo: dateTo,
			kpiEntries: [
				['Teste cu activitate', testKpis.totalTests],
				['Total încercări', testKpis.totalAttempts],
				['Promovare medie (%)', testKpis.avgPassRate],
				['Scor mediu (%)', testKpis.avgScore],
			],
			tableHeaders: [
				'ID test',
				'Titlu test',
				'Încercări',
				'Promovări (încercări reușite)',
				'Rată promovare (%)',
				'Scor mediu (%)',
				'Ultima susținere',
			],
			tableRows: testProgressRows.map((r) => [
				r.id,
				r.title,
				r.attempts,
				r.passed,
				r.passRate,
				r.avgScore,
				r.lastAt ? new Date(r.lastAt).toLocaleString('ro-RO') : '',
			]),
		});
		downloadStructuredExcel(statisticsExcelFilename('progres-teste'), 'Progres teste', rows);
	}, [dateFrom, dateTo, testKpis, testProgressRows]);

	const renderTestProgress = () => (
		<div className="admin-statistics-student-progress">
			<header className="admin-statistics-student-head">
				<div>
					<h2 className="admin-statistics-section-heading">Raport progres teste</h2>
					<p className="admin-statistics-section-desc">
						Statistici pe fiecare test: încercări, rată de promovare și scor mediu.
					</p>
				</div>
				<div className="admin-statistics-top-actions">
					<button
						type="button"
						className="lms-btn-secondary lms-btn-sm"
						onClick={exportTestProgressCsv}
						disabled={loading || Boolean(error)}
					>
						Export Excel
					</button>
				</div>
			</header>

			<div className="admin-statistics-toolbar" role="group" aria-label="Filtru perioadă">
				<label className="admin-statistics-filter">
					<span className="va-input-label">Dată început</span>
					<input
						type="date"
						className="va-input"
						value={dateFrom}
						onChange={(e) => setDateFrom(e.target.value)}
					/>
				</label>
				<label className="admin-statistics-filter">
					<span className="va-input-label">Dată sfârșit</span>
					<input
						type="date"
						className="va-input"
						value={dateTo}
						onChange={(e) => setDateTo(e.target.value)}
					/>
				</label>
			</div>

			<div className="admin-statistics-student-kpis">
				<article>
					<span>Total teste</span>
					<strong>{testKpis.totalTests}</strong>
				</article>
				<article>
					<span>Total incercari</span>
					<strong>{testKpis.totalAttempts}</strong>
				</article>
				<article>
					<span>Promovare medie (%)</span>
					<strong>{testKpis.avgPassRate}%</strong>
				</article>
				<article>
					<span>Scor mediu (%)</span>
					<strong>{testKpis.avgScore}%</strong>
				</article>
			</div>

			<div className="admin-users-table-wrapper admin-statistics-table-clip">
				<table className="admin-users-table admin-statistics-student-table">
					<thead>
						<tr>
							<th>Test</th>
							<th>Incercari</th>
							<th>Promovati</th>
							<th>Rata promovare (%)</th>
							<th>Scor mediu (%)</th>
							<th>Ultima sustinere</th>
						</tr>
					</thead>
					<tbody>
						{testProgressRows.map((row) => (
							<tr key={row.id}>
								<td><strong>{row.title}</strong></td>
								<td>{row.attempts}</td>
								<td>{row.passed}</td>
								<td>{row.passRate}%</td>
								<td>{row.avgScore}%</td>
								<td>{row.lastAt ? new Date(row.lastAt).toLocaleString() : '—'}</td>
							</tr>
						))}
					</tbody>
				</table>
				{loading ? <div className="admin-statistics-student-empty">Se încarcă datele...</div> : null}
				{!loading && !error && testProgressRows.length === 0 ? (
					<div className="admin-statistics-student-empty">Nu există date pentru filtrul selectat.</div>
				) : null}
				{!loading && error ? <div className="admin-statistics-student-empty">{error}</div> : null}
			</div>
		</div>
	);

	const topStudentsRows = useMemo(() => {
		const tests = statsData?.test_results || [];
		const students = statsData?.students || [];
		const enrollments = statsData?.enrollments || [];
		const studentsMap = new Map(students.map((s) => [s.id, s]));
		const visitsByUser = new Map();
		enrollments.forEach((e) => {
			visitsByUser.set(e.user_id, (visitsByUser.get(e.user_id) || 0) + 1);
		});
		const byUser = new Map();

		tests.forEach((row) => {
			if (!byUser.has(row.user_id)) {
				byUser.set(row.user_id, {
					user_id: row.user_id,
					attempts: 0,
					sumScore: 0,
					passed: 0,
				});
			}
			const agg = byUser.get(row.user_id);
			agg.attempts += 1;
			agg.sumScore += Number(row.percentage ?? 0);
			agg.passed += row.passed ? 1 : 0;
		});

		return Array.from(byUser.values())
			.map((r) => {
				const student = studentsMap.get(r.user_id) || {};
				const avgScore = r.attempts ? Math.round((r.sumScore / r.attempts) * 10) / 10 : 0;
				const passRate = r.attempts ? Math.round((r.passed / r.attempts) * 100) : 0;
				return {
					id: r.user_id,
					name: student.name || `Utilizator #${r.user_id}`,
					email: student.email || '—',
					attempts: r.attempts,
					avgScore,
					passRate,
					registeredAt: student.created_at || null,
					visits: visitsByUser.get(r.user_id) || 0,
					shares: 0,
				};
			})
			.sort((a, b) => b.avgScore - a.avgScore || b.attempts - a.attempts);
	}, [statsData]);

	const topPerformers = topStudentsRows.slice(0, 10);
	const needsAttention = topStudentsRows.filter((s) => s.avgScore < 60).slice(0, 8);

	const exportTopStudentsCsv = useCallback(() => {
		const avgTop10 = topPerformers.length
			? Math.round((topPerformers.reduce((sum, r) => sum + r.avgScore, 0) / topPerformers.length) * 10) / 10
			: 0;
		const rows = buildStructuredExcelRows({
			sheetLabel: 'Top 10 studenți',
			periodFrom: dateFrom,
			periodTo: dateTo,
			kpiEntries: [
				['Elevi evaluați (cu încercări la teste)', topStudentsRows.length],
				['În clasament top 10', topPerformers.length],
				['Sub prag 60% (secțiune ghidare)', needsAttention.length],
				['Scor mediu top 10 (%)', avgTop10],
			],
			tableHeaders: [
				'Rang',
				'Nume complet',
				'Email',
				'Scor mediu (%)',
				'Rată promovare (%)',
				'Încercări',
				'Înscrieri cursuri (vizite)',
				'Distribuiri',
				'Data înregistrării cont',
			],
			tableRows: topPerformers.map((row, index) => [
				index + 1,
				row.name,
				row.email,
				row.avgScore,
				row.passRate,
				row.attempts,
				row.visits,
				row.shares,
				row.registeredAt ? new Date(row.registeredAt).toLocaleString('ro-RO') : '',
			]),
			extraSections:
				needsAttention.length > 0
					? [
							{
								title: 'Elevi sub prag 60% (pentru ghidare)',
								headers: ['Nume complet', 'Email', 'Scor mediu (%)', 'Încercări'],
								rows: needsAttention.map((row) => [row.name, row.email, row.avgScore, row.attempts]),
							},
						]
					: [],
		});
		downloadStructuredExcel(statisticsExcelFilename('top-10-studenti'), 'Top studenti', rows);
	}, [dateFrom, dateTo, needsAttention, topPerformers, topStudentsRows.length]);

	const renderTopStudents = () => (
		<div className="admin-statistics-student-progress">
			<header className="admin-statistics-student-head">
				<div>
					<h2 className="admin-statistics-section-heading">Top 10 studenți</h2>
					<p className="admin-statistics-section-desc">
						Performanța celor mai buni elevi după scorul mediu la teste și numărul de încercări. Poți identifica
						rapid zonele unde e nevoie de sprijin suplimentar.
					</p>
				</div>
				<div className="admin-statistics-top-actions">
					<button
						type="button"
						className="lms-btn-secondary lms-btn-sm"
						onClick={exportTopStudentsCsv}
						disabled={loading || Boolean(error)}
					>
						Export Excel
					</button>
				</div>
			</header>

			<div className="admin-statistics-student-kpis">
				<article>
					<span>Elevi evaluați</span>
					<strong>{topStudentsRows.length}</strong>
				</article>
				<article>
					<span>Top performeri</span>
					<strong>{topPerformers.length}</strong>
				</article>
				<article>
					<span>Necesită atenție</span>
					<strong>{needsAttention.length}</strong>
				</article>
				<article>
					<span>Scor mediu top 10</span>
					<strong>
						{topPerformers.length
							? Math.round((topPerformers.reduce((sum, r) => sum + r.avgScore, 0) / topPerformers.length) * 10) / 10
							: 0}
						%
					</strong>
				</article>
			</div>

			<div className="admin-users-table-wrapper admin-statistics-table-clip">
				<table className="admin-users-table admin-statistics-student-table admin-statistics-top10-table">
					<thead>
						<tr>
							<th>Email</th>
							<th>Nume complet</th>
							<th>Data inregistrarii</th>
							<th>Progres</th>
							<th>Vizite</th>
							<th>Distribuiri</th>
						</tr>
					</thead>
					<tbody>
						{topPerformers.map((row) => (
							<tr key={row.id}>
								<td><strong>{row.email}</strong></td>
								<td>{row.name}</td>
								<td>{formatDateShort(row.registeredAt)}</td>
								<td><span className="admin-statistics-progress-pill">{row.avgScore}%</span></td>
								<td><span className="admin-statistics-metric-pill">{row.visits}</span></td>
								<td><span className="admin-statistics-metric-pill is-muted">{row.shares}</span></td>
							</tr>
						))}
					</tbody>
				</table>
				{loading ? <div className="admin-statistics-student-empty">Se încarcă datele...</div> : null}
				{!loading && !error && topPerformers.length === 0 ? (
					<div className="admin-statistics-student-empty">Nu există date suficiente pentru clasament.</div>
				) : null}
				{!loading && error ? <div className="admin-statistics-student-empty">{error}</div> : null}
			</div>

			<div className="admin-statistics-attention">
				<h3>Elevi care au nevoie de ghidare</h3>
				{needsAttention.length === 0 ? (
					<p>Nu au fost identificați elevi sub pragul de 60%.</p>
				) : (
					<ul>
						{needsAttention.map((row) => (
							<li key={row.id}>
								<strong>{row.name}</strong>
								<span>{row.avgScore}% • {row.attempts} incercari</span>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);

	const studentsRows = useMemo(() => {
		const students = statsData?.students || [];
		const enrollments = statsData?.enrollments || [];
		const tests = statsData?.test_results || [];

		return students.map((student) => {
			const studentEnrollments = enrollments.filter((e) => e.user_id === student.id);
			const studentTests = tests.filter((t) => t.user_id === student.id);
			const openedCourses = studentEnrollments.length;
			const completedCourses = studentEnrollments.filter((e) => e.completed_at).length;
			const avgScore = studentTests.length
				? Math.round((studentTests.reduce((sum, t) => sum + Number(t.percentage ?? 0), 0) / studentTests.length) * 10) / 10
				: 0;
			const learningSec = studentEnrollments.reduce((sum, e) => sum + Number(e.time_spent_seconds ?? 0), 0);

			const timestamps = [
				...studentEnrollments.map((e) => e.enrolled_at).filter(Boolean),
				...studentEnrollments.map((e) => e.completed_at).filter(Boolean),
				...studentTests.map((t) => t.completed_at).filter(Boolean),
			].map((v) => new Date(v));
			const firstActivity = timestamps.length ? new Date(Math.min(...timestamps.map((d) => d.getTime()))) : null;
			const lastActivity = timestamps.length ? new Date(Math.max(...timestamps.map((d) => d.getTime()))) : null;

			return {
				id: student.id,
				name: student.name || `Utilizator #${student.id}`,
				email: student.email || '—',
				registeredAt: firstActivity,
				lastActivity,
				openedCourses,
				completedCourses,
				completedTests: studentTests.length,
				avgScore,
				learningTime: formatLearningDuration(learningSec),
			};
		});
	}, [statsData]);

	const exportStudentsOverviewCsv = useCallback(() => {
		const rows = buildStructuredExcelRows({
			sheetLabel: 'Elevi — detaliu',
			periodFrom: dateFrom,
			periodTo: dateTo,
			kpiEntries: [['Total elevi în raport', studentsRows.length]],
			tableHeaders: [
				'ID utilizator',
				'Nume complet',
				'Email',
				'Prima activitate',
				'Ultima activitate',
				'Cursuri deschise',
				'Cursuri finalizate',
				'Teste (încercări înregistrate)',
				'Scor mediu (%)',
				'Timp studiu',
			],
			tableRows: studentsRows.map((row) => [
				row.id,
				row.name,
				row.email,
				row.registeredAt ? row.registeredAt.toLocaleString('ro-RO') : '',
				row.lastActivity ? row.lastActivity.toLocaleString('ro-RO') : '',
				row.openedCourses,
				row.completedCourses,
				row.completedTests,
				row.avgScore,
				row.learningTime,
			]),
		});
		downloadStructuredExcel(statisticsExcelFilename('elevi-detaliu'), 'Elevi', rows);
	}, [dateFrom, dateTo, studentsRows]);

	const renderStudentsOverview = () => (
		<div className="admin-statistics-student-progress">
			<header className="admin-statistics-student-head">
				<div>
					<h2 className="admin-statistics-section-heading">Statistică pe elevi</h2>
					<p className="admin-statistics-section-desc">
						Vizualizare consolidată pentru fiecare elev: activitate, progres și performanță la teste.
					</p>
				</div>
				<div className="admin-statistics-top-actions">
					<span className="admin-statistics-meta-pill">Total elevi: {studentsRows.length}</span>
					<button
						type="button"
						className="lms-btn-secondary lms-btn-sm"
						onClick={exportStudentsOverviewCsv}
						disabled={loading || Boolean(error)}
					>
						Export Excel
					</button>
				</div>
			</header>

			<div className="admin-statistics-toolbar" role="group" aria-label="Filtru perioadă">
				<label className="admin-statistics-filter">
					<span className="va-input-label">Dată început</span>
					<input
						type="date"
						className="va-input"
						value={dateFrom}
						onChange={(e) => setDateFrom(e.target.value)}
					/>
				</label>
				<label className="admin-statistics-filter">
					<span className="va-input-label">Dată sfârșit</span>
					<input
						type="date"
						className="va-input"
						value={dateTo}
						onChange={(e) => setDateTo(e.target.value)}
					/>
				</label>
			</div>

			<div className="admin-users-table-wrapper admin-statistics-table-clip">
				<table className="admin-users-table admin-statistics-student-table">
					<thead>
						<tr>
							<th>Data inregistrarii</th>
							<th>Email</th>
							<th>Nume complet</th>
							<th>Ultima activitate</th>
							<th>Cursuri deschise</th>
							<th>Cursuri finalizate</th>
							<th>Teste finalizate</th>
							<th>Scor mediu (%)</th>
							<th>Timp studiu</th>
						</tr>
					</thead>
					<tbody>
						{studentsRows.map((row) => (
							<tr key={row.id}>
								<td>{row.registeredAt ? row.registeredAt.toLocaleString() : '—'}</td>
								<td>{row.email}</td>
								<td><strong>{row.name}</strong></td>
								<td>{row.lastActivity ? row.lastActivity.toLocaleString() : '—'}</td>
								<td>{row.openedCourses}</td>
								<td>{row.completedCourses}</td>
								<td>{row.completedTests}</td>
								<td>{row.avgScore}%</td>
								<td>{row.learningTime}</td>
							</tr>
						))}
					</tbody>
				</table>
				{loading ? <div className="admin-statistics-student-empty">Se încarcă datele...</div> : null}
				{!loading && !error && studentsRows.length === 0 ? (
					<div className="admin-statistics-student-empty">Nu există date pentru filtrul selectat.</div>
				) : null}
				{!loading && error ? <div className="admin-statistics-student-empty">{error}</div> : null}
			</div>
		</div>
	);

	const coursesRows = useMemo(() => {
		const courses = statsData?.courses || [];
		const enrollments = statsData?.enrollments || [];
		return courses.map((course) => {
			const courseEnrollments = enrollments.filter((e) => e.course_id === course.id);
			const total = courseEnrollments.length;
			const completed = courseEnrollments.filter((e) => e.completed_at).length;
			const inProgress = courseEnrollments.filter((e) => !e.completed_at && Number(e.progress_percentage || 0) > 0).length;
			const notStarted = courseEnrollments.filter((e) => Number(e.progress_percentage || 0) === 0).length;
			const didNotFinish = total - completed;
			const avgProgress = total
				? Math.round((courseEnrollments.reduce((sum, e) => sum + Number(e.progress_percentage ?? 0), 0) / total) * 10) / 10
				: 0;
			const totalLearningSec = courseEnrollments.reduce((sum, e) => sum + Number(e.time_spent_seconds ?? 0), 0);
			const avgLearningSec = total ? Math.round(totalLearningSec / total) : 0;
			return {
				id: course.id,
				title: course.title || `Curs #${course.id}`,
				total,
				notStarted,
				inProgress,
				completed,
				didNotFinish,
				reopened: 0,
				avgTime: formatLearningDuration(avgLearningSec),
				totalLearningTime: formatLearningDuration(totalLearningSec),
				avgProgress,
			};
		});
	}, [statsData]);

	const exportCoursesOverviewCsv = useCallback(() => {
		const rows = buildStructuredExcelRows({
			sheetLabel: 'Cursuri — funnel',
			periodFrom: dateFrom,
			periodTo: dateTo,
			kpiEntries: [
				['Elevi în eșantion', statsData?.students?.length ?? 0],
				['Cursuri în raport', coursesRows.length],
			],
			tableHeaders: [
				'ID curs',
				'Titlu curs',
				'Elevi (funnel)',
				'Neînceput',
				'În progres',
				'Finalizat',
				'Nefinalizat',
				'Re-deschis',
				'Timp mediu / elev',
				'Timp total studiu',
				'Progres mediu (%)',
			],
			tableRows: coursesRows.map((row) => [
				row.id,
				row.title,
				row.total,
				row.notStarted,
				row.inProgress,
				row.completed,
				row.didNotFinish,
				row.reopened,
				row.avgTime,
				row.totalLearningTime,
				row.avgProgress,
			]),
		});
		downloadStructuredExcel(statisticsExcelFilename('cursuri-funnel'), 'Cursuri', rows);
	}, [coursesRows, dateFrom, dateTo, statsData?.students?.length]);

	const renderCoursesOverview = () => (
		<div className="admin-statistics-student-progress">
			<header className="admin-statistics-student-head">
				<div>
					<h2 className="admin-statistics-section-heading">Statistică cursuri</h2>
					<p className="admin-statistics-section-desc">
						Vizualizare pe cursuri: funnel de progres, stare curs și indicatori agregați.
					</p>
				</div>
				<div className="admin-statistics-top-actions">
					<span className="admin-statistics-meta-pill">Elevi: {statsData?.students?.length || 0}</span>
					<span className="admin-statistics-meta-pill">Cursuri: {coursesRows.length}</span>
					<button
						type="button"
						className="lms-btn-secondary lms-btn-sm"
						onClick={exportCoursesOverviewCsv}
						disabled={loading || Boolean(error)}
					>
						Export Excel
					</button>
				</div>
			</header>

			<div className="admin-statistics-toolbar" role="group" aria-label="Filtru perioadă">
				<label className="admin-statistics-filter">
					<span className="va-input-label">Dată început</span>
					<input
						type="date"
						className="va-input"
						value={dateFrom}
						onChange={(e) => setDateFrom(e.target.value)}
					/>
				</label>
				<label className="admin-statistics-filter">
					<span className="va-input-label">Dată sfârșit</span>
					<input
						type="date"
						className="va-input"
						value={dateTo}
						onChange={(e) => setDateTo(e.target.value)}
					/>
				</label>
			</div>

			<div className="admin-users-table-wrapper admin-statistics-table-clip">
				<table className="admin-users-table admin-statistics-student-table">
					<thead>
						<tr>
							<th>Nume curs</th>
							<th>Funnel</th>
							<th>Neinceput</th>
							<th>In progres</th>
							<th>Finalizat</th>
							<th>Nefinalizat</th>
							<th>Re-deschis</th>
							<th>Timp mediu / elev</th>
							<th>Timp total studiu</th>
							<th>Progres mediu</th>
						</tr>
					</thead>
					<tbody>
						{coursesRows.map((row) => (
							<tr key={row.id}>
								<td><strong>{row.title}</strong></td>
								<td>{row.total}</td>
								<td>{row.notStarted}</td>
								<td>{row.inProgress}</td>
								<td>{row.completed}</td>
								<td>{row.didNotFinish}</td>
								<td>{row.reopened}</td>
								<td>{row.avgTime}</td>
								<td>{row.totalLearningTime}</td>
								<td>{row.avgProgress}%</td>
							</tr>
						))}
					</tbody>
				</table>
				{loading ? <div className="admin-statistics-student-empty">Se încarcă datele...</div> : null}
				{!loading && !error && coursesRows.length === 0 ? (
					<div className="admin-statistics-student-empty">Nu există date pentru filtrul selectat.</div>
				) : null}
				{!loading && error ? <div className="admin-statistics-student-empty">{error}</div> : null}
			</div>
		</div>
	);

	const testsRows = useMemo(() => {
		const tests = statsData?.test_results || [];
		const students = statsData?.students || [];
		const totalStudents = students.length;
		const byTest = new Map();

		tests.forEach((row) => {
			const key = row.test_id;
			if (!byTest.has(key)) {
				byTest.set(key, {
					test_id: row.test_id,
					test_title: row.test_title || `Test #${row.test_id}`,
					attempts: [],
				});
			}
			byTest.get(key).attempts.push(row);
		});

		return Array.from(byTest.values()).map((item) => {
			const attemptedUserIds = new Set(item.attempts.map((a) => a.user_id));
			const attempted = attemptedUserIds.size;
			const passed = item.attempts.filter((a) => a.passed).length;
			const failed = Math.max(attempted - passed, 0);
			const notStarted = Math.max(totalStudents - attempted, 0);
			return {
				id: item.test_id,
				title: item.test_title,
				notStarted,
				started: attempted,
				passed,
				failed,
			};
		});
	}, [statsData]);

	const testsStudentRows = useMemo(() => {
		const tests = statsData?.test_results || [];
		const students = statsData?.students || [];
		const studentsMap = new Map(students.map((s) => [s.id, s]));
		const byStudent = new Map();
		tests.forEach((row) => {
			if (!byStudent.has(row.user_id)) {
				byStudent.set(row.user_id, {
					user_id: row.user_id,
					attempts: 0,
					passed: 0,
				});
			}
			const agg = byStudent.get(row.user_id);
			agg.attempts += 1;
			agg.passed += row.passed ? 1 : 0;
		});
		return Array.from(byStudent.values()).map((row) => {
			const s = studentsMap.get(row.user_id) || {};
			return {
				id: row.user_id,
				name: s.name || `Utilizator #${row.user_id}`,
				email: s.email || '—',
				attempts: row.attempts,
				passed: row.passed,
				failed: Math.max(row.attempts - row.passed, 0),
			};
		});
	}, [statsData]);

	const normalizedTestsSearch = testsSearch.trim().toLowerCase();
	const filteredTestsRows = useMemo(() => {
		if (!normalizedTestsSearch) return testsRows;
		return testsRows.filter((row) => (row.title || '').toLowerCase().includes(normalizedTestsSearch));
	}, [testsRows, normalizedTestsSearch]);

	const filteredTestsStudentRows = useMemo(() => {
		if (!normalizedTestsSearch) return testsStudentRows;
		return testsStudentRows.filter((row) => {
			const name = (row.name || '').toLowerCase();
			const email = (row.email || '').toLowerCase();
			return name.includes(normalizedTestsSearch) || email.includes(normalizedTestsSearch);
		});
	}, [testsStudentRows, normalizedTestsSearch]);

	const exportTestsOverviewCsv = useCallback(() => {
		const searchNote = testsSearch.trim();
		const rows = buildStructuredExcelRows({
			sheetLabel: 'Teste — agregat și pe elevi',
			periodFrom: dateFrom,
			periodTo: dateTo,
			extraMeta: searchNote ? [['Filtru căutare (ca în ecran)', searchNote]] : [],
			kpiEntries: [
				['Elevi în raport', statsData?.students?.length ?? 0],
				['Teste cu activitate', testsRows.length],
				[
					'Rânduri export (teste / elevi)',
					`${filteredTestsRows.length} / ${filteredTestsStudentRows.length}`,
				],
			],
			tableHeaders: [
				'ID test',
				'Nume test',
				'Nu au început (elevi)',
				'Au început (elevi)',
				'Au finalizat (valoare din raport)',
				'Nu au finalizat (valoare din raport)',
			],
			tableRows: filteredTestsRows.map((row) => [
				row.id,
				row.title,
				row.notStarted,
				row.started,
				row.passed,
				row.failed,
			]),
			extraSections: [
				{
					title: 'Elevi — activitate la teste (rânduri filtrate ca în ecran)',
					headers: ['ID utilizator', 'Nume', 'Email', 'Încercări', 'Promovări', 'Nepromovate'],
					rows: filteredTestsStudentRows.map((row) => [
						row.id,
						row.name,
						row.email,
						row.attempts,
						row.passed,
						row.failed,
					]),
				},
			],
		});
		downloadStructuredExcel(statisticsExcelFilename('teste-elevi'), 'Teste', rows);
	}, [
		dateFrom,
		dateTo,
		filteredTestsRows,
		filteredTestsStudentRows,
		statsData?.students?.length,
		testsRows.length,
		testsSearch,
	]);

	const renderTestsOverview = () => (
		<div className="admin-statistics-student-progress">
			<header className="admin-statistics-student-head">
				<div>
					<h2 className="admin-statistics-section-heading">Statistică teste</h2>
					<p className="admin-statistics-section-desc">
						Detalii pe teste și pe elevi: încercări, promovări și filtre rapide.
					</p>
				</div>
				<div className="admin-statistics-top-actions admin-statistics-top-actions--wrap">
					<span className="admin-statistics-meta-pill">Elevi: {statsData?.students?.length || 0}</span>
					<span className="admin-statistics-meta-pill">Teste: {testsRows.length}</span>
					<button
						type="button"
						className="lms-btn-secondary lms-btn-sm"
						onClick={exportTestsOverviewCsv}
						disabled={loading || Boolean(error)}
					>
						Export Excel
					</button>
					<input
						type="search"
						placeholder={testsViewMode === 'tests' ? 'Caută test…' : 'Caută elev…'}
						value={testsSearch}
						onChange={(e) => setTestsSearch(e.target.value)}
						className="va-input admin-statistics-tests-search"
						aria-label={testsViewMode === 'tests' ? 'Caută după nume test' : 'Caută după nume sau email elev'}
					/>
				</div>
			</header>

			<div className="admin-statistics-tests-tabs">
				<button
					type="button"
					className={testsViewMode === 'tests' ? 'is-active' : ''}
					onClick={() => setTestsViewMode('tests')}
				>
					Vizualizare teste
				</button>
				<button
					type="button"
					className={testsViewMode === 'students' ? 'is-active' : ''}
					onClick={() => setTestsViewMode('students')}
				>
					Vizualizare elevi
				</button>
			</div>

			<div className="admin-users-table-wrapper admin-statistics-table-clip">
				<table className="admin-users-table admin-statistics-student-table">
					<thead>
						{testsViewMode === 'tests' ? (
							<tr>
								<th>Nume test</th>
								<th>Nu au inceput</th>
								<th>Au inceput</th>
								<th>Au finalizat</th>
								<th>Nu au finalizat</th>
							</tr>
						) : (
							<tr>
								<th>Elev</th>
								<th>Email</th>
								<th>Încercări</th>
								<th>Finalizate</th>
								<th>Nefinalizate</th>
							</tr>
						)}
					</thead>
					<tbody>
						{testsViewMode === 'tests'
							? filteredTestsRows.map((row) => (
								<tr key={row.id}>
									<td><strong>{row.title}</strong></td>
									<td>{row.notStarted}</td>
									<td>{row.started}</td>
									<td>{row.passed}</td>
									<td>{row.failed}</td>
								</tr>
							))
							: filteredTestsStudentRows.map((row) => (
								<tr key={row.id}>
									<td><strong>{row.name}</strong></td>
									<td>{row.email}</td>
									<td>{row.attempts}</td>
									<td>{row.passed}</td>
									<td>{row.failed}</td>
								</tr>
							))}
					</tbody>
				</table>
				{loading ? <div className="admin-statistics-student-empty">Se încarcă datele...</div> : null}
				{!loading && !error && testsViewMode === 'tests' && filteredTestsRows.length === 0 ? (
					<div className="admin-statistics-student-empty">Nu există teste cu activitate.</div>
				) : null}
				{!loading && !error && testsViewMode === 'students' && filteredTestsStudentRows.length === 0 ? (
					<div className="admin-statistics-student-empty">Nu există elevi cu activitate pe teste.</div>
				) : null}
				{!loading && error ? <div className="admin-statistics-student-empty">{error}</div> : null}
			</div>
		</div>
	);

	return (
		<div className="admin-container">
			<header className="admin-page-header">
				<div className="admin-page-header-content">
					<h1 className="admin-page-title">Statistică</h1>
					<p className="admin-page-subtitle">
						Rapoarte de progres, cursuri, teste și clasamente — aliniate la datele din platformă
					</p>
				</div>
			</header>

			<div className="admin-statistics-hub-layout">
				<aside className="admin-statistics-hub-sidebar" aria-label="Navigare rapoarte">
					<p className="admin-statistics-hub-sidebar-title">Rapoarte</p>
					<nav className="admin-statistics-hub-nav">
						{MENU_ITEMS.map((item) => (
							<button
								key={item.id}
								type="button"
								className={active === item.id ? 'is-active' : ''}
								onClick={() => setActive(item.id)}
							>
								{item.label}
							</button>
						))}
					</nav>
				</aside>

				<section className="admin-statistics-hub-main">
				{active === 'student-progress' ? (
					renderStudentProgress()
				) : active === 'course-progress' ? (
					renderCourseProgress()
				) : active === 'test-progress' ? (
					renderTestProgress()
				) : active === 'top-students' ? (
					renderTopStudents()
				) : active === 'students' ? (
					renderStudentsOverview()
				) : active === 'courses' ? (
					renderCoursesOverview()
				) : active === 'tests' ? (
					renderTestsOverview()
				) : (
					<div className="admin-statistics-placeholder">
						<h2 className="admin-statistics-section-heading">{activeItem?.label || 'Statistică'}</h2>
						<p className="admin-statistics-placeholder-text">
							Această secțiune este pregătită pentru conținut viitor.
						</p>
					</div>
				)}
				</section>
			</div>
		</div>
	);
};

export default AdminStatisticsHubPage;
