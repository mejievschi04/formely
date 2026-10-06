/** Căutare după nume, prenume sau email, indiferent de echipă, majuscule sau diacritice. */
export function matchesDirectorySearch(user, query) {
	const tokens = fold(query).split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return true;
	const haystack = fold(`${user?.name || ''} ${user?.email || ''}`);
	return tokens.every((token) => haystack.includes(token));
}

function fold(value) {
	return String(value || '')
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase();
}
