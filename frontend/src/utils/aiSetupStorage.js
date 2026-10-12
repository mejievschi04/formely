const STORAGE_KEY = 'formely-ai-setup-done';

export function markAiSetupDone() {
	try {
		localStorage.setItem(STORAGE_KEY, '1');
	} catch {
		/* ignore */
	}
}

export function isAiSetupDone() {
	try {
		return localStorage.getItem(STORAGE_KEY) === '1';
	} catch {
		return false;
	}
}
