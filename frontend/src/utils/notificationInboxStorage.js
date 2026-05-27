import { notificationsService, parseStoredNotificationId, adminService } from '../services/api';

const KEYS = {
	student: 'va_notif_inbox_student',
	admin: 'va_notif_inbox_admin',
};
const LEGACY_STUDENT_DISMISSED = 'va_dismissed_student_notifications';

function parseState(raw) {
	try {
		const o = raw ? JSON.parse(raw) : {};
		const read = o.read && typeof o.read === 'object' ? o.read : {};
		const removed = Array.isArray(o.removedIds) ? o.removedIds.map(String) : [];
		return { read, removedIds: new Set(removed) };
	} catch {
		return { read: {}, removedIds: new Set() };
	}
}

function serializeState(state) {
	return JSON.stringify({
		read: state.read,
		removedIds: [...state.removedIds],
	});
}

function loadRaw(variant) {
	const key = KEYS[variant];
	const data = parseState(localStorage.getItem(key));
	return data;
}

function saveRaw(variant, state) {
	try {
		localStorage.setItem(KEYS[variant], serializeState(state));
	} catch {
		// ignore
	}
}

let legacyStudentMigrated = false;
function migrateLegacyStudentDismissed() {
	if (legacyStudentMigrated) return;
	legacyStudentMigrated = true;
	try {
		const old = localStorage.getItem(LEGACY_STUDENT_DISMISSED);
		if (!old) return;
		const arr = JSON.parse(old);
		if (!Array.isArray(arr)) return;
		const state = loadRaw('student');
		arr.forEach((id) => state.removedIds.add(String(id)));
		saveRaw('student', state);
		localStorage.removeItem(LEGACY_STUDENT_DISMISSED);
	} catch {
		// ignore
	}
}

/** Notificare salvată în DB (vs. calculate: next-lesson-, pending-exam-). */
export function isPersistedNotification(notif) {
	if (!notif) return false;
	if (notif.stored === true) return true;
	return parseStoredNotificationId(notif.id) != null;
}

export function snapshotForStorage(notif, variant) {
	const id = String(notif.id);
	const readAt = new Date().toISOString();
	if (variant === 'admin') {
		return {
			id,
			readAt,
			title: notif.title || '',
			subtitle: notif.description || notif.message || '',
			link:
				typeof notif.action_url === 'string' && notif.action_url.startsWith('/')
					? notif.action_url
					: null,
			type: notif.type || '',
			severity: notif.severity || 'info',
			created_at: notif.created_at || null,
		};
	}
	return {
		id,
		readAt,
		title: notif.title || '',
		subtitle: notif.message || '',
		link: notif.link && String(notif.link).startsWith('/') ? notif.link : null,
		type: notif.type || '',
		severity: notif.severity || 'info',
		created_at: notif.created_at || null,
	};
}

export async function markNotificationRead(variant, notif) {
	if (variant === 'student') migrateLegacyStudentDismissed();
	const state = loadRaw(variant);
	const id = String(notif.id);
	const snap = snapshotForStorage(notif, variant);
	state.read[id] = snap;
	saveRaw(variant, state);

	const storedId = parseStoredNotificationId(notif.id);
	if (storedId != null) {
		try {
			await notificationsService.markRead(storedId);
		} catch (err) {
			console.warn('notificationsService.markRead failed:', err);
		}
	} else if (variant === 'admin' && String(notif.id).startsWith('alert_')) {
		try {
			await adminService.dismissDashboardAlert(String(notif.id));
		} catch (err) {
			console.warn('dismissDashboardAlert failed:', err);
		}
	}
}

/** Marchează toate notificările din Primite ca citite. */
export async function markAllPrimiteAsRead(variant, apiList) {
	if (variant === 'student') migrateLegacyStudentDismissed();
	const primite = getPrimiteFromApi(apiList, variant);
	if (primite.length === 0) return;

	const state = loadRaw(variant);
	for (const notif of primite) {
		state.read[String(notif.id)] = snapshotForStorage(notif, variant);
	}
	saveRaw(variant, state);

	if (primite.some((n) => isPersistedNotification(n))) {
		try {
			await notificationsService.markAllRead();
		} catch (err) {
			console.warn('notificationsService.markAllRead failed:', err);
		}
	}
}

/** Șterge tot istoricul; ID-urile trec în removed ca să nu reapară în Primite. */
export function clearAllHistoric(variant) {
	if (variant === 'student') migrateLegacyStudentDismissed();
	const state = loadRaw(variant);
	for (const id of Object.keys(state.read)) {
		state.removedIds.add(String(id));
	}
	state.read = {};
	saveRaw(variant, state);
}

export function removeNotificationFromHistoric(variant, id) {
	if (variant === 'student') migrateLegacyStudentDismissed();
	const state = loadRaw(variant);
	const sid = String(id);
	delete state.read[sid];
	state.removedIds.add(sid);
	saveRaw(variant, state);
}

export function getPrimiteFromApi(apiList, variant) {
	if (variant === 'student') migrateLegacyStudentDismissed();
	const state = loadRaw(variant);
	const list = Array.isArray(apiList) ? apiList : [];
	return list.filter((n) => {
		const id = String(n.id);
		return !state.read[id] && !state.removedIds.has(id);
	});
}

export function getIstoricList(variant) {
	if (variant === 'student') migrateLegacyStudentDismissed();
	const state = loadRaw(variant);
	return Object.values(state.read)
		.filter((entry) => entry && entry.id)
		.sort((a, b) => new Date(b.readAt || 0) - new Date(a.readAt || 0));
}

export function countPrimite(apiList, variant) {
	return getPrimiteFromApi(apiList, variant).length;
}
