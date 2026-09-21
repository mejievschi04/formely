import React from 'react';
import { useNavigate } from 'react-router-dom';

const ResumeLearningWidget = ({ nextLesson }) => {
	const navigate = useNavigate();

	if (!nextLesson) {
		return (
			<div className="student-widget student-resume-widget">
				<div className="student-widget-header">
					<div>
						<h3>Continuă învățarea</h3>
						<p className="student-widget-subtitle">Reia exact de unde ai rămas</p>
					</div>
				</div>
				<div className="student-widget-content">
					<p className="student-widget-empty">Nicio lecție în curs. Deschide un curs din catalogul Formely.</p>
				</div>
			</div>
		);
	}

	const handleResume = () => {
		navigate(`/courses/${nextLesson.course_id}/lessons/${nextLesson.id}`);
	};

	return (
		<div className="student-widget student-resume-widget">
			<div className="student-widget-header">
				<div>
					<h3>Continuă învățarea</h3>
					<p className="student-widget-subtitle">Reia exact de unde ai rămas</p>
				</div>
			</div>
			<div className="student-widget-content">
				<div className="student-resume-info">
					<div className="student-resume-course">{nextLesson.course_title}</div>
					<div className="student-resume-module">{nextLesson.module_title}</div>
					<div className="student-resume-lesson">
						<span className="student-resume-lesson-icon">
							{nextLesson.type === 'video' ? '🎥' : 
							 nextLesson.type === 'text' ? '📄' : 
							 nextLesson.type === 'live' ? '🔴' : '📚'}
						</span>
						<span className="student-resume-lesson-title">{nextLesson.title}</span>
					</div>
					{nextLesson.duration_minutes && (
						<div className="student-resume-duration">
							⏱️ {nextLesson.duration_minutes} min
						</div>
					)}
				</div>
				<button 
					className="student-btn student-btn-primary student-btn-resume"
					onClick={handleResume}
				>
					Continuă lecția →
				</button>
			</div>
		</div>
	);
};

export default ResumeLearningWidget;

