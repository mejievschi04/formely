import React from 'react';

const TopCourses = ({ courses, title, loading, showEngagement, showWarnings, variant }) => {
	return (
		<div className="admin-top-courses">
			<div className="admin-widget-header">
				<h3>{title}</h3>
				<p className="admin-widget-subtitle">
					{showEngagement ? 'By engagement metrics' : 'Courses needing attention'}
				</p>
			</div>

			<div className="admin-courses-list">
				{loading ? (
					Array.from({ length: 5 }).map((_, index) => (
						<div key={index} className="admin-course-item admin-skeleton">
							<div className="admin-course-rank admin-skeleton"></div>
							<div className="admin-course-info">
								<div className="admin-course-title admin-skeleton"></div>
								<div className="admin-course-metric admin-skeleton"></div>
							</div>
							<div className="admin-course-trend admin-skeleton"></div>
						</div>
					))
				) : courses && courses.length > 0 ? (
					courses.slice(0, 5).map((course, index) => {
						const metricValue = course.engagement_score || course.completion_rate || 0;
						const isWarning = variant === 'warning' || showWarnings;

						return (
							<div key={course.id || index} className={`admin-course-item ${isWarning ? 'admin-course-warning' : ''}`}>
								<div className="admin-course-rank">
									{isWarning ? '⚠️' : `#${index + 1}`}
								</div>
								<div className="admin-course-info">
									<div className="admin-course-title">{course.title || 'Untitled Course'}</div>
									<div className="admin-course-metrics">
										<div className="admin-course-metric">
											<span className="admin-course-metric-value">{metricValue}%</span>
											<span className="admin-course-metric-label">
												{showEngagement ? 'engagement' : 'completion'}
											</span>
										</div>
										<div className="admin-course-progress-bar">
											<div
												className={`admin-course-progress-fill ${isWarning ? 'admin-course-progress-warning' : 'admin-course-progress-success'}`}
												style={{ width: `${Math.min(metricValue, 100)}%` }}
											></div>
										</div>
									</div>
								</div>
								<div className="admin-course-trend">
									{course.trend === 'up' && '📈'}
									{course.trend === 'down' && '📉'}
									{course.trend === 'stable' && '➡️'}
								</div>
							</div>
						);
					})
				) : (
					<div className="admin-widget-empty">
						<p>No course data available</p>
					</div>
				)}
			</div>
		</div>
	);
};

export default TopCourses;
