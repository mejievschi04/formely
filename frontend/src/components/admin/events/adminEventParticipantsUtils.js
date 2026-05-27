export function pickRegisteredUsers(event) {
	if (!event) return [];
	const camel = event.registeredUsers;
	const snake = event.registered_users;
	return Array.isArray(camel) ? camel : Array.isArray(snake) ? snake : [];
}

export function formatPivotDate(raw) {
	if (!raw) return null;
	const d = new Date(raw);
	if (Number.isNaN(d.getTime())) return null;
	return d.toLocaleString('ro-RO', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}
