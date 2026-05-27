import React, { useEffect, useMemo, useState } from 'react';
import { DragGripIcon } from '../../common/DragGripIcon';
import {
	DndContext,
	pointerWithin,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	useDroppable,
} from '@dnd-kit/core';
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const toModuleKey = (id) => `module:${id}`;
const toLessonKey = (id) => `lesson:${id}`;
const toModuleContainerKey = (id) => `module-container:${id}`;

const parseDndId = (rawId) => {
	if (typeof rawId !== 'string') return { kind: 'unknown', id: rawId };
	const [kind, idStr] = rawId.split(':');
	const id = Number(idStr);
	return { kind, id: Number.isFinite(id) ? id : rawId };
};

const ModuleCard = ({
	module,
	issueCounts,
	lessonIssueCounts,
	bulkMode,
	selectedLessonIds,
	onToggleSelectLesson,
	onEdit,
	onDelete,
	onToggleLock,
	onToggleStatus,
	onAddLesson,
	onAddTest,
	onReorderLessons,
	onMoveLesson,
	onToggleLessonStatus,
	onToggleLessonPreview,
	onSelectLesson,
	onDeleteLesson,
	moduleMenuOpen,
	onModuleMenuToggle,
	lessonMenuOpen,
	onLessonMenuToggle,
}) => {
	const open = moduleMenuOpen === module.id;

	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: toModuleKey(module.id) });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	const { setNodeRef: setDroppableRef, isOver } = useDroppable({
		id: toModuleContainerKey(module.id),
	});

	const closeMenu = () => onModuleMenuToggle?.(null);

	return (
		<div
			ref={setNodeRef}
			style={style}
			data-module-id={module.id}
			className={`admin-module-card ${module.is_locked ? 'locked' : ''} ${module.status === 'draft' ? 'draft' : ''}`}
			role="listitem"
			aria-label={`Modul: ${module.title || 'Fără titlu'}`}
		>
			<div className="admin-module-card-header">
				<div
					ref={setActivatorNodeRef}
					className="admin-module-card-drag-handle"
					{...attributes}
					{...listeners}
					title="Trage pentru reordonare"
					role="button"
					tabIndex={0}
					aria-label="Trage pentru reordonare"
				>
					<DragGripIcon size={14} className="admin-drag-handle-icon" />
				</div>
				<div className="admin-module-card-info">
					<h4 className="admin-module-card-title">
						{module.title || 'Fără titlu'}
						{module.status === 'draft' && <span className="admin-module-draft-badge">Ciornă</span>}
						{issueCounts?.errors > 0 && (
							<span className="admin-module-issue-badge errors" title="Erori validare">{issueCounts.errors}</span>
						)}
						{issueCounts?.warnings > 0 && (
							<span className="admin-module-issue-badge warnings" title="Avertismente">{issueCounts.warnings}</span>
						)}
					</h4>
					<div className="admin-module-card-meta">
						<span>{module.lessons?.length || 0} lecții</span>
					</div>
				</div>
				<div className="admin-module-card-actions">
					<button
						type="button"
						className="admin-module-card-btn-add"
						onClick={() => onAddLesson(module.id)}
						title="Adaugă lecție"
						aria-label="Adaugă lecție"
					>
						+ Lecție
					</button>
					<div className="admin-module-card-menu-wrap">
						<button
							type="button"
							className="admin-module-card-menu-btn"
							onClick={() => onModuleMenuToggle?.(moduleMenuOpen === module.id ? null : module.id)}
							aria-expanded={open}
							aria-haspopup="true"
							aria-label="Acțiuni modul"
						>
							⋯
						</button>
						{open && (
							<>
								<div className="admin-module-card-menu-backdrop" onClick={closeMenu} aria-hidden="true" />
								<div className="admin-module-card-menu" role="menu">
									{onToggleStatus && (
										<button type="button" role="menuitem" onClick={() => { onToggleStatus(module.id, module.status === 'published' ? 'draft' : 'published'); closeMenu(); }}>
											{module.status === 'published' ? 'Treci în ciornă' : 'Publică modul'}
										</button>
									)}
									<button type="button" role="menuitem" onClick={() => { onToggleLock(module.id); closeMenu(); }}>
										{module.is_locked ? 'Deblochează' : 'Blochează'}
									</button>
									{onAddTest && (
										<button type="button" role="menuitem" onClick={() => { onAddTest({ scope: 'module', scope_id: module.id }); closeMenu(); }}>
											Atașează test
										</button>
									)}
									<button type="button" role="menuitem" onClick={() => { onEdit(module.id); closeMenu(); }}>Editează modul</button>
									<button type="button" role="menuitem" className="va-menu-danger" onClick={() => { onDelete(module.id); closeMenu(); }}>Șterge modul</button>
								</div>
							</>
						)}
					</div>
				</div>
			</div>

			{/* Lessons List */}
			<div
				ref={setDroppableRef}
				className={`admin-module-lessons ${isOver ? 'is-over' : ''}`}
				style={isOver ? { outline: '2px dashed var(--border-secondary)', outlineOffset: '2px', borderRadius: 'var(--radius-md)' } : undefined}
				role="list"
				aria-label="Lecții modul"
			>
				{module.lessons && module.lessons.length > 0 ? (
					<SortableContext
						items={module.lessons.map((l) => toLessonKey(l.id))}
						strategy={verticalListSortingStrategy}
					>
						{module.lessons.map((lesson, index) => (
							<LessonItem
								key={lesson.id}
								lesson={lesson}
								moduleId={module.id}
								index={index}
								issueCounts={lessonIssueCounts?.[lesson.id] || null}
								bulkMode={bulkMode}
								selected={selectedLessonIds?.includes?.(lesson.id)}
								onToggleSelect={onToggleSelectLesson}
								onToggleLessonStatus={onToggleLessonStatus}
								onToggleLessonPreview={onToggleLessonPreview}
								onSelectLesson={onSelectLesson}
								onAddTest={onAddTest}
								onDeleteLesson={onDeleteLesson}
								lessonMenuOpen={lessonMenuOpen}
								onLessonMenuToggle={onLessonMenuToggle}
							/>
						))}
					</SortableContext>
				) : (
					<button
						type="button"
						className="admin-module-lessons-empty"
						onClick={() => onAddLesson(module.id)}
						title="Adaugă prima lecție – vei alege titlul și tipul"
					>
						➕ Adaugă lecție
					</button>
				)}
			</div>

		</div>
	);
};

