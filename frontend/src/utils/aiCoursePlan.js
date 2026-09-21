import { adminService } from '../services/api';

export const AI_BUILDER_REFRESH_EVENT = 'formely:builder-refresh';
export const AI_TEST_REFRESH_EVENT = 'formely:test-refresh';

export function summarizeAiPlanOperations(plan) {
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

export function getLessonContentFromPlanItem(lessonItem) {
	if (!lessonItem || typeof lessonItem !== 'object') return '';
	return String(lessonItem.content ?? lessonItem.body ?? lessonItem.html ?? '').trim();
}

export function countLessonContentLines(content) {
	const text = String(content ?? '').trim();
	if (!text) return 0;
	const normalized = text
		.replace(/<br\s*\/?>(?![^<]*>)/gi, '\n')
		.replace(/<br\s*\/?/gi, '\n')
		.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n');
	const plain = normalized.replace(/<[^>]*>/g, ' ');
	return plain
		.split(/\n+/)
		.map((line) => line.trim())
		.filter(Boolean).length;
}

export function validateAiPlanStructure(plan) {
	if (!plan || typeof plan !== 'object') {
		return { valid: false, message: 'Formely AI nu a returnat un plan valid.' };
	}

	const operations = Array.isArray(plan.operations) ? plan.operations : [];
	const courseUpdates = plan.course_updates && typeof plan.course_updates === 'object' ? plan.course_updates : null;
	if (!courseUpdates && operations.length === 0) {
		return { valid: false, message: 'Planul Formely AI nu conține schimbări aplicabile.' };
	}

	const lessonOperations = operations.filter((op) => {
		if (!op || typeof op !== 'object') return false;
		const opType = String(op.op || '').trim();
		return ['create_lesson', 'createLesson', 'update_lesson', 'updateLesson'].includes(opType);
	});

	for (const lessonOp of lessonOperations) {
		const opType = String(lessonOp.op || '').trim();
		const content = getLessonContentFromPlanItem(lessonOp);
		const lineCount = countLessonContentLines(content);
		if ((opType === 'create_lesson' || opType === 'createLesson') && (!content || lineCount < 4)) {
			return { valid: false, message: `Lecția "${lessonOp.title || 'fără titlu'}" nu are conținut suficient.` };
		}
		if ((opType === 'update_lesson' || opType === 'updateLesson') && content && lineCount < 4) {
			return { valid: false, message: `Lecția "${lessonOp.title || 'fără titlu'}" are conținut prea scurt.` };
		}
	}

	const createModuleWithoutLessons = operations.some((op) => {
		if (!op || typeof op !== 'object') return false;
		const opType = String(op.op || '').trim();
		if (opType !== 'create_module' && opType !== 'createModule') return false;
		const nestedLessons = Array.isArray(op.lessons) ? op.lessons : [];
		return nestedLessons.length === 0 && lessonOperations.length === 0;
	});

	if (createModuleWithoutLessons) {
		return {
			valid: false,
			message: 'Planul Formely AI creează un modul nou fără lecții. Cere-i lui Formely AI să includă conținut pentru modul.',
		};
	}

	return { valid: true, operations, courseUpdates };
}

const ALLOWED_COURSE_KEYS = [
	'title',
	'description',
	'short_description',
	'card_color',
	'level',
	'status',
	'visibility',
	'estimated_duration_hours',
	'sequential_unlock',
	'min_test_score',
	'has_certificate',
	'marketing_tags',
];

async function applyLessonsForModule(courseIdValue, moduleIdValue, lessons = []) {
	if (!Number.isFinite(Number(moduleIdValue)) || !Array.isArray(lessons) || lessons.length === 0) {
		return 0;
	}
	let createdCount = 0;
	for (const lessonItem of lessons) {
		if (!lessonItem || typeof lessonItem !== 'object') continue;
		const lessonContent = getLessonContentFromPlanItem(lessonItem);
		if (!lessonContent) {
			throw new Error(`Lecția "${lessonItem.title || 'fără titlu'}" nu are conținut.`);
		}
		if (countLessonContentLines(lessonContent) < 4) {
			throw new Error(`Lecția "${lessonItem.title || 'fără titlu'}" are conținut prea scurt.`);
		}
		await adminService.builderCreateLesson(courseIdValue, {
			module_id: Number(moduleIdValue),
			title: lessonItem.title || 'Lecție nouă',
			content: lessonContent,
			status: lessonItem.status || 'draft',
			order: lessonItem.order ?? undefined,
			is_preview: lessonItem.is_preview ?? undefined,
		});
		createdCount += 1;
	}
	return createdCount;
}

export async function applyAiCoursePlan(courseId, planPayload) {
	const plan = planPayload?.plan ?? planPayload;
	const validation = validateAiPlanStructure(plan);
	if (!validation.valid) {
		throw new Error(validation.message);
	}

	const { operations, courseUpdates } = validation;
	const filteredCourseUpdates = courseUpdates
		? Object.fromEntries(
			Object.entries(courseUpdates).filter(([key, value]) => ALLOWED_COURSE_KEYS.includes(key) && value !== undefined)
		)
		: null;

	if (filteredCourseUpdates && Object.keys(filteredCourseUpdates).length > 0) {
		await adminService.updateCourse(courseId, filteredCourseUpdates);
	}

	const structureOps = [];
	let appliedSteps = 0;

	for (const rawOp of operations) {
		if (!rawOp || typeof rawOp !== 'object') continue;
		const opType = String(rawOp.op || '').trim();

		if (opType === 'create_module' || opType === 'createModule') {
			const createdModuleResponse = await adminService.builderCreateModule(courseId, {
				title: rawOp.title || 'Modul nou',
				description: rawOp.description || '',
				status: rawOp.status || 'draft',
				order: rawOp.order ?? undefined,
			});
			const createdModule = createdModuleResponse?.module
				|| createdModuleResponse?.data?.module
				|| createdModuleResponse?.data
				|| createdModuleResponse;
			const createdModuleId = Number(createdModule?.id || createdModule?.module_id || createdModuleResponse?.id);
			appliedSteps += 1;
			if (Number.isFinite(createdModuleId) && Array.isArray(rawOp.lessons)) {
				for (const lessonItem of rawOp.lessons) {
					if (!lessonItem || typeof lessonItem !== 'object') continue;
					const lessonContent = getLessonContentFromPlanItem(lessonItem);
					if (!lessonContent) {
						throw new Error(`Lecția "${lessonItem.title || 'fără titlu'}" nu are conținut.`);
					}
					if (countLessonContentLines(lessonContent) < 4) {
						throw new Error(`Lecția "${lessonItem.title || 'fără titlu'}" are conținut prea scurt.`);
					}
					await adminService.builderCreateLesson(courseId, {
						module_id: createdModuleId,
						title: lessonItem.title || 'Lecție nouă',
						content: lessonContent,
						status: lessonItem.status || 'draft',
						order: lessonItem.order ?? undefined,
						is_preview: lessonItem.is_preview ?? undefined,
					});
					appliedSteps += 1;
				}
			}
			continue;
		}

		if (opType === 'update_module' || opType === 'updateModule') {
			if (!rawOp.module_id) continue;
			const payload = {};
			if (rawOp.title !== undefined) payload.title = rawOp.title;
			if (rawOp.description !== undefined) payload.description = rawOp.description;
			if (rawOp.status !== undefined) payload.status = rawOp.status;
			if (rawOp.order !== undefined) payload.order = rawOp.order;
			if (Object.keys(payload).length > 0) {
				await adminService.updateModule(rawOp.module_id, payload);
				appliedSteps += 1;
			}
			if (Array.isArray(rawOp.lessons) && rawOp.lessons.length > 0) {
				appliedSteps += await applyLessonsForModule(courseId, rawOp.module_id, rawOp.lessons);
			}
			continue;
		}

		if (opType === 'delete_module' || opType === 'deleteModule') {
			if (!rawOp.module_id) continue;
			await adminService.deleteModule(rawOp.module_id);
			appliedSteps += 1;
			continue;
		}

		if (opType === 'create_lesson' || opType === 'createLesson') {
			const payload = {
				module_id: rawOp.module_id ?? null,
				title: rawOp.title || 'Lecție nouă',
				content: getLessonContentFromPlanItem(rawOp),
				status: rawOp.status || 'draft',
				order: rawOp.order ?? undefined,
				is_preview: rawOp.is_preview ?? undefined,
			};
			if (!payload.content) throw new Error(`Lecția "${payload.title}" nu are conținut.`);
			if (countLessonContentLines(payload.content) < 4) {
				throw new Error(`Lecția "${payload.title}" are conținut prea scurt.`);
			}
			await adminService.builderCreateLesson(courseId, payload);
			appliedSteps += 1;
			continue;
		}

		if (opType === 'update_lesson' || opType === 'updateLesson') {
			if (!rawOp.lesson_id) continue;
			const payload = {};
			if (rawOp.title !== undefined) payload.title = rawOp.title;
			if (rawOp.content !== undefined || rawOp.body !== undefined || rawOp.html !== undefined) {
				payload.content = getLessonContentFromPlanItem(rawOp);
			}
			if (rawOp.status !== undefined) payload.status = rawOp.status;
			if (rawOp.is_preview !== undefined) payload.is_preview = rawOp.is_preview;
			if (rawOp.order !== undefined) payload.order = rawOp.order;
			if (payload.content === '') throw new Error(`Lecția "${rawOp.title || 'fără titlu'}" nu are conținut.`);
			if (payload.content && countLessonContentLines(payload.content) < 4) {
				throw new Error(`Lecția "${rawOp.title || 'fără titlu'}" are conținut prea scurt.`);
			}
			if (Object.keys(payload).length > 0) {
				await adminService.builderUpdateLesson(courseId, rawOp.lesson_id, payload);
				appliedSteps += 1;
			}
			continue;
		}

		if (opType === 'delete_lesson' || opType === 'deleteLesson') {
			if (!rawOp.lesson_id) continue;
			await adminService.deleteLesson(rawOp.lesson_id);
			appliedSteps += 1;
			continue;
		}

		if (opType === 'reorderModules' || opType === 'reorder_modules') {
			if (Array.isArray(rawOp.module_ids) && rawOp.module_ids.length > 0) {
				structureOps.push({ op: 'reorderModules', module_ids: rawOp.module_ids });
			}
			continue;
		}

		if (opType === 'reorderLessons' || opType === 'reorder_lessons') {
			if (rawOp.module_id && Array.isArray(rawOp.lesson_ids) && rawOp.lesson_ids.length > 0) {
				structureOps.push({
					op: 'reorderLessons',
					module_id: rawOp.module_id,
					lesson_ids: rawOp.lesson_ids,
				});
			}
			continue;
		}

		if (opType === 'moveLesson' || opType === 'move_lesson') {
			if (rawOp.lesson_id && rawOp.to_module_id) {
				structureOps.push({
					op: 'moveLesson',
					lesson_id: rawOp.lesson_id,
					to_module_id: rawOp.to_module_id,
					to_index: rawOp.to_index ?? 0,
				});
			}
		}
	}

	if (structureOps.length > 0) {
		await adminService.patchCourseBuilderStructure(courseId, structureOps);
		appliedSteps += structureOps.length;
	}

	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent(AI_BUILDER_REFRESH_EVENT, { detail: { courseId: Number(courseId) } }));
	}

	return { appliedSteps };
}
