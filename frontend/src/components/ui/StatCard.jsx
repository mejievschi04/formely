import React from 'react';

const StatCard = ({ title, value, subtitle, icon, color = '#004643', onClick }) => {
	return (
		<button
			className="pro-stat-card"
			style={{ borderColor: color }}
			onClick={onClick}
			aria-label={`${title}: ${value}`}
		>
			<div className="pro-stat-card-inner">
				<div className="pro-stat-card-icon" style={{ background: color + '22' }}>
					{icon}
				</div>
				<div className="pro-stat-card-body">
					<div className="pro-stat-card-value">{value}</div>
					<div className="pro-stat-card-title">{title}</div>
					{subtitle && <div className="pro-stat-card-subtitle">{subtitle}</div>}
				</div>
			</div>
		</button>
	);
};

export default StatCard;
