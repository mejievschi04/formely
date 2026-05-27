import React, { useState } from 'react';
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
import './Step3Content.css';
import { DragGripIcon } from '../../../common/DragGripIcon';
import { toImageUrl } from '../../../../utils/imageUrl';

/**
 * Step 3 — Lesson Builder (instructiuni.md)
 * User selects lesson → full editor: Left: Block list (add + reorder dnd), Center: Content editor, Right: Settings.
 * Block types: Text, Video, File, Link, Audio, Live, Image gallery, Assignment. Store as payload.
 * Preview mode: read-only render of lesson as student would see it.
 */

const BLOCK_TYPES = [
	{ id: 'text', label: 'Text', icon: '📄' },
	{ id: 'video', label: 'Video', icon: '🎥' },
	{ id: 'audio', label: 'Audio', icon: '🎵' },
	{ id: 'file', label: 'Fișier', icon: '📎' },
	{ id: 'link', label: 'Link', icon: '🔗' },
	{ id: 'live', label: 'Sesiune live', icon: '🔴' },
	{ id: 'image_gallery', label: 'Galerie imagini', icon: '🖼️' },
	{ id: 'assignment', label: 'Tema / Assignment', icon: '📝' },
];

function getDefaultPayload(type) {
	switch (type) {
		case 'image_gallery':
			return { images: [], captions: {} };
		case 'assignment':
			return { title: '', description: '', due_days: null, max_score: 100 };
		default:
			return {};
	}
}

function SortableBlockItem({ block, index, isSelected, onSelect, onDelete, typeInfo }) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: `block-${block.id}`,
	});
	const style = { transform: CSS.Transform.toString(transform), transition };
	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`step3-block-list-item ${isSelected ? 'selected' : ''} ${isDragging ? 'step3-dragging' : ''}`}
		>
			<button type="button" className="step3-drag-handle" {...attributes} {...listeners} aria-label="Reordonare bloc">
				<DragGripIcon size={14} />
			</button>
			<button
				type="button"
				className="step3-block-list-content"
				onClick={() => onSelect(block)}
			>
				<span className="step3-block-list-num">{index + 1}</span>
				<span className="step3-block-list-icon">{typeInfo?.icon}</span>
				<span className="step3-block-list-label">{typeInfo?.label || block.type}</span>
			</button>
			<button type="button" className="step3-btn-remove" onClick={(e) => { e.stopPropagation(); onDelete(block.id); }} aria-label="Șterge bloc">🗑️</button>
		</div>
	);
}

function BlockList({ lessonId, blocks, selectedBlock, onSelectBlock, onDeleteBlock, onReorder, onAddBlock }) {
	const [localBlocks, setLocalBlocks] = useState(blocks);
	React.useEffect(() => setLocalBlocks(blocks), [blocks]);
	const ids = localBlocks.map((b) => `block-${b.id}`);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	const handleDragEnd = (event) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = localBlocks.findIndex((b) => `block-${b.id}` === active.id);
		const newIndex = localBlocks.findIndex((b) => `block-${b.id}` === over.id);
		if (oldIndex === -1 || newIndex === -1) return;
		const reordered = arrayMove(localBlocks, oldIndex, newIndex);
		setLocalBlocks(reordered);
		onReorder(reordered);
	};

	return (
		<div className="step3-column-blocks">
			<div className="step3-column-title">Blocuri conținut</div>
			<div className="step3-add-block-buttons">
				{BLOCK_TYPES.map((t) => (
					<button
						key={t.id}
						type="button"
						className="step3-add-block-btn"
						onClick={() => onAddBlock(lessonId, t.id)}
						title={t.label}
					>
						{t.icon} {t.label}
					</button>
				))}
			</div>
			<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
				<SortableContext items={ids} strategy={verticalListSortingStrategy}>
					<div className="step3-block-list">
						{localBlocks.map((block, idx) => (
							<SortableBlockItem
								key={block.id}
								block={block}
								index={idx}
								isSelected={selectedBlock?.id === block.id}
								onSelect={onSelectBlock}
								onDelete={onDeleteBlock}
								typeInfo={BLOCK_TYPES.find((x) => x.id === block.type)}
							/>
						))}
					</div>
				</SortableContext>
			</DndContext>
		</div>
	);
}

