import { isDirectLessonVideoUrl } from '../../../../utils/lessonReadCompletion.js';

/**
 * Transformă linkul unui video găzduit extern în sursa playerului din lecție.
 * Întoarce { kind: 'iframe' | 'video', src, provider } sau null dacă linkul nu poate fi redat la noi.
 */
export function resolveLessonVideo(rawUrl) {
	const value = String(rawUrl || '').trim();
	if (!value) return null;
	let url;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	if (!['http:', 'https:'].includes(url.protocol)) return null;
	const host = url.hostname.replace(/^www\.|^m\./, '');

	if (host === 'youtu.be' || host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
		let id = null;
		if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
		else if (url.pathname === '/watch') id = url.searchParams.get('v');
		else {
			const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
			id = match?.[1] || null;
		}
		if (!id || !/^[\w-]{6,}$/.test(id)) return null;
		const start = parseYouTubeStart(url.searchParams.get('t') || url.searchParams.get('start'));
		return {
			kind: 'iframe',
			provider: 'youtube',
			src: `https://www.youtube-nocookie.com/embed/${id}?rel=0${start ? `&start=${start}` : ''}`,
		};
	}

	if (host === 'vimeo.com' || host === 'player.vimeo.com') {
		const match = url.pathname.match(/(?:\/video)?\/(\d+)(?:\/([\da-f]+))?/i);
		if (!match) return null;
		const hash = match[2] || url.searchParams.get('h');
		return {
			kind: 'iframe',
			provider: 'vimeo',
			src: `https://player.vimeo.com/video/${match[1]}${hash ? `?h=${hash}` : ''}`,
		};
	}

	if (host === 'loom.com') {
		const match = url.pathname.match(/^\/(?:share|embed)\/([\da-f]+)/i);
		return match ? { kind: 'iframe', provider: 'loom', src: `https://www.loom.com/embed/${match[1]}` } : null;
	}

	if (host === 'drive.google.com') {
		const match = url.pathname.match(/\/file\/d\/([\w-]+)/);
		const id = match?.[1] || url.searchParams.get('id');
		return id ? { kind: 'iframe', provider: 'drive', src: `https://drive.google.com/file/d/${id}/preview` } : null;
	}

	if (isDirectLessonVideoUrl(url.href)) {
		return { kind: 'video', provider: 'file', src: url.href };
	}

	return null;
}

function parseYouTubeStart(value) {
	if (!value) return 0;
	if (/^\d+$/.test(value)) return Number(value);
	const match = String(value).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
	if (!match) return 0;
	return (Number(match[1] || 0) * 3600) + (Number(match[2] || 0) * 60) + Number(match[3] || 0);
}
