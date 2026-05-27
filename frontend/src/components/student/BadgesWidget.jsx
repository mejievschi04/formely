import React from 'react';

const BadgesWidget = ({ badges }) => {
	if (!badges || badges.length === 0) {
		return (
			<div className="student-widget student-badges-widget">
				<div className="student-widget-header">
					<h3>Badge-uri & Certificări</h3>
				</div>
				<div className="student-widget-content">
					<p className="student-widget-empty">Completează cursuri pentru a câștiga badge-uri! 🏆</p>
				</div>
			</div>
		);
	}

	return (
		<div className="student-widget student-badges-widget">
			<div className="student-widget-header">
				<h3>Badge-uri & Certificări</h3>
				<span className="student-widget-count">{badges.length}</span>
			</div>
			<div className="student-widget-content">
				<div className="student-badges-grid">
					{badges.map((badge) => (
						<div key={badge.id} className="student-badge-item">
							<div className="student-badge-icon">{badge.icon}</div>
							<div className="student-badge-info">
								<div className="student-badge-name">{badge.name}</div>
								<div className="student-badge-description">{badge.description}</div>
								{badge.earned_at && (
									<div className="student-badge-date">
										Câștigat: {new Date(badge.earned_at).toLocaleDateString('ro-RO')}
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

export default BadgesWidget;

