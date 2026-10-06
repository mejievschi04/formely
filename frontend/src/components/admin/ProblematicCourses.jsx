import React from 'react';
import { Link } from 'react-router-dom';
import { CaretRight, CheckCircle } from '@phosphor-icons/react';
import './AdminInsightLists.css';

/**
 * Motivele pentru care un curs apare ca problematic. Ratingul contează doar
 * când există recenzii (backend-ul trimite 0 fără modul de recenzii).
 */
const getIssues = (course) => {
	const issues = [];
	const completion = Number(course.completion_rate) || 0;
	const rating = Number(course.rating) || 0;
	const dropoff = Number(course.dropoff_rate) || 0;
	if (completion < 30) issues.push('Finalizare scăzută');
	if (rating > 0 && rating < 3) issues.push('Rating scăzut');
	if (dropoff > 50) issues.push('Abandon ridicat');
	return issues;
};

const ProblematicCourses = ({ courses, loading }) => {
	if (loading) {
		return (
			<div className="admin-section-card" aria-busy>
				<div className="admin-courses-list">
					{Array.from({ length: 4 }).map((_, index) => (
						<div key={index} className="admin-course-item" aria-hidden>
							<div className="admin-course-info">
								<div className="admin-skeleton-line" />
								<div className="admin-skeleton-line" />
							</div>
						</div>
					))}
				</div>
			</div>
		);
	}

	if (!courses || courses.length === 0) {
		return (
			<div className="admin-section-card">
				<div className="admin-widget-empty">
					<CheckCircle size={32} weight="duotone" aria-hidden />
					<p>Nu există cursuri care să necesite atenție.</p>
				</div>
			</div>
		);
	}

	return (
		<div className="admin-section-card">
			<div className="admin-section-header">
				<h2>Cursuri care necesită atenție</h2>
				<p className="admin-section-subtitle">Finalizare sub 30% sau peste jumătate dintre cursanți au abandonat</p>
			</div>
			<div className="admin-courses-list">
				{courses.map((course) => {
					const issues = getIssues(course);
					const rating = Number(course.rating) || 0;
					const dropoff = Number(course.dropoff_rate) || 0;
					return (
						<Link key={course.id} to={`/admin/courses/${course.id}`} className="admin-course-item">
							<div className="admin-course-info">
								<div className="admin-course-title">{course.title}</div>
								{issues.length > 0 ? (
									<div className="admin-course-issues">
										{issues.map((issue) => (
											<span key={issue} className="admin-issue-badge">{issue}</span>
										))}
									</div>
								) : null}
								<div className="admin-course-metrics">
									<span className="admin-course-metric">
										<span className="admin-course-metric-value">{Number(course.completion_rate) || 0}%</span>
										finalizare
									</span>
									{dropoff > 0 ? (
										<span className="admin-course-metric">
											<span className="admin-course-metric-value">{dropoff}%</span>
											abandon
										</span>
									) : null}
									{rating > 0 ? (
										<span className="admin-course-metric">
											<span className="admin-course-metric-value">{rating.toFixed(1)}</span>
											rating
										</span>
									) : null}
								</div>
							</div>
							<CaretRight className="admin-course-arrow" size={18} weight="bold" aria-hidden />
						</Link>
					);
				})}
			</div>
		</div>
	);
};

export default ProblematicCourses;
