import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultAnswersByType,
  normalizeBuilderQuestion,
  serializeAnswersForQuestionApi,
} from '../src/utils/testQuestionBuilder.js';

test('yes/no questions keep Da and Nu with a single correct answer', () => {
  assert.deepEqual(getDefaultAnswersByType('yes_no'), [
    { text: 'Da', is_correct: true },
    { text: 'Nu', is_correct: false },
  ]);

  const question = normalizeBuilderQuestion({
    id: 4,
    type: 'yes_no',
    answers: [
      { text: 'Da', is_correct: false },
      { text: 'Nu', is_correct: true },
    ],
  });

  assert.equal(question.type, 'yes_no');
  assert.deepEqual(question.answers, [
    { text: 'Da', is_correct: false },
    { text: 'Nu', is_correct: true },
  ]);
  assert.deepEqual(serializeAnswersForQuestionApi('yes_no', question.answers), [
    { text: 'Da', is_correct: false, order: 0 },
    { text: 'Nu', is_correct: true, order: 1 },
  ]);
});
