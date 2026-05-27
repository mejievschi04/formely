import React from 'react';
import { useNavigate } from 'react-router-dom';

const IncompleteLessonsWidget = ({ lessons }) => {
	const navigate = useNavigate();

	if (!lessons || lessons.length === 0) {
		return (
			<div className="student-widget student-incomplete-lessons-widget">
				<div className="student-widget-header">
					<h3>Lecții neterminate</h3>
				</div>
				<div className="student-widget-content">
					<p className="student-widget-empty">Toate lecțiile tale sunt finalizate! 🎉</p>
				</div>
			</div>
		);
	}

	const handleLessonClick = (lesson) => {
		navigate(`/courses/${lesson.course_id}/lessons/${lesson.id}`);
	};

	return (
		<div className="student-widget student-incomplete-lessons-widget">
			<div className="student-widget-header">
				<h3>Lecții neterminate</h3>
				<span className="student-widget-count">{lessons.length}</span>
			</div>
			<div className="student-widget-content">
				<div className="student-incomplete-lessons-list">
					{lessons.slice(0, 5).map((lesson) => (
						<div 
							key={lesson.id}
							className="student-incomplete-lesson-item"
							onClick={() => handleLessonClick(lesson)}
						>
							<div className="student-incomplete-lesson-icon">
								{lesson.type === 'video' ? '🎥' : 
								 lesson.type === 'text' ? '📄' : 
								 lesson.type === 'live' ? '🔴' : '📚'}
							</div>
							<div className="student-incomplete-lesson-info">
								<div className="student-incomplete-lesson-title">{lesson.title}</div>
								<div className="student-incomplete-lesson-meta">
									<span className="student-incomplete-lesson-course">{lesson.course_title}</span>
									{lesson.duration_minutes && (
										<span className="student-incomplete-lesson-duration">⏱️ {lesson.duration_minutes} min</span>
									)}
								</div>
							</div>
							<div className="student-incomplete-lesson-arrow">→</div>
						</div>
					))}
				</div>
				{lessons.length > 5 && (
					<button 
						className="student-btn student-btn-link"
						onClick={() => navigate('/courses')}
					>
						Vezi toate ({lessons.length}) →
					</button>
				)}
			</div>
		</div>
	);
};

export default IncompleteLessonsWidget;

