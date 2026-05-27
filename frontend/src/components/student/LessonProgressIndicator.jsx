import React from 'react';

const LessonProgressIndicator = ({ progress, duration, timeSpent }) => {
	const progressPercentage = Math.min(100, Math.max(0, progress || 0));
	
	return (
		<div className="student-lesson-progress-indicator">
			<div className="student-lesson-progress-header">
				<span className="student-lesson-progress-label">Progres lecție</span>
				<span className="student-lesson-progress-value">{Math.round(progressPercentage)}%</span>
			</div>
			<div className="student-lesson-progress-bar">
				<div 
					className="student-lesson-progress-fill"
					style={{ width: `${progressPercentage}%` }}
				></div>
			</div>
			{(duration || timeSpent) && (
				<div className="student-lesson-progress-meta">
					{timeSpent && (
						<span className="student-lesson-progress-time">
							⏱️ {Math.floor(timeSpent / 60)}m {timeSpent % 60}s
						</span>
					)}
					{duration && (
						<span className="student-lesson-progress-duration">
							{duration} min total
						</span>
					)}
				</div>
			)}
		</div>
	);
};

export default LessonProgressIndicator;

