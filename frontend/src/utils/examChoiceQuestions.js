/** Tipuri cu o singură variantă selectabilă. */
import { getQuestionTypeLabel } from './questionTypeLabels';

export function getQuestionType(question) {
	return question?.type || question?.question_type || 'multiple_choice';
}

/** Tipuri cu răspuns text liber (evaluare manuală). */
const TEXT_ANSWER_TYPES = new Set(['short_answer', 'essay', 'fill_in_blank']);

export function isTextAnswerQuestion(question) {
	return TEXT_ANSWER_TYPES.has(getQuestionType(question));
}

/** Răspuns multiplu = mai multe variante corecte bifabile de student. */
export function isMultiSelectChoiceQuestion(question) {
	return getQuestionType(question) === 'multiple_choice';
}

export function getChoiceTypeLabel(question) {
	const type = getQuestionType(question);
	if (isTextAnswerQuestion(question)) {
		return getQuestionTypeLabel(type, 'Răspuns scurt');
	}
	return getQuestionTypeLabel(type, 'Alegere');
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
	if (Array.isArray(question?.correct_answer_display_indices) && question.correct_answer_display_indices.length > 0) {
		return normalizeMultiChoiceIndices(question.correct_answer_display_indices);
	}
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
	if (!isMultiSelectChoiceQuestion(question)) {
		if (Array.isArray(value)) {
			return value.length > 0 ? normalizeAnswerIndex(value[0]) : undefined;
		}
		const idx = normalizeAnswerIndex(value);
		return idx !== null ? idx : value;
	}
	if (Array.isArray(question?.user_answer_display_indices) && question.user_answer_display_indices.length > 0) {
		return normalizeMultiChoiceIndices(question.user_answer_display_indices);
	}
	if (Array.isArray(value)) return normalizeMultiChoiceIndices(value);
	const single = normalizeAnswerIndex(value);
	return single !== null ? [single] : [];
}

/** Indici în ordinea afișată (după submit / rezultate). */
export function getUserChoiceDisplayIndices(question, value) {
	if (Array.isArray(question?.user_answer_display_indices) && question.user_answer_display_indices.length > 0) {
		return normalizeMultiChoiceIndices(question.user_answer_display_indices);
	}
	if (Array.isArray(question?.user_answer_indices) && question.user_answer_indices.length > 0) {
		return normalizeMultiChoiceIndices(question.user_answer_indices);
	}
	if (!isMultiSelectChoiceQuestion(question)) {
		const displayIdx = normalizeAnswerIndex(question?.user_answer_index);
		if (displayIdx !== null) return [displayIdx];
	}
	if (value !== undefined && value !== null) {
		return coerceChoiceAnswerForQuestion(question, value);
	}
	return [];
}

export function getUserChoiceDisplayLabels(question, displayIndices) {
	if (Array.isArray(question?.user_answer_labels) && question.user_answer_labels.length > 0) {
		return question.user_answer_labels.map((label) => String(label)).filter(Boolean);
	}
	const indices = displayIndices ?? getUserChoiceDisplayIndices(question);
	if (!Array.isArray(question?.options) || question.options.length === 0) {
		return [];
	}
	return indices.map((i) => question.options[i]).filter((label) => label != null && String(label).trim() !== '');
}

export function isChoiceAnswered(question, value) {
	const type = getQuestionType(question);
	if (type === 'matching' || type === 'ordering') {
		return Array.isArray(value) && value.length > 0;
	}
	if (isTextAnswerQuestion(question)) {
		return typeof value === 'string' && value.trim() !== '';
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
