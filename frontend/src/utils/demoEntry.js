export const DEFAULT_DEMO_URL = 'https://demo.formely.org';

/** Redirect before demo login/logout can touch a real academy's session. */
export function demoEntryRedirect(currentOrigin, demoUrl = DEFAULT_DEMO_URL) {
	const destination = new URL(demoUrl);
	return currentOrigin === destination.origin ? null : destination.href;
}
