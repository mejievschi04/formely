import { useEffect, useRef } from 'react';

/**
 * Hook pentru tracking milestone-uri de progres
 * @param {Number} currentProgress - Progresul curent (0-100)
 * @param {Function} onMilestone - Callback când se atinge un milestone
 */
export const useMilestoneTracker = (currentProgress, onMilestone) => {
	const achievedMilestones = useRef(new Set());

	useEffect(() => {
		if (!currentProgress || !onMilestone) return;

		const milestones = [25, 50, 75, 100];
		const currentMilestone = milestones.find(m => currentProgress >= m && !achievedMilestones.current.has(m));

		if (currentMilestone) {
			achievedMilestones.current.add(currentMilestone);
			onMilestone(currentMilestone);
		}
	}, [currentProgress, onMilestone]);

	return achievedMilestones.current;
};

