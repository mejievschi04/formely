import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { scrollAppToTop } from '../../utils/scrollToTop';

/**
 * La fiecare schimbare de rută, conținutul începe de sus.
 */
export default function ScrollToTop() {
	const { pathname, search, hash } = useLocation();

	useLayoutEffect(() => {
		scrollAppToTop();
	}, [pathname, search, hash]);

	return null;
}
