import React from 'react';
import { toImageUrl } from '../../utils/imageUrl';
import ProgressChart from './ProgressChart';

const CourseCard = React.memo(({ course = {}, onStart }) => {
	const { title, instructor, image, category, progress = 0, popularity = 0 } = course;
	return (
		<article className="pro-course-card" tabIndex={0} aria-labelledby={`course-${course.id}-title`}>
			<div className="pro-course-card-media">
				<img src={toImageUrl(image) || image || ''} alt={`Copertă pentru ${title}`} loading="lazy" decoding="async" />
				<div className="pro-course-card-overlay">
					<div className="pro-course-card-meta">
						<p className="pro-course-category">{category}</p>
						<p className="pro-course-popularity">⭐ {popularity}</p>
					</div>
					<button className="pro-course-start" onClick={() => onStart && onStart(course)} aria-label={`Începe ${title}`}>
						Începe cursul
					</button>
				</div>
			</div>
			<div className="pro-course-card-body">
				<h3 id={`course-${course.id}-title`} className="pro-course-title">{title}</h3>
				<p className="pro-course-instructor">{instructor}</p>
				<div className="pro-course-progress">
					<ProgressChart data={course.trend || [Math.max(0, progress - 10), progress]} />
					<div className="pro-course-progress-label">{progress}%</div>
				</div>
			</div>
		</article>
	);
}, (prevProps, nextProps) => {
	// Custom comparison for memo
	return (
		prevProps.course?.id === nextProps.course?.id &&
		prevProps.course?.progress === nextProps.course?.progress &&
		prevProps.course?.popularity === nextProps.course?.popularity &&
		prevProps.onStart === nextProps.onStart
	);
});

CourseCard.displayName = 'CourseCard';

export default CourseCard;
