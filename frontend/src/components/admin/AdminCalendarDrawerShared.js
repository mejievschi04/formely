export function notifyAdminEventsRefresh() {
	window.dispatchEvent(new CustomEvent('volta-admin-events-refresh'));
}
