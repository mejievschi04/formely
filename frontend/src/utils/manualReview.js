/** Aliniat cu logica din ExamController (auto-gradable). */
import { getQuestionTypeLabel, QUESTION_TYPE_LABELS } from './questionTypeLabels';

export const AUTO_GRADABLE_QUESTION_TYPES = [
	'multiple_choice',
	'single_choice',
	'true_false',
	'matching',
	'ordering',
];

export function getQuestionType(question) {
	return String(question?.question_type || question?.type || 'multiple_choice');
}

export function isManualReviewQuestion(question) {
	return !AUTO_GRADABLE_QUESTION_TYPES.includes(getQuestionType(question));
}

export function getManualQuestions(questions) {
	return (Array.isArray(questions) ? questions : []).filter(isManualReviewQuestion);
}

export function testRequiresApprovalOnly(result, manualQuestions) {
	if ((manualQuestions?.length ?? 0) > 0) return false;
	return Boolean(result?.test?.requires_manual_verification);
}

export const MANUAL_QUESTION_TYPE_LABELS = {
	...QUESTION_TYPE_LABELS,
};

export function manualQuestionTypeLabel(type) {
	return getQuestionTypeLabel(type, type);
}