const LessonItem = ({
	lesson,
	moduleId,
	index,
	issueCounts,
	bulkMode,
	selected,
	onToggleSelect,
	onToggleLessonStatus,
	onToggleLessonPreview,
	onSelectLesson,
	onAddTest,
	onDeleteLesson,
	lessonMenuOpen,
	onLessonMenuToggle,
}) => {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: toLessonKey(lesson.id) });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.6 : 1,
	};

	const open = lessonMenuOpen === lesson.id;
	const closeMenu = () => onLessonMenuToggle?.(null);

	return (
		<div
			ref={setNodeRef}
			style={{
				...style,
				borderLeft:
					issueCounts?.errors > 0
						? '3px solid var(--color-error)'
						: issueCounts?.warnings > 0
							? '3px solid var(--color-warning)'
							: undefined,
				paddingLeft: issueCounts ? 8 : undefined,
				background: bulkMode && selected ? 'var(--bg-elevated)' : undefined,
			}}
			data-lesson-id={lesson.id}
			className="admin-lesson-item"
			role="listitem"
			aria-label={`Lecție ${index + 1}: ${lesson.title || 'Fără titlu'}`}
		>
			<span
				className="admin-lesson-drag-handle"
				{...attributes}
				{...listeners}
				role="button"
				tabIndex={0}
				aria-label="Reordonare"
				title="Trage pentru reordonare"
			>
				<DragGripIcon size={14} className="admin-drag-handle-icon" />
			</span>
			<span className="admin-lesson-item-number">{index + 1}</span>
			<button
				type="button"
				className="admin-lesson-item-title"
				onClick={() => onSelectLesson?.(lesson.id)}
				title="Deschide conținutul lecției"
				aria-label={`Deschide: ${lesson.title || 'Fără titlu'}`}
			>
				{lesson.title || 'Fără titlu'}
			</button>
			{lesson.is_preview && <span className="admin-lesson-preview-badge">Preview</span>}
			{(issueCounts?.errors > 0 || issueCounts?.warnings > 0) && (
				<span className="admin-lesson-issue-dots" title={`Erori: ${issueCounts?.errors || 0}, Avertismente: ${issueCounts?.warnings || 0}`}>
					{issueCounts?.errors > 0 && <span className="dot error" />}
					{issueCounts?.warnings > 0 && <span className="dot warning" />}
				</span>
			)}
			{bulkMode && (
				<label className="admin-lesson-bulk-check">
					<input
						type="checkbox"
						checked={!!selected}
						onChange={(e) => { e.stopPropagation(); onToggleSelect?.(lesson.id, e.target.checked); }}
						onClick={(e) => e.stopPropagation()}
					/>
					<span>Select</span>
				</label>
			)}
			<div className="admin-lesson-item-menu-wrap">
				<button
					type="button"
					className="admin-lesson-item-menu-btn"
					onClick={(e) => { e.stopPropagation(); onLessonMenuToggle?.(open ? null : lesson.id); }}
					aria-expanded={open}
					aria-haspopup="true"
					aria-label="Acțiuni lecție"
				>
					⋯
				</button>
				{open && (
					<>
						<div className="admin-lesson-item-menu-backdrop" onClick={(e) => { e.stopPropagation(); closeMenu(); }} aria-hidden="true" />
						<div className="admin-lesson-item-menu" role="menu" onClick={(e) => e.stopPropagation()}>
							{onAddTest && (
								<button type="button" role="menuitem" onClick={() => { onAddTest({ scope: 'lesson', scope_id: lesson.id }); closeMenu(); }}>Atașează test</button>
							)}
							{onToggleLessonPreview && (
								<button type="button" role="menuitem" onClick={() => { onToggleLessonPreview(lesson.id, !lesson.is_preview); closeMenu(); }}>
									{lesson.is_preview ? 'Dezactivează preview' : 'Activează preview'}
								</button>
							)}
							{onToggleLessonStatus && (
								<button type="button" role="menuitem" onClick={() => { onToggleLessonStatus(lesson.id, lesson.status === 'published' ? 'draft' : 'published'); closeMenu(); }}>
									{lesson.status === 'published' ? 'Treci în ciornă' : 'Publică lecția'}
								</button>
							)}
							{onDeleteLesson && (
								<button type="button" role="menuitem" className="va-menu-danger" onClick={() => { onDeleteLesson(lesson.id); closeMenu(); }}>Șterge lecția</button>
							)}
						</div>
					</>
				)}
			</div>
		</div>
	);
};

