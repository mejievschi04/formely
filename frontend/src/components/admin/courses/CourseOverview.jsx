import React from 'react';
import { Eye, EyeSlash, PencilSimple, RocketLaunch, Trash } from '@phosphor-icons/react';

const iconProps = { size: 18, weight: 'bold', 'aria-hidden': true };

const CourseOverview = ({ course, onQuickAction, readOnly = false, showStaffCourseEdit = false }) => {

	// Culorile stau în CSS (admin-course-detail-modern.css), cu variante pentru tema luminoasă și întunecată.
	const getStatusBadge = (status) => (
		status === 'published'
			? { label: 'Publicat', tone: 'is-published' }
			: { label: 'Ciornă', tone: 'is-draft' }
	);

	const statusBadge = getStatusBadge(course.status);

	return (
		<div className="admin-course-overview">
			<div className="admin-course-overview-header">
				<div className="admin-course-overview-title">
					<h2>Prezentare curs</h2>
					<div className={`admin-course-status-badge ${statusBadge.tone}`}>
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
							className="lms-btn-secondary va-btn-delete va-btn-danger admin-course-overview-action-btn"
							onClick={() => onQuickAction('delete')}
						>
							<Trash {...iconProps} />
							<span>Șterge curs</span>
						</button>
					)}
				</div>
			</div>

			<div className="admin-course-overview-grid">
				{/* KPI-uri */}
				<div className="admin-course-overview-card">
					<h3>Indicatori principali</h3>
					<div className="admin-course-overview-kpis">
						<div className="admin-course-overview-kpi">
							<div className="admin-course-overview-kpi-label">Înscrieri</div>
							<div className="admin-course-overview-kpi-value">
								{course.enrollments_count ?? course.total_enrollments ?? 0}
							</div>
						</div>
						<div className="admin-course-overview-kpi">
							<div className="admin-course-overview-kpi-label">Finalizare</div>
							<div className="admin-course-overview-kpi-value">
								{course.completion_rate || 0}%
							</div>
						</div>
					</div>
				</div>

				{/* Structură */}
				<div className="admin-course-overview-card">
					<h3>Structură</h3>
					<div className="admin-course-overview-info">
						<div className="admin-course-overview-info-item">
							<span className="admin-course-overview-label">Module:</span>
							<span className="admin-course-overview-value">
								{course.modules_count || 0}
							</span>
						</div>
						<div className="admin-course-overview-info-item">
							<span className="admin-course-overview-label">Lecții:</span>
							<span className="admin-course-overview-value">
								{course.lessons_count || 0}
							</span>
						</div>
						<div className="admin-course-overview-info-item">
							<span className="admin-course-overview-label">Teste:</span>
							<span className="admin-course-overview-value">
								{course.exams_count || 0}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default CourseOverview;
