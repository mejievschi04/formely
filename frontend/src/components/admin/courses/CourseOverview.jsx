import React, { useMemo } from 'react';
import { Eye, EyeSlash, PencilSimple, RocketLaunch, Trash } from '@phosphor-icons/react';

const iconProps = { size: 18, weight: 'bold', 'aria-hidden': true };

const CourseOverview = ({ course, onQuickAction, readOnly = false, showStaffCourseEdit = false }) => {
	const stats = useMemo(() => {
		const modules = Array.isArray(course?.modules) ? course.modules : [];
		const nestedLessons = modules.reduce((n, m) => n + (Array.isArray(m?.lessons) ? m.lessons.length : 0), 0);
		const rootLessons = Array.isArray(course?.root_lessons)
			? course.root_lessons.length
			: Array.isArray(course?.lessons)
				? course.lessons.filter((l) => l?.module_id == null || Number(l.module_id) === 0).length
				: 0;
		const enrollments = Number(
			course?.enrollments_count ?? course?.total_enrollments ?? 0
		) || 0;
		const completion = Number(course?.completion_rate ?? 0) || 0;
		const modulesCount = Number(course?.modules_count ?? modules.length) || 0;
		const lessonsCount = Number(
			course?.lessons_count ?? (nestedLessons + rootLessons)
		) || 0;
		const examsCount = Number(course?.exams_count ?? course?.tests_count ?? 0) || 0;
		return { enrollments, completion, modulesCount, lessonsCount, examsCount };
	}, [course]);

	const getStatusBadge = (status) => {
		const badges = {
			published: { label: 'Publicat', color: '#09A86B', bg: 'rgba(9, 168, 107, 0.1)' },
			draft: { label: 'Ciornă', color: '#9FE22F', bg: 'rgba(159, 226, 47, 0.1)' },
		};
		return badges[status] || badges.draft;
	};

	const statusBadge = getStatusBadge(course.status);

	return (
		<div className="admin-course-overview">
			<div className="admin-course-overview-header">
				<div className="admin-course-overview-title">
					<h2>Prezentare curs</h2>
					<div
						className="admin-course-status-badge"
						style={{
							backgroundColor: statusBadge.bg,
							color: statusBadge.color,
							borderColor: statusBadge.color,
						}}
					>
						{statusBadge.label}
					</div>
				</div>
				<div className="admin-course-overview-actions">
					{showStaffCourseEdit && (
						<button
							type="button"
							className="lms-btn-secondary admin-course-overview-action-btn"
							onClick={() => onQuickAction('edit')}
							title="Module, lecții și conținut (builder)"
						>
							<PencilSimple {...iconProps} />
							<span>Editează</span>
						</button>
					)}
					{!readOnly && course.status !== 'published' && (
						<button
							type="button"
							className="lms-btn-primary admin-course-overview-action-btn"
							onClick={() => onQuickAction('publish')}
						>
							<RocketLaunch {...iconProps} />
							<span>Publică</span>
						</button>
					)}
					{!readOnly && course.status === 'published' && (
						<button
							type="button"
							className="lms-btn-secondary admin-course-overview-action-btn"
							onClick={() => onQuickAction('unpublish')}
						>
							<EyeSlash {...iconProps} />
							<span>Retrage publicarea</span>
						</button>
					)}
					<button
						type="button"
						className="lms-btn-secondary admin-course-overview-action-btn"
						onClick={() => onQuickAction('preview')}
					>
						<Eye {...iconProps} />
						<span>Previzualizare ca elev</span>
					</button>
					{!readOnly && (
						<button
							type="button"
							className="lms-btn-secondary va-btn-danger admin-course-overview-action-btn"
							onClick={() => onQuickAction('delete')}
						>
							<Trash {...iconProps} />
							<span>Șterge</span>
						</button>
					)}
				</div>
			</div>

			<div className="admin-course-overview-grid">
				<div className="admin-course-overview-card">
					<h3>Indicatori principali</h3>
					<div className="admin-course-overview-kpis">
						<div className="admin-course-overview-kpi">
							<div className="admin-course-overview-kpi-label">Înscrieri</div>
							<div className="admin-course-overview-kpi-value">
								{stats.enrollments}
							</div>
						</div>
						<div className="admin-course-overview-kpi">
							<div className="admin-course-overview-kpi-label">Finalizare</div>
							<div className="admin-course-overview-kpi-value">
								{stats.completion}%
							</div>
						</div>
					</div>
				</div>

				<div className="admin-course-overview-card">
					<h3>Structură</h3>
					<div className="admin-course-overview-info">
						<div className="admin-course-overview-info-item">
							<span className="admin-course-overview-label">Module:</span>
							<span className="admin-course-overview-value">
								{stats.modulesCount}
							</span>
						</div>
						<div className="admin-course-overview-info-item">
							<span className="admin-course-overview-label">Lecții:</span>
							<span className="admin-course-overview-value">
								{stats.lessonsCount}
							</span>
						</div>
						<div className="admin-course-overview-info-item">
							<span className="admin-course-overview-label">Teste:</span>
							<span className="admin-course-overview-value">
								{stats.examsCount}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default CourseOverview;
