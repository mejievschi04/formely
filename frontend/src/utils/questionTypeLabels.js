/** Tipuri de întrebări pentru teste (catalog unic — nu modifica Exam). */
export const QUESTION_TYPE_CATALOG = [
  { id: 'single_choice', label: 'Răspuns unic', short: '1', autoGrade: true, icon: '○' },
  { id: 'multiple_choice', label: 'Răspuns multiplu', short: 'A/B', autoGrade: true, icon: '☑' },
  { id: 'true_false', label: 'Adevărat / Fals', short: 'T/F', autoGrade: true, icon: '✓✗' },
  { id: 'short_answer', label: 'Răspuns scurt', short: 'Txt', autoGrade: false, icon: '✎' },
  { id: 'matching', label: 'Potrivire', short: '↔', autoGrade: true, icon: '↔' },
  { id: 'ordering', label: 'Ordonare', short: '1-4', autoGrade: true, icon: '🔢' },
];

export const QUESTION_TYPE_LABELS = {
  ...Object.fromEntries(QUESTION_TYPE_CATALOG.map(({ id, label }) => [id, label])),
  essay: 'Eseu',
  fill_in_blank: 'Completare spații',
  open_ended: 'Răspuns deschis',
  text: 'Text liber',
};

export function getQuestionTypeLabel(type, fallback = 'Întrebare') {
  const key = String(type || '').trim();
  if (!key) return fallback;
  return QUESTION_TYPE_LABELS[key] || fallback;
}

export const QUESTION_TYPE_GLOSSARY =
  'Răspuns unic — elevul alege o singură variantă · Răspuns multiplu — una sau mai multe variante corecte · Răspuns scurt — text liber (corectare manuală).';

/** Teste în curs vs examene în catalog — nu modifica fluxul Exam. */
export const COURSE_TEST_VS_EXAM_HINT =
  'Testele apar în meniul cursului (module, lecții, test final). Examenele se creează în Admin → Examene și apar la elev în Cursuri → Examene — nu le amesteca.';

export const INLINE_QUESTION_TYPES = QUESTION_TYPE_CATALOG.map(({ id, label, short }) => ({
  id,
  label,
  short,
}));

export const QUESTION_TYPE_SELECT_OPTIONS = QUESTION_TYPE_CATALOG.map(({ id, label }) => ({
  value: id,
  label,
}));

export const WIZARD_QUESTION_TYPES = QUESTION_TYPE_CATALOG.map(({ id, label, icon, autoGrade }) => ({
  id,
  label,
  icon,
  autoGrade,
}));

export function isCatalogQuestionType(type) {
  return QUESTION_TYPE_CATALOG.some((entry) => entry.id === type);
}
