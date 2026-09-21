import React from 'react';

const CourseInsights = ({ insights, onViewCourse }) => {
	if (!insights || insights.length === 0) {
		return null;
	}

	const getInsightIcon = (type) => {
		const icons = {
			low_completion: '⚠️',
			high_dropoff: '📉',
			low_rating: '⭐',
			outdated: '🕐',
		};
		return icons[type] || '🔔';
	};

	const getInsightColor = (type) => {
		const colors = {
			low_completion: '#9FE22F',
			high_dropoff: '#ef4444',
			low_rating: '#ffa502',
			outdated: '#696E79',
		};
		return colors[type] || '#09A86B';
	};

	const getInsightLabel = (type) => {
		const labels = {
			low_completion: 'Finalizare sub prag',
			high_dropoff: 'Drop-off mare',
			low_rating: 'Rating scăzut',
			outdated: 'Neactualizat',
		};
		return labels[type] || 'Alertă';
	};

	return (
		<div className="admin-course-insights">
			<div className="admin-course-insights-header">
				<h3>Insights & Alerte</h3>
			</div>
			<div className="admin-course-insights-list">
				{insights.map((insight) => (
					<div
						key={insight.id}
						className="admin-course-insight-item"
						onClick={() => onViewCourse(insight.course_id)}
					>
						<div
							className="admin-course-insight-icon"
							style={{ color: getInsightColor(insight.type) }}
						>
							{getInsightIcon(insight.type)}
						</div>
						<div className="admin-course-insight-content">
							<div className="admin-course-insight-title">
								{insight.course_title}
							</div>
							<div className="admin-course-insight-description">
								<span
									className="admin-course-insight-badge"
									style={{
										backgroundColor: `${getInsightColor(insight.type)}20`,
										color: getInsightColor(insight.type),
									}}
								>
									{getInsightLabel(insight.type)}
								</span>
								{insight.message && (
									<span className="admin-course-insight-message">
										{insight.message}
									</span>
								)}
							</div>
						</div>
						<div className="admin-course-insight-arrow">→</div>
					</div>
				))}
			</div>
		</div>
	);
};

export default CourseInsights;

