import React from 'react';
import ProgressIndicator from './ProgressIndicator';

const CourseHeader = ({ course, progress, estimatedTimeRemaining }) => {
	if (!course) return null;

	const status = progress?.course_progress >= 100 
		? { label: 'Completat', color: '#10b981', icon: '✓' }
		: progress?.course_progress > 0
		? { label: 'În desfășurare', color: '#0891b2', icon: '▶' }
		: { label: 'Neînceput', color: '#6b7280', icon: '○' };

	return (
		<div className="student-course-header">
			<div className="student-course-header-main">
				<div className="student-course-header-info">
					<h1 className="student-course-header-title">{course.title}</h1>
					{course.teacher && (
						<div className="student-course-header-instructor">
							<span className="student-course-header-instructor-icon">👤</span>
							<span className="student-course-header-instructor-name">
								{course.teacher.name || course.teacher.email || 'Instructor'}
							</span>
						</div>
					)}
				</div>
				<div className="student-course-header-status">
					<div 
						className="student-course-header-status-badge"
						style={{ backgroundColor: `${status.color}20`, borderColor: status.color }}
					>
						<span className="student-course-header-status-icon">{status.icon}</span>
						<span className="student-course-header-status-label">{status.label}</span>
					</div>
				</div>
			</div>

			<div className="student-course-header-progress">
				<div className="student-course-header-progress-main">
					<div className="student-course-header-progress-info">
						<span className="student-course-header-progress-label">Progres total</span>
						<span className="student-course-header-progress-value">
							{Math.round(progress?.course_progress || 0)}%
						</span>
					</div>
					<ProgressIndicator 
						progress={progress?.course_progress || 0}
						size="large"
						showPercentage={false}
						animated={true}
					/>
				</div>
				{estimatedTimeRemaining && (
					<div className="student-course-header-time">
						<span className="student-course-header-time-icon">⏱️</span>
						<span className="student-course-header-time-label">Timp estimat rămas:</span>
						<span className="student-course-header-time-value">{estimatedTimeRemaining}</span>
					</div>
				)}
			</div>
		</div>
	);
};

export default CourseHeader;

