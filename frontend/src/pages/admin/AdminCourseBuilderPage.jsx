import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CaretDoubleLeft, CaretDoubleRight, Plus, Trash, X } from '@phosphor-icons/react';
import { adminService } from '../../services/api';

import { useToast } from '../../contexts/ToastContextShared.js';
import AutoSaveIndicator from '../../components/common/AutoSaveIndicator';
import Modal from '../../components/common/Modal';
import { DragGripIcon } from '../../components/common/DragGripIcon';
import LessonTipTapEditor from '../../components/admin/lessons/LessonTipTapEditor';
import '../../styles/admin-course-builder.css';

import { useAuth } from '../../contexts/AuthContextShared.js';
import InlineTestEditorShell from '../../components/admin/courses/InlineTestEditorShell';
import PublishCourseModal from '../../components/admin/courses/PublishCourseModal';
import OutlineItemMenu from '../../components/admin/courses/OutlineItemMenu';
import { useInlineTestEditor } from '../../hooks/useInlineTestEditor';
import { TEST_EDITOR_DEFAULT as INLINE_TEST_DEFAULT } from '../../utils/testQuestionBuilder';
import {
	buildModuleFlowItems,
	buildRootOutlineFlow,
	resolvePlacementFromFlowInsert,
} from '../../utils/courseBuilderTestFlow';
import { VOLT_BUILDER_REFRESH_EVENT } from '../../utils/voltCoursePlan';

const LESSON_DRAG_MIME = 'application/x-volta-course-lesson';
const TEST_DRAG_MIME = 'application/x-volta-course-test';
// Salvare aproape instantă: o pauză scurtă la scris trimite conținutul (nu câte o cerere la fiecare tastă).
const LESSON_CONTENT_AUTOSAVE_MS = 500;

function getDropTargetLessons(modulesList, rootLessonsList, toModuleId) {
	if (toModuleId == null) {
		return rootLessonsList || [];
	}
	const mod = modulesList.find((m) => Number(m.id) === Number(toModuleId));
	return mod?.lessons || [];
}

/** Index de inserare pentru op-ul builder moveLesson (lista destinație fără lecția mutată). */
function computeLessonInsertIndex(modulesList, rootLessonsList, toModuleId, movingLessonId, targetLessonId, position) {
	const targetLessons = getDropTargetLessons(modulesList, rootLessonsList, toModuleId);
	const filtered = targetLessons.filter((l) => Number(l.id) !== Number(movingLessonId));
	if (targetLessonId == null || position === 'end') {
		return filtered.length;
	}
	const idx = filtered.findIndex((l) => Number(l.id) === Number(targetLessonId));
	if (idx === -1) return filtered.length;
	return position === 'before' ? idx : idx + 1;
}

function sameOutlineModule(left, right) {
	if (left == null && right == null) return true;
	if (left == null || right == null) return false;
	return Number(left) === Number(right);
}

function readMovingLessonId(event, fallbackId) {
	const raw = event.dataTransfer?.getData(LESSON_DRAG_MIME);
	try {
		return raw ? JSON.parse(raw).lessonId : fallbackId;
	} catch {
		return fallbackId;
	}
}

/** Unde se inserează lecția când o lași pe un test sau pe spațiul dintre lecții. */
function resolveLessonInsertFromFlow(flowItems, flowIndex, edge) {
	const lessonEntries = [];
	flowItems.forEach((item, index) => {
		if (item.type === 'lesson') lessonEntries.push({ index, lesson: item.lesson });
	});
	const previous = [...lessonEntries].reverse().find((entry) => entry.index < flowIndex);
	const next = lessonEntries.find((entry) => entry.index > flowIndex);
	if (edge === 'before') {
		if (previous) return { lesson: previous.lesson, position: 'after' };
		if (next) return { lesson: next.lesson, position: 'before' };
	} else if (next) {
		return { lesson: next.lesson, position: 'before' };
	} else if (previous) {
		return { lesson: previous.lesson, position: 'after' };
	}
	return null;
}

