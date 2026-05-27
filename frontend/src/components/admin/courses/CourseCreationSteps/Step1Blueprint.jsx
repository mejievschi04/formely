import React, { useState } from 'react';
import { CaretDown, Plus, Ruler, Trash } from '@phosphor-icons/react';
import { DragGripIcon } from '../../../common/DragGripIcon';
import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './Step1Blueprint.css';

/** Step 2 — Curriculum builder: tree of modules/lessons, add module/lesson, drag reorder, inline rename (instructiuni.md) */

function SortableModule({ module, index, expanded, onToggle, onUpdate, onDelete, onAddLesson, onUpdateLesson, onDeleteLesson }) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `module-${module.id}` });
	const style = { transform: CSS.Transform.toString(transform), transition };
	const lessons = module.lessons || [];

	return (
		<div ref={setNodeRef} style={style} className={`step1-module-card ${isDragging ? 'step1-dragging' : ''}`}>
			<div className="step1-module-header">
				<button type="button" className="step1-drag-handle" {...attributes} {...listeners} aria-label="Reordonare modul">
					<DragGripIcon size={14} />
				</button>
				<button type="button" className="step1-module-toggle" onClick={() => onToggle(module.id)}>
					<CaretDown className={`step1-module-arrow ${expanded ? 'expanded' : ''}`} size={16} weight="bold" aria-hidden />
				</button>
				<div className="step1-module-number">{index + 1}</div>
				<input
					type="text"
					value={module.title}
					onChange={(e) => onUpdate(module.id, { title: e.target.value })}
					placeholder="Titlu modul"
					className="step1-module-title-input"
				/>
				<button type="button" className="step1-btn-remove" onClick={() => onDelete(module.id)} aria-label="Șterge modul">
					<Trash size={14} weight="bold" aria-hidden />
				</button>
			</div>
			{expanded && (
				<div className="step1-module-content">
					<div className="step1-form-group">
						<label>Obiectiv modul</label>
						<textarea
							value={module.objective || ''}
							onChange={(e) => onUpdate(module.id, { objective: e.target.value })}
							placeholder="Ce va învăța cursantul în acest modul?"
							rows={2}
							className="step1-textarea"
						/>
					</div>
					<div className="step1-lessons">
						<div className="step1-lessons-header">
							<label>Lecții</label>
							<button type="button" className="step1-btn-add" onClick={() => onAddLesson(module.id)}>
								<Plus size={14} weight="bold" aria-hidden /> Adaugă lecție
							</button>
						</div>
						{lessons.length > 0 ? (
							<SortableLessonList
								moduleId={module.id}
								lessons={lessons}
								onUpdateLesson={onUpdateLesson}
								onDeleteLesson={onDeleteLesson}
								onReorder={onUpdate.bind(null, module.id)}
							/>
						) : (
							<div className="step1-lessons-empty">Nu există lecții. Adaugă prima lecție.</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function SortableLessonItem({ lesson, index, moduleId, onUpdateLesson, onDeleteLesson }) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `lesson-${moduleId}-${lesson.id}` });
	const style = { transform: CSS.Transform.toString(transform), transition };
	return (
		<div ref={setNodeRef} style={style} className={`step1-lesson-item ${isDragging ? 'step1-dragging' : ''}`}>
			<button type="button" className="step1-drag-handle" {...attributes} {...listeners} aria-label="Reordonare lecție">
				<DragGripIcon size={14} />
			</button>
			<div className="step1-lesson-number">{index + 1}</div>
			<div className="step1-lesson-content">
				<input
					type="text"
					value={lesson.title}
					onChange={(e) => onUpdateLesson(moduleId, lesson.id, { title: e.target.value })}
					placeholder="Titlu lecție"
					className="step1-lesson-title-input"
				/>
			</div>
			<button type="button" className="step1-btn-remove" onClick={() => onDeleteLesson(moduleId, lesson.id)} aria-label="Șterge lecție">
				<Trash size={14} weight="bold" aria-hidden />
			</button>
		</div>
	);
}

function SortableLessonList({ moduleId, lessons, onUpdateLesson, onDeleteLesson, onReorder }) {
	const [localLessons, setLocalLessons] = useState(lessons);
	React.useEffect(() => setLocalLessons(lessons), [lessons]);
	const ids = localLessons.map((l) => `lesson-${moduleId}-${l.id}`);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	const handleDragEnd = (event) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = localLessons.findIndex((l) => `lesson-${moduleId}-${l.id}` === active.id);
		const newIndex = localLessons.findIndex((l) => `lesson-${moduleId}-${l.id}` === over.id);
		if (oldIndex === -1 || newIndex === -1) return;
		const reordered = arrayMove(localLessons, oldIndex, newIndex);
		setLocalLessons(reordered);
		onReorder({ lessons: reordered });
	};

	return (
		<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
			<SortableContext items={ids} strategy={verticalListSortingStrategy}>
				<div className="step1-lessons-list">
					{localLessons.map((lesson, idx) => (
						<SortableLessonItem
							key={lesson.id}
							lesson={lesson}
							index={idx}
							moduleId={moduleId}
							onUpdateLesson={onUpdateLesson}
							onDeleteLesson={onDeleteLesson}
						/>
					))}
				</div>
			</SortableContext>
		</DndContext>
	);
}

const Step1Blueprint = ({ data, onUpdate }) => {
	const [expandedModules, setExpandedModules] = useState({});
	
	const modules = data.structure?.modules || [];
	const moduleIds = modules.map((m) => `module-${m.id}`);
	
	const handleAddModule = () => {
		const newModule = {
			id: Date.now(),
			title: `Modul ${modules.length + 1}`,
			objective: '',
			duration_estimate: null,
			lessons: [],
		};
		
		onUpdate({
			structure: {
				...data.structure,
				modules: [...modules, newModule]
			}
		});
		setExpandedModules(prev => ({ ...prev, [newModule.id]: true }));
	};
	
	const handleUpdateModule = (moduleId, updates) => {
		const updatedModules = modules.map(m => 
			m.id === moduleId ? { ...m, ...updates } : m
		);
		
		onUpdate({
			structure: {
				...data.structure,
				modules: updatedModules
			}
		});
	};
	
	const handleDeleteModule = (moduleId) => {
		const updatedModules = modules.filter(m => m.id !== moduleId);
		onUpdate({
			structure: {
				...data.structure,
				modules: updatedModules
			}
		});
	};
	
	const handleAddLesson = (moduleId) => {
		const module = modules.find(m => m.id === moduleId);
		if (!module) return;
		
		const newLesson = {
			id: Date.now(),
			title: `Lecție ${(module.lessons || []).length + 1}`,
			objective: '',
			duration_estimate: null,
		};
		
		handleUpdateModule(moduleId, {
			lessons: [...(module.lessons || []), newLesson]
		});
	};
	
	const handleUpdateLesson = (moduleId, lessonId, updates) => {
		const module = modules.find(m => m.id === moduleId);
		if (!module) return;
		
		const updatedLessons = (module.lessons || []).map(l =>
			l.id === lessonId ? { ...l, ...updates } : l
		);
		
		handleUpdateModule(moduleId, { lessons: updatedLessons });
	};
	
	const handleDeleteLesson = (moduleId, lessonId) => {
		const module = modules.find(m => m.id === moduleId);
		if (!module) return;
		const updatedLessons = (module.lessons || []).filter(l => l.id !== lessonId);
		handleUpdateModule(moduleId, { lessons: updatedLessons });
	};

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	const handleModuleDragEnd = (event) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = modules.findIndex((m) => `module-${m.id}` === active.id);
		const newIndex = modules.findIndex((m) => `module-${m.id}` === over.id);
		if (oldIndex === -1 || newIndex === -1) return;
		const reordered = arrayMove(modules, oldIndex, newIndex);
		onUpdate({ structure: { ...data.structure, modules: reordered } });
	};

	return (
		<div className="step1-blueprint">
			<div className="step1-header">
				<h3>Curriculum</h3>
				<p className="step1-description">
					Structură module și lecții. Glisează pentru reordonare; redenumește inline.
				</p>
			</div>
			<div className="step1-content">
				<div className="step1-modules">
					{modules.length === 0 ? (
						<div className="step1-empty">
							<div className="step1-empty-icon">
								<Ruler size={22} weight="duotone" aria-hidden />
							</div>
							<p>Nu există module încă.</p>
							<p className="step1-empty-hint">Adaugă primul modul pentru a începe.</p>
						</div>
					) : (
						<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleModuleDragEnd}>
							<SortableContext items={moduleIds} strategy={verticalListSortingStrategy}>
								{modules.map((module, moduleIndex) => (
									<SortableModule
										key={module.id}
										module={module}
										index={moduleIndex}
										expanded={!!expandedModules[module.id]}
										onToggle={(id) => setExpandedModules(prev => ({ ...prev, [id]: !prev[id] }))}
										onUpdate={handleUpdateModule}
										onDelete={handleDeleteModule}
										onAddLesson={handleAddLesson}
										onUpdateLesson={handleUpdateLesson}
										onDeleteLesson={handleDeleteLesson}
									/>
								))}
							</SortableContext>
						</DndContext>
					)}
				</div>
				<button type="button" className="step1-btn-add-module" onClick={handleAddModule}>
					<Plus size={14} weight="bold" aria-hidden /> Adaugă modul
				</button>
			</div>
		</div>
	);
};

export default Step1Blueprint;
