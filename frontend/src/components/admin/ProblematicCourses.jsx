import React from 'react';
import { Link } from 'react-router-dom';

const ProblematicCourses = ({ courses, loading }) => {
	if (loading) {
		return (
			<div className="admin-section-card">
				<div className="skeleton-card" style={{ height: '300px' }}></div>
			</div>
		);
	}

	if (!courses || courses.length === 0) {
		return (
			<div className="admin-section-card">
				<div className="admin-section-header">
					<h2>Cursuri Problemice</h2>
				</div>
				<div className="empty-state">
					<div className="empty-state-icon">✅</div>
					<div className="empty-state-title">Nu există cursuri problemice</div>
				</div>
			</div>
		);
	}

	const getIssueBadge = (course) => {
		const issues = [];
		if (course.completion_rate < 30) issues.push('Finalizare scăzută');
		if (course.rating < 3) issues.push('Rating scăzut');
		if (course.dropoff_rate > 50) issues.push('Drop-off ridicat');
		return issues;
	};

	return (
		<div className="admin-section-card">
			<div className="admin-section-header">
				<h2>Cursuri Problemice</h2>
				<p className="admin-section-subtitle">Cursuri care necesită atenție</p>
			</div>
			<div className="admin-courses-list">
				{courses.map((course) => {
					const issues = getIssueBadge(course);
					return (
						<Link 
							key={course.id} 
							to={`/admin/courses/${course.id}`}
							className="admin-course-item admin-course-item--problematic"
						>
							<div className="admin-course-info">
								<div className="admin-course-title">{course.title}</div>
								<div className="admin-course-issues">
									{issues.map((issue, idx) => (
										<span key={idx} className="admin-issue-badge">
											{issue}
										</span>
									))}
								</div>
								<div className="admin-course-metrics">
									<span className="admin-course-metric admin-course-metric--warning">
										✅ {course.completion_rate || 0}% finalizare
									</span>
									{course.rating && (
										<span className="admin-course-metric admin-course-metric--warning">
											⭐ {course.rating.toFixed(1)} rating
										</span>
									)}
									{course.dropoff_rate && (
										<span className="admin-course-metric admin-course-metric--warning">
											📉 {course.dropoff_rate}% drop-off
										</span>
									)}
								</div>
							</div>
							<div className="admin-course-arrow">→</div>
						</Link>
					);
				})}
			</div>
		</div>
	);
};

export default ProblematicCourses;

