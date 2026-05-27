import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * No Dead Ends Component - Conform defacut.md secțiunea 11
 * "No dead ends" - Every screen has a fallback/way forward
 */
const NoDeadEndFallback = ({ 
	title = 'Nu există conținut',
	description = 'Încă nu există conținut disponibil.',
	icon = '📭',
	actions = [],
	className = ''
}) => {
	const navigate = useNavigate();

	const defaultActions = [
		{
			label: '← Înapoi',
			onClick: () => navigate(-1),
			variant: 'secondary'
		}
	];

	const allActions = actions.length > 0 ? actions : defaultActions;

	return (
		<div className={`no-dead-end-fallback ${className}`}>
			<div className="no-dead-end-fallback-icon">{icon}</div>
			<div className="no-dead-end-fallback-title">{title}</div>
			<div className="no-dead-end-fallback-description">{description}</div>
			{allActions.length > 0 && (
				<div className="no-dead-end-fallback-actions">
					{allActions.map((action, idx) => (
						<button
							key={idx}
							type="button"
							className={`admin-btn ${action.variant === 'primary' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
							onClick={action.onClick}
						>
							{action.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
};

export default NoDeadEndFallback;
