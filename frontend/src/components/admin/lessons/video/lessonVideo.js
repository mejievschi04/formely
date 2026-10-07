import { mergeAttributes, Node } from '@tiptap/core';
import { resolveLessonVideo } from './lessonVideoSource.js';

/**
 * Video găzduit extern (YouTube, Vimeo, Loom, Google Drive sau fișier .mp4/.webm), redat în lecție.
 * În HTML se salvează linkul original (data-src) și playerul gata făcut, ca pagina cursantului
 * să-l afișeze fără cod în plus; la încărcare playerul se reface din linkul original.
 */
export const LessonVideo = Node.create({
	name: 'lessonVideo',
	group: 'block',
	atom: true,
	draggable: true,
	selectable: true,

	addAttributes() {
		return {
			src: {
				default: null,
				parseHTML: (element) => element.getAttribute('data-src'),
				renderHTML: (attributes) => ({ 'data-src': attributes.src }),
			},
		};
	},

	parseHTML() {
		return [{ tag: 'figure[data-lesson-video="true"]' }];
	},

	renderHTML({ node, HTMLAttributes }) {
		const video = resolveLessonVideo(node.attrs.src);
		const wrapper = mergeAttributes(HTMLAttributes, { 'data-lesson-video': 'true', class: 'lesson-video' });
		if (!video) {
			return ['figure', wrapper, ['a', { href: node.attrs.src || '#', target: '_blank', rel: 'noopener noreferrer' }, 'Deschide video']];
		}
		if (video.kind === 'video') {
			return ['figure', wrapper, ['video', {
				src: video.src,
				controls: 'true',
				preload: 'metadata',
				playsinline: 'true',
				'data-lesson-media': 'video',
			}]];
		}
		return ['figure', wrapper, ['iframe', {
			src: video.src,
			title: 'Video',
			loading: 'lazy',
			allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen',
			allowfullscreen: 'true',
			referrerpolicy: 'strict-origin-when-cross-origin',
			frameborder: '0',
			'data-lesson-embed': 'video',
		}]];
	},

	addCommands() {
		return {
			setLessonVideo: (src) => ({ commands }) => {
				if (!resolveLessonVideo(src)) return false;
				// Paragraful de după primește cursorul: altfel video-ul rămâne selectat și următorul
				// lucru inserat (text, imagine) l-ar înlocui.
				return commands.insertContent([
					{ type: this.name, attrs: { src: String(src).trim() } },
					{ type: 'paragraph' },
				]);
			},
		};
	},
});

export default LessonVideo;
