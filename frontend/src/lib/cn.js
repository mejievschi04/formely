/**
 * Concatenează clase CSS (înlocuitor minimal pentru `cn` din shadcn / clsx).
 * @param {...(string|undefined|null|false)} parts
 * @returns {string}
 */
export function cn(...parts) {
	return parts.filter(Boolean).join(' ');
}
