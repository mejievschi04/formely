import test from 'node:test';
import assert from 'node:assert/strict';
import { detectVoltWorkspaceIntent } from '../src/utils/detectVoltWorkspaceIntent.js';

test('Volt workspace intent: analytics stay in answer mode', () => {
	assert.equal(
		detectVoltWorkspaceIntent('Câți elevi sunt în risc săptămâna asta?'),
		'answer'
	);
});

test('Volt workspace intent: create course, map and test', () => {
	assert.equal(detectVoltWorkspaceIntent('Creează un curs de Python pentru începători'), 'create_course');
	assert.equal(detectVoltWorkspaceIntent('Generează o mapă de onboarding'), 'map');
	assert.equal(detectVoltWorkspaceIntent('Creează un test cu 5 întrebări de recapitulare'), 'test');
});

test('Volt workspace intent: builder context edits the open course', () => {
	assert.equal(
		detectVoltWorkspaceIntent('Adaugă o lecție despre variabile', {
			courseId: 12,
			pathname: '/admin/courses/12/builder',
		}),
		'edit_course'
	);
	assert.equal(
		detectVoltWorkspaceIntent('Completează lecția selectată', {
			courseId: 12,
			pathname: '/admin/courses/12/builder',
		}),
		'edit_course'
	);
});

test('Volt workspace intent: examene are not treated as tests unless creating', () => {
	assert.equal(detectVoltWorkspaceIntent('Câți elevi au dat examenul?'), 'answer');
});

test('Volt workspace intent: open test and map pages edit the current item', () => {
	assert.equal(
		detectVoltWorkspaceIntent('Adaugă 3 întrebări de recapitulare', {
			testId: 9,
			page: 'test_builder',
			pathname: '/admin/tests/9/builder',
		}),
		'edit_test'
	);
	assert.equal(
		detectVoltWorkspaceIntent('Redenumește mapa în Onboarding', {
			mapId: 4,
			page: 'map',
			pathname: '/admin/maps/4',
		}),
		'edit_map'
	);
});