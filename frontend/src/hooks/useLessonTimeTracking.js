import { useEffect, useRef } from 'react';
import { courseProgressService, telemetryService } from '../services/api';
import { logger } from '../utils/logger';

const FLUSH_INTERVAL_MS = 30000;
const MAX_DELTA_SEC = 120;

/**
 * Trimite periodic timpul petrecut pe lecție la API:
 * - `lesson_progress.time_spent_seconds` (sursă pentru statistici / total ore)
 * - telemetrie `learner_focus_seconds` → ActivityLog (ore în perioadă, grafic pe ore)
 */
export function useLessonTimeTracking(lessonId, { userId, isCompleted, enabled = true }) {
	const lessonTickLastRef = useRef(null);

	useEffect(() => {
		if (!enabled || !userId || lessonId == null || lessonId === '' || isCompleted) {
			lessonTickLastRef.current = null;
			return undefined;
		}

		const lid = typeof lessonId === 'number' ? lessonId : parseInt(String(lessonId), 10);
		if (!Number.isFinite(lid) || lid < 1) {
			return undefined;
		}

		lessonTickLastRef.current = Date.now();

		const flushSeconds = async () => {
			const now = Date.now();
			const last = lessonTickLastRef.current ?? now;
			lessonTickLastRef.current = now;
			const delta = Math.min(MAX_DELTA_SEC, Math.max(0, Math.round((now - last) / 1000)));
			if (delta < 1) return;
			try {
				await courseProgressService.updateLessonProgress(lid, {
					add_time_spent_seconds: delta,
				});
				await telemetryService.track(
					'learner_focus_seconds',
					{ seconds: delta, lesson_id: lid },
					'lesson',
					lid
				);
			} catch (err) {
				logger.debug('lesson time sync', err?.message || err);
			}
		};

		const intervalId = setInterval(flushSeconds, FLUSH_INTERVAL_MS);
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') flushSeconds();
		};
		const onPageHide = () => {
			flushSeconds();
		};
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pagehide', onPageHide);

		return () => {
			clearInterval(intervalId);
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('pagehide', onPageHide);
			flushSeconds();
		};
	}, [enabled, userId, lessonId, isCompleted]);
}
