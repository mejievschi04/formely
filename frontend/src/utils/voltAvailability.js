/** Formely AI — activat când backend-ul are un provider AI configurat. */
export let VOLT_ENABLED = false;

/** Funcțiile AI incluse în planul academiei (null = fără informații de plan). */
let PLAN_FEATURES = null;

/** Cote lunare Formely AI din entitlements.ai_usage */
let AI_USAGE = null;

export function setVoltCapabilities(capabilities, entitlements = null) {
	VOLT_ENABLED = capabilities?.volt === true;
	PLAN_FEATURES = entitlements?.features && typeof entitlements.features === 'object'
		? entitlements.features
		: null;
	AI_USAGE = entitlements?.ai_usage && typeof entitlements.ai_usage === 'object'
		? entitlements.ai_usage
		: null;
}

/** Actualizează doar snapshot-ul de cotă (după un call AI reușit). */
export function setAiUsage(aiUsage) {
	if (aiUsage && typeof aiUsage === 'object') {
		AI_USAGE = aiUsage;
	}
}

/** Aplică `ai_usage` din răspuns API / eveniment SSE. */
export function applyAiUsageFromResponse(payload) {
	const usage = payload?.ai_usage ?? payload?.data?.ai_usage ?? null;
	if (usage && typeof usage === 'object') {
		setAiUsage(usage);
		return usage;
	}
	return null;
}

/** Fără `feature`: e suficient ca planul să includă măcar o funcție AI. */
function planAllows(feature) {
	if (!PLAN_FEATURES) return true;
	if (feature) return PLAN_FEATURES[feature] === true;
	return Object.entries(PLAN_FEATURES).some(([key, on]) => key.startsWith('ai_') && on === true);
}

export const VOLT_COMING_SOON_MESSAGE = 'Formely AI va fi disponibil în curând.';
export const AI_QUOTA_EXCEEDED_MESSAGE =
	'Ai epuizat creditele Formely AI pentru luna aceasta. Trece la un plan superior sau așteaptă resetarea.';

export function isVoltEnabled(feature) {
	return VOLT_ENABLED && planAllows(feature);
}

/** Cost în credite pentru o acțiune (din payload sau default-uri). */
export function getAiCreditCost(action) {
	const fromPayload = AI_USAGE?.costs?.[action];
	if (typeof fromPayload === 'number' && fromPayload > 0) return fromPayload;
	const defaults = { course_generation: 15, test_generation: 3, tutor: 1 };
	return defaults[action] ?? 1;
}

/** Pool de credite lunare, dacă există în payload. */
export function getAiCredits() {
	const row = AI_USAGE?.credits;
	if (!row || typeof row !== 'object') return null;
	return row;
}

/** @returns {{ used: number, limit: number|null, remaining: number|null, unlimited: boolean, credit_cost?: number }|null} */
export function getAiQuota(action) {
	const row = AI_USAGE?.actions?.[action];
	if (!row || typeof row !== 'object') return null;
	return row;
}

export function hasAiQuota(action) {
	const credits = getAiCredits();
	if (credits) {
		if (credits.unlimited) return true;
		if (credits.limit == null) return true;
		const cost = getAiCreditCost(action);
		return (credits.remaining ?? 0) >= cost;
	}

	const row = getAiQuota(action);
	if (!row) return true;
	if (row.unlimited) return true;
	if (row.limit == null) return true;
	return (row.remaining ?? 0) > 0;
}

export function notifyVoltComingSoon(showToast) {
	if (typeof showToast === 'function') {
		showToast(VOLT_COMING_SOON_MESSAGE, 'info');
	}
}

export function notifyAiQuotaExceeded(showToast, serverMessage) {
	if (typeof showToast === 'function') {
		showToast(serverMessage || AI_QUOTA_EXCEEDED_MESSAGE, 'warning');
	}
}

/** Eroare din fetch AI (compatibilă cu isAiQuotaError). */
export class AiApiError extends Error {
	constructor(message, status, data = null) {
		super(message || `HTTP error! status: ${status}`);
		this.name = 'AiApiError';
		this.status = status;
		this.response = { status, data };
		this.data = data;
	}
}

function readQuotaCode(payload) {
	if (!payload || typeof payload !== 'object') return null;
	return payload.code || payload?.error?.code || null;
}

/** True dacă răspunsul API e cotă AI epuizată (Axios sau fetch/AiApiError). */
export function isAiQuotaError(err) {
	const status = err?.response?.status ?? err?.status ?? null;
	if (status !== 429) return false;
	const data = err?.response?.data ?? err?.data ?? null;
	if (readQuotaCode(data) === 'ai_quota_exceeded') return true;
	// body text uneori e string JSON
	if (typeof data === 'string') {
		try {
			return readQuotaCode(JSON.parse(data)) === 'ai_quota_exceeded';
		} catch {
			return data.includes('ai_quota_exceeded');
		}
	}
	return false;
}

export function quotaErrorMessage(err) {
	const data = err?.response?.data ?? err?.data ?? null;
	if (data && typeof data === 'object' && data.error) return String(data.error);
	return AI_QUOTA_EXCEEDED_MESSAGE;
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

/** Rulează acțiunea Formely AI sau afișează mesajul „în curând” / cotă. */
export function runVoltAction(showToast, action, feature, quotaAction) {
	if (!isVoltEnabled(feature)) {
		notifyVoltComingSoon(showToast);
		return undefined;
	}
	if (quotaAction && !hasAiQuota(quotaAction)) {
		notifyAiQuotaExceeded(showToast);
		return undefined;
	}
	return action();
}
