/** Tipuri cu o singură variantă selectabilă. */
const SINGLE_SELECT_TYPES = new Set(['single_choice', 'true_false', 'yes_no']);

export function getQuestionType(question) {
	return question?.type || question?.question_type || 'multiple_choice';
}

/** Răspuns multiplu = mai multe variante corecte bifabile de student. */
export function isMultiSelectChoiceQuestion(question) {
	return getQuestionType(question) === 'multiple_choice';
}

export function getChoiceTypeLabel(question) {
	if (isMultiSelectChoiceQuestion(question)) return 'Răspuns multiplu';
	if (getQuestionType(question) === 'yes_no') return 'Da / Nu';
	if (SINGLE_SELECT_TYPES.has(getQuestionType(question))) return 'Răspuns unic';
	return 'Alegere';
}

export function normalizeAnswerIndex(value) {
	if (value === null || value === undefined || value === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

export function normalizeMultiChoiceIndices(value) {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map((v) => normalizeAnswerIndex(v)).filter((v) => v !== null))].sort((a, b) => a - b);
}

export function getCorrectChoiceIndices(question) {
	if (Array.isArray(question?.correct_answer_indices) && question.correct_answer_indices.length > 0) {
		return normalizeMultiChoiceIndices(question.correct_answer_indices);
	}
	if (Array.isArray(question?.answerIndices) && question.answerIndices.length > 0) {
		return normalizeMultiChoiceIndices(question.answerIndices);
	}
	const single = normalizeAnswerIndex(question?.answerIndex ?? question?.correct_answer_index);
	return single !== null ? [single] : [];
}

export function coerceChoiceAnswerForQuestion(question, value) {
	const type = getQuestionType(question);
	// Only choice answers are option indices. Sequences and written answers are payloads.
	if (type !== 'multiple_choice' && !SINGLE_SELECT_TYPES.has(type)) return value;
	if (!isMultiSelectChoiceQuestion(question)) {
		if (Array.isArray(value)) {
			return value.length > 0 ? normalizeAnswerIndex(value[0]) : undefined;
		}
		const idx = normalizeAnswerIndex(value);
		return idx !== null ? idx : value;
	}
	if (Array.isArray(value)) return normalizeMultiChoiceIndices(value);
	const single = normalizeAnswerIndex(value);
	return single !== null ? [single] : [];
}

export function isChoiceAnswered(question, value) {
	const type = getQuestionType(question);
	if (type === 'matching' || type === 'ordering') {
		return Array.isArray(value) && value.length > 0;
	}
	if (isMultiSelectChoiceQuestion(question)) {
		return Array.isArray(value) && value.length > 0;
	}
	return value !== undefined && value !== null && value !== '';
}

export function isChoiceOptionSelected(question, value, optionIndex) {
	if (isMultiSelectChoiceQuestion(question)) {
		return Array.isArray(value) && value.includes(optionIndex);
	}
	return value === optionIndex;
}

export function toggleMultiChoiceIndex(current, optionIndex) {
	const base = normalizeMultiChoiceIndices(Array.isArray(current) ? current : []);
	const next = base.includes(optionIndex)
		? base.filter((i) => i !== optionIndex)
		: [...base, optionIndex].sort((a, b) => a - b);
	return next;
}

export function areChoiceAnswersEqual(question, userValue, correctIndices) {
	const expected = normalizeMultiChoiceIndices(correctIndices);
	if (isMultiSelectChoiceQuestion(question)) {
		const selected = normalizeMultiChoiceIndices(userValue);
		return expected.length > 0 && selected.length === expected.length && selected.every((v, i) => v === expected[i]);
	}
	const userIndex = normalizeAnswerIndex(
		Array.isArray(userValue) ? userValue[0] : userValue
	);
	return userIndex !== null && expected.length > 0 && userIndex === expected[0];
}
