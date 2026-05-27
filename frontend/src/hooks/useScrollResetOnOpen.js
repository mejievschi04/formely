import { useLayoutEffect } from 'react';
import { resetModalScrollRoots, scrollAppToTop, scrollElementToTop } from '../utils/scrollToTop';

/**
 * La deschidere (modal, panou), scroll mereu de sus.
 * @param {boolean} active
 * @param {React.RefObject<HTMLElement | null>} [containerRef]
 */
export function useScrollResetOnOpen(active, containerRef) {
	useLayoutEffect(() => {
		if (!active) return;
		scrollAppToTop();
		resetModalScrollRoots();
		if (containerRef?.current) {
			scrollElementToTop(containerRef.current);
		}
	}, [active, containerRef]);
}
