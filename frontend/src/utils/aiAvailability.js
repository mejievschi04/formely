/** Asistent AI — dezactivat temporar; schimbă în `true` când e gata. */
export const AI_FEATURE_ENABLED = false;

export const AI_COMING_SOON_MESSAGE = 'Asistentul AI va fi disponibil în curând.';

export function isAiEnabled() {
	return AI_FEATURE_ENABLED;
}

export function notifyAiComingSoon(showToast) {
	if (typeof showToast === 'function') {
		showToast(AI_COMING_SOON_MESSAGE, 'info');
	}
}

export class AiUnavailableError extends Error {
	constructor() {
		super(AI_COMING_SOON_MESSAGE);
		this.name = 'AiUnavailableError';
	}
}

export function assertAiEnabled() {
	if (!AI_FEATURE_ENABLED) {
		throw new AiUnavailableError();
	}
}

/** Rulează acțiunea AI sau afișează mesajul „în curând”. */
export function runAiAction(showToast, action) {
	if (!isAiEnabled()) {
		notifyAiComingSoon(showToast);
		return undefined;
	}
	return action();
}
