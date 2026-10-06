import test from 'node:test';
import assert from 'node:assert/strict';
import { groupPublishIssues, parsePublishIssue } from '../src/utils/publishCourseIssues.js';

test('parsePublishIssue maps lesson, test and module paths', () => {
	assert.equal(parsePublishIssue({ path: 'lessons.12.content', message: 'Lecție goală' }).kind, 'lesson');
	assert.equal(parsePublishIssue({ path: 'lessons.12.content', message: 'Lecție goală' }).id, 12);
	assert.equal(parsePublishIssue({ path: 'course_tests.9', message: 'Fără întrebări' }).kind, 'test');
	assert.equal(parsePublishIssue({ path: 'modules.3.lessons', message: 'Modul gol' }).kind, 'module');
	assert.equal(parsePublishIssue({ path: 'course.title', message: 'Titlu' }).kind, 'course');
});

test('groupPublishIssues keeps all errors grouped', () => {
	const groups = groupPublishIssues([
		{ path: 'lessons.1.content', message: 'A' },
		{ path: 'lessons.2.content', message: 'B' },
		{ path: 'course_tests.4', message: 'C' },
		{ path: 'course.title', message: 'D' },
	]);
	assert.equal(groups.length, 3);
	assert.equal(groups[0].items.length, 2);
	assert.equal(groups[1].key, 'tests');
	assert.equal(groups.find((g) => g.key === 'course').items.length, 1);
});
