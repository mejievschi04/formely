import test from 'node:test';
import assert from 'node:assert/strict';
import { inferCourseStartPreferences } from '../src/utils/courseStartPreferences.js';

test('explicit course preferences are preserved instead of being replaced by defaults', () => {
	assert.deepEqual(inferCourseStartPreferences('Creează un curs în engleză pentru avansați, cu 3 module și 4 lecții per modul. Vreau lecții detaliate, teorie și practică.'), {
		language: 'en', level: 'avansat', lesson_size: 'detaliat', style: 'mixt', modules_count: 3, lessons_per_module: 4,
	});
});

test('the subject itself does not imply a different teaching language', () => {
	assert.deepEqual(inferCourseStartPreferences('Un curs despre limba engleză pentru colegii noi.'), {});
	assert.deepEqual(inferCourseStartPreferences('Un curs despre scurtcircuite și formule avansate.'), {});
});

test('Russian and English preferences can be picked up from the request', () => {
	assert.deepEqual(inferCourseStartPreferences('Курс на русском для начинающих, подробные уроки.'), { language: 'ru', level: 'incepator', lesson_size: 'detaliat' });
	assert.deepEqual(inferCourseStartPreferences('A hands-on course in English for beginners with short lessons.'), { language: 'en', level: 'incepator', lesson_size: 'scurt', style: 'practic' });
});

test('negated language preferences are not selected and later corrections take precedence', () => {
	assert.deepEqual(inferCourseStartPreferences('Nu în engleză. În română, pentru începători.'), { language: 'ro', level: 'incepator' });
	assert.deepEqual(inferCourseStartPreferences('În engleză. Corectez: în rusă.'), { language: 'ru' });
});

test('unsupported counts are preserved for visible validation instead of silently changing the request', () => {
	assert.deepEqual(inferCourseStartPreferences('Un curs cu 20 de module și 1 lecții per modul.'), { modules_count: 20, lessons_per_module: 1 });
	assert.deepEqual(inferCourseStartPreferences('Nu 4 module. Vreau 3 module.'), { modules_count: 3 });
});
