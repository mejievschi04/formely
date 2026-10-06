/** Containere care pot păstra poziția de scroll între pagini / tab-uri. */
const APP_SCROLL_ROOT_SELECTORS = [
	'.va-shell-topnav .va-shell-main',
	'.va-shell-main-topnav.va-shell-main',
	'.va-shell-main',
	'.va-main',
	'.admin-container',
	'#admin-events-panel',
	'.student-dashboard-page',
	'.courses-page-modern',
	'.events-page',
	'.library-page',
	'.guides-page',
	'.unified-course-page',
	'.lessons-page-main-content',
	'.lessons-page-player-layout',
	'.lesson-page-modern',
];

const MODAL_SCROLL_SELECTORS = [
	'.admin-event-modal-body',
	'.aev-detail-body',
	'.admin-team-modal-body',
	'.admin-users-modal-body',
	'.admin-modal-body',
	'[role="dialog"]',
];

/**
 * Resetează scroll-ul aplicației (fereastră + containere principale).
 * @param {{ behavior?: ScrollBehavior }} [options]
 */
export function scrollAppToTop(options = {}) {
	if (typeof window === 'undefined') return;

	const behavior = options.behavior ?? 'instant';

	try {
		if ('scrollRestoration' in window.history) {
			window.history.scrollRestoration = 'manual';
		}
	} catch {
		/* ignore */
	}

	window.scrollTo({ top: 0, left: 0, behavior });

	const seen = new Set();
	const visit = (el) => {
		if (!el || seen.has(el)) return;
		seen.add(el);
		if (typeof el.scrollTo === 'function') {
			try {
				el.scrollTo({ top: 0, left: 0, behavior });
			} catch {
				el.scrollTop = 0;
				el.scrollLeft = 0;
			}
		} else {
			el.scrollTop = 0;
			el.scrollLeft = 0;
		}
	};

	visit(document.documentElement);
	visit(document.body);

	APP_SCROLL_ROOT_SELECTORS.forEach((selector) => {
		document.querySelectorAll(selector).forEach(visit);
	});
}

/**
 * @param {Element | null | undefined} el
 * @param {ScrollBehavior} [behavior]
 */
export function scrollElementToTop(el, behavior = 'instant') {
	if (!el) return;
	if (typeof el.scrollTo === 'function') {
		try {
			el.scrollTo({ top: 0, left: 0, behavior });
			return;
		} catch {
			/* fall through */
		}
	}
	el.scrollTop = 0;
	el.scrollLeft = 0;
}

/** Resetează scroll-ul în modale / dialoguri deschise. */
export function resetModalScrollRoots() {
	if (typeof document === 'undefined') return;

	const seen = new Set();
	MODAL_SCROLL_SELECTORS.forEach((selector) => {
		document.querySelectorAll(selector).forEach((el) => {
			if (seen.has(el)) return;
			seen.add(el);
			scrollElementToTop(el);
		});
	});
}
