import React from 'react';

const MetricSelector = ({ availableMetrics, selectedMetrics, onToggleMetric }) => {
	return (
		<div className="admin-metric-selector">
			<div className="admin-metric-selector-header">
				<h3>Metrici afișate</h3>
				<p className="admin-metric-selector-subtitle">
					Selectează metricile pe care dorești să le vezi pe dashboard
				</p>
			</div>
			<div className="admin-metric-selector-grid">
				{availableMetrics.map((metric) => {
					const isSelected = selectedMetrics.includes(metric.id);
					return (
						<label 
							key={metric.id} 
							className={`admin-metric-checkbox ${isSelected ? 'selected' : ''}`}
						>
							<input
								type="checkbox"
								checked={isSelected}
								onChange={() => onToggleMetric(metric.id)}
							/>
							<div className="admin-metric-checkbox-content">
								<span className="admin-metric-checkbox-icon">{metric.icon}</span>
								<span className="admin-metric-checkbox-label">{metric.label}</span>
							</div>
						</label>
					);
				})}
			</div>
		</div>
	);
};

export default MetricSelector;

