import { useCallback, useEffect, useMemo, useRef } from 'react';
import { telemetryService } from '../services/api';

const ANSWER_DEBOUNCE_MS = 4000;

function parsePositiveInt(value) {
	const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
	return Number.isFinite(n) && n > 0 ? n : null;
}

function countAnswered(answers) {
	if (!answers || typeof answers !== 'object') return 0;
	return Object.values(answers).filter((v) => v !== null && v !== undefined && v !== '').length;
}

/**
 * Telemetrie pentru încercări la test/examen (ActivityLog: telemetry.learner_*).
 */
export function useTestAttemptTelemetry({
	enabled = true,
	userId,
	entityId,
	courseId = null,
	testId = null,
	modelType = 'exam',
}) {
	const modelId = parsePositiveInt(entityId);
	const startedRef = useRef(false);
	const resultViewedRef = useRef(false);
	const attemptSessionRef = useRef(null);
	const answerTimerRef = useRef(null);

	const basePayload = useCallback(
		() => ({
			course_id: parsePositiveInt(courseId),
			test_id: parsePositiveInt(testId),
			exam_id: modelType === 'exam' ? modelId : null,
			attempt_session: attemptSessionRef.current,
		}),
		[courseId, testId, modelId, modelType]
	);

	const resetSession = useCallback(() => {
		startedRef.current = false;
		resultViewedRef.current = false;
		attemptSessionRef.current = null;
		if (answerTimerRef.current) {
			clearTimeout(answerTimerRef.current);
			answerTimerRef.current = null;
		}
	}, []);

	const trackStarted = useCallback(
		async (extra = {}) => {
			if (!enabled || !userId || !modelId || startedRef.current) return;
			startedRef.current = true;
			attemptSessionRef.current = Date.now();
			await telemetryService.track(
				'learner_attempt_started',
				{ ...basePayload(), ...extra },
				modelType,
				modelId
			);
		},
		[enabled, userId, modelId, basePayload, modelType]
	);

	const trackAnswerSaved = useCallback(
		(answers, questionCount = 0) => {
			if (!enabled || !userId || !modelId || !startedRef.current) return;

			if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
			answerTimerRef.current = setTimeout(() => {
				telemetryService.track(
					'learner_answer_saved',
					{
						...basePayload(),
						answered_count: countAnswered(answers),
						question_count: questionCount,
					},
					modelType,
					modelId
				);
			}, ANSWER_DEBOUNCE_MS);
		},
		[enabled, userId, modelId, basePayload, modelType]
	);

	const trackSubmitted = useCallback(
		async (result = {}) => {
			if (!enabled || !userId || !modelId) return;
			if (answerTimerRef.current) {
				clearTimeout(answerTimerRef.current);
				answerTimerRef.current = null;
			}
			await telemetryService.track(
				'learner_attempt_submitted',
				{
					...basePayload(),
					passed: Boolean(result.passed),
					percentage: result.percentage ?? result.percent ?? null,
					score: result.score ?? null,
					max_score: result.max_score ?? result.total_points ?? null,
					attempt_number: result.attempt_number ?? null,
				},
				modelType,
				modelId
			);
		},
		[enabled, userId, modelId, basePayload, modelType]
	);

	const trackResultViewed = useCallback(
		async (result = {}) => {
			if (!enabled || !userId || !modelId || resultViewedRef.current) return;
			resultViewedRef.current = true;
			await telemetryService.track(
				'learner_result_viewed',
				{
					...basePayload(),
					passed: Boolean(result.passed),
					percentage: result.percentage ?? result.percent ?? null,
				},
				modelType,
				modelId
			);
		},
		[enabled, userId, modelId, basePayload, modelType]
	);

	const trackRetakeStarted = useCallback(
		async (extra = {}) => {
			if (!enabled || !userId || !modelId) return;
			resetSession();
			await telemetryService.track(
				'learner_retake_weak_areas_started',
				{ ...basePayload(), ...extra },
				modelType,
				modelId
			);
			await trackStarted(extra);
		},
		[enabled, userId, modelId, basePayload, modelType, resetSession, trackStarted]
	);

	useEffect(
		() => () => {
			if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
		},
		[]
	);

	return useMemo(
		() => ({
			trackStarted,
			trackAnswerSaved,
			trackSubmitted,
			trackResultViewed,
			trackRetakeStarted,
			resetSession,
		}),
		[trackStarted, trackAnswerSaved, trackSubmitted, trackResultViewed, trackRetakeStarted, resetSession]
	);
}
