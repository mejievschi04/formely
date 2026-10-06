import { useEffect, useState } from 'react';

function findLessonScrollRoot(startEl) {
	let node = startEl?.parentElement;
	let best = null;
	let bestHeight = 0;
	while (node && node !== document.body) {
		const style = window.getComputedStyle(node);
		const overflowY = style.overflowY;
		const scrolls =
			(overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
			node.scrollHeight > node.clientHeight + 8;
		if (scrolls && node.clientHeight > bestHeight) {
			best = node;
			bestHeight = node.clientHeight;
		}
		node = node.parentElement;
	}
	return best;
}

function screenBottom() {
	const viewport = window.visualViewport;
	if (viewport) return viewport.offsetTop + viewport.height;
	return window.innerHeight;
}

function scrollRemaining(scrollRoot) {
	if (scrollRoot) {
		return scrollRoot.scrollHeight - scrollRoot.scrollTop - scrollRoot.clientHeight;
	}
	const doc = document.scrollingElement || document.documentElement;
	const viewport = window.visualViewport;
	const viewHeight = viewport?.height ?? window.innerHeight;
	const offsetTop = viewport?.offsetTop ?? 0;
	return doc.scrollHeight - window.scrollY - offsetTop - viewHeight;
}

function atScrollEnd(scrollRoot) {
	const slack = 48;
	if (scrollRoot) return scrollRemaining(scrollRoot) <= slack;
	return scrollRemaining(null) <= slack;
}

function mediaHasSize(root) {
	const nodes = root.querySelectorAll('img, video, iframe[data-lesson-embed], iframe[data-lesson-media]');
	for (const node of nodes) {
		if (node.tagName === 'IMG') {
			const src = node.currentSrc || node.getAttribute('src') || '';
			if (src && !node.complete) return false;
			continue;
		}
		if (node.tagName === 'VIDEO' && node.readyState < 1 && node.clientHeight < 8) return false;
		if (node.tagName === 'IFRAME' && node.clientHeight < 8) return false;
	}
	return true;
}

function endIsVisible(root, scrollRoot) {
	if (!mediaHasSize(root)) return false;
	if (atScrollEnd(scrollRoot)) return true;
	const bottom = screenBottom();
	const sentinel = root.querySelector('[data-lesson-read-end]');
	if (sentinel) {
		return sentinel.getBoundingClientRect().top <= bottom + 8;
	}
	return root.getBoundingClientRect().bottom <= bottom + 8;
}

const NOT_REACHED = { lessonId: null, reached: false };

/**
 * Devine adevărat când finalul lecției intră în zona vizibilă.
 */
export function useLessonReachedEnd({ contentRef, lessonId, enabled = true }) {
	// Starea ține minte lecția pentru care a fost calculată, ca la schimbarea lecției
	// să nu se vadă valoarea veche (fără resetare sincronă în efect).
	const [endState, setEndState] = useState(NOT_REACHED);

	useEffect(() => {
		if (!enabled || lessonId == null) return undefined;

		const root = contentRef.current;
		if (!root) return undefined;

		const update = () => {
			const reached = endIsVisible(root, findLessonScrollRoot(root));
			setEndState((prev) => (
				prev.lessonId === lessonId && prev.reached === reached ? prev : { lessonId, reached }
			));
		};

		update();
		document.addEventListener('scroll', update, { passive: true, capture: true });
		root.addEventListener('load', update, true);
		root.addEventListener('error', update, true);
		root.addEventListener('loadedmetadata', update, true);
		window.addEventListener('resize', update);
		window.visualViewport?.addEventListener('resize', update);
		window.visualViewport?.addEventListener('scroll', update);

		const resizeObserver =
			typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
		resizeObserver?.observe(root);

		const lateCheck = window.setTimeout(update, 300);

		return () => {
			document.removeEventListener('scroll', update, true);
			root.removeEventListener('load', update, true);
			root.removeEventListener('error', update, true);
			root.removeEventListener('loadedmetadata', update, true);
			window.removeEventListener('resize', update);
			window.visualViewport?.removeEventListener('resize', update);
			window.visualViewport?.removeEventListener('scroll', update);
			resizeObserver?.disconnect();
			window.clearTimeout(lateCheck);
			setEndState(NOT_REACHED);
		};
	}, [contentRef, enabled, lessonId]);

	return enabled && lessonId != null && endState.lessonId === lessonId && endState.reached;
}