const AdminCourseBuilderPage = () => {
	const { id } = useParams();
	const courseId = Number(id);
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const { showToast } = useToast();
	const { canMutateInAdminArea } = useAuth();

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [structure, setStructure] = useState(null);
	const [selectedModuleId, setSelectedModuleId] = useState(null);
	const [selectedLessonId, setSelectedLessonId] = useState(null);
	const [lessonContent, setLessonContent] = useState('');
	const [lessonEditorRefreshKey, setLessonEditorRefreshKey] = useState(0);
	const [lessonSaveStatus, setLessonSaveStatus] = useState(null);
	const [courseActionLoading, setCourseActionLoading] = useState(false);
	const [publishModalOpen, setPublishModalOpen] = useState(false);
	const [publishValidationReport, setPublishValidationReport] = useState(null);
	const [qualityAuditLoading, setQualityAuditLoading] = useState(false);
	const [qualityAuditReport, setQualityAuditReport] = useState(null);

	const [quickAddMenuOpen, setQuickAddMenuOpen] = useState(false);
	const [quickCreateModuleOpen, setQuickCreateModuleOpen] = useState(false);
	const [quickModuleTitle, setQuickModuleTitle] = useState('');
	const [quickModuleLoading, setQuickModuleLoading] = useState(false);
	const [showTestCreator, setShowTestCreator] = useState(false);
	const [builderSidebarVisible, setBuilderSidebarVisible] = useState(
		() => (typeof window === 'undefined' ? true : window.matchMedia('(min-width: 769px)').matches)
	);
	const [showCreateTestModal, setShowCreateTestModal] = useState(false);
	const [createTestTitle, setCreateTestTitle] = useState('');
	const [createTestModuleId, setCreateTestModuleId] = useState(null);
	const [courseAttachedTests, setCourseAttachedTests] = useState([]);
	const [lessonDropHint, setLessonDropHint] = useState(null);
	const lessonDragPayloadRef = useRef(null);
	const testDragPayloadRef = useRef(null);
	const sidebarTestDropHintRef = useRef(null);
	const sidebarNavRef = useRef(null);
	const draggingTestRowRef = useRef(null);
	const dragGhostCloneRef = useRef(null);

	const closeOutlineIfMobile = useCallback(() => {
		if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
			setBuilderSidebarVisible(false);
		}
	}, []);

	useEffect(() => {
		const mq = window.matchMedia('(max-width: 768px)');
		const sync = () => {
			setBuilderSidebarVisible(!mq.matches);
		};
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	}, []);

	const syncTestDropHintDom = useCallback((hint) => {
		sidebarTestDropHintRef.current = hint;
		const root = sidebarNavRef.current;
		if (!root) return;
		root.querySelectorAll('.admin-course-builder-drop-slot.is-active').forEach((el) => {
			el.classList.remove('is-active');
		});
		if (!hint || hint.targetType !== 'flow-insert') return;
		const moduleKey = hint.moduleId ?? 'root';
		const slot = root.querySelector(
			`.admin-course-builder-drop-slot[data-drop-module-id="${moduleKey}"][data-flow-insert-index="${hint.insertIndex}"]`
		);
		slot?.classList.add('is-active');
	}, []);

	const applyTestDropHint = useCallback(
		(hint) => {
			const prev = sidebarTestDropHintRef.current;
			if (
				prev?.targetType === hint?.targetType &&
				(prev?.moduleId ?? null) === (hint?.moduleId ?? null) &&
				prev?.insertIndex === hint?.insertIndex
			) {
				return;
			}
			syncTestDropHintDom(hint);
		},
		[syncTestDropHintDom]
	);
	const [editingModuleId, setEditingModuleId] = useState(null);
	const [editingModuleTitle, setEditingModuleTitle] = useState('');
	const lessonTitleRef = useRef(null);
	const quickAddRef = useRef(null);

	const contentSaveTimeoutRef = useRef(null);
	const lastPersistedLessonContentRef = useRef('');
	const lastPersistedLessonUpdatedAtRef = useRef(null);
	const lessonContentSaveChainRef = useRef(Promise.resolve());
	const inFlightContentSaveRef = useRef(null);
	const inFlightTitleSaveRef = useRef(null);
	const pendingContentRef = useRef(null);
	const flushAllInlineQuestionSavesRef = useRef(() => Promise.resolve());
	const handleManualLessonSaveRef = useRef(() => Promise.resolve());
	const publishFocusConsumedRef = useRef(false);
	const course = structure?.course || null;
	const isCoursePublished = course?.status === 'published';
	const hasUnpublishedEdits = isCoursePublished && String(course?.workflow_status || '') === 'editing';
	const coursePublishStatusLabel = hasUnpublishedEdits
		? 'Publicat · Ai modificări nepublicate'
		: isCoursePublished
			? 'Publicat'
			: 'Ciornă';
	const coursePublishStatusHint = hasUnpublishedEdits
		? 'Modificările sunt salvate. Cursanții văd versiunea publicată anterior.'
		: isCoursePublished
			? 'Cursanții văd această versiune publicată.'
			: 'Cursanții nu văd cursul până la publicare.';
	const modules = useMemo(
		() => (Array.isArray(course?.modules) ? course.modules : Array.isArray(structure?.modules) ? structure.modules : []),
		[course?.modules, structure?.modules]
	);

	const rootLessons = useMemo(
		() => {
			const source = Array.isArray(structure?.root_lessons)
				? structure.root_lessons
				: Array.isArray(structure?.lessons)
					? structure.lessons.filter((lessonItem) => lessonItem?.module_id == null)
				: Array.isArray(course?.lessons)
					? course.lessons.filter((lessonItem) => lessonItem?.module_id == null)
					: [];

			return source.map((lessonItem) => ({
				...lessonItem,
				module_id: null,
			}));
		},
		[course?.lessons, structure?.lessons, structure?.root_lessons]
	);

	const allLessons = useMemo(
		() =>
			[
				...rootLessons,
				...modules.flatMap((moduleItem) =>
					(moduleItem.lessons || []).map((lessonItem) => ({
						...lessonItem,
						__moduleTitle: moduleItem.title,
					}))
				),
			],
		[modules, rootLessons]
	);



	const selectedLesson = useMemo(() => {
		if (!selectedLessonId) return null;
		return allLessons.find((lessonItem) => lessonItem.id === selectedLessonId) || null;
	}, [allLessons, selectedLessonId]);

	const getModuleAttachedTests = useCallback((moduleId) => (
		courseAttachedTests
			.filter((row) => row.scope === 'module' && Number(row.scope_id) === Number(moduleId))
			.sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
	), [courseAttachedTests]);

	const getCourseLevelAttachedTests = useCallback(
		() =>
			courseAttachedTests
				.filter((row) => row.scope === 'course')
				.sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
		[courseAttachedTests]
	);

	const getLessonAttachedTests = useCallback(
		(lessonId) =>
			courseAttachedTests
				.filter((row) => row.scope === 'lesson' && Number(row.scope_id) === Number(lessonId))
				.sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
		[courseAttachedTests]
	);

	useEffect(() => {
		document.body.classList.add('admin-course-builder-scroll-lock');
		return () => {
			document.body.classList.remove('admin-course-builder-scroll-lock');
		};
	}, []);

	const persistLessonContent = useCallback(async (lessonId, content) => {
		const applyLessonTimestamp = (lesson) => {
			if (lesson?.updated_at) {
				lastPersistedLessonUpdatedAtRef.current = lesson.updated_at;
			}
		};
		// Serverul trece cursul publicat în „editing” la prima modificare (cursanții văd versiunea publicată
		// până la „Publică modificările”). Salvarea conținutului nu reîncarcă structura, deci actualizăm aici
		// starea, altfel builder-ul afișa „Cursanții văd această versiune” și nu oferea butonul de publicare.
		const markUnpublishedEdits = () => setStructure((prev) => (
			prev?.course?.status === 'published' && prev.course.workflow_status !== 'editing'
				? { ...prev, course: { ...prev.course, workflow_status: 'editing' } }
				: prev
		));
		const run = async () => {
			const send = () => adminService.builderUpdateLesson(courseId, lessonId, {
				content,
				expected_updated_at: lastPersistedLessonUpdatedAtRef.current || undefined,
			});
			try {
				const response = await send();
				lastPersistedLessonContentRef.current = content ?? '';
				applyLessonTimestamp(response?.lesson);
				markUnpublishedEdits();
			} catch (e) {
				const status = e?.response?.status;
				const serverLesson = e?.response?.data?.lesson;
				if (status === 409 && serverLesson) {
					applyLessonTimestamp(serverLesson);
					const retry = await send();
					lastPersistedLessonContentRef.current = content ?? '';
					applyLessonTimestamp(retry?.lesson);
					markUnpublishedEdits();
					return;
				}
				throw e;
			}
		};
		const chained = lessonContentSaveChainRef.current.then(run, run);
		lessonContentSaveChainRef.current = chained.catch(() => {});
		await chained;
	}, [courseId]);

	const flushPendingLessonContentSave = useCallback(async () => {
		if (contentSaveTimeoutRef.current) {
			clearTimeout(contentSaveTimeoutRef.current);
			contentSaveTimeoutRef.current = null;
		}
		const pending = pendingContentRef.current;
		if (!pending?.lessonId) return true;
		const { lessonId, content } = pending;
		// Ieșirea din editor (blur) și butonul „Salvează” cer aceeași salvare aproape simultan:
		// a doua așteaptă cererea deja pornită în loc să mai trimită o dată tot conținutul.
		const inFlight = inFlightContentSaveRef.current;
		if (inFlight && inFlight.lessonId === lessonId && inFlight.content === content) {
			return inFlight.promise;
		}
		const promise = (async () => {
			try {
				await persistLessonContent(lessonId, content);
				if (
					pendingContentRef.current?.lessonId === lessonId &&
					pendingContentRef.current?.content === content
				) {
					pendingContentRef.current = null;
				}
				setLessonSaveStatus('saved');
				return true;
			} catch (e) {
				console.error('Lesson content save failed:', e?.response?.data?.message || e?.message || e);
				setLessonSaveStatus('error');
				showToast(e?.response?.data?.message || 'Eroare la salvarea conținutului lecției.', 'error');
				return false;
			} finally {
				if (inFlightContentSaveRef.current?.promise === promise) {
					inFlightContentSaveRef.current = null;
				}
			}
		})();
		inFlightContentSaveRef.current = { lessonId, content, promise };
		return promise;
	}, [persistLessonContent, showToast]);
	const flushPendingLessonContentSaveRef = useRef(flushPendingLessonContentSave);
	flushPendingLessonContentSaveRef.current = flushPendingLessonContentSave;

	const fetchAttachedTests = useCallback(async () => {
		try {
			const response = await adminService.builderGetTests(courseId);
			const raw = response?.attached ?? response?.data?.attached;
			setCourseAttachedTests(Array.isArray(raw) ? raw : []);
		} catch (e) {
			console.error('Failed to load attached tests:', e);
			setCourseAttachedTests([]);
			showToast('Nu s-au putut încărca testele atașate cursului.', 'error');
		}
	}, [courseId, showToast]);

	const testEditor = useInlineTestEditor({
		showToast,
		canMutateInAdminArea,
		courseContext: {
			courseId,
			selectedModuleId,
			modules,
			courseAttachedTests,
			fetchAttachedTests,
			getModuleAttachedTests,
		},
	});

	const {
		inlineTest,
		inlineTestTab,
		openQuestionTypePickerId,
		flushAllInlineQuestionSaves,
		loadTest: loadTestIntoEditor,
		resetTest,
		handlePublishInlineTest: publishInlineTestBase,
	} = testEditor;

	const handlePublishInlineTest = useCallback(
		() => publishInlineTestBase(fetchAttachedTests),
		[publishInlineTestBase, fetchAttachedTests]
	);

	useEffect(() => {
		flushAllInlineQuestionSavesRef.current = flushAllInlineQuestionSaves;
	}, [flushAllInlineQuestionSaves]);

	const loadInlineTestById = useCallback(async (testId) => {
		await flushPendingLessonContentSave();
		await loadTestIntoEditor(testId, 'questions');
		setShowTestCreator(true);
	}, [flushPendingLessonContentSave, loadTestIntoEditor]);

	const clearLessonDrag = useCallback(() => {
		lessonDragPayloadRef.current = null;
		setLessonDropHint(null);
		document.body.classList.remove('admin-course-builder-lesson-drag-active');
	}, []);

	const handleLessonMove = useCallback(
		async (lessonId, toModuleId, toIndex) => {
			try {
				await flushPendingLessonContentSave();
				await flushAllInlineQuestionSavesRef.current();
				const normalizedModuleId = toModuleId == null ? null : Number(toModuleId);
				const data = await adminService.patchCourseBuilderStructure(courseId, [
					{
						op: 'moveLesson',
						lesson_id: Number(lessonId),
						to_module_id: normalizedModuleId,
						to_index: toIndex,
					},
				]);
				setStructure(data);
				await fetchAttachedTests();
				setSelectedModuleId(normalizedModuleId);
				setSelectedLessonId(Number(lessonId));
				setShowTestCreator(false);
				showToast('Lecția a fost mutată.', 'success');
			} catch (err) {
				console.error('moveLesson failed:', err);
				showToast(err?.response?.data?.message || 'Nu s-a putut muta lecția.', 'error');
			}
		},
		[courseId, fetchAttachedTests, flushPendingLessonContentSave, showToast]
	);

	const clearTestDragVisuals = useCallback(() => {
		draggingTestRowRef.current?.classList.remove('is-dragging');
		draggingTestRowRef.current = null;
		document.body.classList.remove('admin-course-builder-test-drag-active');
		if (dragGhostCloneRef.current) {
			dragGhostCloneRef.current.remove();
			dragGhostCloneRef.current = null;
		}
		syncTestDropHintDom(null);
	}, [syncTestDropHintDom]);

	const clearTestDrag = useCallback(() => {
		testDragPayloadRef.current = null;
		clearTestDragVisuals();
	}, [clearTestDragVisuals]);

	const handleCourseTestMove = useCallback(
		async (courseTestItem, placement) => {
			if (!courseTestItem || !placement) return;

			const movingCourseTestId = courseTestItem.id;
			const targetScope = placement.scope;
			const targetScopeId = placement.scope_id;
			const moduleId = placement.moduleId;

			const getTargetSiblings = (excludeId) => {
				if (targetScope === 'lesson') {
					return getLessonAttachedTests(targetScopeId).filter((row) => Number(row.id) !== Number(excludeId));
				}
				if (targetScope === 'module' && moduleId != null) {
					return getModuleAttachedTests(moduleId).filter((row) => Number(row.id) !== Number(excludeId));
				}
				if (targetScope === 'course') {
					return getCourseLevelAttachedTests().filter((row) => Number(row.id) !== Number(excludeId));
				}
				return [];
			};

			const sourceScope = courseTestItem.scope;
			const sourceScopeId = courseTestItem.scope_id;
			const scopeChanged =
				sourceScope !== targetScope || Number(sourceScopeId) !== Number(targetScopeId);

			let insertAt = placement.order;
			if (!scopeChanged) {
				const originalSiblings =
					targetScope === 'lesson'
						? getLessonAttachedTests(targetScopeId)
						: targetScope === 'module' && moduleId != null
							? getModuleAttachedTests(moduleId)
							: targetScope === 'course'
								? getCourseLevelAttachedTests()
								: [];
				const sourceIndex = originalSiblings.findIndex(
					(row) => Number(row.id) === Number(movingCourseTestId)
				);
				if (sourceIndex !== -1 && sourceIndex < insertAt) {
					insertAt -= 1;
				}
			}

			const siblings = getTargetSiblings(movingCourseTestId);
			insertAt = Math.max(0, Math.min(insertAt, siblings.length));
			const nextRows = [...siblings];
			nextRows.splice(insertAt, 0, {
				...courseTestItem,
				scope: targetScope,
				scope_id: targetScopeId,
			});

			try {
				if (scopeChanged) {
					await adminService.builderDetachTest(courseId, courseTestItem.test_id, {
						course_test_id: courseTestItem.id,
					});
				}

				for (let i = 0; i < nextRows.length; i += 1) {
					const row = nextRows[i];
					await adminService.builderAttachTest(courseId, {
						test_id: row.test_id,
						scope: targetScope,
						scope_id: targetScope === 'course' ? null : targetScopeId,
						order: i,
						required: row.required,
						passing_score: row.passing_score,
					});
				}

				if (scopeChanged) {
					let oldSiblings = [];
					if (sourceScope === 'lesson') {
						oldSiblings = getLessonAttachedTests(sourceScopeId);
					} else if (sourceScope === 'module') {
						oldSiblings = getModuleAttachedTests(sourceScopeId);
					} else if (sourceScope === 'course') {
						oldSiblings = getCourseLevelAttachedTests();
					}
					oldSiblings = oldSiblings.filter((row) => Number(row.id) !== Number(movingCourseTestId));

					for (let i = 0; i < oldSiblings.length; i += 1) {
						const row = oldSiblings[i];
						await adminService.builderAttachTest(courseId, {
							test_id: row.test_id,
							scope: sourceScope,
							scope_id: sourceScope === 'course' ? null : sourceScopeId,
							order: i,
							required: row.required,
							passing_score: row.passing_score,
						});
					}
				}

				await fetchAttachedTests();
				showToast('Testul a fost mutat.', 'success');
			} catch (err) {
				console.error('Move course test failed:', err);
				showToast(err?.response?.data?.message || 'Eroare la mutarea testului.', 'error');
				await fetchAttachedTests();
			}
		},
		[courseId, fetchAttachedTests, getCourseLevelAttachedTests, getLessonAttachedTests, getModuleAttachedTests, showToast]
	);

	const handleTestDragStart = useCallback(
		(e, courseTestItem) => {
			if (!canMutateInAdminArea) {
				e.preventDefault();
				return;
			}
			const payload = { courseTestId: courseTestItem.id };
			testDragPayloadRef.current = payload;
			syncTestDropHintDom(null);

			const dragRow =
				e.currentTarget.closest('.admin-course-builder-outline-test-row')
				|| e.currentTarget.closest('.admin-course-builder-sidebar-test');
			draggingTestRowRef.current = dragRow;

			try {
				e.dataTransfer.setData(TEST_DRAG_MIME, JSON.stringify(payload));
				e.dataTransfer.setData('text/plain', String(courseTestItem.id));
			} catch {
				// unele browsere pot restricționa setData
			}
			e.dataTransfer.effectAllowed = 'move';

			if (dragRow) {
				const clone = dragRow.cloneNode(true);
				clone.classList.remove('is-dragging');
				clone.style.cssText = 'position:fixed;top:-2000px;left:-2000px;opacity:1;transform:none;pointer-events:none;';
				clone.style.width = `${dragRow.offsetWidth}px`;
				clone.setAttribute('aria-hidden', 'true');
				document.body.appendChild(clone);
				dragGhostCloneRef.current = clone;
				try {
					e.dataTransfer.setDragImage(clone, clone.offsetWidth / 2, clone.offsetHeight / 2);
				} catch {
					// ignore
				}
			}

			requestAnimationFrame(() => {
				if (!testDragPayloadRef.current) return;
				dragRow?.classList.add('is-dragging');
				document.body.classList.add('admin-course-builder-test-drag-active');
			});
		},
		[canMutateInAdminArea, syncTestDropHintDom]
	);

	const handleTestDragEnd = useCallback(() => {
		clearTestDrag();
	}, [clearTestDrag]);

	const resolveDraggingCourseTest = useCallback(
		(e) => {
			let courseTestId = testDragPayloadRef.current?.courseTestId;
			const raw = e.dataTransfer.getData(TEST_DRAG_MIME);
			if (raw) {
				try {
					courseTestId = JSON.parse(raw).courseTestId ?? courseTestId;
				} catch {
					// ignore
				}
			}
			if (courseTestId == null) {
				const plain = e.dataTransfer.getData('text/plain');
				if (plain) courseTestId = Number(plain);
			}
			if (courseTestId == null) return null;
			return courseAttachedTests.find((row) => Number(row.id) === Number(courseTestId)) || null;
		},
		[courseAttachedTests]
	);

	const handleTestDropAtFlowIndex = useCallback(
		async (e, moduleItem, flowItems, insertIndex) => {
			e.preventDefault();
			e.stopPropagation();
			const movingTest = resolveDraggingCourseTest(e);
			if (!movingTest) {
				clearTestDrag();
				return;
			}

			const placement = resolvePlacementFromFlowInsert(
				flowItems,
				insertIndex,
				moduleItem?.id ?? null,
				movingTest.id,
				getLessonAttachedTests,
				getModuleAttachedTests,
				getCourseLevelAttachedTests
			);

			clearTestDrag();
			if (!placement) return;

			await handleCourseTestMove(movingTest, placement);
		},
		[
			clearTestDrag,
			getCourseLevelAttachedTests,
			getLessonAttachedTests,
			getModuleAttachedTests,
			handleCourseTestMove,
			resolveDraggingCourseTest,
		]
	);

	const getFlowInsertIndexFromEvent = (e, flowIndex) => {
		const rect = e.currentTarget.getBoundingClientRect();
		return (e.clientY - rect.top) < rect.height / 2 ? flowIndex : flowIndex + 1;
	};

	const handleTestDragOverFlowRow = useCallback((e, moduleId, flowIndex) => {
		if (!testDragPayloadRef.current) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		const insertIndex = getFlowInsertIndexFromEvent(e, flowIndex);
		applyTestDropHint({
			moduleId: moduleId ?? null,
			targetType: 'flow-insert',
			insertIndex,
		});
	}, [applyTestDropHint]);

	const handleTestDropOnFlowRow = useCallback(
		(e, moduleItem, flowItems, flowIndex, rootLessonsList = null) => {
			if (!testDragPayloadRef.current) return;
			e.preventDefault();
			e.stopPropagation();
			const insertIndex = getFlowInsertIndexFromEvent(e, flowIndex);
			handleTestDropAtFlowIndex(e, moduleItem, flowItems, insertIndex, rootLessonsList);
		},
		[handleTestDropAtFlowIndex]
	);

	const handleSidebarTestDragOver = useCallback((e) => {
		if (!testDragPayloadRef.current) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
	}, []);

	const handleLessonDragStart = useCallback(
		(e, lessonItem, sourceModuleId) => {
			if (!canMutateInAdminArea) {
				e.preventDefault();
				return;
			}
			const payload = { lessonId: lessonItem.id, moduleId: sourceModuleId };
			lessonDragPayloadRef.current = payload;
			document.body.classList.add('admin-course-builder-lesson-drag-active');
			try {
				e.dataTransfer.setData(LESSON_DRAG_MIME, JSON.stringify(payload));
			} catch {
				// unele browsere pot restricționa setData
			}
			e.dataTransfer.effectAllowed = 'move';
		},
		[canMutateInAdminArea]
	);

	const handleLessonDragEnd = useCallback(() => {
		clearLessonDrag();
	}, [clearLessonDrag]);

	const handleLessonDragOverFlowItem = useCallback((e, moduleItem, flowItems, flowIndex) => {
		if (!lessonDragPayloadRef.current) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		const rect = e.currentTarget.getBoundingClientRect();
		const edge = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
		const flowItem = flowItems[flowIndex];
		const resolved = flowItem?.type === 'lesson'
			? { lesson: flowItem.lesson, position: edge }
			: resolveLessonInsertFromFlow(flowItems, flowIndex, edge);
		if (!resolved?.lesson) {
			setLessonDropHint({ moduleId: moduleItem?.id ?? null, zone: 'end' });
			return;
		}
		setLessonDropHint({
			moduleId: moduleItem?.id ?? null,
			lessonId: resolved.lesson.id,
			position: resolved.position,
		});
	}, []);

	const handleLessonDragOverModuleEnd = useCallback((e, moduleItem) => {
		if (!lessonDragPayloadRef.current) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		setLessonDropHint({ moduleId: moduleItem?.id ?? null, zone: 'end' });
	}, []);

	const handleLessonDropOnFlowItem = useCallback(
		async (e, targetModuleItem, flowItems, flowIndex) => {
			e.preventDefault();
			e.stopPropagation();
			const movingId = readMovingLessonId(e, lessonDragPayloadRef.current?.lessonId);
			if (movingId == null) {
				clearLessonDrag();
				return;
			}
			const rect = e.currentTarget.getBoundingClientRect();
			const edge = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
			const flowItem = flowItems[flowIndex];
			const resolved = flowItem?.type === 'lesson'
				? { lesson: flowItem.lesson, position: edge }
				: resolveLessonInsertFromFlow(flowItems, flowIndex, edge);
			if (!resolved?.lesson || Number(movingId) === Number(resolved.lesson.id)) {
				if (!resolved?.lesson) {
					const toIndex = computeLessonInsertIndex(
						modules,
						rootLessons,
						targetModuleItem?.id ?? null,
						movingId,
						null,
						'end'
					);
					await handleLessonMove(movingId, targetModuleItem?.id ?? null, toIndex);
				}
				clearLessonDrag();
				return;
			}
			const toIndex = computeLessonInsertIndex(
				modules,
				rootLessons,
				targetModuleItem?.id ?? null,
				movingId,
				resolved.lesson.id,
				resolved.position
			);
			await handleLessonMove(movingId, targetModuleItem?.id ?? null, toIndex);
			clearLessonDrag();
		},
		[modules, rootLessons, handleLessonMove, clearLessonDrag]
	);

	const handleLessonDropAtModuleStart = useCallback(
		async (e, targetModuleItem) => {
			e.preventDefault();
			e.stopPropagation();
			const movingId = readMovingLessonId(e, lessonDragPayloadRef.current?.lessonId);
			if (movingId == null || !targetModuleItem) {
				clearLessonDrag();
				return;
			}
			const firstOther = (targetModuleItem.lessons || []).find((lesson) => Number(lesson.id) !== Number(movingId));
			const toIndex = firstOther
				? computeLessonInsertIndex(modules, rootLessons, targetModuleItem.id, movingId, firstOther.id, 'before')
				: 0;
			await handleLessonMove(movingId, targetModuleItem.id, toIndex);
			clearLessonDrag();
		},
		[modules, rootLessons, handleLessonMove, clearLessonDrag]
	);

	const handleLessonDropAtModuleEnd = useCallback(
		async (e, targetModuleItem) => {
			e.preventDefault();
			e.stopPropagation();
			let movingId = null;
			const raw = e.dataTransfer.getData(LESSON_DRAG_MIME);
			try {
				movingId = raw ? JSON.parse(raw).lessonId : lessonDragPayloadRef.current?.lessonId;
			} catch {
				movingId = lessonDragPayloadRef.current?.lessonId;
			}
			if (movingId == null) return;
			const toIndex = computeLessonInsertIndex(modules, rootLessons, targetModuleItem?.id ?? null, movingId, null, 'end');
			await handleLessonMove(movingId, targetModuleItem?.id ?? null, toIndex);
			clearLessonDrag();
		},
		[modules, rootLessons, handleLessonMove, clearLessonDrag]
	);

	const fetchStructure = async (background = false) => {
		try {
			if (!background) {
				setLoading(true);
				setError(null);
			}
			const data = await adminService.getCourseBuilderStructure(courseId);
			setStructure(data);
			await fetchAttachedTests();
			return data;
		} catch (e) {
			console.error('Failed to load course builder structure:', e);
			if (!background) setError('Nu s-a putut încărca builder-ul cursului.');
			return null;
		} finally {
			if (!background) setLoading(false);
		}
	};

	useEffect(() => {
		if (!Number.isFinite(courseId)) return;
		if (!canMutateInAdminArea) {
			navigate(`/admin/courses/${courseId}`, { replace: true });
			return;
		}
		fetchStructure();
		// Testele atașate se încarcă în fetchStructure (după structură), ca lista să fie sincronă
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [courseId, canMutateInAdminArea, navigate]);

	useEffect(() => {
		const onVoltRefresh = (event) => {
			if (Number(event.detail?.courseId) !== Number(courseId)) {
				return;
			}
			Promise.resolve(fetchStructure(true)).finally(() => {
				setLessonEditorRefreshKey((prev) => prev + 1);
			});
		};
		window.addEventListener(VOLT_BUILDER_REFRESH_EVENT, onVoltRefresh);
		return () => window.removeEventListener(VOLT_BUILDER_REFRESH_EVENT, onVoltRefresh);
	}, [courseId]);

	useEffect(() => {
		const hasModules = modules.length > 0;
		const hasRootLessons = rootLessons.length > 0;
		const focus = searchParams.get('focus');
		const rawId = Number(searchParams.get('id'));
		const hasFocus = Boolean(focus) && Number.isFinite(rawId);

		if (hasFocus && !publishFocusConsumedRef.current) {
			if (focus === 'lesson') {
				const lesson = allLessons.find((item) => Number(item.id) === rawId);
				if (!lesson) return;
				setSelectedLessonId(lesson.id);
				setSelectedModuleId(lesson.module_id ?? null);
				setShowTestCreator(false);
				publishFocusConsumedRef.current = true;
				setSearchParams({}, { replace: true });
				return;
			}
			if (focus === 'module') {
				if (!modules.some((item) => Number(item.id) === rawId)) return;
				setSelectedModuleId(rawId);
				publishFocusConsumedRef.current = true;
				setSearchParams({}, { replace: true });
				return;
			}
			if (focus === 'test') {
				const row = courseAttachedTests.find((item) => Number(item.id) === rawId);
				if (row?.test_id) {
					loadInlineTestById(row.test_id);
					publishFocusConsumedRef.current = true;
					setSearchParams({}, { replace: true });
					return;
				}
				if (courseAttachedTests.length > 0) {
					publishFocusConsumedRef.current = true;
					setSearchParams({}, { replace: true });
				}
				return;
			}
		}

		if (!hasModules && !hasRootLessons) {
			setSelectedModuleId(null);
			setSelectedLessonId(null);
			return;
		}

		if (selectedModuleId != null && !modules.some((moduleItem) => moduleItem.id === selectedModuleId)) {
			setSelectedModuleId(hasModules ? modules[0].id : null);
		}

		const selectedLessonExists = selectedLessonId
			? allLessons.some((lessonItem) => lessonItem.id === selectedLessonId)
			: false;

		if (!selectedLessonExists) {
			const firstLesson = rootLessons[0] || modules.flatMap((moduleItem) => moduleItem.lessons || [])[0] || null;
			setSelectedLessonId(firstLesson?.id || null);
			setSelectedModuleId(firstLesson?.module_id ?? null);
		}
	}, [allLessons, modules, rootLessons, selectedLessonId, selectedModuleId, searchParams, setSearchParams, courseAttachedTests, loadInlineTestById]);

	// Doar la schimbarea lecției — nu la fiecare refresh al structurii (ex. moveLesson, fetch).
	// Altfel `selectedLesson.content` din snapshot poate fi gol/diferit și rescrie ce scrie utilizatorul.
	useLayoutEffect(() => {
		if (selectedLesson?.id == null) {
			setLessonContent('');
			setLessonSaveStatus(null);
			return;
		}
		const initialContent = selectedLesson?.content || '';
		setLessonContent(initialContent);
		lastPersistedLessonContentRef.current = initialContent;
		lastPersistedLessonUpdatedAtRef.current = selectedLesson?.updated_at || null;
		setLessonSaveStatus(null);
		// lessonEditorRefreshKey: forțează reîncărcarea conținutului după ce Volt aplică modificări
		// pe lecția deja deschisă (id neschimbat → altfel editorul ar rămâne pe conținutul vechi).
	}, [selectedLesson?.id, lessonEditorRefreshKey]);

	useEffect(() => {
		if (!lessonTitleRef.current || !selectedLesson) return;
		lessonTitleRef.current.textContent = selectedLesson.title || 'Titlu lecție';
	}, [selectedLesson?.id, selectedLesson?.title]);

	const handleUpdateLessonTitle = (lessonId, newTitle) => {
		if (!newTitle?.trim()) return Promise.resolve();
		// Blur-ul titlului și butonul „Salvează” pornesc aceeași salvare: o trimitem o singură dată.
		const inFlight = inFlightTitleSaveRef.current;
		if (inFlight && inFlight.lessonId === lessonId && inFlight.title === newTitle.trim()) {
			return inFlight.promise;
		}
		const promise = (async () => {
			try {
				const response = await adminService.builderUpdateLesson(courseId, lessonId, { title: newTitle.trim() });
				if (response?.lesson?.updated_at) {
					lastPersistedLessonUpdatedAtRef.current = response.lesson.updated_at;
				}
				// Doar titlul s-a schimbat: îl actualizăm local. Reîncărcarea structurii aduce conținutul
				// tuturor lecțiilor și făcea butonul „Salvează” să aștepte secunde pe cursurile mari.
				const savedTitle = response?.lesson?.title || newTitle.trim();
				const renameIn = (list) => (Array.isArray(list)
					? list.map((lessonItem) => (lessonItem?.id === lessonId ? { ...lessonItem, title: savedTitle } : lessonItem))
					: list);
				const renameInModules = (list) => (Array.isArray(list)
					? list.map((moduleItem) => (Array.isArray(moduleItem?.lessons) ? { ...moduleItem, lessons: renameIn(moduleItem.lessons) } : moduleItem))
					: list);
				setStructure((prev) => (prev ? {
					...prev,
					modules: renameInModules(prev.modules),
					root_lessons: renameIn(prev.root_lessons),
					lessons: renameIn(prev.lessons),
					course: prev.course ? {
						...prev.course,
						modules: renameInModules(prev.course.modules),
						lessons: renameIn(prev.course.lessons),
					} : prev.course,
				} : prev));
				showToast('Titlul lecției salvat', 'success');
			} catch (e) {
				console.error('Update lesson title failed:', e);
				showToast('Eroare la salvarea titlului', 'error');
			} finally {
				if (inFlightTitleSaveRef.current?.promise === promise) {
					inFlightTitleSaveRef.current = null;
				}
			}
		})();
		inFlightTitleSaveRef.current = { lessonId, title: newTitle.trim(), promise };
		return promise;
	};

	const handleLessonContentChange = (nextContent) => {
		if (!selectedLesson?.id) return;
		setLessonContent(nextContent);
		pendingContentRef.current = {
			lessonId: selectedLesson.id,
			content: nextContent || '',
		};
		setLessonSaveStatus('pending');
		if (contentSaveTimeoutRef.current) clearTimeout(contentSaveTimeoutRef.current);
		contentSaveTimeoutRef.current = setTimeout(() => {
			flushPendingLessonContentSaveRef.current();
		}, LESSON_CONTENT_AUTOSAVE_MS);
	};

	const handleManualLessonSave = async () => {
		if (!canMutateInAdminArea || !selectedLesson?.id) return;
		setLessonSaveStatus('saving');
		const nextTitle = lessonTitleRef.current?.textContent?.trim();
		if (nextTitle && nextTitle !== selectedLesson.title) {
			await handleUpdateLessonTitle(selectedLesson.id, nextTitle);
		}
		const ok = await flushPendingLessonContentSave();
		// Fără nimic de trimis (autosave-ul sau ieșirea din editor au salvat deja), flush-ul nu schimbă
		// starea: butonul rămânea blocat pe „Se salvează...”.
		if (ok) {
			setLessonSaveStatus('saved');
			showToast('Lecție salvată.', 'success');
		}
	};
	handleManualLessonSaveRef.current = handleManualLessonSave;

	const handleLeaveBuilder = async () => {
		await flushPendingLessonContentSave();
		await flushAllInlineQuestionSavesRef.current();
		navigate('/admin/content?tab=courses&view=maps');
	};

	useEffect(() => {
		if (!quickAddMenuOpen) return undefined;
		const onOutsideClick = (event) => {
			if (quickAddRef.current && !quickAddRef.current.contains(event.target)) {
				setQuickAddMenuOpen(false);
			}
		};
		document.addEventListener('click', onOutsideClick);
		return () => document.removeEventListener('click', onOutsideClick);
	}, [quickAddMenuOpen]);

	const handleQuickCreateModule = async () => {
		const title = quickModuleTitle.trim();
		if (!title || quickModuleLoading) return;
		setQuickModuleLoading(true);
		try {
			await adminService.builderCreateModule(courseId, {
				title,
				status: 'draft',
			});
			showToast('Modul creat', 'success');
			await fetchStructure(true);
			setQuickCreateModuleOpen(false);
			setQuickModuleTitle('');
		} catch (e) {
			console.error('Create module failed:', e);
			showToast(e?.response?.data?.message || 'Eroare la crearea modulului', 'error');
		} finally {
			setQuickModuleLoading(false);
		}
	};

	const handleQuickCreateLesson = async (targetModuleId = selectedModuleId ?? null) => {
		const moduleItem = targetModuleId != null ? modules.find((m) => Number(m.id) === Number(targetModuleId)) : null;
		const nextLessonOrder = targetModuleId != null ? (moduleItem?.lessons || []).length + 1 : rootLessons.length + 1;
		const fallbackTitle = `Lecție ${nextLessonOrder}`;

		try {
			await flushPendingLessonContentSave();
			const result = await adminService.builderCreateLesson(courseId, {
				module_id: targetModuleId,
				title: fallbackTitle,
				type: 'text',
				status: 'draft',
			});
			const lesson = result?.lesson ?? result;
			await fetchStructure(true);
			await flushAllInlineQuestionSavesRef.current();
			setSelectedModuleId(targetModuleId ?? null);
			if (lesson?.id) {
				setSelectedLessonId(lesson.id);
				setShowTestCreator(false);
			}
			showToast('Lecție nouă adăugată.', 'success');
		} catch (err) {
			console.error('Quick create lesson failed:', err);
			showToast(err?.response?.data?.message || 'Nu am putut crea lecția.', 'error');
		}
	};

	const handleQuickModuleInputBlur = () => {
		if (quickModuleLoading) return;
		if (quickModuleTitle.trim()) {
			handleQuickCreateModule();
			return;
		}
		setQuickCreateModuleOpen(false);
		setQuickModuleTitle('');
	};

	const beginModuleRename = (moduleItem) => {
		setEditingModuleId(moduleItem.id);
		setEditingModuleTitle(moduleItem.title || '');
	};

	const handleSaveModuleRename = async (moduleId, currentTitle) => {
		const nextTitle = editingModuleTitle.trim();
		setEditingModuleId(null);
		if (!nextTitle || nextTitle === (currentTitle || '').trim()) return;
		try {
			await adminService.updateModule(moduleId, { title: nextTitle });
			showToast('Titlul modulului salvat', 'success');
			await fetchStructure(true);
		} catch (e) {
			console.error('Update module title failed:', e);
			showToast('Eroare la salvarea titlului modulului', 'error');
		}
	};

	const [creatingTestFromModal, setCreatingTestFromModal] = useState(false);



	const handleOpenCreateTestModal = () => {
		const fallbackModuleId = selectedModuleId || modules[0]?.id || null;
		setCreateTestModuleId(fallbackModuleId);
		setCreateTestTitle('');
		setShowCreateTestModal(true);
	};

	const handleCreateTestFromModal = async (e) => {
		e.preventDefault();
		const title = createTestTitle.trim();
		if (!title) {
			showToast('Adaugă titlul testului.', 'error');
			return;
		}
		setCreatingTestFromModal(true);
		try {
			const created = await adminService.createTest({
				title,
				status: 'draft',
				type: 'final',
				passing_score: INLINE_TEST_DEFAULT.passing_score,
				max_attempts: INLINE_TEST_DEFAULT.max_attempts,
				randomize_questions: INLINE_TEST_DEFAULT.randomize_questions,
				randomize_answers: INLINE_TEST_DEFAULT.randomize_answers,
				show_results_immediately: INLINE_TEST_DEFAULT.show_results_immediately,
				show_correct_answers: INLINE_TEST_DEFAULT.show_correct_answers,
				show_only_submitted_answers: INLINE_TEST_DEFAULT.show_only_submitted_answers,
				allow_review: INLINE_TEST_DEFAULT.allow_review,
				requires_manual_verification: INLINE_TEST_DEFAULT.requires_manual_verification,
			});
			const newTestId = Number(created?.test?.id ?? created?.id);
			if (!newTestId) throw new Error('ID test invalid');

			if (createTestModuleId) {
				const moduleItem = modules.find((row) => Number(row.id) === Number(createTestModuleId));
				const moduleLessons = moduleItem?.lessons || [];
				if (moduleLessons.length > 0) {
					const lastLesson = moduleLessons[moduleLessons.length - 1];
					const lessonTests = getLessonAttachedTests(lastLesson.id);
					await adminService.builderAttachTest(courseId, {
						test_id: newTestId,
						scope: 'lesson',
						scope_id: lastLesson.id,
						order: lessonTests.length,
					});
				} else {
					const moduleTests = getModuleAttachedTests(createTestModuleId);
					await adminService.builderAttachTest(courseId, {
						test_id: newTestId,
						scope: 'module',
						scope_id: createTestModuleId,
						order: moduleTests.length,
					});
				}
			} else {
				await adminService.builderAttachTest(courseId, {
					test_id: newTestId,
					scope: 'course',
					order: 0,
				});
			}

			await fetchAttachedTests();
			await loadInlineTestById(newTestId);
			setShowCreateTestModal(false);
			showToast('Test creat. Setările detaliate sunt în panoul adițional.', 'success');
		} catch (err) {
			console.error('Create test from modal failed:', err);
			showToast(err?.response?.data?.message || 'Eroare la crearea testului.', 'error');
		} finally {
			setCreatingTestFromModal(false);
		}
	};

	useEffect(() => {
		const persistNow = () => {
			flushPendingLessonContentSaveRef.current();
			flushAllInlineQuestionSavesRef.current();
		};
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') persistNow();
		};
		const onKeyDown = (e) => {
			if ((e.metaKey || e.ctrlKey) && String(e.key || '').toLowerCase() === 's') {
				e.preventDefault();
				handleManualLessonSaveRef.current();
			}
		};
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pagehide', persistNow);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('pagehide', persistNow);
			window.removeEventListener('keydown', onKeyDown);
			persistNow();
		};
	}, []);

	const handleValidateForPublish = useCallback(async () => {
		if (!course?.id) return;
		try {
			await flushPendingLessonContentSave();
			await flushAllInlineQuestionSaves();
			const report = await adminService.builderValidateCourse(course.id);
			setPublishValidationReport(report);
			return report;
		} catch (e) {
			console.error('Course validation failed:', e);
			showToast(e?.response?.data?.message || 'Nu am putut valida cursul.', 'error');
			throw e;
		}
	}, [course?.id, flushPendingLessonContentSave, flushAllInlineQuestionSaves, showToast]);

	const handleOpenPublishModal = async () => {
		if (!course?.id || courseActionLoading) return;
		setPublishValidationReport(null);
		setPublishModalOpen(true);
		try {
			await handleValidateForPublish();
		} catch {
			// Modal still opens; user can retry validation inside.
		}
	};

	const handleFixPublishIssue = useCallback((issue) => {
		if (!issue) return;
		if (issue.kind === 'lesson' && issue.id) {
			setSelectedLessonId(issue.id);
			setShowTestCreator(false);
		} else if (issue.kind === 'module' && issue.id) {
			setSelectedModuleId(issue.id);
			setShowTestCreator(false);
		} else if (issue.kind === 'test' && issue.id) {
			const row = courseAttachedTests.find((item) => Number(item.id) === Number(issue.id));
			if (row?.test_id) {
				loadInlineTestById(row.test_id);
			}
		}
		setPublishModalOpen(false);
	}, [courseAttachedTests, loadInlineTestById]);

	const handlePreviewAsStudent = () => {
		if (!course?.id) return;
		window.open(`/courses/${course.id}`, '_blank', 'noopener,noreferrer');
	};

	const handleCoursePublished = async () => {
		showToast('Cursul a fost publicat cu succes', 'success');
		setPublishModalOpen(false);
		setPublishValidationReport(null);
		await fetchStructure(true);
	};

	const handleCourseStatusAction = async (action) => {
		if (!course?.id || courseActionLoading) return;
		if (action === 'publish') {
			await handleOpenPublishModal();
			return;
		}
		setCourseActionLoading(true);
		try {
			if (action === 'unpublish') {
				await adminService.updateCourse(course.id, { status: 'draft' });
				showToast('Cursul a fost retras din publicare', 'success');
			}
			await fetchStructure(true);
		} catch (e) {
			console.error('Course status action failed:', e);
			showToast(e?.response?.data?.message || 'Nu am putut actualiza statusul cursului.', 'error');
		} finally {
			setCourseActionLoading(false);
		}
	};

	const handleLessonStatusToggle = async (lessonId, nextStatus) => {
		if (nextStatus === 'draft') {
			const lesson = allLessons.find((item) => Number(item.id) === Number(lessonId));
			const title = lesson?.title || 'această lecție';
			if (!window.confirm(`Retragi lecția „${title}” din publicare? Cursanții nu o vor mai vedea ca lecție publicată.`)) {
				return;
			}
		}
		try {
			const response = await adminService.builderUpdateLesson(courseId, lessonId, { status: nextStatus });
			if (response?.lesson?.updated_at) {
				lastPersistedLessonUpdatedAtRef.current = response.lesson.updated_at;
			}
			await fetchStructure(true);
			showToast(nextStatus === 'published' ? 'Lecția a fost publicată.' : 'Lecția a fost retrasă din publicare.', 'success');
		} catch (e) {
			console.error('Lesson status toggle failed:', e);
			showToast(e?.response?.data?.message || 'Nu am putut actualiza statusul lecției.', 'error');
		}
	};

	const handleDuplicateLesson = async (lessonItem) => {
		if (!lessonItem?.id) return;
		try {
			const result = await adminService.builderCreateLesson(courseId, {
				module_id: lessonItem.module_id ?? null,
				title: `${lessonItem.title || 'Lecție'} (copie)`,
				content: lessonItem.content || '',
				type: lessonItem.type || 'text',
				video_url: lessonItem.video_url || null,
				duration_minutes: lessonItem.duration_minutes || null,
				status: 'draft',
			});
			const lesson = result?.lesson ?? result;
			await fetchStructure(true);
			if (lesson?.id) {
				setSelectedLessonId(lesson.id);
				setSelectedModuleId(lesson.module_id ?? lessonItem.module_id ?? null);
				setShowTestCreator(false);
			}
			showToast('Lecția a fost duplicată ca ciornă.', 'success');
		} catch (e) {
			console.error('Duplicate lesson failed:', e);
			showToast(e?.response?.data?.message || 'Nu am putut duplica lecția.', 'error');
		}
	};

	const handleTestStatusToggle = async (courseTestItem, nextStatus) => {
		const testId = courseTestItem?.test_id;
		if (!testId) return;
		if (nextStatus === 'draft') {
			const title = courseTestItem?.test?.title || `Test #${testId}`;
			if (!window.confirm(`Retragi testul „${title}” din publicare? Cursanții nu îl vor mai putea începe ca test publicat.`)) {
				return;
			}
		}
		try {
			await adminService.updateTest(testId, { status: nextStatus });
			setCourseAttachedTests((prev) =>
				prev.map((row) =>
					Number(row.test_id) === Number(testId)
						? { ...row, test: { ...(row.test || {}), status: nextStatus } }
						: row
				)
			);
			if (Number(inlineTest.id) === Number(testId)) {
				await loadTestIntoEditor(testId, inlineTestTab);
			}
			showToast(
				nextStatus === 'published' ? 'Testul a fost publicat.' : 'Testul a fost retras din publicare.',
				'success'
			);
		} catch (e) {
			console.error('Test status toggle failed:', e);
			showToast(e?.response?.data?.message || 'Nu am putut actualiza statusul testului.', 'error');
		}
	};

	const handleDuplicateCourse = async () => {
		if (!course?.id) return;
		if (!window.confirm(`Creezi o copie ciornă a cursului „${course.title || 'fără titlu'}”? Cursanții și echipele nu se copiază.`)) return;
		setCourseActionLoading(true);
		try {
			await flushPendingLessonContentSave();
			const data = await adminService.duplicateCourse(course.id);
			showToast('Copia cursului a fost creată ca ciornă.', 'success');
			navigate(`/admin/courses/${data.course.id}/builder`);
		} catch (e) {
			console.error('Duplicate course failed:', e);
			showToast(e?.response?.data?.message || 'Nu am putut duplica cursul.', 'error');
		} finally {
			setCourseActionLoading(false);
		}
	};

	const handleDeleteCourse = async () => {
		if (!course?.id) return;
		if (!window.confirm(`Ștergi definitiv cursul „${course.title || 'fără titlu'}”?`)) return;
		setCourseActionLoading(true);
		try {
			await adminService.deleteCourse(course.id);
			showToast('Cursul a fost șters.', 'success');
			navigate('/admin/courses');
		} catch (e) {
			console.error('Delete course failed:', e);
			showToast(e?.response?.data?.message || 'Nu am putut sterge cursul.', 'error');
			setCourseActionLoading(false);
		}
	};

	const handleDeleteModule = async (moduleItem) => {
		if (!moduleItem?.id) return;
		if (!window.confirm(`Ștergi modulul „${moduleItem.title || 'fără titlu'}” și toate lecțiile lui?`)) return;
		try {
			await adminService.deleteModule(moduleItem.id);
			await fetchStructure(true);
			showToast('Modulul a fost șters.', 'success');
		} catch (e) {
			console.error('Delete module failed:', e);
			showToast(e?.response?.data?.message || 'Nu am putut sterge modulul.', 'error');
		}
	};

	const handleDeleteLesson = async (lessonItem) => {
		if (!lessonItem?.id) return;
		if (!window.confirm(`Ștergi lecția „${lessonItem.title || 'fără titlu'}”?`)) return;
		try {
			await adminService.deleteLesson(lessonItem.id);
			await fetchStructure(true);
			showToast('Lectia a fost stearsa.', 'success');
		} catch (e) {
			console.error('Delete lesson failed:', e);
			showToast(e?.response?.data?.message || 'Nu am putut șterge lecția.', 'error');
		}
	};

	const handleDetachTestFromCourse = async (courseTestItem) => {
		if (!courseTestItem?.id) return;
		const title = courseTestItem?.test?.title || `Test #${courseTestItem.test_id}`;
		if (!window.confirm(`Elimini testul „${title}” din acest curs?`)) return;
		try {
			await adminService.builderDetachTest(courseId, courseTestItem.test_id, {
				course_test_id: courseTestItem.id,
			});
			await fetchAttachedTests();
			if (Number(inlineTest.id) === Number(courseTestItem.test_id)) {
				setShowTestCreator(false);
				resetTest();
			}
			showToast('Testul a fost eliminat din curs.', 'success');
		} catch (e) {
			console.error('Detach test failed:', e);
			showToast(e?.response?.data?.message || 'Nu am putut elimina testul din curs.', 'error');
		}
	};

	const handleRunQualityAudit = async () => {
		if (!courseId || qualityAuditLoading) return;
		try {
			setQualityAuditLoading(true);
			const report = await adminService.builderQualityAuditCourse(courseId);
			setQualityAuditReport(report);
			showToast('Verificarea calității este gata.', 'success');
		} catch (e) {
			console.error('Course quality audit failed:', e);
			showToast(e?.response?.data?.message || 'Nu am putut rula auditul QA.', 'error');
		} finally {
			setQualityAuditLoading(false);
		}
	};

	const getQualitySeverityLabel = (severity) => {
		if (severity === 'critical') return 'Critic';
		if (severity === 'warning') return 'Atenție';
		return 'Info';
	};

	const outlineItemCount = useMemo(() => {
		let count = buildRootOutlineFlow(rootLessons, getLessonAttachedTests, getCourseLevelAttachedTests).length;
		modules.forEach((moduleItem) => {
			count += buildModuleFlowItems(moduleItem, getLessonAttachedTests, getModuleAttachedTests).length;
		});
		return count;
	}, [getCourseLevelAttachedTests, getLessonAttachedTests, getModuleAttachedTests, modules, rootLessons]);

	const renderTestDropSlot = (moduleId, flowItems, insertIndex, moduleItem, rootLessonsList = null) => {
		if (!canMutateInAdminArea) return null;

		return (
			<li
				key={`drop-slot-${moduleId ?? 'root'}-${insertIndex}`}
				className="admin-course-builder-drop-slot"
				data-drop-module-id={moduleId ?? 'root'}
				data-flow-insert-index={insertIndex}
				onDragEnter={(e) => {
					if (!testDragPayloadRef.current) return;
					e.preventDefault();
					applyTestDropHint({
						moduleId: moduleId ?? null,
						targetType: 'flow-insert',
						insertIndex,
					});
				}}
				onDragOver={(e) => {
					if (!testDragPayloadRef.current) return;
					e.preventDefault();
					e.dataTransfer.dropEffect = 'move';
					applyTestDropHint({
						moduleId: moduleId ?? null,
						targetType: 'flow-insert',
						insertIndex,
					});
				}}
				onDrop={(e) => handleTestDropAtFlowIndex(e, moduleItem, flowItems, insertIndex, rootLessonsList)}
			>
				<div className="admin-course-builder-drop-slot-hit">
					<span className="admin-course-builder-drop-slot-line" />
					<span className="admin-course-builder-drop-slot-label">Plasează aici</span>
				</div>
			</li>
		);
	};

	const renderOutlineFlow = ({
		flowItems,
		moduleId,
		moduleItem,
		rootLessonsList,
		stepOffset = 0,
	}) => {
		let step = stepOffset;
		return flowItems.map((flowItem, flowIndex) => {
			const dropSlot = renderTestDropSlot(moduleId, flowItems, flowIndex, moduleItem, rootLessonsList);

			if (flowItem.type === 'lesson') {
				const lessonItem = flowItem.lesson;
				step += 1;
				const currentStep = step;
				const hintOnThisLesson = sameOutlineModule(lessonDropHint?.moduleId, moduleItem?.id ?? null)
					&& Number(lessonDropHint?.lessonId) === Number(lessonItem.id);
				const rowDropClass = hintOnThisLesson && lessonDropHint?.position === 'before'
					? 'is-lesson-drop-before'
					: hintOnThisLesson && lessonDropHint?.position === 'after'
						? 'is-lesson-drop-after'
						: '';

				const lessonTitle = lessonItem.title || `Lecție ${currentStep}`;
				const isLessonEditing = !showTestCreator && selectedLessonId === lessonItem.id;

				return (
					<React.Fragment key={flowItem.key}>
						{dropSlot}
						<li className="admin-course-builder-outline-item admin-course-builder-outline-item--lesson">
							<div
								className={`admin-course-builder-sidebar-lesson-row admin-course-builder-outline-row ${isLessonEditing ? 'is-selected' : ''} ${rowDropClass}`}
								onDragOver={(e) => {
									if (testDragPayloadRef.current) {
										handleTestDragOverFlowRow(e, moduleId, flowIndex);
										return;
									}
									handleLessonDragOverFlowItem(e, moduleItem, flowItems, flowIndex);
								}}
								onDrop={(e) => {
									if (testDragPayloadRef.current) {
										handleTestDropOnFlowRow(e, moduleItem, flowItems, flowIndex, rootLessonsList);
										return;
									}
									handleLessonDropOnFlowItem(e, moduleItem, flowItems, flowIndex);
								}}
							>
								{canMutateInAdminArea ? (
									<span
										className="admin-course-builder-sidebar-lesson-drag-handle"
										draggable
										onDragStart={(e) => handleLessonDragStart(e, lessonItem, moduleItem?.id ?? null)}
										onDragEnd={handleLessonDragEnd}
										title="Mută lecția"
										aria-label="Mută lecția"
									>
										<DragGripIcon size={14} color="#94a3b8" />
									</span>
								) : (
									<span className="admin-course-builder-sidebar-lesson-drag-handle is-muted" aria-hidden="true">
										<DragGripIcon size={14} color="#94a3b8" />
									</span>
								)}
								<button
									type="button"
									className={`admin-course-builder-sidebar-lesson ${isLessonEditing ? 'is-selected' : ''}`}
									title={lessonTitle}
									aria-current={isLessonEditing ? 'true' : undefined}
									onClick={async () => {
										await flushPendingLessonContentSave();
										await flushAllInlineQuestionSavesRef.current();
										setSelectedModuleId(moduleItem?.id ?? null);
										setSelectedLessonId(lessonItem.id);
										setShowTestCreator(false);
										closeOutlineIfMobile();
									}}
								>
									<span className="admin-course-builder-sidebar-lesson-num">{currentStep}</span>
									<span className="admin-course-builder-sidebar-lesson-title">{lessonTitle}</span>
								</button>
								<OutlineItemMenu
									statusPublished={lessonItem.status === 'published'}
									statusNoun="lecție"
									onPublish={() => handleLessonStatusToggle(lessonItem.id, 'published')}
									onUnpublish={() => handleLessonStatusToggle(lessonItem.id, 'draft')}
									onDuplicate={() => handleDuplicateLesson(lessonItem)}
									onDelete={() => handleDeleteLesson(lessonItem)}
									deleteLabel="Șterge"
								/>
							</div>
						</li>
					</React.Fragment>
				);
			}

			step += 1;
			const currentStep = step;
			const courseTestItem = flowItem.courseTest;
			const isSelected = showTestCreator && inlineTest.id === courseTestItem.test_id;
			const testStatus = courseTestItem?.test?.status === 'published' ? 'published' : 'draft';

			return (
				<React.Fragment key={flowItem.key}>
					{dropSlot}
					<li className="admin-course-builder-outline-item admin-course-builder-outline-item--test">
						<div
							className={`admin-course-builder-sidebar-test admin-course-builder-outline-test-row ${isSelected ? 'is-selected' : ''}`}
							onDragOver={(e) => {
								if (lessonDragPayloadRef.current) {
									handleLessonDragOverFlowItem(e, moduleItem, flowItems, flowIndex);
									return;
								}
								handleTestDragOverFlowRow(e, moduleId, flowIndex);
							}}
							onDrop={(e) => {
								if (lessonDragPayloadRef.current) {
									handleLessonDropOnFlowItem(e, moduleItem, flowItems, flowIndex);
									return;
								}
								handleTestDropOnFlowRow(e, moduleItem, flowItems, flowIndex, rootLessonsList);
							}}
						>
							{canMutateInAdminArea ? (
								<span
									className="admin-course-builder-sidebar-lesson-drag-handle"
									draggable
									onDragStart={(e) => handleTestDragStart(e, courseTestItem)}
									onDragEnd={handleTestDragEnd}
									title="Trage testul pentru a-l muta"
									aria-label="Trage testul"
								>
									<DragGripIcon size={14} color="#94a3b8" />
								</span>
							) : (
								<span className="admin-course-builder-sidebar-lesson-drag-handle is-muted" aria-hidden="true">
									<DragGripIcon size={14} color="#94a3b8" />
								</span>
							)}
							<span className="admin-course-builder-outline-test-num">{currentStep}</span>
							<button
								type="button"
								className="admin-course-builder-sidebar-test-main"
								onClick={() => {
									loadInlineTestById(courseTestItem.test_id);
									closeOutlineIfMobile();
								}}
							>
								<span className="admin-course-builder-sidebar-test-tag">Test</span>
								<span className="admin-course-builder-sidebar-test-title">
									{courseTestItem?.test?.title || `Test #${courseTestItem.test_id}`}
								</span>
							</button>
							<OutlineItemMenu
								statusPublished={testStatus === 'published'}
								statusNoun="test"
								onPublish={() => handleTestStatusToggle(courseTestItem, 'published')}
								onUnpublish={() => handleTestStatusToggle(courseTestItem, 'draft')}
								onDelete={canMutateInAdminArea ? () => handleDetachTestFromCourse(courseTestItem) : undefined}
								deleteLabel="Elimină din curs"
							/>
						</div>
					</li>
				</React.Fragment>
			);
		});
	};

	if (loading) {
		return (
			<div className="admin-container">
				<div className="lms-dashboard-loading">
					<div className="lms-spinner"></div>
					<p>Se încarcă builder-ul...</p>
				</div>
			</div>
		);
	}

	if (error || !structure) {
		return (
			<div className="admin-container">
				<div className="lms-empty-state">
					<p style={{ color: 'var(--color-error)' }}>{error || 'Nu s-a putut încărca builder-ul.'}</p>
					<button className="lms-btn-primary" onClick={() => fetchStructure()}>
						Reîncearcă
					</button>
				</div>
			</div>
		);
	}

	return (
		<div
			className={`admin-container admin-course-builder-page ${
				builderSidebarVisible ? 'has-detached-sidebar' : 'is-detached-sidebar-hidden'
			} ${
				openQuestionTypePickerId ? 'has-right-panel-expanded' : ''
			}`}
		>
			<div className="admin-course-builder-layout admin-course-builder-layout-clean">
				{builderSidebarVisible && (
					<button
						type="button"
						className="admin-course-builder-mobile-outline-backdrop"
						aria-label="Închide structura cursului"
						onClick={() => setBuilderSidebarVisible(false)}
					/>
				)}
				<aside
					className={`admin-course-builder-sidebar admin-course-builder-sidebar-clean admin-course-builder-sidebar-detached ${
						builderSidebarVisible ? 'is-visible' : 'is-hidden'
					}`}
				>
					<div className="admin-course-builder-sidebar-header">
						<div className="admin-course-builder-sidebar-header-top">
							<div className="admin-course-builder-sidebar-course-head">
								<button
									type="button"
									className="admin-course-builder-back va-btn-back admin-back-btn"
									onClick={handleLeaveBuilder}
								>
									<ArrowLeft size={14} weight="bold" color="currentColor" aria-hidden /> Cursuri
								</button>
								<p className="admin-course-builder-sidebar-course-title">{course?.title || 'Builder curs'}</p>
							</div>
							<div className="admin-course-builder-sidebar-header-actions">
								<div className="admin-course-builder-quick-add-wrap" ref={quickAddRef}>
									<button
										type="button"
										className="admin-course-builder-quick-add-btn"
										onClick={() => setQuickAddMenuOpen((open) => !open)}
										aria-expanded={quickAddMenuOpen}
										aria-haspopup="true"
										title="Creează modul, lecție sau test"
									>
										<span className="admin-course-builder-icon-wrap" aria-hidden="true">
											<Plus size={16} weight="bold" color="currentColor" aria-hidden="true" />
										</span>
									</button>
									{quickAddMenuOpen && (
										<div className="admin-course-builder-quick-add-menu">
											<button
												type="button"
												onClick={() => {
													setQuickCreateModuleOpen(true);
													setQuickAddMenuOpen(false);
												}}
											>
												Modul nou
											</button>
											<button
												type="button"
												onClick={() => {
													setQuickAddMenuOpen(false);
													handleQuickCreateLesson();
												}}
											>
												Lecție nouă
											</button>
											<button
												type="button"
												onClick={() => {
													setQuickAddMenuOpen(false);
													handleOpenCreateTestModal();
												}}
											>
												Test nou
											</button>
										</div>
									)}
								</div>
								<button
									type="button"
									className="admin-course-builder-sidebar-toggle"
									onClick={() => setBuilderSidebarVisible(false)}
									aria-label="Ascunde meniul builder"
									title="Ascunde meniul builder"
								>
									<span className="admin-course-builder-icon-wrap" aria-hidden="true">
										<CaretDoubleLeft size={16} weight="bold" color="currentColor" aria-hidden="true" />
									</span>
								</button>
							</div>
						</div>
						{quickCreateModuleOpen && (
							<div className="admin-course-builder-quick-module-create">
								<input
									type="text"
									className="admin-course-builder-quick-module-input"
									placeholder="Scrie titlul modulului + Enter"
									value={quickModuleTitle}
									onChange={(e) => setQuickModuleTitle(e.target.value)}
									disabled={quickModuleLoading}
									autoFocus
									onBlur={handleQuickModuleInputBlur}
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											handleQuickCreateModule();
										}
										if (e.key === 'Escape') {
											setQuickCreateModuleOpen(false);
											setQuickModuleTitle('');
										}
									}}
								/>
							</div>
						)}
					</div>

					<div
						ref={sidebarNavRef}
						className="admin-course-builder-sidebar-nav"
						onDragOver={handleSidebarTestDragOver}
					>
						<p className="admin-course-builder-drag-hint" role="status" aria-live="polite">
							Trage testul la linia evidențiată unde vrei să îl plasezi
						</p>

						{modules.length === 0 && rootLessons.length === 0 && getCourseLevelAttachedTests().length === 0 ? (
							<div className="admin-course-builder-sidebar-empty-state">
								<p className="admin-course-builder-sidebar-empty">Începe prin a crea o lecție sau un modul.</p>
							</div>
						) : (
							<div className="admin-course-builder-outline">
								<div className="admin-course-builder-outline-head">
									<h3 className="admin-course-builder-outline-title">Structură curs</h3>
									<span className="admin-course-builder-outline-count">
										{outlineItemCount} {outlineItemCount === 1 ? 'element' : 'elemente'}
									</span>
								</div>
								<ul
									className="admin-course-builder-outline-list"
									onDragOver={handleSidebarTestDragOver}
								>
									{(() => {
										const rootFlow = buildRootOutlineFlow(
											rootLessons,
											getLessonAttachedTests,
											getCourseLevelAttachedTests
										);
										return (
											<>
												{rootFlow.length > 0 && (
													<>
														{renderOutlineFlow({
															flowItems: rootFlow,
															moduleId: null,
															moduleItem: null,
															rootLessonsList: rootLessons,
															stepOffset: 0,
														})}
														{renderTestDropSlot(null, rootFlow, rootFlow.length, null, rootLessons)}
													</>
												)}
												{canMutateInAdminArea ? (
													<li
														className={`admin-course-builder-outline-lesson-drop-end is-root ${
															lessonDropHint?.zone === 'end' && sameOutlineModule(lessonDropHint?.moduleId, null)
																? 'is-active'
																: ''
														}`}
														onDragOver={(e) => handleLessonDragOverModuleEnd(e, null)}
														onDrop={(e) => handleLessonDropAtModuleEnd(e, null)}
													>
														{modules.length > 0
															? 'Eliberează aici — mută lecția în afara modulelor'
															: 'Eliberează aici — mută lecția la final'}
													</li>
												) : null}
												{modules.map((moduleItem, moduleIndex) => {
													const moduleFlow = buildModuleFlowItems(
														moduleItem,
														getLessonAttachedTests,
														getModuleAttachedTests
													);
													let stepOffset = rootFlow.length;
													for (let i = 0; i < moduleIndex; i += 1) {
														stepOffset += buildModuleFlowItems(
															modules[i],
															getLessonAttachedTests,
															getModuleAttachedTests
														).length;
													}
													return (
														<li key={moduleItem.id} className="admin-course-builder-outline-module">
															<div
																className="admin-course-builder-outline-module-head"
																onDragOver={(e) => {
																	if (lessonDragPayloadRef.current) {
																		e.preventDefault();
																		e.dataTransfer.dropEffect = 'move';
																		const movingId = lessonDragPayloadRef.current.lessonId;
																		const firstOther = (moduleItem.lessons || []).find(
																			(lesson) => Number(lesson.id) !== Number(movingId)
																		);
																		if (firstOther) {
																			setLessonDropHint({
																				moduleId: moduleItem.id,
																				lessonId: firstOther.id,
																				position: 'before',
																			});
																		} else {
																			setLessonDropHint({ moduleId: moduleItem.id, zone: 'end' });
																		}
																		return;
																	}
																	if (!testDragPayloadRef.current) return;
																	e.preventDefault();
																	e.dataTransfer.dropEffect = 'move';
																}}
																onDrop={(e) => {
																	if (lessonDragPayloadRef.current) {
																		handleLessonDropAtModuleStart(e, moduleItem);
																	}
																}}
															>
																<span className="admin-course-builder-outline-module-label">
																	Modul {moduleIndex + 1}
																</span>
																{editingModuleId === moduleItem.id ? (
																	<input
																		type="text"
																		className="admin-course-builder-outline-module-input"
																		value={editingModuleTitle}
																		autoFocus
																		onChange={(e) => setEditingModuleTitle(e.target.value)}
																		onBlur={() => handleSaveModuleRename(moduleItem.id, moduleItem.title)}
																		onKeyDown={(e) => {
																			if (e.key === 'Enter') {
																				e.preventDefault();
																				handleSaveModuleRename(moduleItem.id, moduleItem.title);
																			}
																			if (e.key === 'Escape') {
																				setEditingModuleId(null);
																				setEditingModuleTitle('');
																			}
																		}}
																	/>
																) : (
																	<>
																		<button
																			type="button"
																			className={`admin-course-builder-outline-module-name ${
																				selectedModuleId === moduleItem.id ? 'is-active' : ''
																			}`}
																			onClick={async () => {
																				await flushAllInlineQuestionSavesRef.current();
																				setSelectedModuleId(moduleItem.id);
																				setShowTestCreator(false);
																			}}
																			onDoubleClick={() => beginModuleRename(moduleItem)}
																			title="Dublu-click pentru redenumire"
																		>
																			{moduleItem.title || `Modul ${moduleIndex + 1}`}
																		</button>
																		<button
																			type="button"
																			className="admin-course-builder-sidebar-lesson-icon-btn is-danger is-delete"
																			onClick={() => handleDeleteModule(moduleItem)}
																			title="Șterge modulul"
																			aria-label="Șterge modulul"
																		>
																			<Trash aria-hidden="true" size={17} weight="bold" color="#dc2626" />
																		</button>
																	</>
																)}
															</div>
															<ul className="admin-course-builder-outline-module-items">
																{renderOutlineFlow({
																	flowItems: moduleFlow,
																	moduleId: moduleItem.id,
																	moduleItem,
																	rootLessonsList: null,
																	stepOffset,
																})}
																{renderTestDropSlot(moduleItem.id, moduleFlow, moduleFlow.length, moduleItem)}
																{canMutateInAdminArea ? (
																	<li
																		className={`admin-course-builder-outline-lesson-drop-end ${
																			lessonDropHint?.zone === 'end' && sameOutlineModule(lessonDropHint?.moduleId, moduleItem.id)
																				? 'is-active'
																				: ''
																		}`}
																		onDragOver={(e) => handleLessonDragOverModuleEnd(e, moduleItem)}
																		onDrop={(e) => handleLessonDropAtModuleEnd(e, moduleItem)}
																	>
																		Eliberează aici — mută lecția la finalul modulului
																	</li>
																) : null}
															</ul>
														</li>
													);
												})}
											</>
										);
									})()}
								</ul>
							</div>
						)}
					</div>

					<div className="admin-course-builder-sidebar-footer">
						<div className="admin-course-builder-actions admin-course-builder-actions-in-sidebar">
							{(() => {
								const canPublish = !isCoursePublished || hasUnpublishedEdits;
								return (
									<>
										<div className="admin-course-builder-publish-state">
											<span className={`admin-course-builder-course-status-badge is-${String(course?.status || 'draft')}${hasUnpublishedEdits ? ' is-editing' : ''}`}>
												{coursePublishStatusLabel}
											</span>
											<p className="admin-course-builder-publish-state-copy">{coursePublishStatusHint}</p>
											<AutoSaveIndicator
												status={lessonSaveStatus}
												liveHint={hasUnpublishedEdits}
												onRetry={flushPendingLessonContentSave}
											/>
										</div>
										{canPublish ? (
											<button
												type="button"
												className="admin-btn lms-btn-primary admin-course-builder-actions-primary"
												onClick={() => handleCourseStatusAction('publish')}
												disabled={courseActionLoading}
											>
												{courseActionLoading ? 'Se procesează…' : hasUnpublishedEdits ? 'Publică modificările' : 'Publică'}
											</button>
										) : null}
										<button
											type="button"
											className="admin-btn admin-btn-secondary"
											onClick={handlePreviewAsStudent}
										>
											Previzualizează ca elev
										</button>
										<button
											type="button"
											className="admin-btn admin-btn-secondary"
											onClick={handleDuplicateCourse}
											disabled={courseActionLoading}
										>
											Duplică cursul
										</button>
										{isCoursePublished ? (
											<button
												type="button"
												className="admin-btn admin-btn-secondary admin-course-builder-actions-unpublish"
												onClick={() => handleCourseStatusAction('unpublish')}
												disabled={courseActionLoading}
											>
												{courseActionLoading ? 'Se procesează…' : 'Retrage'}
											</button>
										) : null}
										<button
											type="button"
											className="va-btn-delete admin-course-builder-actions-delete"
											onClick={handleDeleteCourse}
											disabled={courseActionLoading}
										>
											<Trash aria-hidden="true" size={16} weight="bold" color="currentColor" />
											Șterge curs
										</button>
									</>
								);
							})()}
						</div>
					</div>
				</aside>
				{!builderSidebarVisible && (
					<button
						type="button"
						className="admin-course-builder-sidebar-show-btn"
						onClick={() => setBuilderSidebarVisible(true)}
						aria-label="Afișează structura cursului"
						title="Structură curs"
					>
						<span className="admin-course-builder-icon-wrap" aria-hidden="true">
							<CaretDoubleRight size={16} weight="bold" color="currentColor" aria-hidden="true" />
						</span>
						<span className="admin-course-builder-sidebar-show-label">Structură</span>
					</button>
				)}

				<div className="admin-course-builder-workspace admin-course-builder-workspace-clean">
					<div className="admin-course-builder-workspace-content">
						{qualityAuditReport && (
							<section className="admin-course-builder-qa-panel">
								<div className="admin-course-builder-qa-head">
									<div>
										<span className="admin-course-builder-qa-eyebrow">Verificare calitate</span>
										<h2>Scor pregătire: {qualityAuditReport.readiness_score}/100</h2>
										<p>
											{qualityAuditReport.status === 'ready'
												? 'Cursul arată pregătit pentru publicare.'
												: qualityAuditReport.status === 'needs_review'
													? 'Cursul este aproape gata, dar merită revizuit.'
													: 'Cursul are probleme importante înainte de publicare.'}
										</p>
									</div>
									<div className="admin-course-builder-qa-head-actions">
										<button
											type="button"
											className="admin-btn admin-btn-secondary"
											onClick={handleRunQualityAudit}
											disabled={qualityAuditLoading}
										>
											{qualityAuditLoading ? 'Se auditează…' : 'Re-rulează'}
										</button>
										<button type="button" className="admin-course-builder-qa-close va-close-btn" onClick={() => setQualityAuditReport(null)} aria-label="Închide">
											<X size={18} weight="bold" aria-hidden="true" />
										</button>
									</div>
								</div>
								<div className="admin-course-builder-qa-summary">
									<span>{qualityAuditReport.summary?.modules ?? 0} module</span>
									<span>{qualityAuditReport.summary?.lessons ?? 0} lecții</span>
									<span>{qualityAuditReport.summary?.tests ?? 0} teste</span>
									<span>{qualityAuditReport.summary?.critical_issues ?? 0} critice</span>
									<span>{qualityAuditReport.summary?.warnings ?? 0} atenționări</span>
								</div>
								{qualityAuditReport.issues?.length ? (
									<div className="admin-course-builder-qa-issues">
										{qualityAuditReport.issues.slice(0, 8).map((issue, index) => (
											<div key={`${issue.path}-${index}`} className={`admin-course-builder-qa-issue is-${issue.severity}`}>
												<span>{getQualitySeverityLabel(issue.severity)}</span>
												<div>
													<strong>{issue.title}</strong>
													<p>{issue.message}</p>
												</div>
											</div>
										))}
									</div>
								) : null}
								{qualityAuditReport.recommendations?.length ? (
									<div className="admin-course-builder-qa-recommendations">
										<strong>Recomandări</strong>
										<ul>
											{qualityAuditReport.recommendations.map((item) => (
												<li key={item}>{item}</li>
											))}
										</ul>
									</div>
								) : null}
							</section>
						)}
						{showTestCreator ? (
							<InlineTestEditorShell
								editor={{
									...testEditor,
									handlePublishInlineTest,
								}}
								courseId={courseId}
								subtitle="Configurezi testul fără să părăsești pagina de creare curs."
							/>
						) : selectedLesson ? (
							<>
								<div className="admin-course-builder-direct-editor-wrap admin-course-builder-direct-editor-wrap-full">
									<LessonTipTapEditor
										key={`${selectedLesson.id}:${lessonEditorRefreshKey}`}
										courseId={courseId}
										value={lessonContent}
										onChange={handleLessonContentChange}
										onBlur={() => {
											flushPendingLessonContentSave();
										}}
										placeholder="Scrie lecția aici..."
										style={{ minHeight: '100%', height: '100%' }}
										header={(
											<div className="admin-course-builder-lesson-heading-row">
												<div
													ref={lessonTitleRef}
													className="admin-course-builder-lesson-title-inline"
													contentEditable
													suppressContentEditableWarning
													dir="ltr"
													onBlur={(e) => {
														const nextTitle = e.currentTarget.textContent?.trim();
														if (nextTitle && nextTitle !== selectedLesson.title) {
															handleUpdateLessonTitle(selectedLesson.id, nextTitle);
														}
													}}
													onKeyDown={(e) => {
														if (e.key === 'Enter') {
															e.preventDefault();
															e.currentTarget.blur();
														}
													}}
													role="textbox"
													aria-label="Titlu lecție"
												>
													{selectedLesson.title || 'Titlu lecție'}
												</div>
											</div>
										)}
										toolbarEnd={canMutateInAdminArea ? (
											<>
												<AutoSaveIndicator
													status={lessonSaveStatus}
													onRetry={flushPendingLessonContentSave}
												/>
												<button
													type="button"
													className="va-btn-save admin-btn lms-btn-primary"
													onClick={handleManualLessonSave}
													disabled={lessonSaveStatus === 'saving'}
												>
													{lessonSaveStatus === 'saving' ? 'Se salvează...' : 'Salvează'}
												</button>
											</>
										) : null}
									/>
								</div>
							</>
						) : (
							<div className="admin-card">
								<div className="admin-card-body">Selectează o lecție din stânga.</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{showCreateTestModal && (
				<Modal
					isOpen={showCreateTestModal}
					onClose={() => { if (!creatingTestFromModal) setShowCreateTestModal(false); }}
					closeOnBackdropClick={!creatingTestFromModal}
					closeOnEscape={!creatingTestFromModal}
					ariaLabelledby="inline-test-modal-heading"
					className="admin-course-builder-test-modal-overlay"
					unstyledContent
				>
					<div className="admin-course-builder-test-modal">
						<h3 id="inline-test-modal-heading">Creează test</h3>
						<form onSubmit={handleCreateTestFromModal} className="admin-course-builder-test-modal-form">
							<label htmlFor="inline-test-modal-title">Titlu test *</label>
							<input
								id="inline-test-modal-title"
								type="text"
								value={createTestTitle}
								onChange={(e) => setCreateTestTitle(e.target.value)}
								placeholder="Ex: Evaluare modul 1"
								data-modal-initial-focus
								required
								aria-required="true"
							/>
							<div className="admin-course-builder-test-modal-actions">
								<button type="button" className="admin-btn admin-btn-secondary" onClick={() => setShowCreateTestModal(false)} disabled={creatingTestFromModal}>
									Anulează
								</button>
								<button type="submit" className="admin-btn lms-btn-primary" disabled={creatingTestFromModal}>
									{creatingTestFromModal ? 'Se creează...' : 'Continuă'}
								</button>
							</div>
						</form>
					</div>
				</Modal>
			)}

			<PublishCourseModal
				open={publishModalOpen}
				onClose={() => {
					setPublishModalOpen(false);
				}}
				course={course}
				validationReport={publishValidationReport}
				onValidate={handleValidateForPublish}
				onPublished={handleCoursePublished}
				onFixIssue={handleFixPublishIssue}
			/>

		</div>
	);
};

// Starea builder-ului (lecția selectată, editorul) ține de un singur curs; alt id = instanță nouă.
const AdminCourseBuilderRoute = () => {
	const { id } = useParams();
	return <AdminCourseBuilderPage key={id} />;
};

export default AdminCourseBuilderRoute;
