import React, { useState, useEffect } from 'react';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';
import RichTextEditor from '../../RichTextEditor';
import VideoLessonEditor from './LessonTypes/VideoLessonEditor';
import TextLessonEditor from './LessonTypes/TextLessonEditor';
import AssignmentLessonEditor from './LessonTypes/AssignmentLessonEditor';
import LiveSessionEditor from './LessonTypes/LiveSessionEditor';
import './LessonEditModal.css';

/**
 * Modal pentru editarea lecțiilor
 */
const LessonEditModal = ({ lesson, moduleId, courseId, onClose, onSave, onUpdate }) => {
	const { showToast } = useToast();
	const [editingLesson, setEditingLesson] = useState(null);
	const [saving, setSaving] = useState(false);
	const [titleError, setTitleError] = useState('');

	useEffect(() => {
		if (lesson) {
			setEditingLesson({
				...lesson,
				moduleId: moduleId,
				content_type: lesson.content_type || lesson.type || 'text',
				id: lesson.id || `temp-${Date.now()}`,
			});
		}
	}, [lesson, moduleId]);

	// Auto-save lesson content
	const autoSaveLesson = async (lessonData) => {
		if (!courseId || !lessonData.id || lessonData.id.toString().startsWith('temp-')) {
			return; // Skip auto-save for temporary lessons
		}

		try {
			await adminService.updateLesson(lessonData.id, {
				content: lessonData.content,
				title: lessonData.title,
				description: lessonData.description,
				type: lessonData.type || lessonData.content_type || 'text',
				video_url: lessonData.video_url || null,
				resources: lessonData.resources || [],
				attachments: lessonData.attachments || [],
				duration_minutes: lessonData.duration_minutes || null,
				is_preview: lessonData.is_preview || false,
				is_locked: lessonData.is_locked || false,
				unlock_after_lesson_id: lessonData.unlock_after_lesson_id || null,
			});
		} catch (err) {
			console.error('Auto-save error:', err);
		}
	};

	const handleSave = async () => {
		setTitleError('');
		if (!editingLesson || !editingLesson.title?.trim()) {
			setTitleError('Titlul lecției este obligatoriu');
			showToast('Titlul lecției este obligatoriu', 'error');
			return;
		}

		setSaving(true);
		try {
			const updateData = {
				title: editingLesson.title.trim(),
				description: editingLesson.description || '',
				content_type: editingLesson.content_type || 'text',
				content: editingLesson.content || '',
				video_url: editingLesson.video_url || null,
				pdf_url: editingLesson.pdf_url || null,
				duration_minutes: editingLesson.duration_minutes || null,
				is_preview: editingLesson.is_preview || false,
				is_locked: editingLesson.is_locked || false,
			};

			if (onSave) {
				await onSave({ ...editingLesson, ...updateData });
			}
			onClose();
		} catch (err) {
			console.error('Error saving lesson:', err);
			const msg = err?.response?.data?.message || err?.message || 'Eroare la salvare';
			showToast(msg, 'error');
		} finally {
			setSaving(false);
		}
	};

	if (!editingLesson) {
		return null;
	}

	return (
		<div className="lesson-edit-modal-overlay">
			<div className="lesson-edit-modal" onClick={(e) => e.stopPropagation()}>
				<div className="lesson-edit-modal-header">
					<h2>✏️ Editează Lecție</h2>
					<button type="button" className="lesson-edit-modal-close" onClick={onClose} aria-label="Închide">×</button>
				</div>

				<div className="lesson-edit-modal-content">
					{/* Title */}
					<div className="admin-form-group">
						<label className="admin-form-label" htmlFor="lesson-edit-title">
							Titlu Lecție <span className="admin-form-required">*</span>
						</label>
						<input
							id="lesson-edit-title"
							type="text"
							className={`admin-form-input ${titleError ? 'admin-input-error' : ''}`}
							value={editingLesson.title || ''}
							onChange={(e) => {
								setEditingLesson({ ...editingLesson, title: e.target.value });
								setTitleError('');
							}}
							placeholder="Titlul lecției"
							aria-invalid={!!titleError}
							aria-describedby={titleError ? 'lesson-edit-title-error' : undefined}
						/>
						{titleError && (
							<p id="lesson-edit-title-error" className="admin-form-error-inline" role="alert">
								{titleError}
							</p>
						)}
					</div>

					{/* Description */}
					<div className="admin-form-group">
						<label className="admin-form-label">Descriere</label>
						<textarea
							className="admin-form-textarea"
							value={editingLesson.description || ''}
							onChange={(e) => setEditingLesson({ ...editingLesson, description: e.target.value })}
							placeholder="Descriere lecție..."
							rows={3}
						/>
					</div>

					{/* Content Type and Duration */}
					<div className="admin-form-row">
						<div className="admin-form-group">
							<label className="admin-form-label">Tip Lecție</label>
							<select
								className="admin-form-select"
								value={editingLesson.content_type || 'text'}
								onChange={(e) => setEditingLesson({ ...editingLesson, content_type: e.target.value, type: e.target.value })}
							>
								<option value="text">Text</option>
								<option value="video">Video</option>
								<option value="assignment">Assignment / Practice</option>
								<option value="live">Sesiune live</option>
								<option value="pdf">PDF</option>
								<option value="quiz">Quiz</option>
							</select>
						</div>
					</div>

					{/* Content based on type */}
					{editingLesson.content_type === 'video' && (
						<VideoLessonEditor
							lesson={editingLesson}
							onUpdate={(updates) => {
								const updated = { ...editingLesson, ...updates };
								setEditingLesson(updated);
								if (onUpdate) onUpdate(updated);
								// Auto-save after 2 seconds
								setTimeout(() => {
									if (courseId && updated.id && !updated.id.toString().startsWith('temp-')) {
										autoSaveLesson(updated);
									}
								}, 2000);
							}}
							courseId={courseId}
						/>
					)}

					{editingLesson.content_type === 'text' && (
						<TextLessonEditor
							lesson={editingLesson}
							onUpdate={(updates) => {
								const updated = { ...editingLesson, ...updates };
								setEditingLesson(updated);
								if (onUpdate) onUpdate(updated);
								// Auto-save after 2 seconds
								setTimeout(() => {
									if (courseId && updated.id && !updated.id.toString().startsWith('temp-')) {
										autoSaveLesson(updated);
									}
								}, 2000);
							}}
						/>
					)}

					{editingLesson.content_type === 'assignment' && (
						<AssignmentLessonEditor
							lesson={editingLesson}
							onUpdate={(updates) => {
								const updated = { ...editingLesson, ...updates };
								setEditingLesson(updated);
								if (onUpdate) onUpdate(updated);
								// Auto-save after 2 seconds
								setTimeout(() => {
									if (courseId && updated.id && !updated.id.toString().startsWith('temp-')) {
										autoSaveLesson(updated);
									}
								}, 2000);
							}}
						/>
					)}

					{editingLesson.content_type === 'live' && (
						<LiveSessionEditor
							lesson={editingLesson}
							onUpdate={(updates) => {
								const updated = { ...editingLesson, ...updates };
								setEditingLesson(updated);
								if (onUpdate) onUpdate(updated);
								// Auto-save after 2 seconds
								setTimeout(() => {
									if (courseId && updated.id && !updated.id.toString().startsWith('temp-')) {
										autoSaveLesson(updated);
									}
								}, 2000);
							}}
						/>
					)}

					{editingLesson.content_type === 'pdf' && (
						<div className="admin-form-group">
							<label className="admin-form-label">URL PDF sau Încarcă PDF</label>
							<input
								type="url"
								className="admin-form-input"
								value={editingLesson.pdf_url || ''}
								onChange={(e) => setEditingLesson({ ...editingLesson, pdf_url: e.target.value })}
								placeholder="https://… (link către document)"
								style={{ marginBottom: '0.5rem' }}
							/>
							<div className="admin-input-hint" style={{ marginBottom: '1rem' }}>
								Link către documentul PDF sau folosește editorul pentru a încărca PDF direct
							</div>
							<RichTextEditor
								value={editingLesson.content || ''}
								onChange={(content) => {
									const updated = { ...editingLesson, content };
									setEditingLesson(updated);
									if (onUpdate) onUpdate(updated);
								}}
								placeholder="Folosește butonul 📄 pentru a încărca PDF sau adaugă link-uri și resurse..."
								style={{ minHeight: '200px' }}
							/>
						</div>
					)}

					{editingLesson.content_type === 'quiz' && (
						<div className="admin-form-group">
							<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
								<label className="admin-form-label">Întrebări Quiz</label>
							</div>
							<RichTextEditor
								value={editingLesson.content || ''}
								onChange={(content) => {
									const updated = { ...editingLesson, content };
									setEditingLesson(updated);
									if (onUpdate) onUpdate(updated);
								}}
								placeholder="Scrie întrebările quiz aici sau folosește asistentul AI Formely pentru a genera..."
								style={{ minHeight: '300px' }}
							/>
						</div>
					)}

					{/* Options */}
					<div className="admin-form-row">
						<div className="admin-form-group">
							<label className="admin-form-checkbox">
								<input
									type="checkbox"
									checked={editingLesson.is_preview || false}
									onChange={(e) => setEditingLesson({ ...editingLesson, is_preview: e.target.checked })}
								/>
								<span>Lecție gratuită (preview)</span>
							</label>
						</div>
						<div className="admin-form-group">
							<label className="admin-form-checkbox">
								<input
									type="checkbox"
									checked={editingLesson.is_locked || false}
									onChange={(e) => setEditingLesson({ ...editingLesson, is_locked: e.target.checked })}
								/>
								<span>Lecție blocată</span>
							</label>
						</div>
					</div>
				</div>

				<div className="lesson-edit-modal-footer">
					<button
						className="admin-btn admin-btn-secondary"
						onClick={onClose}
						disabled={saving}
					>
						Anulează
					</button>
					<button
						className="admin-btn admin-btn-primary"
						onClick={handleSave}
						disabled={saving || !editingLesson.title?.trim()}
					>
						{saving ? '⏳ Se salvează...' : '💾 Salvează Lecția'}
					</button>
				</div>
			</div>
		</div>
	);
};

export default LessonEditModal;
