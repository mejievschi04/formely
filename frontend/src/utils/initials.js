/** Inițialele pentru avatar: primele litere din primele două cuvinte (ex. „Ana Maria Pop” → „AM”). */
export function nameInitials(name, fallback = 'U') {
	const letters = String(name || '')
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part[0])
		.join('')
		.slice(0, 2)
		.toUpperCase();
	return letters || fallback;
}
