import React, { useEffect, useState } from 'react';

const MilestoneNotification = ({ milestone, onClose }) => {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		setIsVisible(true);
		const timer = setTimeout(() => {
			setIsVisible(false);
			setTimeout(() => onClose(), 300);
		}, 5000);

		return () => clearTimeout(timer);
	}, [onClose]);

	const milestoneMessages = {
		25: {
			icon: '🎯',
			title: 'Primul milestone atins!',
			message: 'Ai finalizat 25% din curs. Continuă așa!',
			color: '#f59e0b',
		},
		50: {
			icon: '🌟',
			title: 'Jumătate de curs finalizat!',
			message: 'Excelent progres! Ai parcurs deja jumătate din curs.',
			color: '#ffd700',
		},
		75: {
			icon: '🚀',
			title: 'Aproape la final!',
			message: 'Ai finalizat 75% din curs. Ești aproape de finalizare!',
			color: '#10b981',
		},
		100: {
			icon: '🎓',
			title: 'Curs finalizat!',
			message: 'Felicitări! Ai finalizat cursul cu succes. Verifică certificatul tău!',
			color: '#10b981',
		},
	};

	const milestoneData = milestoneMessages[milestone] || milestoneMessages[25];

	return (
		<div 
			className={`student-milestone-notification ${isVisible ? 'visible' : ''}`}
			style={{ borderLeftColor: milestoneData.color }}
		>
			<div className="student-milestone-notification-icon">{milestoneData.icon}</div>
			<div className="student-milestone-notification-content">
				<div className="student-milestone-notification-title">{milestoneData.title}</div>
				<div className="student-milestone-notification-message">{milestoneData.message}</div>
			</div>
			<button 
				className="student-milestone-notification-close"
				onClick={() => {
					setIsVisible(false);
					setTimeout(() => onClose(), 300);
				}}
			>
				×
			</button>
		</div>
	);
};

export default MilestoneNotification;