function ContentEditor({ block, onUpdate }) {
	if (!block) return <div className="step3-editor-placeholder">Selectează un bloc din listă</div>;
	const payload = block.payload || {};
	const type = block.type;

	const updatePayload = (key, value) => {
		onUpdate({ payload: { ...payload, [key]: value } });
	};
	const updateSource = (value) => onUpdate({ source: value });

	if (type === 'text') {
		return (
			<div className="step3-editor-form">
				<label>Conținut text</label>
				<textarea
					value={block.source || ''}
					onChange={(e) => updateSource(e.target.value)}
					placeholder="Scrie conținutul aici..."
					rows={8}
					className="step3-textarea"
				/>
			</div>
		);
	}
	if (type === 'video') {
		return (
			<div className="step3-editor-form">
				<label>URL Video</label>
				<input
					type="url"
					value={block.source || ''}
					onChange={(e) => updateSource(e.target.value)}
					placeholder="https://..."
					className="step3-input"
				/>
			</div>
		);
	}
	if (type === 'audio') {
		return (
			<div className="step3-editor-form">
				<label>URL Audio sau descriere</label>
				<input
					type="text"
					value={block.source || ''}
					onChange={(e) => updateSource(e.target.value)}
					placeholder="URL sau nume fișier"
					className="step3-input"
				/>
			</div>
		);
	}
	if (type === 'file') {
		return (
			<div className="step3-editor-form">
				<label>Fișier (nume / URL)</label>
				<input
					type="text"
					value={block.source || ''}
					onChange={(e) => updateSource(e.target.value)}
					placeholder="Nume fișier sau URL"
					className="step3-input"
				/>
				<input
					type="file"
					onChange={(e) => e.target.files?.[0] && updateSource(e.target.files[0].name)}
					className="step3-file-input"
				/>
			</div>
		);
	}
	if (type === 'link') {
		return (
			<div className="step3-editor-form">
				<label>URL</label>
				<input
					type="url"
					value={block.source || ''}
					onChange={(e) => updateSource(e.target.value)}
					placeholder="https://..."
					className="step3-input"
				/>
				<label>Text link (opțional)</label>
				<input
					type="text"
					value={payload.link_text || ''}
					onChange={(e) => updatePayload('link_text', e.target.value)}
					placeholder="Text afișat"
					className="step3-input"
				/>
			</div>
		);
	}
	if (type === 'live') {
		return (
			<div className="step3-editor-form">
				<label>URL sesiune live / Meeting</label>
				<input
					type="url"
					value={block.source || ''}
					onChange={(e) => updateSource(e.target.value)}
					placeholder="https://..."
					className="step3-input"
				/>
				<label>Data/ora (opțional)</label>
				<input
					type="text"
					value={payload.scheduled_at || ''}
					onChange={(e) => updatePayload('scheduled_at', e.target.value)}
					placeholder="Data și ora (AAAA-LL-ZZ HH:MM)"
					className="step3-input"
				/>
			</div>
		);
	}
	if (type === 'image_gallery') {
		const images = Array.isArray(payload.images) ? payload.images : [];
		return (
			<div className="step3-editor-form">
				<label>Galerie imagini</label>
				<p className="step3-hint">Adaugă URL-uri de imagini (câte unul per linie).</p>
				<textarea
					value={(payload.images || []).join('\n')}
					onChange={(e) => updatePayload('images', e.target.value.split('\n').filter(Boolean))}
					placeholder="https://… (câte un URL pe linie)"
					rows={5}
					className="step3-textarea"
				/>
			</div>
		);
	}
	if (type === 'assignment') {
		return (
			<div className="step3-editor-form">
				<label>Titlu temă</label>
				<input
					type="text"
					value={payload.title || ''}
					onChange={(e) => updatePayload('title', e.target.value)}
					placeholder="Titlul temei"
					className="step3-input"
				/>
				<label>Descriere / Instrucțiuni</label>
				<textarea
					value={payload.description || ''}
					onChange={(e) => updatePayload('description', e.target.value)}
					placeholder="Descriere temă..."
					rows={4}
					className="step3-textarea"
				/>
				<label>Termen (zile de la începerea lecției, opțional)</label>
				<input
					type="number"
					min={0}
					value={payload.due_days ?? ''}
					onChange={(e) => updatePayload('due_days', e.target.value ? parseInt(e.target.value, 10) : null)}
					placeholder="Număr de zile"
					className="step3-input"
				/>
				<label>Punctaj maxim</label>
				<input
					type="number"
					min={1}
					value={payload.max_score ?? 100}
					onChange={(e) => updatePayload('max_score', parseInt(e.target.value, 10) || 100)}
					className="step3-input"
				/>
			</div>
		);
	}
	return (
		<div className="step3-editor-form">
			<label>Conținut (sursă)</label>
			<input
				type="text"
				value={block.source || ''}
				onChange={(e) => updateSource(e.target.value)}
				className="step3-input"
			/>
		</div>
	);
}

