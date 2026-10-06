/** Volt AI — activat când backend-ul are un provider AI configurat. */
export let VOLT_ENABLED = false;

/** Formely: funcțiile AI incluse în planul academiei (null = fără informații de plan). */
let PLAN_FEATURES = null;

export function setVoltCapabilities(capabilities, entitlements = null) {
	VOLT_ENABLED = capabilities?.volt === true;
	PLAN_FEATURES = entitlements?.features && typeof entitlements.features === 'object'
		? entitlements.features
		: null;
}

/** Fără `feature`: e suficient ca planul să includă măcar o funcție AI. */
function planAllows(feature) {
	if (!PLAN_FEATURES) return true;
	if (feature) return PLAN_FEATURES[feature] === true;
	return Object.entries(PLAN_FEATURES).some(([key, on]) => key.startsWith('ai_') && on === true);
}

export const VOLT_COMING_SOON_MESSAGE = 'Formely AI va fi disponibil în curând.';

export function isVoltEnabled(feature) {
	return VOLT_ENABLED && planAllows(feature);
}

export function notifyVoltComingSoon(showToast) {
	if (typeof showToast === 'function') {
		showToast(VOLT_COMING_SOON_MESSAGE, 'info');
	}
}

export class VoltUnavailableError extends Error {
	constructor() {
		super(VOLT_COMING_SOON_MESSAGE);
		this.name = 'VoltUnavailableError';
	}
}

export function assertVoltEnabled(feature) {
	if (!isVoltEnabled(feature)) {
		throw new VoltUnavailableError();
	}
}

/** Rulează acțiunea Volt sau afișează mesajul „în curând”. */
export function runVoltAction(showToast, action) {
	if (!isVoltEnabled()) {
		notifyVoltComingSoon(showToast);
		return undefined;
	}
	return action();
}
