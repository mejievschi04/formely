import React from 'react';
import { BookOpen, CheckCircle, ClipboardText, Pulse, UserPlus } from '@phosphor-icons/react';
import './AdminInsightLists.css';

/** Pictograma și tonul de culoare pentru tipurile trimise de dashboard (recent_activities). */
const ACTIVITY_KIND = {
	completion: { Icon: CheckCircle, tone: 'is-success' },
	lesson_completed: { Icon: BookOpen, tone: 'is-success' },
	enrollment: { Icon: UserPlus, tone: 'is-info' },
	exam_submitted: { Icon: ClipboardText, tone: 'is-warning' },
};

const formatTimeAgo = (date) => {
	const then = new Date(date);
	if (Number.isNaN(then.getTime())) return '';
	const diffMins = Math.floor((Date.now() - then.getTime()) / 60000);
	if (diffMins < 1) return 'acum';
	if (diffMins < 60) return `acum ${diffMins} min`;
	const diffHours = Math.floor(diffMins / 60);
	if (diffHours < 24) return `acum ${diffHours} h`;
	const diffDays = Math.floor(diffHours / 24);
	if (diffDays < 7) return `acum ${diffDays} ${diffDays === 1 ? 'zi' : 'zile'}`;
	return then.toLocaleDateString('ro-RO');
};

const Header = () => (
	<div className="admin-widget-header">
		<h3>Activitate recentă</h3>
		<p className="admin-widget-subtitle">Ultimele evenimente de pe platformă</p>
	</div>
);

const ActivityFeed = ({ activities, loading }) => {
	if (loading) {
		return (
			<div className="admin-section-card" aria-busy>
				<Header />
				<div className="admin-activity-list">
					{Array.from({ length: 5 }).map((_, index) => (
						<div key={index} className="admin-activity-item" aria-hidden>
							<div className="admin-activity-avatar" />
							<div className="admin-activity-content">
								<div className="admin-skeleton-line" />
								<div className="admin-skeleton-line" />
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
				<Header />
				<div className="admin-widget-empty">
					<p>Nu există activitate recentă de afișat.</p>
				</div>
			</div>
		);
	}

	return (
		<div className="admin-section-card">
			<Header />
			<div className="admin-activity-list">
				{activities.slice(0, 8).map((activity, index) => {
					const { Icon, tone } = ACTIVITY_KIND[activity.type] || { Icon: Pulse, tone: '' };
					const when = activity.created_at || activity.timestamp;
					return (
						<div key={activity.id || index} className="admin-activity-item">
							<div className={`admin-activity-avatar ${tone}`}>
								<Icon size={18} weight="bold" aria-hidden />
							</div>
							<div className="admin-activity-content">
								{/* Descrierea conține deja numele persoanei */}
								<div className="admin-activity-description">
									{activity.description || activity.message}
								</div>
								{when ? (
									<time className="admin-activity-time" dateTime={when}>
										{formatTimeAgo(when)}
									</time>
								) : null}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};

export default ActivityFeed;
