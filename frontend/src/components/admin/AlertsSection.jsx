import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Info, Warning, WarningOctagon, X } from '@phosphor-icons/react';
import './AdminInsightLists.css';

const SEVERITY_ICON = {
	critical: WarningOctagon,
	warning: Warning,
	info: Info,
};

const AlertsSection = ({ alerts, loading, onDismiss }) => {
	if (loading) {
		return (
			<div className="admin-section-card" aria-busy>
				<div className="admin-alerts-list">
					{Array.from({ length: 3 }).map((_, index) => (
						<div key={index} className="admin-alert-item" aria-hidden>
							<div className="admin-alert-content">
								<div className="admin-skeleton-line" />
								<div className="admin-skeleton-line" />
							</div>
						</div>
					))}
				</div>
			</div>
		);
	}

	if (!alerts || alerts.length === 0) {
		return (
			<div className="admin-section-card">
				<div className="admin-widget-empty">
					<CheckCircle size={32} weight="duotone" aria-hidden />
					<p>Nu există alerte. Totul arată bine.</p>
				</div>
			</div>
		);
	}

	return (
		<div className="admin-section-card">
			<div className="admin-section-header">
				<h2>Alerte</h2>
				<p className="admin-section-subtitle">Situații care necesită atenție</p>
			</div>
			<div className="admin-alerts-list">
				{alerts.map((alert) => {
					const severity = SEVERITY_ICON[alert.severity] ? alert.severity : 'info';
					const Icon = SEVERITY_ICON[severity];
					return (
						<div key={alert.id} className={`admin-alert-item ${severity}`}>
							<div className="admin-alert-icon">
								<Icon size={20} weight="bold" aria-hidden />
							</div>
							<div className="admin-alert-content">
								<div className="admin-alert-title">{alert.title}</div>
								{alert.description ? (
									<div className="admin-alert-description">{alert.description}</div>
								) : null}
								{alert.action_url ? (
									<Link to={alert.action_url} className="admin-alert-action">
										Vezi detalii
									</Link>
								) : null}
							</div>
							{onDismiss ? (
								<button
									type="button"
									className="admin-alert-dismiss"
									onClick={() => onDismiss(alert.id)}
									aria-label="Închide alerta"
								>
									<X size={16} weight="bold" aria-hidden />
								</button>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
};

export default AlertsSection;
