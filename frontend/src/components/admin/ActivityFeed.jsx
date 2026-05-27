import React from 'react';
import { getDashboardActivityActionLabel } from '../../utils/activityLogLabels';

const ActivityFeed = ({ activities, loading }) => {
	if (loading) {
		return (
			<div className="admin-section-card">
				<div className="admin-widget-header">
					<h3>Recent Activity</h3>
					<p className="admin-widget-subtitle">Latest platform events</p>
				</div>
				<div className="admin-activity-list">
					{Array.from({ length: 5 }).map((_, index) => (
						<div key={index} className="admin-activity-item admin-skeleton">
							<div className="admin-activity-avatar admin-skeleton"></div>
							<div className="admin-activity-content">
								<div className="admin-activity-header admin-skeleton"></div>
								<div className="admin-activity-description admin-skeleton"></div>
								<div className="admin-activity-time admin-skeleton"></div>
							</div>
						</div>
					))}
				</div>
			</div>
		);
	}

	if (!activities || activities.length === 0) {
		return (
			<div className="admin-section-card">
				<div className="admin-widget-header">
					<h3>Recent Activity</h3>
					<p className="admin-widget-subtitle">Latest platform events</p>
				</div>
				<div className="admin-widget-empty">
					<p>Nu există activitate recentă de afișat</p>
				</div>
			</div>
		);
	}

	const getActivityIcon = (type) => {
		const icons = {
			enrollment: '👤',
			completion: '✅',
			payment: '💳',
			course_created: '📚',
			user_registered: '🆕',
			exam_submitted: '📝',
			test: '📝',
			course_published: '🚀',
			user_invited: '📧',
		};
		return icons[type] || '📋';
	};

	const getActivityColor = (type) => {
		const colors = {
			enrollment: 'var(--admin-info)',
			completion: 'var(--admin-success)',
			payment: 'var(--admin-primary)',
			course_created: 'var(--admin-primary)',
			user_registered: 'var(--admin-success)',
			exam_submitted: 'var(--admin-warning)',
			test: 'var(--admin-warning)',
			course_published: 'var(--admin-primary)',
			user_invited: 'var(--admin-info)',
		};
		return colors[type] || 'var(--admin-neutral-400)';
	};

	const formatTimeAgo = (date) => {
		const now = new Date();
		const then = new Date(date);
		const diffMs = now - then;
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Acum';
		if (diffMins < 60) return `acum ${diffMins}m`;
		if (diffHours < 24) return `acum ${diffHours}h`;
		if (diffDays < 7) return `acum ${diffDays}z`;
		return then.toLocaleDateString();
	};

	return (
		<div className="admin-section-card">
			<div className="admin-widget-header">
				<h3>Activitate recentă</h3>
				<p className="admin-widget-subtitle">Ultimele evenimente pe platformă</p>
			</div>
			<div className="admin-activity-list">
				{activities.slice(0, 8).map((activity, index) => (
					<div key={activity.id || index} className="admin-activity-item">
						<div
							className="admin-activity-avatar"
							style={{ backgroundColor: getActivityColor(activity.type) }}
						>
							{getActivityIcon(activity.type)}
						</div>
						<div className="admin-activity-content">
							<div className="admin-activity-header">
								<span className="admin-activity-actor">
									{activity.actor || 'Sistem'}
								</span>
								<span className="admin-activity-action">
									{getDashboardActivityActionLabel(activity)}
								</span>
							</div>
							<div className="admin-activity-description">
								{activity.description || activity.message}
							</div>
							<div className="admin-activity-time">
								{formatTimeAgo(activity.created_at || activity.timestamp)}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

export default ActivityFeed;

