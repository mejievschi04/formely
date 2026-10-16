import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCourseCreationPromptFromBrief } from '../src/utils/voltAiPrompts.js';

test('course brief preserves requested style and asks for developed lessons without repetitive introductions', () => {
	const prompt = buildCourseCreationPromptFromBrief({
		topic: 'Circuite electrice', target_audience: 'Elevi', level: 'incepator',
		style: 'teoretic', lesson_size: 'detaliat', modules_count: 2, lessons_per_module: 3,
	}, 'Explică relațiile dintre concepte.');
	assert.match(prompt, /Stil: teoretic; Dimensiune lecții: detaliat/);
	assert.match(prompt, /2 module, 3 lecții per modul/);
	assert.match(prompt, /explicații dezvoltate/);
	assert.match(prompt, /fără introducere și recapitulare standard/);
	assert.doesNotMatch(prompt, /introducere, explicație, exemplu, exercițiu/);
	assert.doesNotMatch(prompt, /Păstrează tonul practic/);
	assert.match(prompt, /Explică relațiile dintre concepte/);
});

test('free-form requests remain intact when no structured brief is provided', () => {
	assert.equal(buildCourseCreationPromptFromBrief(null, '  Dezvoltă exemplul din lecție.  '), 'Dezvoltă exemplul din lecție.');
});
