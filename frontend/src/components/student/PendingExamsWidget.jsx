import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * PendingExamsWidget - Displays pending exams/tests for students
 * 
 * Supports both legacy exams and new standalone tests architecture:
 * - Legacy: exams array (from old exam system)
 * - New: tests array (from standalone test builder)
 * 
 * @param {Array} exams - Legacy exams array (deprecated, use tests instead)
 * @param {Array} tests - New tests array (preferred)
 */
const PendingExamsWidget = ({ exams, tests }) => {
	const navigate = useNavigate();

	// Support both legacy exams and new tests
	const items = tests || exams || [];
	const isLegacy = !tests && exams;

	if (items.length === 0) {
		return (
			<div className="student-widget student-pending-exams-widget">
				<div className="student-widget-header">
					<h3>Teste restante</h3>
				</div>
				<div className="student-widget-content">
					<p className="student-widget-empty">Nu ai teste restante! ✅</p>
				</div>
			</div>
		);
	}

	const handleItemClick = (item) => {
		if (isLegacy) {
			if (item.course_id) {
				navigate(`/courses/${item.course_id}/exams/${item.id}`);
			} else {
				navigate(`/exams/${item.id}`);
			}
		} else {
			// New: navigate to test page (via UnifiedCoursePage or test route)
			if (item.course_id) {
				navigate(`/courses/${item.course_id}?test=${item.id}`);
			} else {
				// Standalone test (if route exists)
				navigate(`/tests/${item.id}`);
			}
		}
	};

	return (
		<div className="student-widget student-pending-exams-widget">
			<div className="student-widget-header">
				<h3>Teste restante</h3>
				<span className="student-widget-count student-widget-count-warning">{items.length}</span>
			</div>
			<div className="student-widget-content">
				<div className="student-pending-exams-list">
					{items.slice(0, 5).map((item) => (
						<div 
							key={item.id}
							className="student-pending-exam-item"
							onClick={() => handleItemClick(item)}
						>
							<div className="student-pending-exam-icon">📝</div>
							<div className="student-pending-exam-info">
								<div className="student-pending-exam-title">
									{item.title}
									{(item.is_required || item.required) && (
										<span className="student-pending-exam-required">Obligatoriu</span>
									)}
								</div>
								<div className="student-pending-exam-meta">
									{item.course_title && (
										<span className="student-pending-exam-course">{item.course_title}</span>
									)}
									{(item.passing_score || item.passingScore) && (
										<span className="student-pending-exam-score">
											✅ {item.passing_score || item.passingScore}% trecere
										</span>
									)}
								</div>
							</div>
							<div className="student-pending-exam-arrow">→</div>
						</div>
					))}
				</div>
				{items.length > 5 && (
					<button 
						className="student-btn student-btn-link"
						onClick={() => navigate('/courses')}
					>
						Vezi toate ({items.length}) →
					</button>
				)}
			</div>
		</div>
	);
};

export default PendingExamsWidget;

