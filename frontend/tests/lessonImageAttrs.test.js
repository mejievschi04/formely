import test from 'node:test';
import assert from 'node:assert/strict';
import {
	lessonImageHtmlAttributes,
	lessonImageWidthForLayout,
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

test('an image with text beside it floats on its side and leaves room for the text', () => {
	const left = lessonImageHtmlAttributes({ alignment: 'wrap-left', width: 320, height: 240 });
	assert.equal(left['data-alignment'], 'wrap-left');
	assert.match(left.style, /float:left/);
	assert.match(left.style, /width:320px/);
	assert.match(left.style, /max-width:60%/);
	assert.match(left.style, /margin:0\.25em 1\.25em 0\.75em 0/);

	const right = lessonImageHtmlAttributes({ alignment: 'wrap-right' });
	assert.match(right.style, /float:right/);
	assert.match(right.style, /width:40%/, 'without a saved width the image takes 40% of the text');
	assert.doesNotMatch(right.style, /margin-left:auto/);

	assert.equal(readLessonImageAttrs(elementFrom({ alignment: 'wrap-right', width: '320' })).alignment, 'wrap-right');
});

test('images placed on their own line do not float', () => {
	for (const alignment of ['left', 'center', 'right', 'full']) {
		assert.doesNotMatch(lessonImageHtmlAttributes({ alignment, width: 300 }).style, /float/, alignment);
	}
});

test('changing the layout keeps the size the image has on screen', () => {
	// imagine fără lățime salvată, afișată la 312px (ex. 40% cu text pe lângă) → rămâne 312px centrată
	assert.equal(lessonImageWidthForLayout({ alignment: 'wrap-left', savedWidth: null, displayedWidth: 312.4 }), 312);
	// imagine redimensionată la 280px → rămâne 280px, chiar dacă pe telefon era afișată mai mică (limita de 60%)
	assert.equal(lessonImageWidthForLayout({ alignment: 'wrap-left', savedWidth: 280, displayedWidth: 194 }), 280);
	// din „full” revine la lățimea pe care o avea înainte, nu la toată lățimea textului
	assert.equal(lessonImageWidthForLayout({ alignment: 'full', savedWidth: 280, displayedWidth: 760 }), 280);
	// lățimea rămâne salvată și la „full”, ca să poată reveni la ea
	assert.equal(lessonImageHtmlAttributes({ alignment: 'full', width: 280 }).width, '280');
});
