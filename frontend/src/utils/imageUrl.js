/**
 * Returnează origin-ul unde se servesc fișierele storage (backend).
 * Ordine: VITE_STORAGE_URL > VITE_API_URL (absolut) > fallback localhost:8000 > window.origin
 */
function getStorageOrigin() {
	// 1. Explicit – cel mai sigur
	const storageUrl = import.meta.env.VITE_STORAGE_URL;
	if (storageUrl && (storageUrl.startsWith('http://') || storageUrl.startsWith('https://'))) {
		try {
			const u = new URL(storageUrl);
			return `${u.protocol}//${u.host}`;
		} catch {}
	}
	// 2. Din API URL
	const apiUrl = import.meta.env.VITE_API_URL;
	if (apiUrl && (apiUrl.startsWith('http://') || apiUrl.startsWith('https://'))) {
		try {
			const u = new URL(apiUrl);
			return `${u.protocol}//${u.host}`;
		} catch {}
	}
	// 3. SSR / build time
	if (typeof window === 'undefined') {
		return 'http://localhost:8000';
	}
	// 4. Local dev fallback: dacă frontend rulează pe localhost (ex: 5173), storage-ul e pe backend:8000
	const origin = window.location.origin;
	try {
		const u = new URL(origin);
		if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
			const port = u.port || (u.protocol === 'https:' ? '443' : '80');
			if (port !== '8000') {
				return `${u.protocol}//${u.hostname}:8000`;
			}
		}
	} catch {}
	return origin;
}

/**
 * Convertește un URL de imagine în URL care se încarcă din origin-ul curent.
 * @param {string|null|undefined} url - URL relativ, absolut, sau doar path
 * @returns {string|null} URL care funcționează
 */
export function toImageUrl(url) {
	if (!url || typeof url !== 'string') return null;
	const trimmed = url.trim();
	if (!trimmed) return null;

	if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
		return trimmed;
	}

	// URL protocol-relative (ex. //cdn.example.com/... )
	if (trimmed.startsWith('//')) {
		if (typeof window !== 'undefined' && window.location?.protocol) {
			return `${window.location.protocol}${trimmed}`;
		}
		return `https:${trimmed}`;
	}

	const origin = getStorageOrigin();
	if (!origin) return trimmed;

	// URL absolut (http/https)
	if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
		try {
			const u = new URL(trimmed);
			if (!u.pathname.startsWith('/storage/')) return trimmed;
			// Dacă backend-ul e pe alt host (ex. producție), păstrăm URL-ul – fișierul e acolo
			if (u.host !== new URL(origin).host) return trimmed;
			// Același host – folosim origin-ul nostru (proxy / acces direct)
			return `${origin}${u.pathname}`;
		} catch {
			return trimmed;
		}
	}

	// Relativ cu / - ex: /storage/courses/xxx.jpg
	if (trimmed.startsWith('/')) {
		return `${origin}${trimmed}`;
	}

	// Doar filename (fără /) – backend stochează în content-blocks/image/
	const path = trimmed.replace(/^\/+/, '');
	if (!path.includes('/')) {
		return `${origin}/storage/content-blocks/image/${path}`;
	}
	// Path cu / – ex: content-blocks/image/xxx.jpg sau courses/xxx.jpg
	return `${origin}/storage/${path}`;
}

/**
 * URL copertă curs din obiectul API (image_url sau câmpul brut image).
 */
export function courseCoverSrc(course) {
	if (!course || typeof course !== 'object') return null;
	const direct = course.image_url ?? course.imageUrl;
	if (direct != null && String(direct).trim() !== '') {
		return toImageUrl(String(direct).trim());
	}
	const raw = course.image;
	if (raw == null || typeof raw !== 'string' || !raw.trim()) return null;
	const im = raw.trim();
	if (im.startsWith('http://') || im.startsWith('https://')) return toImageUrl(im);
	if (im.startsWith('/storage/')) return toImageUrl(im);
	if (im.startsWith('storage/')) return toImageUrl(`/${im}`);
	return toImageUrl(im);
}

/**
 * Imagine pentru cardul unei mape în listă: coperta mapei, apoi preview API / primul curs cu copertă.
 */
export function mapFolderCardImageUrl(map) {
	if (!map || typeof map !== 'object') return null;
	const mc = map.cover_image_url;
	if (mc != null && String(mc).trim() !== '') {
		const u = String(mc).trim();
		return toImageUrl(u) ?? u;
	}
	const pv = map.preview_image_url;
	if (pv != null && String(pv).trim() !== '') {
		const u2 = String(pv).trim();
		return toImageUrl(u2) ?? u2;
	}
	const list = map.courses;
	if (Array.isArray(list)) {
		for (let i = 0; i < list.length; i += 1) {
			const s = courseCoverSrc(list[i]);
			if (s) return s;
		}
	}
	return null;
}
