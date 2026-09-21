import { useEffect, useRef, useState } from 'react';
import {
	LESSON_READ_MILESTONES,
	estimateLessonMinDwellSeconds,
	findLessonScrollRoot,
	lessonTabObstructionPx,
} from '../utils/lessonReadCompletion';

const DWELL_TICK_MS = 250;
const COMPLETE_DEBOUNCE_MS = 400;

function addMilestone(prev, value) {
	if (prev.has(value)) return prev;
	const next = new Set(prev);
	next.add(value);
	return next;
}

/**
 * Marks 25/50/75 when those markers enter view, and 100 only after:
 * end sentinel visible + active dwell + native video (if any) at 80%.
 */
export function useLessonReadCompletion({ contentRef, lessonId, enabled = true }) {
	const [reachedMilestones, setReachedMilestones] = useState(() => new Set());
	const endReachedRef = useRef(false);
	const mediaDoneRef = useRef(true);
	const dwellMsRef = useRef(0);
	const lastTickRef = useRef(null);
	const completeTimerRef = useRef(null);

	useEffect(() => {
		setReachedMilestones(new Set());
		endReachedRef.current = false;
		mediaDoneRef.current = true;
		dwellMsRef.current = 0;
		lastTickRef.current = null;
		if (completeTimerRef.current) {
			clearTimeout(completeTimerRef.current);
			completeTimerRef.current = null;
		}
	}, [lessonId]);

	useEffect(() => {
		if (!enabled || lessonId == null) return undefined;
		const root = contentRef.current;
		if (!root) return undefined;

		const tryComplete = () => {
			if (!endReachedRef.current || !mediaDoneRef.current) return;
			const minMs = estimateLessonMinDwellSeconds(root) * 1000;
			if (dwellMsRef.current < minMs) return;
			if (completeTimerRef.current) return;
			completeTimerRef.current = setTimeout(() => {
				completeTimerRef.current = null;
				if (!endReachedRef.current || !mediaDoneRef.current) return;
				if (dwellMsRef.current < estimateLessonMinDwellSeconds(root) * 1000) return;
				setReachedMilestones((prev) => addMilestone(prev, 100));
			}, COMPLETE_DEBOUNCE_MS);
		};

		const scrollRoot = findLessonScrollRoot(root);
		const bottomGap = lessonTabObstructionPx();

		lastTickRef.current = document.visibilityState === 'visible' ? Date.now() : null;
		const dwellId = setInterval(() => {
			if (document.visibilityState !== 'visible') {
				lastTickRef.current = null;
				return;
			}
			const now = Date.now();
			const last = lastTickRef.current ?? now;
			dwellMsRef.current += Math.max(0, now - last);
			lastTickRef.current = now;

			const sentinel = root.querySelector('[data-lesson-read-end]');
			if (sentinel) {
				const rootBox = scrollRoot?.getBoundingClientRect();
				const viewBottom = (scrollRoot?.clientHeight ?? window.innerHeight) - bottomGap;
				const top = sentinel.getBoundingClientRect().top - (rootBox?.top ?? 0);
				if (top <= viewBottom + 12) {
					endReachedRef.current = true;
				}
			}

			const shortContent =
				root.scrollHeight <= (scrollRoot?.clientHeight ?? window.innerHeight) * 1.2;
			if (shortContent) {
				endReachedRef.current = true;
			}

			tryComplete();
		}, DWELL_TICK_MS);

		const onVisibility = () => {
			if (document.visibilityState === 'visible') {
				lastTickRef.current = Date.now();
			} else {
				lastTickRef.current = null;
			}
		};
		document.addEventListener('visibilitychange', onVisibility);

		const videos = [...root.querySelectorAll('video[data-lesson-media]')];
		let unknownMediaTimer = null;
		const syncMedia = () => {
			if (!videos.length) {
				mediaDoneRef.current = true;
				tryComplete();
				return;
			}
			const allDone = videos.every((video) => {
				if (video.ended) return true;
				const duration = video.duration;
				return Number.isFinite(duration) && duration > 0 && video.currentTime / duration >= 0.8;
			});
			mediaDoneRef.current = allDone;
			if (allDone) tryComplete();
		};
		mediaDoneRef.current = videos.length === 0;
		videos.forEach((video) => {
			video.addEventListener('timeupdate', syncMedia);
			video.addEventListener('ended', syncMedia);
			video.addEventListener('loadedmetadata', syncMedia);
		});
		if (videos.length) {
			unknownMediaTimer = setTimeout(() => {
				const unknown = videos.every((video) => !Number.isFinite(video.duration) || video.duration <= 0);
				if (unknown) {
					mediaDoneRef.current = true;
					tryComplete();
				}
			}, 8000);
		}

		const observerOptions = {
			root: scrollRoot,
			rootMargin: `0px 0px -${bottomGap}px 0px`,
			threshold: 0,
		};

		const markPartial = (milestone) => {
			if (milestone >= 100) return;
			setReachedMilestones((prev) => addMilestone(prev, milestone));
		};

		let observer = null;
		const bindObserver = () => {
			observer?.disconnect();
			if (typeof IntersectionObserver !== 'function') {
				return;
			}
			observer = new IntersectionObserver((entries) => {
				entries.forEach((entry) => {
					if (!entry.isIntersecting) return;
					const milestone = Number(entry.target.getAttribute('data-lesson-milestone'));
					if (Number.isFinite(milestone) && milestone < 100) {
						markPartial(milestone);
						return;
					}
					if (entry.target.hasAttribute('data-lesson-read-end')) {
						endReachedRef.current = true;
						tryComplete();
					}
				});
			}, observerOptions);

			root.querySelectorAll('[data-lesson-milestone]').forEach((node) => observer.observe(node));
			const sentinel = root.querySelector('[data-lesson-read-end]');
			if (sentinel) observer.observe(sentinel);
		};

		bindObserver();

		const fallbackScroll = () => {
			if (observer) return;
			const sentinel = root.querySelector('[data-lesson-read-end]');
			if (!sentinel) return;
			const viewBottom = (scrollRoot?.clientHeight ?? window.innerHeight) - bottomGap;
			const top = sentinel.getBoundingClientRect().top - (scrollRoot?.getBoundingClientRect().top ?? 0);
			if (top <= viewBottom) {
				endReachedRef.current = true;
				tryComplete();
			}
			root.querySelectorAll('[data-lesson-milestone]').forEach((node) => {
				const milestone = Number(node.getAttribute('data-lesson-milestone'));
				const markerTop = node.getBoundingClientRect().top - (scrollRoot?.getBoundingClientRect().top ?? 0);
				if (Number.isFinite(milestone) && milestone < 100 && markerTop <= viewBottom) {
					markPartial(milestone);
				}
			});
		};

		if (!observer) {
			const scrollTarget = scrollRoot || window;
			scrollTarget.addEventListener('scroll', fallbackScroll, { passive: true });
			window.addEventListener('resize', fallbackScroll);
			fallbackScroll();
		}

		const resizeObserver =
			typeof ResizeObserver === 'function'
				? new ResizeObserver(() => {
						bindObserver();
						if (!observer) fallbackScroll();
					})
				: null;
		resizeObserver?.observe(root);

		return () => {
			clearInterval(dwellId);
			document.removeEventListener('visibilitychange', onVisibility);
			observer?.disconnect();
			resizeObserver?.disconnect();
			if (unknownMediaTimer) clearTimeout(unknownMediaTimer);
			if (completeTimerRef.current) {
				clearTimeout(completeTimerRef.current);
				completeTimerRef.current = null;
			}
			videos.forEach((video) => {
				video.removeEventListener('timeupdate', syncMedia);
				video.removeEventListener('ended', syncMedia);
				video.removeEventListener('loadedmetadata', syncMedia);
			});
			if (!observer) {
				const scrollTarget = scrollRoot || window;
				scrollTarget.removeEventListener('scroll', fallbackScroll);
				window.removeEventListener('resize', fallbackScroll);
			}
		};
	}, [contentRef, enabled, lessonId]);

	return { reachedMilestones, milestones: LESSON_READ_MILESTONES };
}
