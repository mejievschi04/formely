import { adminService } from '../services/api';

export const VOLT_BUILDER_REFRESH_EVENT = 'volta:builder-refresh';
export const VOLT_TEST_REFRESH_EVENT = 'volta:test-refresh';

export function summarizeVoltPlanOperations(plan) {
	const operations = Array.isArray(plan?.operations) ? plan.operations : [];
	const counts = { create: 0, update: 0, delete: 0 };
	const lines = operations.map((op) => {
		const opType = String(op?.op || '').trim();
		const title = String(op?.title || op?.name || '').trim();
		if (/delete/i.test(opType)) counts.delete += 1;
		else if (/create/i.test(opType)) counts.create += 1;
		else counts.update += 1;
		const label = opType.replace(/_/g, ' ') || 'modificare';
		return title ? `${label}: ${title}` : label;
	});
	return { counts, lines, total: operations.length };
}

export async function applyVoltCoursePlan(courseId, planPayload) {
	const plan = planPayload?.plan ?? planPayload;
	const result = await adminService.builderApplyAiPlan(courseId, plan);
	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent(VOLT_BUILDER_REFRESH_EVENT, { detail: { courseId: Number(courseId) } }));
	}
	return result;
}
