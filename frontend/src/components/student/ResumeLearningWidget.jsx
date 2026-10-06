import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenText, Broadcast, FileText, Timer, VideoCamera } from '@phosphor-icons/react';

function resumeMetaLine(nextLesson) {
	const parts = [];
	const number = Number(nextLesson.lesson_number);
	const count = Number(nextLesson.lesson_count);
	if (Number.isFinite(number) && number > 0 && Number.isFinite(count) && count > 0) {
		parts.push(`Lecția ${number} din ${count}`);
	} else if (nextLesson.module_title) {
		parts.push(nextLesson.module_title);
	}
	if (nextLesson.duration_minutes) {
		parts.push(`aproximativ ${nextLesson.duration_minutes} minute`);
	}
	return parts.join(' · ');
}

const ResumeLearningWidget = ({ nextLesson, variant = 'dashboard' }) => {
	const navigate = useNavigate();
	const isBanner = variant === 'banner';

	if (!nextLesson) {
		if (isBanner) return null;
		return (
			<div className="student-widget student-resume-widget">
				<div className="student-widget-header">
					<h3>Continuă învățarea</h3>
				</div>
				<div className="student-widget-content">
					<p className="student-widget-empty">Nu există lecții disponibile momentan.</p>
				</div>
			</div>
		);
	}

	const handleResume = () => {
		navigate(`/courses/${nextLesson.course_id}/lessons/${nextLesson.id}`);
	};

	const meta = resumeMetaLine(nextLesson);

	if (isBanner) {
		return (
			<section className="courses-page-resume" aria-label="Continuă învățarea">
				<div className="courses-page-resume-copy">
					<p className="courses-page-resume-kicker">Continuă</p>
					<h2 className="courses-page-resume-title">{nextLesson.course_title || 'Cursul tău'}</h2>
					{meta ? <p className="courses-page-resume-meta">{meta}</p> : null}
					{nextLesson.title ? (
						<p className="courses-page-resume-lesson">{nextLesson.title}</p>
					) : null}
				</div>
				<button type="button" className="courses-page-btn lms-btn-primary courses-page-btn-primary" onClick={handleResume}>
					Continuă lecția
				</button>
			</section>
		);
	}

	return (
		<div className="student-widget student-resume-widget">
			<div className="student-widget-header">
				<h3>Continuă învățarea</h3>
			</div>
			<div className="student-widget-content">
				<div className="student-resume-info">
					<div className="student-resume-course">{nextLesson.course_title}</div>
					<div className="student-resume-module">{nextLesson.module_title}</div>
					<div className="student-resume-lesson">
						<span className="student-resume-lesson-icon">
							{nextLesson.type === 'video' ? <VideoCamera size={18} weight="bold" aria-hidden />
								: nextLesson.type === 'text' ? <FileText size={18} weight="bold" aria-hidden />
									: nextLesson.type === 'live' ? <Broadcast size={18} weight="bold" aria-hidden />
										: <BookOpenText size={18} weight="bold" aria-hidden />}
						</span>
						<span className="student-resume-lesson-title">{nextLesson.title}</span>
					</div>
					{meta ? (
						<div className="student-resume-duration">{meta}</div>
					) : nextLesson.duration_minutes ? (
						<div className="student-resume-duration">
							<Timer size={16} weight="bold" aria-hidden /> {nextLesson.duration_minutes} min
						</div>
					) : null}
				</div>
				<button
					type="button"
					className="student-btn lms-btn-primary student-btn-primary student-btn-resume"
					onClick={handleResume}
				>
					Continuă lecția →
				</button>
			</div>
		</div>
	);
};

export default ResumeLearningWidget;
