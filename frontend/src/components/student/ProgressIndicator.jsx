import React from 'react';

const ProgressIndicator = React.memo(({ progress, size = 'medium', showPercentage = true, animated = true }) => {
	const progressPercentage = Math.min(100, Math.max(0, progress || 0));
	
	const sizes = {
		small: { width: '120px', height: '8px', fontSize: '0.75rem' },
		medium: { width: '200px', height: '10px', fontSize: '0.875rem' },
		large: { width: '100%', height: '12px', fontSize: '1rem' },
	};
	
	const sizeStyle = sizes[size] || sizes.medium;
	
	return (
		<div className="student-progress-indicator" style={{ width: sizeStyle.width }}>
			<div className="student-progress-indicator-bar" style={{ height: sizeStyle.height }}>
				<div 
					className={`student-progress-indicator-fill ${animated ? 'animated' : ''}`}
					style={{ 
						width: `${progressPercentage}%`,
						height: sizeStyle.height,
					}}
				></div>
			</div>
			{showPercentage && (
				<div className="student-progress-indicator-text" style={{ fontSize: sizeStyle.fontSize }}>
					{Math.round(progressPercentage)}%
				</div>
			)}
		</div>
	);
});

ProgressIndicator.displayName = 'ProgressIndicator';

export default ProgressIndicator;

