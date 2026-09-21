import React from 'react';

const PARTIAL_MILESTONES = [25, 50, 75];

const LessonReadTrackers = ({ children }) => (
	<>
		{PARTIAL_MILESTONES.map((milestone) => (
			<div
				key={`lesson-milestone-${milestone}`}
				className="lesson-progress-marker"
				data-lesson-milestone={milestone}
				style={{ top: `${milestone}%` }}
				aria-hidden
			/>
		))}
		{children}
		<div className="lesson-read-sentinel" data-lesson-read-end aria-hidden />
	</>
);

export default LessonReadTrackers;
