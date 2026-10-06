export const TEST_EDITOR_DEFAULT = {
  id: null,
  title: '',
  description: '',
  type: 'final',
  status: 'draft',
  question_source: 'direct',
  time_limit_minutes: null,
  max_attempts: null,
  passing_score: 70,
  randomize_questions: true,
  randomize_answers: true,
  show_results_immediately: true,
  show_correct_answers: false,
  show_only_submitted_answers: true,
  allow_review: true,
  requires_manual_verification: false,
};

export const INLINE_QUESTION_TYPES = [
  { id: 'multiple_choice', label: 'Răspuns multiplu', short: 'A/B', hint: 'Cursantul bifează toate variantele corecte.' },
  { id: 'single_choice', label: 'Răspuns unic', short: '1', hint: 'Cursantul alege o singură variantă corectă.' },
  { id: 'true_false', label: 'Adevărat / Fals', short: 'T/F', hint: 'Cursantul spune dacă afirmația e adevărată.' },
  { id: 'yes_no', label: 'Da / Nu', short: 'Da', hint: 'Cursantul răspunde cu da sau nu.' },
  { id: 'matching', label: 'Potrivire', short: '<->', hint: 'Cursantul leagă fiecare element de perechea lui.' },
  { id: 'ordering', label: 'Ordonare', short: '1-4', hint: 'Cursantul aranjează pașii în ordinea corectă.' },
];

export const isBinaryQuestionType = (type) => type === 'true_false' || type === 'yes_no';

export const yesNoAnswers = (answers) => {
  const list = Array.isArray(answers) ? answers : [];
  const correct = list.find((answer) => answer?.is_correct);
  const correctText = String(correct?.text ?? correct?.answer_text ?? '').trim().toLowerCase();
  const noIsCorrect = ['nu', 'no', 'fals', 'false'].includes(correctText);
  return [
    { text: 'Da', is_correct: !noIsCorrect },
    { text: 'Nu', is_correct: noIsCorrect },
  ];
};

export const normalizeInlineQuestionType = (type) => {
  return INLINE_QUESTION_TYPES.some((t) => t.id === type) ? type : 'multiple_choice';
};

export const getDefaultAnswersByType = (rawType) => {
  const type = normalizeInlineQuestionType(rawType);
  if (type === 'multiple_choice' || type === 'single_choice') {
    return [{ text: 'Răspuns A', is_correct: true }, { text: 'Răspuns B', is_correct: false }];
  }
  if (type === 'true_false') {
    return [{ text: 'Adevărat', is_correct: true }, { text: 'Fals', is_correct: false }];
  }
  if (type === 'yes_no') {
    return yesNoAnswers([]);
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

export const normalizeBuilderQuestion = (q) => {
  if (!q) return q;
  const rawId = q.id;
  let id = rawId;
  if (rawId != null && !(typeof rawId === 'string' && String(rawId).startsWith('temp-'))) {
    const n = Number(rawId);
    if (Number.isFinite(n)) id = n;
  }
  const type = normalizeInlineQuestionType(q.type);
  const answers = Array.isArray(q.answers) ? q.answers.map((a, idx) => normalizeBuilderAnswer(a, type, idx)) : [];
  return {
    ...q,
    id,
    type,
    answers: type === 'yes_no'
      ? yesNoAnswers(answers)
      : (type === 'single_choice' || type === 'true_false' ? keepOnlyOneCorrectAnswer(answers) : answers),
  };
};

export const serializeAnswersForQuestionApi = (rawType, answers) => {
  const type = normalizeInlineQuestionType(rawType);
  const sourceAnswers = Array.isArray(answers) ? answers : [];
  const normalizedAnswers = type === 'yes_no'
    ? yesNoAnswers(sourceAnswers)
    : (type === 'single_choice' || type === 'true_false'
      ? keepOnlyOneCorrectAnswer(sourceAnswers.map((answer, index) => normalizeBuilderAnswer(answer, type, index)))
      : sourceAnswers);

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

    const text = raw.text ?? raw.answer_text ?? raw.content ?? '';
    return {
      text: typeof text === 'string' ? text : String(text ?? ''),
      is_correct: Boolean(raw.is_correct),
      order: typeof raw.order === 'number' ? raw.order : idx,
    };
  });
};

/** Mod afișare răspunsuri după test — mutual exclusive */
export const TEST_RESULTS_DISPLAY_OPTIONS = [
  {
    id: 'correct',
    label: 'Arată răspunsurile corecte',
    hint: 'După finalizare se pot vedea răspunsurile corecte.',
  },
  {
    id: 'submitted',
    label: 'Doar răspunsurile oferite',
    hint: 'La final se văd doar răspunsurile cursantului, colorate verde dacă sunt corecte și roșu dacă sunt greșite.',
  },
  {
    id: 'none',
    label: 'Fără detaliu răspunsuri',
    hint: 'Nu se afișează nici răspunsurile corecte, nici compararea cu răspunsurile oferite.',
  },
];

export function getTestResultsDisplayMode(test) {
  if (test?.show_only_submitted_answers) return 'submitted';
  if (test?.show_correct_answers) return 'correct';
  return 'none';
}

export function patchTestResultsDisplayMode(mode) {
  return {
    show_correct_answers: mode === 'correct',
    show_only_submitted_answers: mode === 'submitted',
  };
}

export function patchExamResultsDisplayMode(mode) {
  return {
    showCorrectAnswers: mode === 'correct',
    showOnlySubmittedAnswers: mode === 'submitted',
  };
}

export function getExamResultsDisplayMode(settings) {
  if (settings?.showOnlySubmittedAnswers) return 'submitted';
  if (settings?.showCorrectAnswers) return 'correct';
  return 'none';
}
