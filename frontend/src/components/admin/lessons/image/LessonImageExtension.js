import Image from '@tiptap/extension-image';
import { mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import LessonImageNodeView from './LessonImageNodeView.jsx';
import { lessonImageHtmlAttributes, readLessonImageAttrs } from './lessonImageAttrs.js';

export const LessonImage = Image.extend({
	draggable: true,

	addAttributes() {
		return {
			...this.parent?.(),
			width: {
				default: null,
				parseHTML: (element) => readLessonImageAttrs(element).width,
				renderHTML: (attributes) => (attributes.width ? { width: String(attributes.width) } : {}),
			},
			height: {
				default: null,
				parseHTML: (element) => readLessonImageAttrs(element).height,
				renderHTML: (attributes) => (attributes.height ? { height: String(attributes.height) } : {}),
			},
			alignment: {
				default: 'center',
				parseHTML: (element) => readLessonImageAttrs(element).alignment,
				renderHTML: (attributes) => ({
					'data-alignment': attributes.alignment || 'center',
				}),
			},
		};
	},

	renderHTML({ HTMLAttributes }) {
		return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, lessonImageHtmlAttributes(HTMLAttributes))];
	},

	addNodeView() {
		return ReactNodeViewRenderer(LessonImageNodeView, {
			stopEvent: ({ event }) => {
				const target = event.target;
				if (target instanceof Element && target.closest('.lesson-image-handle')) {
					return true;
				}
				return false;
			},
		});
	},
});

export default LessonImage;
