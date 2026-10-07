import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLessonVideo } from '../src/components/admin/lessons/video/lessonVideoSource.js';

test('YouTube links become an embedded player, whatever form the link has', () => {
	const expected = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0';
	for (const link of [
		'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		'https://youtu.be/dQw4w9WgXcQ',
		'https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
		'https://www.youtube.com/shorts/dQw4w9WgXcQ',
		'https://www.youtube.com/embed/dQw4w9WgXcQ',
	]) {
		assert.deepEqual(resolveLessonVideo(link), { kind: 'iframe', provider: 'youtube', src: expected }, link);
	}
	assert.equal(resolveLessonVideo('https://youtu.be/dQw4w9WgXcQ?t=1m30s').src, `${expected}&start=90`);
});

test('Vimeo, Loom and Google Drive links play inside the lesson', () => {
	assert.equal(resolveLessonVideo('https://vimeo.com/76979871').src, 'https://player.vimeo.com/video/76979871');
	assert.equal(resolveLessonVideo('https://vimeo.com/76979871/abc123ef').src, 'https://player.vimeo.com/video/76979871?h=abc123ef');
	assert.equal(resolveLessonVideo('https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184').src, 'https://www.loom.com/embed/0281766fa2d04bb788eaf19e65135184');
	assert.equal(resolveLessonVideo('https://drive.google.com/file/d/1AbC_dEf-123/view?usp=sharing').src, 'https://drive.google.com/file/d/1AbC_dEf-123/preview');
});

test('a direct video file plays in the native player', () => {
	assert.deepEqual(resolveLessonVideo('https://cdn.example.com/curs/lectia-1.mp4?token=x'), {
		kind: 'video',
		provider: 'file',
		src: 'https://cdn.example.com/curs/lectia-1.mp4?token=x',
	});
});

test('links that cannot be played inside the lesson are refused', () => {
	for (const link of ['', 'nu e un link', 'javascript:alert(1)', 'https://example.com/pagina', 'https://www.youtube.com/watch', 'ftp://cdn.example.com/a.mp4']) {
		assert.equal(resolveLessonVideo(link), null, link);
	}
});
