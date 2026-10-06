import test from 'node:test';
import assert from 'node:assert/strict';
import {
	lessonImageHtmlAttributes,
	nextLessonImageWidth,
	readLessonImageAttrs,
} from '../src/components/admin/lessons/image/lessonImageAttrs.js';

function elementFrom({ width = null, height = null, alignment = null, style = '' }) {
	const declarations = Object.fromEntries(
		style.split(';').filter(Boolean).map((part) => {
			const [name, value] = part.split(':');
			return [name.trim(), value.trim()];
		}),
	);
	return {
		getAttribute(name) {
			if (name === 'width') return width;
			if (name === 'height') return height;
			if (name === 'data-alignment') return alignment;
			return null;
		},
		style: {
			width: declarations.width || '',
			height: declarations.height || '',
			marginLeft: declarations['margin-left'] || '',
			marginRight: declarations['margin-right'] || '',
		},
	};
}

test('old images without size or alignment stay centered and unsized', () => {
	assert.deepEqual(readLessonImageAttrs(elementFrom({})), {
		alignment: 'center',
		width: null,
		height: null,
	});
});

test('saved width, height and alignment round-trip through html attributes', () => {
	const html = lessonImageHtmlAttributes({ width: 420, height: 280, alignment: 'right' });
	assert.equal(html.width, '420');
	assert.equal(html.height, '280');
	assert.equal(html['data-alignment'], 'right');
	assert.match(html.style, /width:420px/);
	assert.match(html.style, /max-width:100%/);
	assert.match(html.style, /height:auto/);
	assert.match(html.style, /margin-left:auto/);

	const restored = readLessonImageAttrs(elementFrom({
		width: html.width,
		height: html.height,
		alignment: html['data-alignment'],
		style: html.style,
	}));
	assert.equal(restored.width, 420);
	assert.equal(restored.height, 280);
	assert.equal(restored.alignment, 'right');
});

test('corner and side resize keep a positive size inside the editor', () => {
	assert.equal(nextLessonImageWidth({ startWidth: 200, dx: 40, dy: 0, direction: 'se', ratio: 0.5, max: 500 }), 240);
	assert.equal(nextLessonImageWidth({ startWidth: 200, dx: -30, dy: 0, direction: 'nw', ratio: 0.5, max: 500 }), 230);
	assert.equal(nextLessonImageWidth({ startWidth: 200, dx: -500, dy: 0, direction: 'e', ratio: 0.5, max: 500 }), 80);
	assert.equal(nextLessonImageWidth({ startWidth: 200, dx: 900, dy: 0, direction: 'e', ratio: 0.5, max: 360 }), 360);
	assert.equal(nextLessonImageWidth({ startWidth: 200, dx: 0, dy: 50, direction: 's', ratio: 0.5, max: 500 }), 300);
});
