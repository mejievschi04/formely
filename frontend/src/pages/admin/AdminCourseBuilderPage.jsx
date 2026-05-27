import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CaretDoubleLeft, CaretDoubleRight, Eye, EyeSlash, Lightning, Plus, Trash } from '@phosphor-icons/react';
import { adminService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import AutoSaveIndicator from '../../components/common/AutoSaveIndicator';
import { DragGripIcon } from '../../components/common/DragGripIcon';
import RichTextEditor from '../../components/RichTextEditor';
import AICourseChat from '../../components/admin/ai/AICourseChat';
import '../../styles/admin-course-builder.css';
import { useAuth } from '../../contexts/AuthContext';
import InlineTestEditorShell from '../../components/admin/courses/InlineTestEditorShell';
import PublishCourseModal from '../../components/admin/courses/PublishCourseModal';
import { useInlineTestEditor } from '../../hooks/useInlineTestEditor';
import { TEST_EDITOR_DEFAULT as INLINE_TEST_DEFAULT } from '../../utils/testQuestionBuilder';
import { notifyAiComingSoon } from '../../utils/aiAvailability';

const LESSON_DRAG_MIME = 'application/x-formely-course-lesson';

/** Index de inserare pentru op-ul builder moveLesson (lista destinație fără lecția mutată). */
function computeLessonInsertIndex(modulesList, toModuleId, movingLessonId, targetLessonId, position) {
	const mod = modulesList.find((m) => Number(m.id) === Number(toModuleId));
	if (!mod) return 0;
	const filtered = (mod.lessons || []).filter((l) => Number(l.id) !== Number(movingLessonId));
	if (targetLessonId == null || position === 'end') {
		return filtered.length;
	}
	const idx = filtered.findIndex((l) => Number(l.id) === Number(targetLessonId));
	if (idx === -1) return filtered.length;
	return position === 'before' ? idx : idx + 1;
}

const AdminCourseBuilderPage = () => {
	const { id } = useParams();
	const courseId = Number(id);
	const navigate = useNavigate();
	const { showToast } = useToast();
	const { canMutateInAdminArea } = useAuth();

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [structure, setStructure] = useState(null);
	const [selectedModuleId, setSelectedModuleId] = useState(null);
	const [selectedLessonId, setSelectedLessonId] = useState(null);
	const [lessonContent, setLessonContent] = useState('');
	const [lessonSaveStatus, setLessonSaveStatus] = useState(null);
	const [courseActionLoading, setCourseActionLoading] = useState(false);
	const [publishModalOpen, setPublishModalOpen] = useState(false);
	const [publishValidationReport, setPublishValidationReport] = useState(null);
	const [showAiAssistant, setShowAiAssistant] = useState(false);

	const [quickAddMenuOpen, setQuickAddMenuOpen] = useState(false);
	const [quickCreateModuleOpen, setQuickCreateModuleOpen] = useState(false);
	const [quickModuleTitle, setQuickModuleTitle] = useState('');
	const [quickModuleLoading, setQuickModuleLoading] = useState(false);
	const [showTestCreator, setShowTestCreator] = useState(false);
	const [builderSidebarVisible, setBuilderSidebarVisible] = useState(true);
	const [showCreateTestModal, setShowCreateTestModal] = useState(false);
	const [createTestTitle, setCreateTestTitle] = useState('');
	const [createTestModuleId, setCreateTestModuleId] = useState(null);
	const [courseAttachedTests, setCourseAttachedTests] = useState([]);
	const [draggingSidebarTestId, setDraggingSidebarTestId] = useState(null);
	const [sidebarDropHint, setSidebarDropHint] = useState({ moduleId: null, targetId: null, position: null });
	const [lessonDropHint, setLessonDropHint] = useState(null);
	const lessonDragPayloadRef = useRef(null);
	const [editingModuleId, setEditingModuleId] = useState(null);
	const [editingModuleTitle, setEditingModuleTitle] = useState('');
	const lessonTitleRef = useRef(null);
	const quickAddRef = useRef(null);

	const contentSaveTimeoutRef = useRef(null);
	const lastPersistedLessonContentRef = useRef('');
	const pendingContentRef = useRef(null);
	const flushAllInlineQuestionSavesRef = useRef(() => Promise.resolve());
	const course = structure?.course || null;
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
				__moduleTitle: 'Fara modul',
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

	const voltCourseSummary = useMemo(() => {
		const moduleLines = modules.slice(0, 6).map((moduleItem, index) => {
			const lessonTitles = (moduleItem.lessons || [])
				.slice(0, 4)
				.map((lessonItem) => `${lessonItem.id ?? 'nou'}: ${lessonItem.title || 'Lecție'}`)
				.join(', ');
			return `${index + 1}. [module_id=${moduleItem.id ?? 'nou'}] ${moduleItem.title || 'Modul fără titlu'}${lessonTitles ? ` | lecții: ${lessonTitles}` : ''}`;
		});
		const rootLessonTitles = rootLessons
			.slice(0, 6)
			.map((lessonItem) => `${lessonItem.id ?? 'nou'}: ${lessonItem.title || 'Lecție'}`)
			.join(', ');
		return [
			`Curs: ${course?.title || 'Curs curent'}`,
			course?.description ? `Descriere: ${course.description}` : null,
			moduleLines.length > 0 ? `Module existente:\n${moduleLines.join('\n')}` : 'Module existente: niciunul',
			rootLessonTitles ? `Lecții la rădăcină: ${rootLessonTitles}` : null,
		].filter(Boolean).join('\n\n');
	}, [course?.description, course?.title, modules, rootLessons]);

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

	const flushPendingLessonContentSave = useCallback(async () => {
		if (contentSaveTimeoutRef.current) {
			clearTimeout(contentSaveTimeoutRef.current);
			contentSaveTimeoutRef.current = null;
		}
		const pending = pendingContentRef.current;
		if (!pending?.lessonId) return;
		const { lessonId, content } = pending;
		if (
			!String(content || '').trim() &&
			String(lastPersistedLessonContentRef.current || '').trim()
		) {
			pendingContentRef.current = null;
			return;
		}
		try {
			await adminService.builderUpdateLesson(courseId, lessonId, { content });
			lastPersistedLessonContentRef.current = content ?? '';
			// Șterge pending doar dacă nu s-a mai editat între timp (altfel păstrăm coada pentru următorul save)
			if (
				pendingContentRef.current?.lessonId === lessonId &&
				pendingContentRef.current?.content === content
			) {
				pendingContentRef.current = null;
			}
			setLessonSaveStatus('saved');
		} catch (e) {
			console.error('Lesson content save failed:', e);
			setLessonSaveStatus('error');
			showToast('Eroare la salvarea conținutului lecției.', 'error');
		}
	}, [courseId, showToast]);

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
		inlineQuestions,
		inlineTestTab,
		setInlineTestTab,
		inlineTestSaving,
		inlinePublishLoading,
		creatingTest,
		addingQuestion,
		expandedQuestionId,
		setExpandedQuestionId,
		openQuestionTypePickerId,
		flushAllInlineQuestionSaves,
		loadTest: loadTestIntoEditor,
		resetTest,
		ensureInlineTestCreated,
		handleSaveInlineTestNow,
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
		await loadTestIntoEditor(testId, 'questions');
		setShowTestCreator(true);
	}, [loadTestIntoEditor]);

	const clearLessonDrag = useCallback(() => {
		lessonDragPayloadRef.current = null;
		setLessonDropHint(null);
	}, []);

	const handleLessonMove = useCallback(
		async (lessonId, toModuleId, toIndex) => {
			try {
				await flushPendingLessonContentSave();
				await flushAllInlineQuestionSavesRef.current();
				const data = await adminService.patchCourseBuilderStructure(courseId, [
					{
						op: 'moveLesson',
						lesson_id: Number(lessonId),
						to_module_id: Number(toModuleId),
						to_index: toIndex,
					},
				]);
				setStructure(data);
				await fetchAttachedTests();
				setSelectedModuleId(Number(toModuleId));
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

	const handleLessonDragStart = useCallback(
		(e, lessonItem, sourceModuleId) => {
			if (!canMutateInAdminArea) {
				e.preventDefault();
				return;
			}
			const payload = { lessonId: lessonItem.id, moduleId: sourceModuleId };
			lessonDragPayloadRef.current = payload;
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

	const handleLessonDragOverRow = useCallback((e, moduleItem, lessonItem) => {
		if (!lessonDragPayloadRef.current) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		const rect = e.currentTarget.getBoundingClientRect();
		const position = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
		setLessonDropHint({ moduleId: moduleItem.id, lessonId: lessonItem.id, position });
	}, []);

	const handleLessonDragOverModuleEnd = useCallback((e, moduleItem) => {
		if (!lessonDragPayloadRef.current) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		setLessonDropHint({ moduleId: moduleItem.id, zone: 'end' });
	}, []);

	const handleLessonDropOnLesson = useCallback(
		async (e, targetModuleItem, targetLessonItem) => {
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
			if (Number(movingId) === Number(targetLessonItem.id)) {
				clearLessonDrag();
				return;
			}
			const rect = e.currentTarget.getBoundingClientRect();
			const position = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
			const toIndex = computeLessonInsertIndex(
				modules,
				targetModuleItem.id,
				movingId,
				targetLessonItem.id,
				position
			);
			await handleLessonMove(movingId, targetModuleItem.id, toIndex);
			clearLessonDrag();
		},
		[modules, handleLessonMove, clearLessonDrag]
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
			const toIndex = computeLessonInsertIndex(modules, targetModuleItem.id, movingId, null, 'end');
			await handleLessonMove(movingId, targetModuleItem.id, toIndex);
			clearLessonDrag();
		},
		[modules, handleLessonMove, clearLessonDrag]
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
		} catch (e) {
			console.error('Failed to load course builder structure:', e);
			if (!background) setError('Nu s-a putut încărca builder-ul cursului.');
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
		const hasModules = modules.length > 0;
		const hasRootLessons = rootLessons.length > 0;

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
	}, [allLessons, modules, rootLessons, selectedLessonId, selectedModuleId]);

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
		setLessonSaveStatus(null);
	}, [selectedLesson?.id]);

	useEffect(() => {
		if (!lessonTitleRef.current || !selectedLesson) return;
		lessonTitleRef.current.textContent = selectedLesson.title || 'Titlu lecție';
	}, [selectedLesson?.id, selectedLesson?.title]);

	const handleUpdateLessonTitle = async (lessonId, newTitle) => {
		if (!newTitle?.trim()) return;
		try {
			await adminService.builderUpdateLesson(courseId, lessonId, { title: newTitle.trim() });
			showToast('Titlul lecției salvat', 'success');
			await fetchStructure(true);
		} catch (e) {
			console.error('Update lesson title failed:', e);
			showToast('Eroare la salvarea titlului', 'error');
		}
	};

	const handleLessonContentChange = (nextContent) => {
		if (!selectedLesson?.id) return;
		const blocks = selectedLesson?.content_blocks ?? selectedLesson?.contentBlocks ?? [];
		const hasBlocks = Array.isArray(blocks) && blocks.length > 0;
		if (!String(nextContent || '').trim() && hasBlocks) {
			return;
		}
		if (
			!String(nextContent || '').trim() &&
			String(lastPersistedLessonContentRef.current || '').trim()
		) {
			return;
		}
		setLessonContent(nextContent);
		pendingContentRef.current = {
			lessonId: selectedLesson.id,
			content: nextContent || '',
		};
		setLessonSaveStatus('saving');
		if (contentSaveTimeoutRef.current) clearTimeout(contentSaveTimeoutRef.current);
		contentSaveTimeoutRef.current = setTimeout(async () => {
			const pending = pendingContentRef.current;
			if (!pending?.lessonId) return;
			const { lessonId, content } = pending;
			try {
				await adminService.builderUpdateLesson(courseId, lessonId, { content });
				if (
					pendingContentRef.current?.lessonId === lessonId &&
					pendingContentRef.current?.content === content
				) {
					pendingContentRef.current = null;
				}
				setLessonSaveStatus('saved');
			} catch (e) {
				console.error('Lesson content autosave failed:', e);
				setLessonSaveStatus('error');
				showToast('Autosave eșuat pentru conținutul lecției.', 'error');
			}
		}, 700);
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

	const handleCreateTestInline = async (e) => {
		e.preventDefault();
		await ensureInlineTestCreated();
	};

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
				randomize_questions: INLINE_TEST_DEFAULT.randomize_questions,
				randomize_answers: INLINE_TEST_DEFAULT.randomize_answers,
				show_results_immediately: INLINE_TEST_DEFAULT.show_results_immediately,
				show_correct_answers: INLINE_TEST_DEFAULT.show_correct_answers,
				allow_review: INLINE_TEST_DEFAULT.allow_review,
				requires_manual_verification: INLINE_TEST_DEFAULT.requires_manual_verification,
			});
			const newTestId = Number(created?.test?.id ?? created?.id);
			if (!newTestId) throw new Error('ID test invalid');

			if (createTestModuleId) {
				const moduleTests = getModuleAttachedTests(createTestModuleId);
				await adminService.builderAttachTest(courseId, {
					test_id: newTestId,
					scope: 'module',
					scope_id: createTestModuleId,
					order: moduleTests.length,
				});
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

	const handleMoveModuleTest = async (moduleId, courseTestId, direction) => {
		const list = getModuleAttachedTests(moduleId);
		const currentIndex = list.findIndex((item) => Number(item.id) === Number(courseTestId));
		if (currentIndex === -1) return;
		const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
		if (targetIndex < 0 || targetIndex >= list.length) return;

		const swapped = [...list];
		const temp = swapped[currentIndex];
		swapped[currentIndex] = swapped[targetIndex];
		swapped[targetIndex] = temp;

		setCourseAttachedTests((prev) => prev.map((row) => {
			const idx = swapped.findIndex((item) => Number(item.id) === Number(row.id));
			if (idx === -1) return row;
			return { ...row, order: idx };
		}));

		try {
			for (let i = 0; i < swapped.length; i += 1) {
				const row = swapped[i];
				await adminService.builderAttachTest(courseId, {
					test_id: row.test_id,
					scope: 'module',
					scope_id: moduleId,
					order: i,
					required: row.required,
					passing_score: row.passing_score,
				});
			}
			await fetchAttachedTests();
		} catch (err) {
			console.error('Reorder module tests failed:', err);
			showToast(err?.response?.data?.message || 'Eroare la mutarea testului.', 'error');
			fetchAttachedTests();
		}
	};

	const handleReorderModuleTests = async (moduleId, sourceCourseTestId, targetCourseTestId) => {
		if (Number(sourceCourseTestId) === Number(targetCourseTestId)) return;
		const list = getModuleAttachedTests(moduleId);
		const sourceIndex = list.findIndex((item) => Number(item.id) === Number(sourceCourseTestId));
		const targetIndex = list.findIndex((item) => Number(item.id) === Number(targetCourseTestId));
		if (sourceIndex === -1 || targetIndex === -1) return;

		const reordered = [...list];
		const [moved] = reordered.splice(sourceIndex, 1);
		reordered.splice(targetIndex, 0, moved);

		setCourseAttachedTests((prev) => prev.map((row) => {
			const idx = reordered.findIndex((item) => Number(item.id) === Number(row.id));
			if (idx === -1) return row;
			return { ...row, order: idx };
		}));

		try {
			for (let i = 0; i < reordered.length; i += 1) {
				const row = reordered[i];
				await adminService.builderAttachTest(courseId, {
					test_id: row.test_id,
					scope: 'module',
					scope_id: moduleId,
					order: i,
					required: row.required,
					passing_score: row.passing_score,
				});
			}
			await fetchAttachedTests();
		} catch (err) {
			console.error('Drag reorder module tests failed:', err);
			showToast(err?.response?.data?.message || 'Eroare la mutarea testului.', 'error');
			fetchAttachedTests();
		}
	};

	useEffect(() => () => {
		flushPendingLessonContentSave();
		flushAllInlineQuestionSavesRef.current();
	}, [flushPendingLessonContentSave]);

	const handleValidateForPublish = useCallback(async () => {
		if (!course?.id) return;
		try {
			const report = await adminService.builderValidateCourse(course.id);
			setPublishValidationReport(report);
			return report;
		} catch (e) {
			console.error('Course validation failed:', e);
			showToast(e?.response?.data?.message || 'Nu am putut valida cursul.', 'error');
			throw e;
		}
	}, [course?.id, showToast]);

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
	};	const getLessonContentFromPlanItem = (lessonItem) => {
		if (!lessonItem || typeof lessonItem !== 'object') {
			return '';
		}

		return String(lessonItem.content ?? lessonItem.body ?? lessonItem.html ?? '').trim();
	};

	const countLessonContentLines = (content) => {
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
			.filter(Boolean)
			.length;
	};

	const validateAiPlanStructure = (plan) => {
		if (!plan || typeof plan !== 'object') {
			return { valid: false, message: 'AI nu a returnat un plan valid.' };
		}

		const operations = Array.isArray(plan.operations) ? plan.operations : [];
		const courseUpdates = plan.course_updates && typeof plan.course_updates === 'object' ? plan.course_updates : null;
		if (!courseUpdates && operations.length === 0) {
			return { valid: false, message: 'Planul AI nu conține schimbări aplicabile.' };
		}

		const lessonOperations = operations.filter((op) => {
			if (!op || typeof op !== 'object') return false;
			const opType = String(op.op || '').trim();
			return (
				opType === 'create_lesson' ||
				opType === 'createLesson' ||
				opType === 'update_lesson' ||
				opType === 'updateLesson'
			);
		});

		for (const lessonOp of lessonOperations) {
			const opType = String(lessonOp.op || '').trim();
			const content = getLessonContentFromPlanItem(lessonOp);
			const lineCount = countLessonContentLines(content);
			if (opType === 'create_lesson' || opType === 'createLesson') {
				if (!content || lineCount < 4) {
					return {
						valid: false,
						message: `Lecția "${lessonOp.title || 'fără titlu'}" nu are conținut suficient.`,
					};
				}
			}

			if (opType === 'update_lesson' || opType === 'updateLesson') {
				if (content && lineCount < 4) {
					return {
						valid: false,
						message: `Lecția "${lessonOp.title || 'fără titlu'}" are conținut prea scurt.`,
					};
				}
			}
		}

		const moduleOperations = operations.filter((op) => {
			if (!op || typeof op !== 'object') return false;
			const opType = String(op.op || '').trim();
			return (
				opType === 'create_module' ||
				opType === 'createModule' ||
				opType === 'update_module' ||
				opType === 'updateModule'
			);
		});

		if (moduleOperations.length > 0 && lessonOperations.length === 0) {
			return {
				valid: false,
				message: 'Planul AI modifică module, dar nu include lecții. Refuzăm aplicarea până primește conținut real.',
			};
		}

		return { valid: true, operations, courseUpdates };
	};

	const handleApplyAiPlan = async (planPayload) => {
		const plan = planPayload?.plan ?? planPayload;
		const validation = validateAiPlanStructure(plan);
		if (!validation.valid) {
			showToast(validation.message, 'error');
			return;
		}

		const { operations, courseUpdates } = validation;

		const allowedCourseKeys = [
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
		const filteredCourseUpdates = courseUpdates
			? Object.fromEntries(
				Object.entries(courseUpdates).filter(([key, value]) => allowedCourseKeys.includes(key) && value !== undefined)
			)
			: null;

		const applyLessonsForModule = async (courseIdValue, moduleIdValue, lessons = []) => {
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
		};

		setCourseActionLoading(true);
		try {
			if (filteredCourseUpdates && Object.keys(filteredCourseUpdates).length > 0) {
				await adminService.updateCourse(courseId, filteredCourseUpdates);
			}

			const structureOps = [];
			let appliedSteps = 0;

			for (const rawOp of operations) {
				if (!rawOp || typeof rawOp !== 'object') continue;
				const opType = String(rawOp.op || '').trim();

				if (opType === 'create_module' || opType === 'createModule') {
					const modulePayload = {
						title: rawOp.title || 'Modul nou',
						description: rawOp.description || '',
						status: rawOp.status || 'draft',
						order: rawOp.order ?? undefined,
					};
					const createdModuleResponse = await adminService.builderCreateModule(courseId, modulePayload);
					const createdModule = createdModuleResponse?.module
						|| createdModuleResponse?.data?.module
						|| createdModuleResponse?.data
						|| createdModuleResponse;
					const createdModuleId = Number(createdModule?.id || createdModule?.module_id || createdModuleResponse?.id);
					appliedSteps++;

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
							appliedSteps++;
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
						appliedSteps++;
					}
					if (Array.isArray(rawOp.lessons) && rawOp.lessons.length > 0) {
						appliedSteps += await applyLessonsForModule(courseId, rawOp.module_id, rawOp.lessons);
					}
					continue;
				}

				if (opType === 'delete_module' || opType === 'deleteModule') {
					if (!rawOp.module_id) continue;
					await adminService.deleteModule(rawOp.module_id);
					appliedSteps++;
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
					if (!payload.content) {
						throw new Error(`Lecția "${payload.title}" nu are conținut.`);
					}
					if (countLessonContentLines(payload.content) < 4) {
						throw new Error(`Lecția "${payload.title}" are conținut prea scurt.`);
					}
					await adminService.builderCreateLesson(courseId, payload);
					appliedSteps++;
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
					if (payload.content === '') {
						throw new Error(`Lecția "${rawOp.title || 'fără titlu'}" nu are conținut.`);
					}
					if (countLessonContentLines(payload.content) < 4) {
						throw new Error(`Lecția "${rawOp.title || 'fără titlu'}" are conținut prea scurt.`);
					}
					if (Object.keys(payload).length > 0) {
						await adminService.builderUpdateLesson(courseId, rawOp.lesson_id, payload);
						appliedSteps++;
					}
					continue;
				}

				if (opType === 'delete_lesson' || opType === 'deleteLesson') {
					if (!rawOp.lesson_id) continue;
					await adminService.deleteLesson(rawOp.lesson_id);
					appliedSteps++;
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

			await fetchStructure(true);
			setShowAiAssistant(false);
			showToast(`AI a aplicat ${appliedSteps} schimbări în builder.`, 'success');
		} catch (e) {
			console.error('AI plan apply failed:', e);
			showToast(e?.message || e?.response?.data?.message || 'Nu am putut aplica planul AI.', 'error');
		} finally {
			setCourseActionLoading(false);
		}
	};

	const handleLessonStatusToggle = async (lessonId, nextStatus) => {
		try {
			await adminService.builderUpdateLesson(courseId, lessonId, { status: nextStatus });
			await fetchStructure(true);
			showToast(nextStatus === 'published' ? 'Lectia a fost publicata.' : 'Lectia a fost retrasa din publicare.', 'success');
		} catch (e) {
			console.error('Lesson status toggle failed:', e);
			showToast(e?.response?.data?.message || 'Nu am putut actualiza statusul lectiei.', 'error');
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

	const handleDeleteTestFromBuilder = async (testId) => {
		if (!testId) return;
		if (!window.confirm('Ștergi definitiv acest test din creatorul de curs?')) return;
		try {
			await adminService.deleteTest(testId);
			await fetchAttachedTests();
			if (Number(inlineTest.id) === Number(testId)) {
				setShowTestCreator(false);
				resetTest();
			}
			showToast('Testul a fost ?ters.', 'success');
		} catch (e) {
			console.error('Delete test failed:', e);
			showToast(e?.response?.data?.message || 'Nu am putut șterge testul.', 'error');
		}
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
									className="admin-course-builder-back"
									onClick={() => navigate('/admin/content?tab=courses&view=maps')}
								>
									<ArrowLeft size={14} weight="bold" aria-hidden /> Cursuri
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
											<Plus size={16} weight="bold" aria-hidden="true" />
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
													handleQuickCreateLesson(null);
												}}
											>
												Lecție fără modul
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
										<CaretDoubleLeft size={16} weight="bold" aria-hidden="true" />
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

					<div className="admin-course-builder-sidebar-nav">
						{getCourseLevelAttachedTests().length > 0 && (
							<div className="admin-course-builder-sidebar-course-tests-block">
								<p className="admin-course-builder-sidebar-course-tests-label">Teste la nivel de curs</p>
								<ul className="admin-course-builder-sidebar-tests">
									{getCourseLevelAttachedTests().map((courseTestItem) => (
										<li key={courseTestItem.id} className="admin-course-builder-sidebar-course-test-row">
											<button
												type="button"
												className={`admin-course-builder-sidebar-test-main admin-course-builder-sidebar-test-main-full ${showTestCreator && inlineTest.id === courseTestItem.test_id ? 'is-selected' : ''}`}
												onClick={() => loadInlineTestById(courseTestItem.test_id)}
											>
												<span className="admin-course-builder-sidebar-test-tag">Test</span>
												<span className="admin-course-builder-sidebar-test-title">
													{courseTestItem?.test?.title || `Test #${courseTestItem.test_id}`}
												</span>
											</button>
										</li>
									))}
								</ul>
							</div>
						)}
						{rootLessons.length > 0 && (
							<div
								className={
									modules.length > 0
										? 'admin-course-builder-sidebar-course-tests-block'
										: 'admin-course-builder-sidebar-root-lessons-only'
								}
							>
								{modules.length > 0 ? (
									<p className="admin-course-builder-sidebar-course-tests-label">Lecții fără modul</p>
								) : null}
								<ul className="admin-course-builder-sidebar-lessons">
									{rootLessons.map((lessonItem, lessonIndex) => (
										<li key={lessonItem.id} className="admin-course-builder-sidebar-lesson-with-tests">
											<div className="admin-course-builder-sidebar-lesson-row">
												<button
													type="button"
													className={`admin-course-builder-sidebar-lesson ${selectedLessonId === lessonItem.id ? 'is-selected' : ''}`}
													onClick={async () => {
														await flushPendingLessonContentSave();
														await flushAllInlineQuestionSavesRef.current();
														setSelectedModuleId(null);
														setSelectedLessonId(lessonItem.id);
														setShowTestCreator(false);
													}}
												>
													<span className="admin-course-builder-sidebar-lesson-num">{lessonIndex + 1}</span>
													<span className="admin-course-builder-sidebar-lesson-title">{lessonItem.title || `Lecție ${lessonIndex + 1}`}</span>
												</button>
												<button
													type="button"
													className={`admin-course-builder-sidebar-lesson-icon-btn ${lessonItem.status === 'published' ? 'is-lesson-published' : 'is-lesson-draft'}`}
													onClick={() => handleLessonStatusToggle(lessonItem.id, lessonItem.status === 'published' ? 'draft' : 'published')}
													title={lessonItem.status === 'published' ? 'Lecție publicată — click pentru a o retrage din publicare' : 'Lecție nepublicată — click pentru a o publica'}
													aria-label={lessonItem.status === 'published' ? 'Lecție publicată, retrage din publicare' : 'Lecție nepublicată, publică'}
												>
													{lessonItem.status === 'published' ? (
														<Eye aria-hidden="true" size={17} weight="bold" color="#2563eb" />
													) : (
														<EyeSlash aria-hidden="true" size={17} weight="bold" color="#2563eb" />
													)}
												</button>
												<button
													type="button"
													className="admin-course-builder-sidebar-lesson-icon-btn is-danger is-delete"
													onClick={() => handleDeleteLesson(lessonItem)}
													title="Șterge lecția"
													aria-label="Șterge lecția"
												>
													<Trash aria-hidden="true" size={17} weight="bold" color="#dc2626" />
												</button>
											</div>
										</li>
									))}
								</ul>
							</div>
						)}
						{modules.length === 0 && rootLessons.length === 0 ? (
							<div className="admin-course-builder-sidebar-empty-state">
								<p className="admin-course-builder-sidebar-empty">Începe prin a crea un modul.</p>
							</div>
						) : (
							<ul className="admin-course-builder-sidebar-list">
								{modules.map((moduleItem, moduleIndex) => (
									<li key={moduleItem.id} className="admin-course-builder-sidebar-module">
										<div className="admin-course-builder-sidebar-module-head">
											<span className="admin-course-builder-sidebar-module-num">{moduleIndex + 1}.</span>
											{editingModuleId === moduleItem.id ? (
												<input
													type="text"
													className="admin-course-builder-sidebar-module-input"
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
														className={`admin-course-builder-sidebar-module-title admin-course-builder-sidebar-link ${
															selectedModuleId === moduleItem.id ? 'is-active' : ''
														}`}
														onClick={async () => {
															await flushAllInlineQuestionSavesRef.current();
															setSelectedModuleId(moduleItem.id);
															setShowTestCreator(false);
														}}
														onDoubleClick={() => beginModuleRename(moduleItem)}
														title="Dublu-click pentru a modifica denumirea modulului"
													>
														{moduleItem.title || `Modul ${moduleIndex + 1}`}
													</button>
													<button
														type="button"
														className="admin-course-builder-sidebar-lesson-icon-btn is-danger is-delete"
														onClick={() => handleDeleteModule(moduleItem)}
														title="Șterge modul"
														aria-label="Șterge modul"
													>
														<Trash aria-hidden="true" size={17} weight="bold" color="#dc2626" />
													</button>
												</>
											)}
										</div>
										<ul className="admin-course-builder-sidebar-lessons">
											{(moduleItem.lessons || []).map((lessonItem, lessonIndex) => {
												const rowDropClass =
													lessonDropHint?.moduleId === moduleItem.id &&
													lessonDropHint?.lessonId === lessonItem.id &&
													lessonDropHint?.position === 'before'
														? 'is-lesson-drop-before'
														: lessonDropHint?.moduleId === moduleItem.id &&
															lessonDropHint?.lessonId === lessonItem.id &&
															lessonDropHint?.position === 'after'
															? 'is-lesson-drop-after'
															: '';
												return (
												<li key={lessonItem.id} className="admin-course-builder-sidebar-lesson-with-tests">
													<div
														className={`admin-course-builder-sidebar-lesson-row ${rowDropClass}`}
														onDragOver={(e) => handleLessonDragOverRow(e, moduleItem, lessonItem)}
														onDrop={(e) => handleLessonDropOnLesson(e, moduleItem, lessonItem)}
													>
														{canMutateInAdminArea ? (
															<span
																className="admin-course-builder-sidebar-lesson-drag-handle"
																draggable
																onDragStart={(e) => handleLessonDragStart(e, lessonItem, moduleItem.id)}
																onDragEnd={handleLessonDragEnd}
																title="Trage pentru a muta lecția în alt modul sau poziție"
																aria-label="Trage lecția pentru mutare"
																role="button"
																tabIndex={0}
																onKeyDown={(e) => {
																	if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
																}}
															>
																<DragGripIcon size={14} />
															</span>
														) : null}
														<button
															type="button"
															className={`admin-course-builder-sidebar-lesson ${selectedLessonId === lessonItem.id ? 'is-selected' : ''}`}
															onClick={async () => {
																await flushPendingLessonContentSave();
																await flushAllInlineQuestionSavesRef.current();
																setSelectedModuleId(moduleItem.id);
																setSelectedLessonId(lessonItem.id);
																setShowTestCreator(false);
															}}
														>
															<span className="admin-course-builder-sidebar-lesson-num">{lessonIndex + 1}</span>
															<span className="admin-course-builder-sidebar-lesson-title">{lessonItem.title || `Lecție ${lessonIndex + 1}`}</span>
														</button>
														<button
															type="button"
															className={`admin-course-builder-sidebar-lesson-icon-btn ${lessonItem.status === 'published' ? 'is-lesson-published' : 'is-lesson-draft'}`}
															onClick={() => handleLessonStatusToggle(lessonItem.id, lessonItem.status === 'published' ? 'draft' : 'published')}
															title={lessonItem.status === 'published' ? 'Lecție publicată — click pentru a o retrage din publicare' : 'Lecție nepublicată — click pentru a o publica'}
															aria-label={lessonItem.status === 'published' ? 'Lecție publicată, retrage din publicare' : 'Lecție nepublicată, publică'}
														>
															{lessonItem.status === 'published' ? (
																<Eye aria-hidden="true" size={17} weight="bold" color="#2563eb" />
															) : (
																<EyeSlash aria-hidden="true" size={17} weight="bold" color="#2563eb" />
															)}
														</button>
														<button
															type="button"
															className="admin-course-builder-sidebar-lesson-icon-btn is-danger is-delete"
															onClick={() => handleDeleteLesson(lessonItem)}
															title="Șterge lecția"
															aria-label="Șterge lecția"
														>
															<Trash aria-hidden="true" size={17} weight="bold" color="#dc2626" />
														</button>
													</div>
													{getLessonAttachedTests(lessonItem.id).length > 0 && (
														<ul className="admin-course-builder-sidebar-lesson-tests">
															{getLessonAttachedTests(lessonItem.id).map((courseTestItem) => (
																<li key={courseTestItem.id} className="admin-course-builder-sidebar-course-test-row">
																	<button
																		type="button"
																		className={`admin-course-builder-sidebar-test-main admin-course-builder-sidebar-test-main-full ${showTestCreator && inlineTest.id === courseTestItem.test_id ? 'is-selected' : ''}`}
																		onClick={() => loadInlineTestById(courseTestItem.test_id)}
																	>
																		<span className="admin-course-builder-sidebar-test-tag">Test</span>
																		<span className="admin-course-builder-sidebar-test-title">
																			{courseTestItem?.test?.title || `Test #${courseTestItem.test_id}`}
																		</span>
																	</button>
																</li>
															))}
														</ul>
													)}
												</li>
												);
											})}
											{canMutateInAdminArea ? (
												<li
													className={`admin-course-builder-sidebar-lesson-drop-end ${
														lessonDropHint?.moduleId === moduleItem.id && lessonDropHint?.zone === 'end' ? 'is-active' : ''
													}`}
													onDragOver={(e) => handleLessonDragOverModuleEnd(e, moduleItem)}
													onDrop={(e) => handleLessonDropAtModuleEnd(e, moduleItem)}
												>
													<span className="admin-course-builder-sidebar-lesson-drop-end-label">Eliberă aici — la finalul modulului</span>
												</li>
											) : null}
										</ul>
										{getModuleAttachedTests(moduleItem.id).length > 0 && (
											<ul className="admin-course-builder-sidebar-tests">
												{getModuleAttachedTests(moduleItem.id).map((courseTestItem) => (
													<li key={courseTestItem.id}>
														<div
															className={`admin-course-builder-sidebar-test ${showTestCreator && inlineTest.id === courseTestItem.test_id ? 'is-selected' : ''} ${draggingSidebarTestId === courseTestItem.id ? 'is-dragging' : ''} ${
																sidebarDropHint.moduleId === moduleItem.id && sidebarDropHint.targetId === courseTestItem.id
																	? (sidebarDropHint.position === 'before' ? 'is-drop-before' : 'is-drop-after')
																	: ''
															}`}
															draggable
															onDragStart={(e) => {
																setDraggingSidebarTestId(courseTestItem.id);
																e.dataTransfer.effectAllowed = 'move';
																e.dataTransfer.setData('text/plain', String(courseTestItem.id));
															}}
															onDragEnd={() => {
																setDraggingSidebarTestId(null);
																setSidebarDropHint({ moduleId: null, targetId: null, position: null });
															}}
															onDragOver={(e) => {
																e.preventDefault();
																const rect = e.currentTarget.getBoundingClientRect();
																const position = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
																setSidebarDropHint({ moduleId: moduleItem.id, targetId: courseTestItem.id, position });
															}}
															onDragLeave={() => {
																if (sidebarDropHint.moduleId === moduleItem.id && sidebarDropHint.targetId === courseTestItem.id) {
																	setSidebarDropHint({ moduleId: null, targetId: null, position: null });
																}
															}}
															onDrop={(e) => {
																e.preventDefault();
																const sourceId = e.dataTransfer.getData('text/plain');
																if (!sourceId) return;
																const list = getModuleAttachedTests(moduleItem.id);
																const sourceIndex = list.findIndex((item) => Number(item.id) === Number(sourceId));
																const targetIndexRaw = list.findIndex((item) => Number(item.id) === Number(courseTestItem.id));
																if (sourceIndex === -1 || targetIndexRaw === -1) return;
																const insertAfter = sidebarDropHint.moduleId === moduleItem.id
																	&& sidebarDropHint.targetId === courseTestItem.id
																	&& sidebarDropHint.position === 'after';
																const targetIndex = insertAfter ? Math.min(targetIndexRaw + 1, list.length - 1) : targetIndexRaw;
																const targetId = list[targetIndex]?.id ?? courseTestItem.id;
																handleReorderModuleTests(moduleItem.id, Number(sourceId), Number(targetId));
																setSidebarDropHint({ moduleId: null, targetId: null, position: null });
															}}
														>
															<button
																type="button"
																className="admin-course-builder-sidebar-test-main"
																onClick={() => loadInlineTestById(courseTestItem.test_id)}
															>
																<span className="admin-course-builder-sidebar-test-tag">Test</span>
																<span className="admin-course-builder-sidebar-test-title">
																	{courseTestItem?.test?.title || `Test #${courseTestItem.test_id}`}
																</span>
															</button>
														</div>
													</li>
												))}
											</ul>
										)}
									</li>
								))}
							</ul>
						)}
					</div>

					<div className="admin-course-builder-sidebar-footer">
						<div className="admin-course-builder-actions admin-course-builder-actions-in-sidebar">
							<span className={`admin-course-builder-course-status-badge is-${String(course?.status || 'draft')}`}>
								{course?.status === 'published' ? 'Publicat' : 'Ciornă'}
							</span>
							{course?.status !== 'published' && (
								<button
									type="button"
									className="admin-btn admin-btn-primary"
									onClick={() => handleCourseStatusAction('publish')}
									disabled={courseActionLoading}
								>
									{courseActionLoading ? 'Se procesează...' : 'Publică'}
								</button>
							)}
							{course?.status === 'published' && (
								<button
									type="button"
									className="admin-btn admin-btn-secondary"
									onClick={() => handleCourseStatusAction('unpublish')}
									disabled={courseActionLoading}
								>
									{courseActionLoading ? 'Se procesează...' : 'Retrage'}
								</button>
							)}
							<button
								type="button"
								className="admin-course-builder-sidebar-lesson-icon-btn is-danger is-delete"
								onClick={handleDeleteCourse}
								disabled={courseActionLoading}
								title="Șterge curs"
								aria-label="Șterge curs"
							>
								<Trash aria-hidden="true" size={17} weight="bold" color="#dc2626" />
							</button>
<AutoSaveIndicator status={lessonSaveStatus} />
						</div>
					</div>
				</aside>
				{!builderSidebarVisible && (
					<button
						type="button"
						className="admin-course-builder-sidebar-show-btn"
						onClick={() => setBuilderSidebarVisible(true)}
						aria-label="Afișează meniul builder"
						title="Afișează meniul builder"
					>
						<span className="admin-course-builder-icon-wrap" aria-hidden="true">
							<CaretDoubleRight size={16} weight="bold" aria-hidden="true" />
						</span>
					</button>
				)}

				<div className="admin-course-builder-workspace admin-course-builder-workspace-clean">
					<div className="admin-course-builder-workspace-content">
						{showTestCreator ? (
							<InlineTestEditorShell
								editor={{
									...testEditor,
									handlePublishInlineTest,
								}}
								subtitle="Configurezi testul fără să părăsești pagina de creare curs."
							/>
						) : selectedLesson ? (
							<>
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
								<div className="admin-course-builder-direct-editor-wrap admin-course-builder-direct-editor-wrap-full">
									<RichTextEditor
										key={selectedLesson.id}
										courseId={courseId}
										value={lessonContent}
										onChange={handleLessonContentChange}
										onBlur={() => {
											flushPendingLessonContentSave();
										}}
										placeholder="Scrie direct lecția aici, ca într-un document Word..."
										style={{ minHeight: '100%', height: '100%' }}
										toolbarVariant="side-only"
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

			<button
				type="button"
				className="admin-course-builder-ai-fab admin-course-builder-ai-fab--soon"
				onClick={() => notifyAiComingSoon(showToast)}
				title="AI va fi disponibil în curând"
				aria-label="AI — va fi disponibil în curând"
			>
				<span className="admin-course-builder-ai-fab-glow" aria-hidden="true" />
				<span className="admin-course-builder-ai-fab-label" aria-hidden="true">
					<Lightning size={20} weight="fill" className="admin-course-builder-ai-fab-icon" />
				</span>
				<span className="admin-course-builder-ai-fab-copy">
					<span className="admin-course-builder-ai-fab-text">AI</span>
					<span className="admin-course-builder-ai-fab-badge">În curând</span>
				</span>
			</button>

			{false && showAiAssistant && (
				<div className="ai-chat-modal-overlay" onClick={() => setShowAiAssistant(false)}>
					<div className="ai-chat-modal" onClick={(e) => e.stopPropagation()}>
						<AICourseChat
							initialCourseId={courseId}
							mode="assist"
							title="⚡ AI pentru Builder"
                        welcomeMessage={`Sunt AI. Lucrezi la cursul "${course?.title || 'cursul curent'}". Pot modifica și genera module, lecții și conținut complet. Dacă îmi lipsesc detalii, te întreb pe rând.`}
							showPlanPreview={false}
							autoApplyPlan={true}
							onPlanGenerated={() => {}}
							onApplyPlan={handleApplyAiPlan}
							onClose={() => setShowAiAssistant(false)}
						/>
					</div>
				</div>
			)}

			{showCreateTestModal && (
				<div className="admin-course-builder-test-modal-overlay" onClick={() => !creatingTestFromModal && setShowCreateTestModal(false)}>
					<div className="admin-course-builder-test-modal" onClick={(e) => e.stopPropagation()}>
						<h3>Creează test</h3>
						<form onSubmit={handleCreateTestFromModal} className="admin-course-builder-test-modal-form">
							<label htmlFor="inline-test-modal-title">Titlu test *</label>
							<input
								id="inline-test-modal-title"
								type="text"
								value={createTestTitle}
								onChange={(e) => setCreateTestTitle(e.target.value)}
								placeholder="Ex: Evaluare modul 1"
								autoFocus
							/>
							<div className="admin-course-builder-test-modal-actions">
								<button type="button" className="admin-btn admin-btn-secondary" onClick={() => setShowCreateTestModal(false)} disabled={creatingTestFromModal}>
									Anulează
								</button>
								<button type="submit" className="admin-btn admin-btn-primary" disabled={creatingTestFromModal}>
									{creatingTestFromModal ? 'Se creează...' : 'Continuă'}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			<PublishCourseModal
				open={publishModalOpen}
				onClose={() => {
					setPublishModalOpen(false);
					setPublishValidationReport(null);
				}}
				courseId={course?.id}
				validationReport={publishValidationReport}
				onValidate={handleValidateForPublish}
				onPublished={handleCoursePublished}
			/>

		</div>
	);
};

export default AdminCourseBuilderPage;