const CourseStructureBuilder = ({
	course,
	modules,
	validationReport,
	onReorderModules,
	onReorderLessons,
	onMoveLesson,
	onEditModule,
	onDeleteModule,
	onToggleModuleLock,
	onToggleModuleStatus,
	onToggleLessonStatus,
	onToggleLessonPreview,
	onSelectLesson,
	onDeleteLesson,
	onAddModule,
	onAddLesson,
	onAddTest,
	loading,
}) => {
	const [activeId, setActiveId] = useState(null);
	const [bulkMode, setBulkMode] = useState(false);
	const [selectedLessonIds, setSelectedLessonIds] = useState([]);
	const [moduleMenuOpen, setModuleMenuOpen] = useState(null);
	const [lessonMenuOpen, setLessonMenuOpen] = useState(null);

	const validation = useMemo(() => {
		const errors = Array.isArray(validationReport?.errors) ? validationReport.errors : [];
		const warnings = Array.isArray(validationReport?.warnings) ? validationReport.warnings : [];

		const lessonToModule = new Map();
		(modules || []).forEach((m) => (m.lessons || []).forEach((l) => lessonToModule.set(l.id, m.id)));

		const moduleErrors = new Map();
		const moduleWarnings = new Map();
		const lessonErrors = new Map();
		const lessonWarnings = new Map();

		const add = (map, id) => map.set(id, (map.get(id) || 0) + 1);
		const parseModuleId = (path) => {
			const m = typeof path === 'string' ? path.match(/^modules\.(\d+)\./) : null;
			return m ? Number(m[1]) : null;
		};
		const parseLessonId = (path) => {
			const m = typeof path === 'string' ? path.match(/^lessons\.(\d+)\./) : null;
			return m ? Number(m[1]) : null;
		};

		errors.forEach((it) => {
			const mId = parseModuleId(it.path);
			if (mId) add(moduleErrors, mId);
			const lId = parseLessonId(it.path);
			if (lId) {
				add(lessonErrors, lId);
				const owner = lessonToModule.get(lId);
				if (owner) add(moduleErrors, owner);
			}
		});
		warnings.forEach((it) => {
			const mId = parseModuleId(it.path);
			if (mId) add(moduleWarnings, mId);
			const lId = parseLessonId(it.path);
			if (lId) {
				add(lessonWarnings, lId);
				const owner = lessonToModule.get(lId);
				if (owner) add(moduleWarnings, owner);
			}
		});

		const lessonIssueCounts = {};
		(modules || []).forEach((m) =>
			(m.lessons || []).forEach((l) => {
				lessonIssueCounts[l.id] = {
					errors: lessonErrors.get(l.id) || 0,
					warnings: lessonWarnings.get(l.id) || 0,
				};
			})
		);

		return { moduleErrors, moduleWarnings, lessonIssueCounts };
	}, [modules, validationReport]);

	useEffect(() => {
		if (!bulkMode && selectedLessonIds.length > 0) {
			setSelectedLessonIds([]);
		}
	}, [bulkMode, selectedLessonIds.length]);

	const toggleSelectLesson = (lessonId, checked) => {
		setSelectedLessonIds((prev) => {
			const has = prev.includes(lessonId);
			if (checked && !has) return [...prev, lessonId];
			if (!checked && has) return prev.filter((id) => id !== lessonId);
			return prev;
		});
	};

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	const handleDragStart = (event) => {
		setActiveId(event.active.id);
	};

	const handleDragEnd = (event) => {
		const { active, over } = event;

		if (!over?.id || active.id === over.id) {
			setActiveId(null);
			return;
		}

		const activeParsed = parseDndId(active.id);
		const overParsed = parseDndId(over.id);

		// MODULE DnD (module–module sau modul plasat peste lecție)
		if (activeParsed.kind === 'module') {
			let overModuleId = null;
			if (overParsed.kind === 'module') {
				overModuleId = overParsed.id;
			} else if (overParsed.kind === 'lesson') {
				const parentModule = modules.find((m) => (m.lessons || []).some((l) => l.id === overParsed.id));
				if (parentModule) overModuleId = parentModule.id;
			} else if (overParsed.kind === 'module-container') {
				overModuleId = overParsed.id;
			}
			if (overModuleId) {
				const oldIndex = modules.findIndex((m) => m.id === activeParsed.id);
				const newIndex = modules.findIndex((m) => m.id === overModuleId);
				if (oldIndex !== -1 && newIndex !== -1) {
					const newModules = arrayMove(modules, oldIndex, newIndex);
					onReorderModules(newModules.map((m, index) => ({ ...m, order: index })));
				}
			}
			setActiveId(null);
			return;
		}

		// LESSON DnD (within/between modules)
		if (activeParsed.kind === 'lesson') {
			const lessonId = activeParsed.id;
			const sourceModule = modules.find((m) => (m.lessons || []).some((l) => l.id === lessonId));
			if (!sourceModule) {
				setActiveId(null);
				return;
			}

			let targetModule = null;
			let targetLessonId = null;
			if (overParsed.kind === 'lesson') {
				targetLessonId = overParsed.id;
				targetModule = modules.find((m) => (m.lessons || []).some((l) => l.id === targetLessonId)) || null;
			} else if (overParsed.kind === 'module-container') {
				targetModule = modules.find((m) => m.id === overParsed.id) || null;
			} else if (overParsed.kind === 'module') {
				targetModule = modules.find((m) => m.id === overParsed.id) || null;
			}

			if (!targetModule) {
				setActiveId(null);
				return;
			}

			const sourceLessons = [...(sourceModule.lessons || [])];
			const fromIndex = sourceLessons.findIndex((l) => l.id === lessonId);
			if (fromIndex === -1) {
				setActiveId(null);
				return;
			}

			// Remove from source
			sourceLessons.splice(fromIndex, 1);

			const targetLessons = sourceModule.id === targetModule.id ? sourceLessons : [...(targetModule.lessons || [])];

			let toIndex = targetLessons.length;
			if (targetLessonId) {
				const idx = targetLessons.findIndex((l) => l.id === targetLessonId);
				if (idx !== -1) toIndex = idx;
			}

			targetLessons.splice(toIndex, 0, (sourceModule.lessons || []).find((l) => l.id === lessonId));

			if (sourceModule.id === targetModule.id) {
				onReorderLessons?.(sourceModule.id, targetLessons.map((l) => l.id));
			} else {
				// Reorder both modules and move lesson
				onMoveLesson?.(lessonId, targetModule.id, toIndex);
				onReorderLessons?.(sourceModule.id, sourceLessons.map((l) => l.id));
			}
		}

		setActiveId(null);
	};

	return (
		<div className="admin-course-structure-builder">
			<div className="admin-course-structure-header">
				<h2 className="admin-course-structure-title">Structură curs</h2>
				<div className="admin-course-structure-header-actions">
					<label className="admin-course-structure-bulk-label">
						<input type="checkbox" checked={bulkMode} onChange={(e) => setBulkMode(e.target.checked)} />
						<span>Selectare multiplă</span>
					</label>
					<button type="button" className="admin-course-structure-add-module" onClick={() => onAddModule?.()} disabled={loading}>
						+ Modul
					</button>
				</div>
			</div>

			{bulkMode && selectedLessonIds.length > 0 && (
				<div className="admin-card" style={{ marginBottom: 'var(--space-4)' }}>
					<div className="admin-card-body" style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
						<span className="lms-tag">Selectate: {selectedLessonIds.length}</span>
						<button
							type="button"
							className="admin-btn admin-btn-secondary"
							onClick={() => selectedLessonIds.forEach((id) => onToggleLessonStatus?.(id, 'draft'))}
						>
							Setează ciornă
						</button>
						<button
							type="button"
							className="admin-btn admin-btn-secondary"
							onClick={() => selectedLessonIds.forEach((id) => onToggleLessonStatus?.(id, 'published'))}
						>
							Setează Publicat
						</button>
						<button
							type="button"
							className="admin-btn admin-btn-secondary"
							onClick={() => selectedLessonIds.forEach((id) => onToggleLessonPreview?.(id, true))}
						>
							Previzualizare ON
						</button>
						<button
							type="button"
							className="admin-btn admin-btn-secondary"
							onClick={() => selectedLessonIds.forEach((id) => onToggleLessonPreview?.(id, false))}
						>
							Previzualizare OFF
						</button>
						<button type="button" className="admin-btn admin-btn-secondary" onClick={() => setSelectedLessonIds([])}>
							Golește
						</button>
					</div>
				</div>
			)}

			{modules.length === 0 ? (
				<div className="admin-course-structure-empty">
					<div className="admin-course-structure-empty-icon" aria-hidden="true">📚</div>
					<p className="admin-course-structure-empty-title">Adaugă primul modul</p>
					<p className="admin-course-structure-empty-desc">
						Apoi adaugă lecții în modul. Apasă pe o lecție în sidebar pentru a scrie conținutul.
					</p>
					<button type="button" className="admin-course-structure-empty-btn" onClick={() => onAddModule?.()}>
						+ Adaugă modul
					</button>
				</div>
			) : (
				<DndContext
					sensors={sensors}
					collisionDetection={pointerWithin}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
				>
					<SortableContext items={modules.map((m) => toModuleKey(m.id))} strategy={verticalListSortingStrategy}>
						<div className="admin-modules-list" role="list" aria-label="Module curs">
							{modules.map((module) => (
								<ModuleCard
									key={module.id}
									module={module}
									issueCounts={{
										errors: validation.moduleErrors.get(module.id) || 0,
										warnings: validation.moduleWarnings.get(module.id) || 0,
									}}
									lessonIssueCounts={validation.lessonIssueCounts}
									bulkMode={bulkMode}
									selectedLessonIds={selectedLessonIds}
									onToggleSelectLesson={toggleSelectLesson}
									onEdit={onEditModule}
									onDelete={onDeleteModule}
									onToggleLock={onToggleModuleLock}
									onToggleStatus={onToggleModuleStatus}
									onAddLesson={onAddLesson}
									onAddTest={onAddTest}
									onReorderLessons={onReorderLessons}
									onMoveLesson={onMoveLesson}
									onToggleLessonStatus={onToggleLessonStatus}
									onToggleLessonPreview={onToggleLessonPreview}
									onSelectLesson={onSelectLesson}
									onDeleteLesson={onDeleteLesson}
									moduleMenuOpen={moduleMenuOpen}
									onModuleMenuToggle={setModuleMenuOpen}
									lessonMenuOpen={lessonMenuOpen}
									onLessonMenuToggle={setLessonMenuOpen}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
			)}
		</div>
	);
};

export default CourseStructureBuilder;

