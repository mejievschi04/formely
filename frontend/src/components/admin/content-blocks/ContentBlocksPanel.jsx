import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';
import ConfirmModal from '../../../components/common/ConfirmModal';
import AutoSaveIndicator from '../../common/AutoSaveIndicator';
import ContentBlockList from './ContentBlockList';
import ContentBlockEditor from './ContentBlockEditor';
import LessonBlocksPreview from './LessonBlocksPreview';

const debounceMs = 900;
const MAX_CHECKPOINTS = 10;

const checkpointStorageKey = (courseId, lessonId) => `lms:lesson-checkpoints:${courseId}:${lessonId}`;

const safeReadCheckpoints = (courseId, lessonId) => {
	try {
		const raw = localStorage.getItem(checkpointStorageKey(courseId, lessonId));
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

const safeWriteCheckpoints = (courseId, lessonId, checkpoints) => {
	try {
		localStorage.setItem(checkpointStorageKey(courseId, lessonId), JSON.stringify(checkpoints));
	} catch {
		// ignore quota/localStorage restrictions
	}
};

const BLOCK_TYPES = [
	{ id: 'text', label: 'Text' },
	{ id: 'video', label: 'Video' },
	{ id: 'image', label: 'Imagine' },
	{ id: 'quiz_embed', label: 'Quiz embed' },
	{ id: 'gallery', label: 'Galerie' },
	{ id: 'pdf', label: 'PDF (conținut)' },
	{ id: 'file', label: 'Fișier' },
	{ id: 'link', label: 'Legătură' },
	{ id: 'embed', label: 'Încorporare' },
];

const TEMPLATE_OPTIONS = [
	{ id: 'lesson_skeleton', label: 'Schelet lecție (Intro + Video + Checklist + Resurse)' },
	{ id: 'onboarding_skeleton', label: 'Schelet onboarding' },
	{ id: 'compliance_skeleton', label: 'Schelet conformitate' },
	{ id: 'section_intro', label: 'Introducere' },
	{ id: 'key_takeaways', label: 'Puncte cheie' },
	{ id: 'checklist', label: 'Checklist' },
	{ id: 'resources', label: 'Resurse' },
	{ id: 'video_embed', label: 'Video (YouTube)' },
	{ id: 'quiz_embed', label: 'Quiz embed' },
	{ id: 'pdf_embed', label: 'PDF (afișat în lecție)' },
	{ id: 'download_file', label: 'Fișier (descărcare)' },
];

const QUICK_PANEL_BLOCKS = [
	{ id: 'text', label: 'Text', icon: '📝' },
	{ id: 'video', label: 'Video', icon: '🎬' },
	{ id: 'image', label: 'Imagine', icon: '🖼️' },
	{ id: 'quiz_embed', label: 'Quiz', icon: '🧪' },
	{ id: 'pdf', label: 'PDF', icon: '📄' },
	{ id: 'file', label: 'Fișier', icon: '📎' },
];

const QUICK_PANEL_TEMPLATES = [
	{ id: 'lesson_skeleton', label: 'Schelet lecție', icon: '🧱' },
	{ id: 'section_intro', label: 'Introducere', icon: '🚀' },
	{ id: 'key_takeaways', label: 'Puncte cheie', icon: '💡' },
	{ id: 'checklist', label: 'Checklist', icon: '✅' },
	{ id: 'resources', label: 'Resurse', icon: '📚' },
];

const ContentBlocksPanel = ({ courseId, lesson, onRefresh }) => {
	const { showToast } = useToast();

	const blocks = useMemo(() => {
		// Laravel relation name is `contentBlocks` but serialized as `content_blocks`
		return Array.isArray(lesson?.content_blocks) ? lesson.content_blocks : Array.isArray(lesson?.contentBlocks) ? lesson.contentBlocks : [];
	}, [lesson]);

	const [selectedBlockId, setSelectedBlockId] = useState(blocks[0]?.id || null);
	const [draft, setDraft] = useState(null);
	const [saveStatus, setSaveStatus] = useState(null);
	const [deleteConfirmBlockId, setDeleteConfirmBlockId] = useState(null);
	const [deleteBlockLoading, setDeleteBlockLoading] = useState(false);
	const [addDropdownOpen, setAddDropdownOpen] = useState(false);
	const [reorderLoading, setReorderLoading] = useState(false);
	const [localOrderIds, setLocalOrderIds] = useState(null);
	const [editorMode, setEditorMode] = useState('edit'); // edit | preview
	const [contentStep, setContentStep] = useState('edit'); // edit | preview | confirm
	const [checkpoints, setCheckpoints] = useState([]);
	const [selectedCheckpointId, setSelectedCheckpointId] = useState('');
	const [checkpointLoading, setCheckpointLoading] = useState(false);

	const pendingPatchRef = useRef(null); // { blockId, patch }
	const debounceRef = useRef(null);
	const addDropdownRef = useRef(null);

	useEffect(() => {
		const onOutside = (e) => {
			if (addDropdownRef.current && !addDropdownRef.current.contains(e.target)) setAddDropdownOpen(false);
		};
		if (addDropdownOpen) {
			document.addEventListener('click', onOutside);
			return () => document.removeEventListener('click', onOutside);
		}
	}, [addDropdownOpen]);

	useEffect(() => {
		// Reset selection when lesson changes
		setSelectedBlockId(blocks[0]?.id || null);
		setLocalOrderIds(null);
		if (courseId && lesson?.id) {
			const next = safeReadCheckpoints(courseId, lesson.id);
			setCheckpoints(next);
			setSelectedCheckpointId(next[0]?.id || '');
		} else {
			setCheckpoints([]);
			setSelectedCheckpointId('');
		}
	}, [lesson?.id]);

	useEffect(() => {
		const selected = blocks.find((b) => b.id === selectedBlockId) || null;
		setDraft(selected ? { ...selected } : null);
	}, [blocks, selectedBlockId]);

	const displayedBlocks = useMemo(() => {
		if (!Array.isArray(localOrderIds) || localOrderIds.length === 0) return blocks;
		const byId = new Map(blocks.map((blockItem) => [blockItem.id, blockItem]));
		const ordered = localOrderIds.map((id) => byId.get(id)).filter(Boolean);
		if (ordered.length !== blocks.length) return blocks;
		return ordered;
	}, [blocks, localOrderIds]);

	const flushPendingSave = useCallback(async () => {
		if (!pendingPatchRef.current) return;
		const pending = pendingPatchRef.current;
		pendingPatchRef.current = null;
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
			debounceRef.current = null;
		}
		try {
			await adminService.builderUpdateContentBlock(courseId, pending.blockId, pending.patch);
			setSaveStatus('saved');
		} catch (e) {
			console.error('Content block autosave flush failed:', e);
			setSaveStatus('error');
			showToast('Nu am putut salva ultima modificare.', 'error');
		}
	}, [courseId, showToast]);

	useEffect(() => () => {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
			debounceRef.current = null;
		}
	}, []);

	useEffect(() => {
		flushPendingSave();
	}, [selectedBlockId, lesson?.id, flushPendingSave]);

	useEffect(() => {
		const isTypingTarget = (target) => {
			if (!target) return false;
			if (target.isContentEditable) return true;
			const tag = (target.tagName || '').toLowerCase();
			return tag === 'input' || tag === 'textarea' || tag === 'select';
		};

		const onKeyDown = (e) => {
			if (isTypingTarget(e.target)) return;

			// Escape: închide meniul Adaugă bloc dacă e deschis
			if (e.key === 'Escape') {
				if (addDropdownOpen) {
					e.preventDefault();
					setAddDropdownOpen(false);
				}
				return;
			}

			// Ctrl+Shift+A: deschide/închide meniul Adaugă bloc
			if (e.ctrlKey && e.shiftKey && e.key === 'A') {
				e.preventDefault();
				setAddDropdownOpen((o) => !o);
				return;
			}

			// Alt+↑/↓: reordonează blocul selectat
			if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
				if (!selectedBlockId) return;
				e.preventDefault();
				const ids = blocks.map((b) => b.id);
				const from = ids.findIndex((id) => id === selectedBlockId);
				if (from === -1) return;
				const to = e.key === 'ArrowUp' ? from - 1 : from + 1;
				if (to < 0 || to >= ids.length) return;
				const next = [...ids];
				const [moved] = next.splice(from, 1);
				next.splice(to, 0, moved);
				handleReorder(next);
			}
		};

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [blocks, selectedBlockId, addDropdownOpen]);

	const scheduleSave = (patch) => {
		if (!draft?.id) return;
		const blockId = draft.id;
		const next = { ...draft, ...patch, id: blockId };
		setDraft(next);

		const currentPending = pendingPatchRef.current;
		if (currentPending && currentPending.blockId === blockId) {
			pendingPatchRef.current = {
				blockId,
				patch: { ...currentPending.patch, ...patch },
			};
		} else {
			pendingPatchRef.current = { blockId, patch: { ...patch } };
		}
		setSaveStatus('saving');

		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(async () => {
			const pending = pendingPatchRef.current;
			pendingPatchRef.current = null;
			if (!pending?.blockId) return;
			try {
				await adminService.builderUpdateContentBlock(courseId, pending.blockId, pending.patch);
				setSaveStatus('saved');
			} catch (e) {
				console.error('Content block autosave failed:', e);
				setSaveStatus('error');
				showToast('Autosave eșuat. Încearcă din nou.', 'error');
			}
		}, debounceMs);
	};

	const handleAddBlock = async (type) => {
		try {
			await adminService.builderCreateContentBlock(courseId, lesson.id, {
				type,
				source: '',
				metadata: {},
				visible: true,
			});
			await onRefresh?.();
			setSaveStatus(null);
		} catch (e) {
			console.error('Create content block failed:', e);
			setSaveStatus('error');
			const msg = e?.response?.data?.message || e?.message || 'Eroare la crearea content block.';
			showToast(msg, 'error');
		}
	};

	const handleAddTemplate = async (templateId) => {
		const templates = {
			lesson_skeleton: {
				blocks: [
					{ type: 'text', source: `<h2>Introducere</h2><p>Ce va învăța cursantul în această lecție?</p>` },
					{ type: 'video', source: 'https://www.youtube.com/watch?v=' },
					{ type: 'text', source: `<h3>Checklist</h3><ul><li>✅ Pas 1</li><li>✅ Pas 2</li><li>✅ Pas 3</li></ul>` },
					{ type: 'text', source: `<h3>Resurse</h3><ul><li><a href="https://">Link 1</a></li><li><a href="https://">Link 2</a></li></ul>` },
				],
			},
			onboarding_skeleton: {
				blocks: [
					{ type: 'text', source: `<h2>Bine ați venit</h2><p>Context + obiective pentru onboarding.</p>` },
					{ type: 'text', source: `<h3>Ce trebuie să știi</h3><ul><li>Politici</li><li>Tooling</li><li>Contacte</li></ul>` },
					{ type: 'video', source: 'https://www.youtube.com/watch?v=' },
					{ type: 'text', source: `<h3>Pașii următori</h3><ol><li>Pas 1</li><li>Pas 2</li><li>Pas 3</li></ol>` },
				],
			},
			compliance_skeleton: {
				blocks: [
					{ type: 'text', source: `<h2>Conformitate</h2><p>Reguli + scop + ce se evaluează.</p>` },
					{ type: 'file', source: 'https://.../policy.pdf' },
					{ type: 'text', source: `<h3>Checklist</h3><ul><li>✅ Am citit documentul</li><li>✅ Am înțeles regulile</li></ul>` },
					{ type: 'link', source: 'https://...' },
				],
			},
			section_intro: {
				type: 'text',
				source: `<h2>Introducere</h2><p>Scrie aici un scurt context pentru lecție.</p>`,
			},
			key_takeaways: {
				type: 'text',
				source: `<h3>Puncte cheie</h3><ul><li>Ideea #1</li><li>Ideea #2</li><li>Ideea #3</li></ul>`,
			},
			checklist: {
				type: 'text',
				source: `<h3>Checklist</h3><ul><li>✅ Pas 1</li><li>✅ Pas 2</li><li>✅ Pas 3</li></ul>`,
			},
			resources: {
				type: 'text',
				source: `<h3>Resurse</h3><ul><li><a href="https://">Link 1</a></li><li><a href="https://">Link 2</a></li></ul>`,
			},
			video_embed: {
				type: 'video',
				source: 'https://www.youtube.com/watch?v=',
			},
			quiz_embed: {
				type: 'quiz_embed',
				source: '',
				metadata: { test_id: null, test_title: '' },
			},
			pdf_embed: {
				type: 'pdf',
				source: 'https://.../document.pdf',
			},
			download_file: {
				type: 'file',
				source: 'https://.../fisier.pdf',
			},
		};

		const tpl = templates[templateId];
		if (!tpl) return;

		try {
			setSaveStatus('saving');

			if (Array.isArray(tpl.blocks) && tpl.blocks.length > 0) {
				let lastId = null;
				for (const b of tpl.blocks) {
					const res = await adminService.builderCreateContentBlock(courseId, lesson.id, {
						type: b.type,
						source: b.source ?? '',
						metadata: b.metadata || {},
						visible: b.visible ?? true,
					});
					lastId = res?.content_block?.id || lastId;
				}
				await onRefresh?.();
				if (lastId) setSelectedBlockId(lastId);
				setSaveStatus('saved');
				return;
			}

			await adminService.builderCreateContentBlock(courseId, lesson.id, {
				type: tpl.type,
				source: tpl.source,
				metadata: tpl.metadata || {},
				visible: true,
			});
			await onRefresh?.();
			setSaveStatus('saved');
		} catch (e) {
			console.error('Create template block failed:', e);
			setSaveStatus('error');
		}
	};

	const handleReorder = async (ids) => {
		if (!Array.isArray(ids) || ids.length < 2) return;
		if (reorderLoading) return;
		try {
			setReorderLoading(true);
			setLocalOrderIds(ids);
			setSaveStatus('saving');
			await adminService.builderReorderContentBlocks(courseId, lesson.id, ids);
			setSaveStatus('saved');
			await onRefresh?.();
		} catch (e) {
			console.error('Reorder content blocks failed:', e);
			setLocalOrderIds(null);
			setSaveStatus('error');
			showToast('Nu am putut salva noua ordine a blocurilor.', 'error');
		} finally {
			setReorderLoading(false);
		}
	};

	const handleDeleteBlockClick = (blockId) => {
		setDeleteConfirmBlockId(blockId);
	};

	const handleDeleteBlock = async (blockId) => {
		try {
			setSaveStatus('saving');
			const nextSelection = (() => {
				const idx = blocks.findIndex((b) => b.id === blockId);
				if (idx === -1) return selectedBlockId;
				if (selectedBlockId !== blockId) return selectedBlockId;
				return blocks[idx + 1]?.id || blocks[idx - 1]?.id || null;
			})();

			await adminService.builderDeleteContentBlock(courseId, blockId);
			setSelectedBlockId(nextSelection);
			setDraft(null);
			await onRefresh?.();
			setSaveStatus('saved');
		} catch (e) {
			console.error('Delete content block failed:', e);
			setSaveStatus('error');
		}
	};

	const handleConfirmDeleteBlock = async () => {
		if (!deleteConfirmBlockId) return;
		setDeleteBlockLoading(true);
		try {
			await handleDeleteBlock(deleteConfirmBlockId);
			setDeleteConfirmBlockId(null);
		} finally {
			setDeleteBlockLoading(false);
		}
	};

	const blockTypeLabel = useCallback((type) => BLOCK_TYPES.find((t) => t.id === type)?.label || type || 'Bloc', []);

	const saveCheckpoint = () => {
		if (!courseId || !lesson?.id || !Array.isArray(displayedBlocks)) return;
		const snapshotBlocks = displayedBlocks.map((blockItem, idx) => ({
			id: blockItem.id,
			type: blockItem.type || 'text',
			source: blockItem.source || '',
			metadata: blockItem.metadata || {},
			payload: blockItem.payload || null,
			visible: blockItem.visible !== false,
			order: idx,
		}));
		const checkpoint = {
			id: `cp_${Date.now()}`,
			label: `Checkpoint ${new Date().toLocaleString()}`,
			created_at: new Date().toISOString(),
			blocks: snapshotBlocks,
		};
		const next = [checkpoint, ...checkpoints].slice(0, MAX_CHECKPOINTS);
		setCheckpoints(next);
		setSelectedCheckpointId(checkpoint.id);
		safeWriteCheckpoints(courseId, lesson.id, next);
		showToast('Checkpoint salvat.', 'success');
	};

	const restoreCheckpoint = async () => {
		if (!courseId || !lesson?.id || !selectedCheckpointId || checkpointLoading) return;
		const checkpoint = checkpoints.find((item) => item.id === selectedCheckpointId);
		if (!checkpoint || !Array.isArray(checkpoint.blocks)) {
			showToast('Checkpoint invalid.', 'error');
			return;
		}

		setCheckpointLoading(true);
		try {
			setSaveStatus('saving');
			const currentById = new Map((blocks || []).map((blockItem) => [blockItem.id, blockItem]));
			const checkpointIds = new Set(
				checkpoint.blocks
					.map((blockItem) => blockItem.id)
					.filter(Boolean)
			);

			// 1) Delete blocks that do not exist in checkpoint.
			for (const currentBlock of blocks || []) {
				if (!checkpointIds.has(currentBlock.id)) {
					// eslint-disable-next-line no-await-in-loop
					await adminService.builderDeleteContentBlock(courseId, currentBlock.id);
				}
			}

			// 2) Update existing blocks and create missing ones.
			const finalOrderedIds = [];
			for (const checkpointBlock of checkpoint.blocks) {
				const existing = checkpointBlock.id ? currentById.get(checkpointBlock.id) : null;
				const payload = {
					type: checkpointBlock.type || 'text',
					source: checkpointBlock.source || '',
					metadata: checkpointBlock.metadata || {},
					payload: checkpointBlock.payload || null,
					visible: checkpointBlock.visible !== false,
				};

				if (existing) {
					// eslint-disable-next-line no-await-in-loop
					await adminService.builderUpdateContentBlock(courseId, existing.id, payload);
					finalOrderedIds.push(existing.id);
				} else {
					// eslint-disable-next-line no-await-in-loop
					const created = await adminService.builderCreateContentBlock(courseId, lesson.id, payload);
					const newId = created?.content_block?.id;
					if (newId) finalOrderedIds.push(newId);
				}
			}

			// 3) Reorder blocks to checkpoint order.
			if (finalOrderedIds.length > 1) {
				await adminService.builderReorderContentBlocks(courseId, lesson.id, finalOrderedIds);
			}

			setSaveStatus('saved');
			await onRefresh?.();
			setSelectedBlockId(finalOrderedIds[0] || null);
			showToast('Checkpoint restaurat.', 'success');
		} catch (e) {
			console.error('Restore checkpoint failed:', e);
			setSaveStatus('error');
			showToast('Restaurarea checkpoint-ului a eșuat.', 'error');
		} finally {
			setCheckpointLoading(false);
		}
	};

	return (
		<div className="admin-course-builder-content-blocks">
			<header className="admin-course-builder-content-blocks-header">
				<div className="admin-course-builder-content-blocks-head">
					<h3 className="admin-course-builder-content-blocks-title">Conținut lecție</h3>
					<p className="admin-course-builder-content-blocks-hint">
						Adaugă blocuri → selectează un bloc → editează. Poți reordona prin drag.
					</p>
					<p className="admin-course-builder-content-blocks-shortcuts" title="Scurtături tastatură">
						<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> adaugă bloc · <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> reordonează · <kbd>Esc</kbd> închide meniul
					</p>
				</div>
				<div className="admin-course-builder-content-blocks-toolbar">
					<div className="admin-course-builder-add-dropdown-wrap" ref={addDropdownRef}>
						<button
							type="button"
							className="admin-course-builder-add-block-btn"
							onClick={() => setAddDropdownOpen((o) => !o)}
							aria-expanded={addDropdownOpen}
							aria-haspopup="true"
							title="Adaugă bloc de conținut (Ctrl+Shift+A)"
						>
							+ Adaugă bloc
						</button>
						{addDropdownOpen && (
							<div className="admin-course-builder-add-dropdown">
								<div className="admin-course-builder-add-dropdown-section">
									<span className="admin-course-builder-add-dropdown-section-title">Tip bloc</span>
									{BLOCK_TYPES.map((t) => (
										<button
											key={t.id}
											type="button"
											className="admin-course-builder-add-dropdown-item"
											onClick={() => {
												handleAddBlock(t.id);
												setAddDropdownOpen(false);
											}}
											title={`Adaugă bloc ${t.label}`}
										>
											{t.label}
										</button>
									))}
								</div>
								<div className="admin-course-builder-add-dropdown-section">
									<span className="admin-course-builder-add-dropdown-section-title">Șabloane</span>
									{TEMPLATE_OPTIONS.map((t) => (
										<button
											key={t.id}
											type="button"
											className="admin-course-builder-add-dropdown-item"
											onClick={() => {
												handleAddTemplate(t.id);
												setAddDropdownOpen(false);
											}}
											title={`Șablon: ${t.label}`}
										>
											{t.label}
										</button>
									))}
								</div>
							</div>
						)}
					</div>
					<div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
						<button
							type="button"
							className="admin-btn admin-btn-secondary"
							onClick={saveCheckpoint}
							disabled={checkpointLoading || displayedBlocks.length === 0}
						>
							Save checkpoint
						</button>
						<select
							className="form-select"
							value={selectedCheckpointId}
							onChange={(e) => setSelectedCheckpointId(e.target.value)}
							disabled={checkpointLoading || checkpoints.length === 0}
							style={{ minWidth: 220 }}
						>
							<option value="">Alege checkpoint</option>
							{checkpoints.map((checkpoint) => (
								<option key={checkpoint.id} value={checkpoint.id}>
									{checkpoint.label}
								</option>
							))}
						</select>
						<button
							type="button"
							className="admin-btn admin-btn-secondary"
							onClick={restoreCheckpoint}
							disabled={checkpointLoading || !selectedCheckpointId}
						>
							{checkpointLoading ? 'Restore...' : 'Restore checkpoint'}
						</button>
					</div>
					<span title="Salvare automată la câteva secunde după editare">
						<AutoSaveIndicator status={saveStatus} />
					</span>
				</div>
			</header>

			<div className="admin-course-builder-content-grid">
				<div className="admin-course-builder-blocks-list-wrap">
					<ContentBlockList
						blocks={displayedBlocks}
						selectedBlockId={selectedBlockId}
						onSelectBlock={setSelectedBlockId}
						onReorderBlocks={handleReorder}
						onDeleteBlock={handleDeleteBlockClick}
						onAddBlock={handleAddBlock}
						disabled={reorderLoading || deleteBlockLoading}
					/>
				</div>
				<div className="admin-course-builder-editor-wrap">
					<div className="admin-course-builder-editor-toolbar">
						{draft ? (
							<span className="admin-course-builder-editor-toolbar-badge">
								Bloc: {blockTypeLabel(draft.type)}
							</span>
						) : (
							<span className="admin-course-builder-editor-toolbar-badge">
								Preview lecție
							</span>
						)}
						<div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginLeft: 'auto' }}>
							<button
								type="button"
								className="admin-btn admin-btn-secondary"
								onClick={() => {
									setEditorMode('edit');
									setContentStep('edit');
								}}
								disabled={editorMode === 'edit' && contentStep === 'edit'}
							>
								1. Edit blocks
							</button>
							<button
								type="button"
								className="admin-btn admin-btn-secondary"
								onClick={() => {
									setEditorMode('preview');
									setContentStep('preview');
								}}
								disabled={editorMode === 'preview' && contentStep === 'preview'}
							>
								2. Preview student
							</button>
							<button
								type="button"
								className="admin-btn admin-btn-secondary"
								onClick={() => {
									setEditorMode('preview');
									setContentStep('confirm');
								}}
								disabled={contentStep === 'confirm'}
							>
								3. Confirm
							</button>
							{draft && editorMode === 'edit' && (
								<button
									type="button"
									className="admin-course-builder-editor-delete-btn"
									onClick={() => handleDeleteBlockClick(draft.id)}
									title="Șterge acest bloc din lecție"
								>
									Șterge bloc
								</button>
							)}
						</div>
					</div>

					{editorMode === 'preview' ? (
						<div style={{ padding: '0.5rem 0' }}>
							<LessonBlocksPreview blocks={displayedBlocks} variant="student" />
							{contentStep === 'confirm' && (
								<div className="admin-card" style={{ marginTop: '0.75rem' }}>
									<div className="admin-card-body" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
										<strong>{displayedBlocks.length}</strong>
										<span>blocuri pregătite pentru lecție</span>
										<button type="button" className="admin-btn admin-btn-secondary" onClick={saveCheckpoint}>
											Salvează checkpoint final
										</button>
									</div>
								</div>
							)}
						</div>
					) : draft ? (
						<ContentBlockEditor courseId={courseId} block={draft} onChange={scheduleSave} />
					) : (
						<div className="admin-course-builder-editor-empty">
							<p className="admin-course-builder-editor-empty-text">Selectează un bloc din listă sau adaugă unul nou.</p>
							<p className="admin-course-builder-editor-empty-hint">Blocul selectat se editează aici; modificările se salvează automat.</p>
						</div>
					)}
				</div>
				<aside className="admin-course-builder-tools-dock" aria-label="Panou instrumente creare conținut">
					<div className="admin-course-builder-tools-card">
						<p className="admin-course-builder-tools-title">Instrumente rapide</p>
						<div className="admin-course-builder-tools-list">
							{QUICK_PANEL_BLOCKS.map((item) => (
								<button
									key={item.id}
									type="button"
									className="admin-course-builder-tool-btn"
									onClick={() => handleAddBlock(item.id)}
									title={`Adaugă ${item.label}`}
									aria-label={`Adaugă ${item.label}`}
								>
									<span aria-hidden="true">{item.icon}</span>
								</button>
							))}
						</div>
					</div>

					<div className="admin-course-builder-tools-card">
						<p className="admin-course-builder-tools-title">Șabloane</p>
						<div className="admin-course-builder-tools-list">
							{QUICK_PANEL_TEMPLATES.map((item) => (
								<button
									key={item.id}
									type="button"
									className="admin-course-builder-tool-btn admin-course-builder-tool-btn-secondary"
									onClick={() => handleAddTemplate(item.id)}
									title={`Șablon: ${item.label}`}
									aria-label={`Șablon: ${item.label}`}
								>
									<span aria-hidden="true">{item.icon}</span>
								</button>
							))}
						</div>
					</div>

					<div className="admin-course-builder-tools-card">
						<p className="admin-course-builder-tools-title">Workflow</p>
						<div className="admin-course-builder-tools-list">
							<button
								type="button"
								className="admin-course-builder-tool-btn admin-course-builder-tool-btn-secondary"
								onClick={() => {
									setEditorMode('edit');
									setContentStep('edit');
								}}
								title="Editare blocuri"
								aria-label="Editare blocuri"
							>
								<span aria-hidden="true">✍️</span>
							</button>
							<button
								type="button"
								className="admin-course-builder-tool-btn admin-course-builder-tool-btn-secondary"
								onClick={() => {
									setEditorMode('preview');
									setContentStep('preview');
								}}
								title="Preview student"
								aria-label="Preview student"
							>
								<span aria-hidden="true">👁️</span>
							</button>
							<button
								type="button"
								className="admin-course-builder-tool-btn admin-course-builder-tool-btn-secondary"
								onClick={() => {
									setEditorMode('preview');
									setContentStep('confirm');
								}}
								title="Confirmare finală"
								aria-label="Confirmare finală"
							>
								<span aria-hidden="true">✅</span>
							</button>
							<button
								type="button"
								className="admin-course-builder-tool-btn admin-course-builder-tool-btn-secondary"
								onClick={saveCheckpoint}
								disabled={checkpointLoading || displayedBlocks.length === 0}
								title="Salvează checkpoint"
								aria-label="Salvează checkpoint"
							>
								<span aria-hidden="true">💾</span>
							</button>
						</div>
					</div>
				</aside>
			</div>

			<ConfirmModal
				open={!!deleteConfirmBlockId}
				onClose={() => setDeleteConfirmBlockId(null)}
				onConfirm={handleConfirmDeleteBlock}
				title="Șterge content block"
				message="Ștergi acest content block?"
				confirmLabel="Șterge"
				cancelLabel="Anulare"
				variant="danger"
				loading={deleteBlockLoading}
			/>
		</div>
	);
};

export default ContentBlocksPanel;

