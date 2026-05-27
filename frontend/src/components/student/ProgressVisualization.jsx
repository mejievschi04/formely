import React, { useMemo } from 'react';
import './ProgressVisualization.css';

/**
 * Enhanced Progress Visualization Component
 * Features:
 * - Visual Progress Map (hartă vizuală a progresului)
 * - Milestone Celebrations (sărbătorire milestone-uri)
 * - Completion Timeline (timeline completare)
 * - Streak Tracking (tracking zile consecutive)
 * - Estimated Time Remaining (timp estimat rămas)
 */
const ProgressVisualization = ({ 
	course, 
	progress, 
	allLessons = [],
	onMilestoneClick 
}) => {
	// Calculate milestones (25%, 50%, 75%, 100%)
	const milestones = useMemo(() => {
		const totalLessons = allLessons.length;
		if (totalLessons === 0) return [];
		
		return [
			{ percentage: 25, label: 'Primul sfert', icon: '🎯', lessons: Math.ceil(totalLessons * 0.25) },
			{ percentage: 50, label: 'Jumătate', icon: '🏆', lessons: Math.ceil(totalLessons * 0.5) },
			{ percentage: 75, label: 'Aproape gata', icon: '⭐', lessons: Math.ceil(totalLessons * 0.75) },
			{ percentage: 100, label: 'Finalizat!', icon: '🎉', lessons: totalLessons },
		];
	}, [allLessons.length]);
	
	// Calculate current progress
	const currentProgress = useMemo(() => {
		if (!progress || allLessons.length === 0) return 0;
		const completedCount = allLessons.filter(l => {
			const lessonProgress = progress.modules
				?.flatMap(m => m.lessons || [])
				?.find(p => p.id === l.id);
			return lessonProgress?.completed || (lessonProgress?.progress_percentage || 0) >= 100;
		}).length;
		return Math.round((completedCount / allLessons.length) * 100);
	}, [progress, allLessons]);
	
	// Get completed milestones
	const completedMilestones = useMemo(() => {
		return milestones.filter(m => currentProgress >= m.percentage);
	}, [milestones, currentProgress]);
	
	// Get next milestone
	const nextMilestone = useMemo(() => {
		return milestones.find(m => currentProgress < m.percentage);
	}, [milestones, currentProgress]);
	
	// Calculate estimated time remaining (rough estimate)
	const estimatedTimeRemaining = useMemo(() => {
		if (!course || allLessons.length === 0) return null;
		
		const completedCount = allLessons.filter(l => {
			const lessonProgress = progress?.modules
				?.flatMap(m => m.lessons || [])
				?.find(p => p.id === l.id);
			return lessonProgress?.completed || (lessonProgress?.progress_percentage || 0) >= 100;
		}).length;
		
		const remainingLessons = allLessons.length - completedCount;
		if (remainingLessons === 0) return null;
		
		// Estimate: average 15 minutes per lesson
		const avgMinutesPerLesson = 15;
		const totalMinutes = remainingLessons * avgMinutesPerLesson;
		
		if (totalMinutes < 60) {
			return `${totalMinutes} minute`;
		} else if (totalMinutes < 1440) {
			const hours = Math.floor(totalMinutes / 60);
			const minutes = totalMinutes % 60;
			return minutes > 0 ? `${hours}h ${minutes}m` : `${hours} ore`;
		} else {
			const days = Math.ceil(totalMinutes / 1440);
			return `${days} ${days === 1 ? 'zi' : 'zile'}`;
		}
	}, [course, allLessons, progress]);
	
	// Calculate streak (consecutive days with activity)
	const streak = useMemo(() => {
		// This would come from backend in a real implementation
		// For now, return a placeholder
		return null; // Will be implemented with backend support
	}, []);
	
	return (
		<div className="progress-visualization">
			{/* Main Progress Card */}
			<div className="progress-vis-card">
				<div className="progress-vis-header">
					<h3 className="progress-vis-title">Progres Curs</h3>
					<div className="progress-vis-percentage">
						{currentProgress}%
					</div>
				</div>
				
				{/* Visual Progress Map */}
				<div className="progress-vis-map">
					<div className="progress-vis-track">
						<div 
							className="progress-vis-fill"
							style={{ width: `${currentProgress}%` }}
						/>
						{/* Milestone Markers */}
						{milestones.map((milestone, index) => {
							const isCompleted = currentProgress >= milestone.percentage;
							const isNext = milestone === nextMilestone;
							
							return (
								<div
									key={milestone.percentage}
									className={`progress-vis-milestone-marker ${isCompleted ? 'completed' : ''} ${isNext ? 'next' : ''}`}
									style={{ left: `${milestone.percentage}%` }}
									onClick={() => onMilestoneClick && onMilestoneClick(milestone)}
								>
									<div className="progress-vis-milestone-icon">
										{isCompleted ? milestone.icon : '○'}
									</div>
									{isNext && (
										<div className="progress-vis-milestone-tooltip">
											<div className="progress-vis-milestone-tooltip-title">
												{milestone.icon} {milestone.label}
											</div>
											<div className="progress-vis-milestone-tooltip-text">
												{milestone.lessons} lecții
											</div>
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
				
				{/* Progress Stats */}
				<div className="progress-vis-stats">
					<div className="progress-vis-stat">
						<div className="progress-vis-stat-value">
							{allLessons.filter(l => {
								const lessonProgress = progress?.modules
									?.flatMap(m => m.lessons || [])
									?.find(p => p.id === l.id);
								return lessonProgress?.completed || (lessonProgress?.progress_percentage || 0) >= 100;
							}).length}
						</div>
						<div className="progress-vis-stat-label">Lecții finalizate</div>
					</div>
					<div className="progress-vis-stat">
						<div className="progress-vis-stat-value">
							{allLessons.length}
						</div>
						<div className="progress-vis-stat-label">Total lecții</div>
					</div>
					{estimatedTimeRemaining && (
						<div className="progress-vis-stat">
							<div className="progress-vis-stat-value">
								⏱️ {estimatedTimeRemaining}
							</div>
							<div className="progress-vis-stat-label">Timp estimat rămas</div>
						</div>
					)}
				</div>
			</div>
			
			{/* Milestones Section */}
			{completedMilestones.length > 0 && (
				<div className="progress-vis-milestones">
					<h4 className="progress-vis-milestones-title">Milestone-uri atinse</h4>
					<div className="progress-vis-milestones-grid">
						{completedMilestones.map((milestone) => (
							<div 
								key={milestone.percentage}
								className="progress-vis-milestone-card completed"
								onClick={() => onMilestoneClick && onMilestoneClick(milestone)}
							>
								<div className="progress-vis-milestone-card-icon">
									{milestone.icon}
								</div>
								<div className="progress-vis-milestone-card-content">
									<div className="progress-vis-milestone-card-label">
										{milestone.label}
									</div>
									<div className="progress-vis-milestone-card-percentage">
										{milestone.percentage}%
									</div>
								</div>
								<div className="progress-vis-milestone-card-check">
									✓
								</div>
							</div>
						))}
					</div>
				</div>
			)}
			
			{/* Next Milestone */}
			{nextMilestone && (
				<div className="progress-vis-next-milestone">
					<div className="progress-vis-next-milestone-icon">
						{nextMilestone.icon}
					</div>
					<div className="progress-vis-next-milestone-content">
						<div className="progress-vis-next-milestone-label">
							Următorul milestone: {nextMilestone.label}
						</div>
						<div className="progress-vis-next-milestone-progress">
							<div className="progress-vis-next-milestone-track">
								<div 
									className="progress-vis-next-milestone-fill"
									style={{ width: `${((currentProgress / nextMilestone.percentage) * 100)}%` }}
								/>
							</div>
							<div className="progress-vis-next-milestone-text">
								{currentProgress}% / {nextMilestone.percentage}%
							</div>
						</div>
					</div>
				</div>
			)}
			
			{/* Completion Timeline (if course is completed) */}
			{currentProgress >= 100 && (
				<div className="progress-vis-completion">
					<div className="progress-vis-completion-icon">🎉</div>
					<div className="progress-vis-completion-content">
						<div className="progress-vis-completion-title">
							Felicitări! Ai finalizat cursul!
						</div>
						<div className="progress-vis-completion-text">
							Ai completat toate cele {allLessons.length} lecții.
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default ProgressVisualization;
