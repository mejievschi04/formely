import { companyHasFeature } from './entitlements';

/** Asistent AI — dezactivat până la lansare. */
export const AI_FEATURE_ENABLED = false;

export const AI_SOON_LABEL = 'Formely AI — în curând';
export const AI_COMING_SOON_MESSAGE = 'Asistentul AI Formely va fi disponibil în curând.';
export const AI_PLAN_LOCKED_MESSAGE = 'Această funcție AI nu este inclusă în planul organizației.';

export function isAiEnabled() {
	return AI_FEATURE_ENABLED;
}

/**
 * @param {Record<string, unknown>|null|undefined} user
 * @param {string} feature e.g. ai_builder, ai_tutor, ai_stats
 */
export function canUseAiFeature(user, feature) {
	if (!isAiEnabled()) return false;
	return companyHasFeature(user, feature);
}

export function notifyAiComingSoon(showToast) {
	if (typeof showToast === 'function') {
		showToast(AI_COMING_SOON_MESSAGE, 'info');
	}
}

export function notifyAiPlanLocked(showToast) {
	if (typeof showToast === 'function') {
		showToast(AI_PLAN_LOCKED_MESSAGE, 'info');
	}
}

export class AiUnavailableError extends Error {
	constructor(message = AI_COMING_SOON_MESSAGE) {
		super(message);
		this.name = 'AiUnavailableError';
	}
}

export function assertAiEnabled() {
	if (!AI_FEATURE_ENABLED) {
		throw new AiUnavailableError();
	}
}

/** Rulează acțiunea AI sau afișează mesajul „în curând” / plan locked. */
export function runAiAction(showToast, action, user = null, feature = null) {
	if (!isAiEnabled()) {
		notifyAiComingSoon(showToast);
		return undefined;
	}
	if (feature && user && !companyHasFeature(user, feature)) {
		notifyAiPlanLocked(showToast);
		return undefined;
	}
	return action();
}
