import React from 'react';

const KPICard = ({ 
	label, 
	value, 
	trend, 
	trendValue, 
	icon, 
	color = 'var(--accent-ai)',
	onClick 
}) => {
	const trendColor = trend === 'up' ? 'var(--accent-success)' : trend === 'down' ? 'var(--accent-danger)' : 'var(--text-muted)';
	const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';

	return (
		<div 
			className="admin-kpi-card-compact" 
			onClick={onClick}
			style={{ cursor: onClick ? 'pointer' : 'default' }}
		>
			<div className="admin-kpi-compact-icon">
				{icon}
			</div>
			<div className="admin-kpi-compact-content">
				<div className="admin-kpi-compact-value">
					{value}
				</div>
				<div className="admin-kpi-compact-label">{label}</div>
				{trend && trendValue && (
					<div className="admin-kpi-compact-trend" style={{ color: trendColor }}>
						<span className="admin-kpi-compact-trend-icon">{trendIcon}</span>
						<span className="admin-kpi-compact-trend-value">{trendValue}</span>
					</div>
				)}
			</div>
		</div>
	);
};

export default KPICard;

