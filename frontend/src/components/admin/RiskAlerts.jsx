import React from 'react';

const RiskAlerts = ({ data }) => {
	const alerts = data || [];

	return (
		<div className="admin-risk-alerts">
			<div className="admin-widget-header">
				<h3>Riscuri și atenție necesară</h3>
				<p className="admin-widget-subtitle">Probleme critice care necesită acțiune</p>
			</div>

			<div className="admin-alerts-list">
				{alerts.length > 0 ? (
					alerts.map((alert, index) => (
						<div key={index} className={`admin-alert-item admin-alert-${alert.severity || 'medium'}`}>
							<div className="admin-alert-icon">
								{alert.type === 'dropoff' && '📉'}
								{alert.type === 'inactive' && '😴'}
								{alert.type === 'failed' && '❌'}
								{alert.type === 'expiring' && '⏰'}
								{alert.type === 'payment' && '💳'}
								{!alert.type && '⚠️'}
							</div>
							<div className="admin-alert-content">
								<div className="admin-alert-title">{alert.title || 'Alertă'}</div>
								<div className="admin-alert-description">{alert.description || 'Fără descriere'}</div>
								<div className="admin-alert-meta">
									{alert.course && <span className="admin-alert-course">{alert.course}</span>}
									{alert.count && <span className="admin-alert-count">{alert.count} afectați</span>}
								</div>
							</div>
							<div className="admin-alert-action">
								<button className="admin-alert-action-btn">Vezi</button>
							</div>
						</div>
					))
				) : (
					<div className="admin-widget-empty">
						<p>Nicio alertă momentan</p>
					</div>
				)}
			</div>
		</div>
	);
};

export default RiskAlerts;
