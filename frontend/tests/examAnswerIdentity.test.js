import test from 'node:test';
import assert from 'node:assert/strict';
import { coerceChoiceAnswerForQuestion } from '../src/utils/examChoiceQuestions.js';

test('restoring ordering and matching answers preserves every selected item', () => {
    for (const type of ['ordering', 'matching']) {
        const answer = ['right-3', 'right-1', 'right-2'];
        assert.deepEqual(coerceChoiceAnswerForQuestion({ type }, answer), answer);
    }
});

test('restoring a written numeric answer preserves its exact text', () => {
    assert.equal(coerceChoiceAnswerForQuestion({ type: 'essay' }, '007'), '007');
});

test('choice normalization still preserves the first option and multiple selections', () => {
    assert.equal(coerceChoiceAnswerForQuestion({ type: 'single_choice' }, '0'), 0);
    assert.deepEqual(coerceChoiceAnswerForQuestion({ type: 'multiple_choice' }, ['2', '0']), [0, 2]);
});
