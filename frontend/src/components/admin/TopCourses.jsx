import React from 'react';
import { Link } from 'react-router-dom';
import { CaretRight } from '@phosphor-icons/react';
import './AdminInsightLists.css';

const SkeletonRows = () => Array.from({ length: 5 }).map((_, index) => (
	<div key={index} className="admin-course-item" aria-hidden>
		<div className="admin-course-rank" />
		<div className="admin-course-info">
			<div className="admin-skeleton-line" />
			<div className="admin-skeleton-line" />
		</div>
	</div>
));

/**
 * Cursurile cu cele mai multe înscrieri în perioadă (date din dashboard: top_courses).
 */
const TopCourses = ({ courses, loading }) => {
	return (
		<div className="admin-section-card">
			<div className="admin-widget-header">
				<h3>Cursuri după înscrieri</h3>
				<p className="admin-widget-subtitle">Primele 5 cursuri după înscrierile din ultima lună</p>
			</div>

			<div className="admin-courses-list" aria-busy={loading || undefined}>
				{loading ? (
					<SkeletonRows />
				) : courses && courses.length > 0 ? (
					courses.slice(0, 5).map((course, index) => {
						const completion = Math.max(0, Math.min(100, Number(course.completion_rate) || 0));
						return (
							<Link key={course.id ?? index} to={`/admin/courses/${course.id}`} className="admin-course-item">
								<div className="admin-course-rank">{index + 1}</div>
								<div className="admin-course-info">
									<div className="admin-course-title">{course.title || 'Curs fără titlu'}</div>
									<div className="admin-course-metrics">
										<span className="admin-course-metric">
											<span className="admin-course-metric-value">{Number(course.enrollments) || 0}</span>
											înscrieri noi
										</span>
										<span className="admin-course-metric">
											<span className="admin-course-metric-value">{completion}%</span>
											finalizare
										</span>
										<div
											className="admin-course-progress-bar"
											role="progressbar"
											aria-valuenow={completion}
											aria-valuemin={0}
											aria-valuemax={100}
											aria-label="Rată de finalizare"
										>
											<div className="admin-course-progress-fill" style={{ width: `${completion}%` }} />
										</div>
									</div>
								</div>
								<CaretRight className="admin-course-arrow" size={18} weight="bold" aria-hidden />
							</Link>
						);
					})
				) : (
					<div className="admin-widget-empty">
						<p>Nu există încă date despre cursuri.</p>
					</div>
				)}
			</div>
		</div>
	);
};

export default TopCourses;
