export const AI_QUESTION_TYPE_OPTIONS = [
  { id: 'multiple_choice', label: 'Răspuns multiplu' },
  { id: 'single_choice', label: 'Răspuns unic' },
  { id: 'true_false', label: 'Adevărat/Fals' },
  { id: 'matching', label: 'Potrivire' },
  { id: 'ordering', label: 'Ordonare' },
];

export const DEFAULT_AI_QUESTION_TYPES = AI_QUESTION_TYPE_OPTIONS.map((option) => option.id);

export const getAiQuestionTypeLabel = (type) => {
  const match = AI_QUESTION_TYPE_OPTIONS.find((option) => option.id === type);
  return match?.label || type || 'Întrebare';
};
