import { useEffect, useRef, useState } from 'react';

const PULL_MAX = 88;
const PULL_TRIGGER = 68;

function isMobileLessonViewport() {
	return window.matchMedia('(max-width: 768px)').matches;
}

function pageScrollTop() {
	return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

function isScrolledToTop(node) {
	if (pageScrollTop() > 2) return false;
	let current = node instanceof Element ? node : null;
	while (current && current !== document.body && current !== document.documentElement) {
		const overflowY = window.getComputedStyle(current).overflowY;
		if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollTop > 2) {
			return false;
		}
		current = current.parentElement;
	}
	return true;
}

/**
 * Tragere în jos, doar pe mobil și doar când lecția e deja sus.
 * Arată distanța trasă și pornește reîncărcarea după eliberare.
 */
export function useLessonPullRefresh(onRefresh) {
	const onRefreshRef = useRef(onRefresh);
	const startYRef = useRef(null);
	const originRef = useRef(null);
	const distanceRef = useRef(0);
	const refreshingRef = useRef(false);
	const [pull, setPull] = useState(0);
	const [refreshing, setRefreshing] = useState(false);

	onRefreshRef.current = onRefresh;

	useEffect(() => {
		if (!isMobileLessonViewport()) return undefined;

		const reset = () => {
			startYRef.current = null;
			originRef.current = null;
			distanceRef.current = 0;
			if (!refreshingRef.current) setPull(0);
		};

		const onStart = (event) => {
			if (!isMobileLessonViewport() || refreshingRef.current || event.touches.length !== 1) return;
			if (event.target.closest('button, a, input, textarea, select, .lessons-page-sidebar')) return;
			if (!isScrolledToTop(event.target)) return;
			originRef.current = event.target;
			startYRef.current = event.touches[0].clientY;
		};

		const onMove = (event) => {
			if (startYRef.current == null || refreshingRef.current) return;
			if (!isMobileLessonViewport() || !isScrolledToTop(originRef.current)) {
				reset();
				return;
			}
			const delta = event.touches[0].clientY - startYRef.current;
			if (delta <= 0) {
				distanceRef.current = 0;
				setPull(0);
				return;
			}
			const next = Math.min(PULL_MAX, delta * 0.42);
			distanceRef.current = next;
			setPull(next);
			if (next > 8) event.preventDefault();
		};

		const onEnd = async () => {
			if (startYRef.current == null) return;
			const distance = distanceRef.current;
			startYRef.current = null;
			originRef.current = null;
			if (distance < PULL_TRIGGER || refreshingRef.current) {
				distanceRef.current = 0;
				setPull(0);
				return;
			}
			refreshingRef.current = true;
			distanceRef.current = 56;
			setPull(56);
			setRefreshing(true);
			const started = Date.now();
			try {
				await onRefreshRef.current?.();
			} finally {
				const wait = Math.max(0, 450 - (Date.now() - started));
				window.setTimeout(() => {
					refreshingRef.current = false;
					distanceRef.current = 0;
					setRefreshing(false);
					setPull(0);
				}, wait);
			}
		};

		document.addEventListener('touchstart', onStart, { passive: true });
		document.addEventListener('touchmove', onMove, { passive: false });
		document.addEventListener('touchend', onEnd);
		document.addEventListener('touchcancel', reset);
		return () => {
			document.removeEventListener('touchstart', onStart);
			document.removeEventListener('touchmove', onMove);
			document.removeEventListener('touchend', onEnd);
			document.removeEventListener('touchcancel', reset);
		};
	}, []);

	return {
		pull,
		refreshing,
		ready: pull >= PULL_TRIGGER,
	};
}