function SettingsPanel({ block, onUpdate }) {
	if (!block) return <div className="step3-settings-placeholder">Selectează un bloc</div>;
	return (
		<div className="step3-settings-panel">
			<div className="step3-settings-title">Setări bloc</div>
			<div className="step3-form-group">
				<label>
					<input
						type="checkbox"
						checked={block.visible !== false}
						onChange={(e) => onUpdate({ visible: e.target.checked })}
					/>
					<span>Vizibil pentru cursanți</span>
				</label>
			</div>
			<div className="step3-form-group">
				<label>Ordine (index)</label>
				<input
					type="number"
					min={0}
					value={block.order ?? 0}
					onChange={(e) => onUpdate({ order: parseInt(e.target.value, 10) || 0 })}
					className="step3-input step3-input-sm"
				/>
			</div>
		</div>
	);
}

function LessonPreview({ blocks }) {
	const typeInfo = (type) => BLOCK_TYPES.find((t) => t.id === type) || { icon: '📄', label: type };
	return (
		<div className="step3-preview-content">
			{(!blocks || blocks.length === 0) && (
				<p className="step3-preview-empty">Niciun bloc în această lecție.</p>
			)}
			{blocks && blocks.length > 0 && blocks.map((block, idx) => {
				if (block.visible === false) return null;
				const info = typeInfo(block.type);
				return (
					<div key={block.id} className="step3-preview-block">
						<div className="step3-preview-block-header">
							<span>{info.icon}</span> <span>{info.label}</span>
						</div>
						{block.type === 'text' && <div className="step3-preview-text">{block.source || '—'}</div>}
						{block.type === 'video' && (
							<div className="step3-preview-media">
								{block.source ? <a href={block.source} target="_blank" rel="noopener noreferrer">{block.source}</a> : '—'}
							</div>
						)}
						{block.type === 'link' && (
							<div className="step3-preview-media">
								<a href={block.source || '#'} target="_blank" rel="noopener noreferrer">
									{(block.payload && block.payload.link_text) || block.source || 'Link'}
								</a>
							</div>
						)}
						{block.type === 'image_gallery' && (
							<div className="step3-preview-gallery">
								{(block.payload?.images || []).slice(0, 6).map((url, i) => (
									<img key={i} src={toImageUrl(url) || url} alt="" className="step3-preview-gallery-img" />
								))}
							</div>
						)}
						{block.type === 'assignment' && (
							<div className="step3-preview-text">
								<strong>{block.payload?.title || 'Temă'}</strong>
								<p>{block.payload?.description || ''}</p>
							</div>
						)}
						{!['text', 'video', 'link', 'image_gallery', 'assignment'].includes(block.type) && (
							<div className="step3-preview-text">{block.source || '—'}</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

const Step3Content = ({ data, onUpdate }) => {
	const modules = data.structure?.modules || [];
	const [selectedLesson, setSelectedLesson] = useState(null);
	const [selectedBlock, setSelectedBlock] = useState(null);
	const [previewMode, setPreviewMode] = useState(false);

	const allLessons = modules.flatMap((m) => (m.lessons || []).map((l) => ({ ...l, moduleTitle: m.title })));
	const contentBlocks = data.content_blocks || {};
	const blocksForLesson = selectedLesson ? (contentBlocks[selectedLesson.id] || []) : [];

	const handleAddContent = (lessonId, type) => {
		const lessonContents = contentBlocks[lessonId] || [];
		const newBlock = {
			id: Date.now(),
			type,
			source: '',
			payload: getDefaultPayload(type),
			metadata: {},
			order: lessonContents.length,
			visible: true,
		};
		onUpdate({
			content_blocks: {
				...contentBlocks,
				[lessonId]: [...lessonContents, newBlock],
			},
		});
		if (selectedLesson?.id === lessonId) setSelectedBlock(newBlock);
	};

	const handleUpdateContent = (lessonId, blockId, updates) => {
		const lessonContents = [...(contentBlocks[lessonId] || [])];
		const idx = lessonContents.findIndex((b) => b.id === blockId);
		if (idx === -1) return;
		lessonContents[idx] = { ...lessonContents[idx], ...updates };
		onUpdate({ content_blocks: { ...contentBlocks, [lessonId]: lessonContents } });
		if (selectedBlock?.id === blockId) setSelectedBlock(lessonContents[idx]);
	};

	const handleDeleteContent = (lessonId, blockId) => {
		const lessonContents = (contentBlocks[lessonId] || []).filter((b) => b.id !== blockId);
		onUpdate({ content_blocks: { ...contentBlocks, [lessonId]: lessonContents } });
		if (selectedBlock?.id === blockId) setSelectedBlock(null);
	};

	const handleReorder = (lessonId, reordered) => {
		onUpdate({ content_blocks: { ...contentBlocks, [lessonId]: reordered.map((b, i) => ({ ...b, order: i })) } });
	};

	return (
		<div className="step3-content">
			<div className="step3-header">
				<h3>Conținut lecții</h3>
				<p className="step3-description">
					Selectează o lecție pentru a adăuga și ordona blocuri de conținut. Editează în centru, setări în dreapta.
				</p>
			</div>

			{modules.length === 0 ? (
				<div className="step3-empty">
					<div className="step3-empty-icon">📚</div>
					<p>Nu există lecții definite.</p>
					<p className="step3-empty-hint">Revino la pasul Curriculum pentru a adăuga lecții.</p>
				</div>
			) : (
				<>
					{/* Lesson selector + Preview toggle */}
					<div className="step3-lesson-selector-row">
						<div className="step3-lesson-selector">
							<label>Lecție:</label>
							<select
								value={selectedLesson?.id ?? ''}
								onChange={(e) => {
									const id = e.target.value ? Number(e.target.value) : null;
									setSelectedLesson(allLessons.find((l) => l.id === id) || null);
									setSelectedBlock(null);
								}}
								className="step3-select"
							>
								<option value="">— Selectează lecția —</option>
								{allLessons.map((l) => (
									<option key={l.id} value={l.id}>
										{l.moduleTitle} → {l.title}
									</option>
								))}
							</select>
						</div>
						<button
							type="button"
							className={`step3-preview-toggle ${previewMode ? 'active' : ''}`}
							onClick={() => setPreviewMode(!previewMode)}
						>
							{previewMode ? '✏️ Mod editare' : '👁 Preview lecție'}
						</button>
					</div>

					{selectedLesson && (
						previewMode ? (
							<div className="step3-preview-container">
								<h4>Preview: {selectedLesson.title}</h4>
								<LessonPreview blocks={blocksForLesson} />
							</div>
						) : (
							<div className="step3-editor-layout">
								<BlockList
									lessonId={selectedLesson.id}
									blocks={blocksForLesson}
									selectedBlock={selectedBlock}
									onSelectBlock={setSelectedBlock}
									onDeleteBlock={(blockId) => handleDeleteContent(selectedLesson.id, blockId)}
									onReorder={(reordered) => handleReorder(selectedLesson.id, reordered)}
									onAddBlock={handleAddContent}
								/>
								<div className="step3-column-editor">
									<div className="step3-column-title">Editor conținut</div>
									<ContentEditor
										block={selectedBlock}
										onUpdate={(updates) => selectedBlock && handleUpdateContent(selectedLesson.id, selectedBlock.id, updates)}
									/>
								</div>
								<div className="step3-column-settings">
									<SettingsPanel
										block={selectedBlock}
										onUpdate={(updates) => selectedBlock && handleUpdateContent(selectedLesson.id, selectedBlock.id, updates)}
									/>
								</div>
							</div>
						)
					)}
				</>
			)}
		</div>
	);
};

export default Step3Content;
