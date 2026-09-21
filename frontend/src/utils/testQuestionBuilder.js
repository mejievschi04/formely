import {
  INLINE_QUESTION_TYPES,
  isCatalogQuestionType,
} from './questionTypeLabels';

export { INLINE_QUESTION_TYPES };

export const TEST_EDITOR_DEFAULT = {
  id: null,
  title: '',
  description: '',
  type: 'final',
  status: 'draft',
  question_source: 'direct',
  time_limit_minutes: null,
  max_attempts: 1,
  passing_score: 70,
  randomize_questions: true,
  randomize_answers: true,
  show_results_immediately: true,
  show_correct_answers: true,
  show_only_submitted_answers: false,
  allow_review: true,
  requires_manual_verification: false,
};

export const normalizeInlineQuestionType = (type) => (
  isCatalogQuestionType(type) ? type : 'multiple_choice'
);

export const getDefaultAnswersByType = (rawType) => {
  const type = normalizeInlineQuestionType(rawType);
  if (type === 'short_answer') {
    return [];
  }
  if (type === 'single_choice' || type === 'multiple_choice') {
    return [{ text: 'Răspuns A', is_correct: true }, { text: 'Răspuns B', is_correct: false }];
  }
  if (type === 'true_false') {
    return [{ text: 'Adevărat', is_correct: true }, { text: 'Fals', is_correct: false }];
  }
  if (type === 'matching') {
    return [
      { left: 'Element A', right: 'Răspuns A', text: 'Element A', answer_text: 'Răspuns A', is_correct: true, order: 0 },
      { left: 'Element B', right: 'Răspuns B', text: 'Element B', answer_text: 'Răspuns B', is_correct: true, order: 1 },
    ];
  }
  if (type === 'ordering') {
    return [
      { text: 'Pasul 1', is_correct: true, order: 0 },
      { text: 'Pasul 2', is_correct: true, order: 1 },
    ];
  }
  return [];
};

export const normalizeBuilderAnswer = (a, rawType = 'multiple_choice', index = 0) => {
  const type = normalizeInlineQuestionType(rawType);
  const obj = a && typeof a === 'object' ? a : {};

  if (type === 'matching') {
    const left = obj.left ?? obj.text ?? obj.question ?? '';
    const right = obj.right ?? obj.answer_text ?? obj.content ?? '';
    return {
      ...obj,
      left: typeof left === 'string' ? left : String(left ?? ''),
      right: typeof right === 'string' ? right : String(right ?? ''),
      text: typeof left === 'string' ? left : String(left ?? ''),
      answer_text: typeof right === 'string' ? right : String(right ?? ''),
      is_correct: true,
      order: typeof obj.order === 'number' ? obj.order : index,
    };
  }

  if (type === 'ordering') {
    const text = obj.text ?? obj.answer_text ?? obj.content ?? obj.label ?? '';
    return {
      ...obj,
      text: typeof text === 'string' ? text : String(text ?? ''),
      is_correct: true,
      order: typeof obj.order === 'number' ? obj.order : index,
    };
  }

  const text = obj.text ?? obj.answer_text ?? obj.content ?? '';
  return {
    ...obj,
    text: typeof text === 'string' ? text : String(text ?? ''),
    is_correct: Boolean(obj.is_correct),
    order: typeof obj.order === 'number' ? obj.order : index,
  };
};

function keepOnlyOneCorrectAnswer(answers) {
  const firstCorrectIndex = answers.findIndex((answer) => answer.is_correct);
  const correctIndex = firstCorrectIndex >= 0 ? firstCorrectIndex : 0;
  return answers.map((answer, index) => ({ ...answer, is_correct: index === correctIndex }));
}

export { keepOnlyOneCorrectAnswer };

export const normalizeBuilderQuestion = (q) => {
  if (!q) return q;
  const rawId = q.id;
  let id = rawId;
  if (rawId != null && !(typeof rawId === 'string' && String(rawId).startsWith('temp-'))) {
    const n = Number(rawId);
    if (Number.isFinite(n)) id = n;
  }
  const type = normalizeInlineQuestionType(q.type === 'single_choice' ? 'single_choice' : q.type);
  const answers = Array.isArray(q.answers) ? q.answers.map((a, idx) => normalizeBuilderAnswer(a, type, idx)) : [];
  return {
    ...q,
    id,
    type,
    answers: type === 'single_choice' || type === 'true_false' ? keepOnlyOneCorrectAnswer(answers) : answers,
  };
};

export const serializeAnswersForQuestionApi = (rawType, answers) => {
  const type = normalizeInlineQuestionType(rawType);
  const sourceAnswers = Array.isArray(answers) ? answers : [];
  const normalizedAnswers = type === 'single_choice' || type === 'true_false'
    ? keepOnlyOneCorrectAnswer(sourceAnswers.map((answer, index) => normalizeBuilderAnswer(answer, type, index)))
    : sourceAnswers;

  return normalizedAnswers.map((a, idx) => {
    const raw = a && typeof a === 'object' ? a : {};

    if (type === 'matching') {
      const left = raw.left ?? raw.text ?? raw.question ?? '';
      const right = raw.right ?? raw.answer_text ?? raw.content ?? '';
      return {
        left: typeof left === 'string' ? left : String(left ?? ''),
        right: typeof right === 'string' ? right : String(right ?? ''),
        text: typeof left === 'string' ? left : String(left ?? ''),
        answer_text: typeof right === 'string' ? right : String(right ?? ''),
        is_correct: true,
        order: idx,
      };
    }

    if (type === 'ordering') {
      const text = raw.text ?? raw.answer_text ?? raw.content ?? raw.label ?? '';
      return {
        text: typeof text === 'string' ? text : String(text ?? ''),
        is_correct: true,
        order: idx,
      };
    }

    if (type === 'short_answer') {
      const text = raw.text ?? raw.answer_text ?? raw.content ?? '';
      return {
        text: typeof text === 'string' ? text : String(text ?? ''),
        is_correct: Boolean(raw.is_correct ?? true),
        order: typeof raw.order === 'number' ? raw.order : idx,
      };
    }

    const text = raw.text ?? raw.answer_text ?? raw.content ?? '';
    return {
      text: typeof text === 'string' ? text : String(text ?? ''),
      is_correct: Boolean(raw.is_correct),
      order: typeof raw.order === 'number' ? raw.order : idx,
    };
  });
};

/** Selectează tot textul la focus/click — util pentru câmpuri de răspuns la întrebări. */
export const selectAllTextInputHandlers = {
  onFocus: (event) => {
    const input = event.currentTarget;
    requestAnimationFrame(() => {
      input.select();
    });
  },
  onClick: (event) => {
    const input = event.currentTarget;
    requestAnimationFrame(() => {
      input.select();
    });
  },
  onMouseUp: (event) => {
    const input = event.currentTarget;
    if (
      input.value.length > 0 &&
      input.selectionStart === 0 &&
      input.selectionEnd === input.value.length
    ) {
      event.preventDefault();
    }
  },
};
