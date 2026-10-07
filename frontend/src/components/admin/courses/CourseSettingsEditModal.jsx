import React, { useState, useEffect, useRef } from 'react';
import { adminService } from '../../../services/api';

import { useToast } from '../../../contexts/ToastContextShared.js';
import { X } from '@phosphor-icons/react';
import Modal from '../../common/Modal';
import { courseCoverSrc } from '../../../utils/imageUrl';
import '../../../styles/admin-course-builder.css';

function hydrateDraftFromCourse(course) {
	const tags = Array.isArray(course?.marketing_tags) ? course.marketing_tags : [];
	const colorTag = tags.find((tag) => String(tag).startsWith('card_color:'));
	const courseSettings = course?.settings || {};
	const certificateSettings = courseSettings?.certificate || {};
	const accessSettings = courseSettings?.access || {};
	const currentVisibility = course?.visibility || courseSettings?.visibility || 'public';
	const currentLevel = course?.level || 'beginner';
	const currentStatus = course?.status || 'draft';
	const currentDuration = course?.estimated_duration_hours ?? '';
	return {
		title: course?.title || '',
		description: course?.description || '',
		short_description: course?.short_description || '',
		card_color: course?.card_color || (colorTag ? String(colorTag).replace('card_color:', '') : '#5b72ff'),
		level: currentLevel,
		status: currentStatus,
		visibility: currentVisibility,
		estimated_duration_hours: currentDuration,
		sequential_unlock: course?.sequential_unlock !== false,
		has_certificate: course?.has_certificate === true || certificateSettings?.enabled === true,
		access_type: accessSettings?.type || course?.access_type || 'free',
		enrollment_type: accessSettings?.enrollment_type || course?.enrollment_type || 'open',
	};
}

/**
 * Modal setări curs (titlu, copertă, status etc.) — folosit pe pagina de detaliu curs.
 */
const CourseSettingsEditModal = ({ open, onClose, course, onSaved }) => {
	const { showToast } = useToast();
	const [courseEditSaving, setCourseEditSaving] = useState(false);
	const [courseEditImageFile, setCourseEditImageFile] = useState(null);
	const [courseEditImagePreviewUrl, setCourseEditImagePreviewUrl] = useState(null);
	const courseEditImageInputRef = useRef(null);
	const [courseEditDraft, setCourseEditDraft] = useState(() => hydrateDraftFromCourse({}));

	const openCourseEditImagePicker = () => courseEditImageInputRef.current?.click();
	const wasOpenRef = useRef(false);

	useEffect(() => {
		if (open && course?.id) {
			if (!wasOpenRef.current) {
				setCourseEditDraft(hydrateDraftFromCourse(course));
				setCourseEditImageFile(null);
			}
			wasOpenRef.current = true;
		} else {
			wasOpenRef.current = false;
		}
	}, [open, course]);

	useEffect(() => {
		if (!courseEditImageFile) {
			setCourseEditImagePreviewUrl(null);
			return undefined;
		}
		const url = URL.createObjectURL(courseEditImageFile);
		setCourseEditImagePreviewUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [courseEditImageFile]);

	const handleSaveCourseEdit = async () => {
		if (!course?.id || courseEditSaving) return;
		if (!courseEditDraft.title?.trim()) {
			showToast('Titlul cursului este obligatoriu.', 'error');
			return;
		}

		setCourseEditSaving(true);
		try {
			const payload = new FormData();
			payload.append('title', courseEditDraft.title.trim());
			payload.append('description', courseEditDraft.description || '');
			payload.append('short_description', courseEditDraft.short_description || '');
			payload.append('card_color', courseEditDraft.card_color || '#5b72ff');
			payload.append('level', courseEditDraft.level || 'beginner');
			payload.append('status', courseEditDraft.status || 'draft');
			payload.append('visibility', courseEditDraft.visibility || 'public');
			payload.append('sequential_unlock', courseEditDraft.sequential_unlock !== false ? '1' : '0');
			payload.append('has_certificate', courseEditDraft.has_certificate ? '1' : '0');
			if (courseEditDraft.estimated_duration_hours !== '' && courseEditDraft.estimated_duration_hours != null) {
				payload.append('estimated_duration_hours', String(courseEditDraft.estimated_duration_hours));
			}
			payload.append('access_type', courseEditDraft.access_type || 'free');
			payload.append('enrollment_type', courseEditDraft.enrollment_type || 'open');

			const existingTags = Array.isArray(course?.marketing_tags) ? [...course.marketing_tags] : [];
			const nonColorTags = existingTags.filter((tag) => !String(tag).startsWith('card_color:'));
			const nextTags = [...nonColorTags, `card_color:${courseEditDraft.card_color || '#5b72ff'}`];
			nextTags.forEach((tag, index) => payload.append(`marketing_tags[${index}]`, String(tag)));

			if (courseEditImageFile) {
				payload.append('image', courseEditImageFile);
			}

			await adminService.updateCourse(course.id, payload);
			showToast('Datele cursului au fost actualizate.', 'success');
			onSaved?.();
			onClose();
		} catch (err) {
			console.error('Course edit save failed:', err);
			showToast(err?.response?.data?.message || 'Nu am putut salva datele cursului.', 'error');
		} finally {
			setCourseEditSaving(false);
		}
	};

	if (!open || !course?.id) return null;

	const set = (field) => (e) => setCourseEditDraft((prev) => ({ ...prev, [field]: e.target.value }));
	const coverSrc = courseEditImagePreviewUrl || courseCoverSrc(course);
	const cardColor = courseEditDraft.card_color || '#5b72ff';

	return (
		<Modal
			isOpen={open}
			onClose={onClose}
			closeOnBackdropClick={!courseEditSaving}
			closeOnEscape={!courseEditSaving}
			ariaLabelledby="course-settings-edit-heading"
			className="va-dialog-overlay"
			unstyledContent
		>
			<form
				className="va-dialog"
				onSubmit={(e) => {
					e.preventDefault();
					handleSaveCourseEdit();
				}}
				noValidate
			>
				<header className="va-dialog__header">
					<h2 id="course-settings-edit-heading" className="va-dialog__title">Editare curs</h2>
					<button type="button" className="va-close-btn" onClick={onClose} disabled={courseEditSaving} aria-label="Închide">
						<X size={18} weight="bold" aria-hidden="true" />
					</button>
				</header>

				<div className="va-dialog__body">
					<div className="va-form-grid">
						<div className="va-field va-field--full">
							<label htmlFor="course-settings-edit-title">Titlu curs</label>
							<input
								id="course-settings-edit-title"
								type="text"
								value={courseEditDraft.title}
								onChange={set('title')}
								placeholder="Titlu curs"
								disabled={courseEditSaving}
								data-modal-initial-focus
								required
								aria-required="true"
							/>
						</div>

						<div className="va-field va-field--full">
							<label htmlFor="course-settings-edit-description">Descriere</label>
							<textarea
								id="course-settings-edit-description"
								rows={4}
								value={courseEditDraft.description}
								onChange={set('description')}
								placeholder="Descrierea cursului"
								disabled={courseEditSaving}
							/>
						</div>

						<div className="va-field va-field--full">
							<label htmlFor="course-settings-edit-short-description">
								Descriere scurtă <span className="va-field__optional">(în carduri și liste)</span>
							</label>
							<textarea
								id="course-settings-edit-short-description"
								rows={2}
								value={courseEditDraft.short_description}
								onChange={set('short_description')}
								placeholder="Rezumatul cursului"
								disabled={courseEditSaving}
							/>
						</div>

						<div className="va-field">
							<label htmlFor="course-settings-edit-level">Nivel</label>
							<select id="course-settings-edit-level" value={courseEditDraft.level || 'beginner'} onChange={set('level')} disabled={courseEditSaving}>
								<option value="beginner">Începător</option>
								<option value="intermediate">Intermediar</option>
								<option value="advanced">Avansat</option>
							</select>
						</div>
						<div className="va-field">
							<label htmlFor="course-settings-edit-status">Status</label>
							<select id="course-settings-edit-status" value={courseEditDraft.status || 'draft'} onChange={set('status')} disabled={courseEditSaving}>
								<option value="draft">Ciornă</option>
								<option value="published">Publicat</option>
							</select>
						</div>

						<div className="va-field">
							<label htmlFor="course-settings-edit-visibility">Vizibilitate</label>
							<select id="course-settings-edit-visibility" value={courseEditDraft.visibility || 'public'} onChange={set('visibility')} disabled={courseEditSaving}>
								<option value="public">Public</option>
								<option value="private">Privat</option>
								<option value="hidden">Ascuns</option>
							</select>
						</div>
						<div className="va-field">
							<label htmlFor="course-settings-edit-hours">
								Durată estimată <span className="va-field__optional">(ore)</span>
							</label>
							<input
								id="course-settings-edit-hours"
								type="number"
								min={1}
								value={courseEditDraft.estimated_duration_hours}
								onChange={(e) => setCourseEditDraft((prev) => ({
									...prev,
									estimated_duration_hours: e.target.value ? parseInt(e.target.value, 10) : '',
								}))}
								placeholder="Ex: 12"
								disabled={courseEditSaving}
							/>
						</div>

						<div className="va-field">
							<label htmlFor="course-settings-edit-card-color">Culoarea cardului</label>
							<div className="va-color-input">
								<input
									id="course-settings-edit-card-color"
									type="color"
									value={cardColor}
									onChange={set('card_color')}
									disabled={courseEditSaving}
								/>
								<input
									type="text"
									value={cardColor}
									onChange={set('card_color')}
									aria-label="Codul culorii cardului"
									maxLength={7}
									disabled={courseEditSaving}
								/>
							</div>
						</div>

						<div className="va-field va-field--full">
							<span className="va-field__label">Copertă</span>
							<div className="va-media-field">
								<div className="va-media-field__preview">
									{coverSrc ? <img src={coverSrc} alt="" /> : <span>Fără copertă</span>}
								</div>
								<div className="va-media-field__copy">
									<p className="va-field__hint">
										{courseEditImageFile
											? 'Imagine nouă — se salvează odată cu cursul.'
											: courseCoverSrc(course)
												? 'Apare pe cardul cursului.'
												: 'Cursul nu are încă o copertă.'}
										{' '}Recomandat 16:9, cel mult 4 MB.
									</p>
									<div className="va-media-field__actions">
										<button type="button" className="lms-btn-secondary lms-btn-sm" onClick={openCourseEditImagePicker} disabled={courseEditSaving}>
											{coverSrc ? 'Schimbă imaginea' : 'Alege imaginea'}
										</button>
										{courseEditImageFile ? (
											<button
												type="button"
												className="lms-btn-secondary lms-btn-sm"
												onClick={() => {
													setCourseEditImageFile(null);
													if (courseEditImageInputRef.current) {
														courseEditImageInputRef.current.value = '';
													}
												}}
												disabled={courseEditSaving}
											>
												Renunță
											</button>
										) : null}
									</div>
									<input
										ref={courseEditImageInputRef}
										id="course-settings-edit-image"
										type="file"
										accept="image/*"
										onChange={(e) => {
											const file = e.target.files?.[0] || null;
											e.target.value = '';
											setCourseEditImageFile(file);
										}}
										disabled={courseEditSaving}
										hidden
									/>
								</div>
							</div>
						</div>

						<div className="va-field va-field--full">
							<div className="va-checks">
								<label className="va-check">
									<input
										type="checkbox"
										checked={courseEditDraft.sequential_unlock !== false}
										onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, sequential_unlock: e.target.checked }))}
										disabled={courseEditSaving}
									/>
									<span>Deblocare secvențială</span>
								</label>
								<label className="va-check">
									<input
										type="checkbox"
										checked={courseEditDraft.has_certificate === true}
										onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, has_certificate: e.target.checked }))}
										disabled={courseEditSaving}
									/>
									<span>Certificat la finalizare</span>
								</label>
							</div>
							<p className="va-field__hint">
								Cursul rămâne gratuit și deschis implicit; aici ajustezi setările de publicare și finalizare.
							</p>
						</div>
					</div>
				</div>

				<footer className="va-dialog__footer">
					<button type="button" className="lms-btn-secondary" onClick={onClose} disabled={courseEditSaving}>
						Anulează
					</button>
					<button type="submit" className="va-btn-save lms-btn-primary" disabled={courseEditSaving}>
						{courseEditSaving ? 'Se salvează…' : 'Salvează'}
					</button>
				</footer>
			</form>
		</Modal>
	);
};

export default CourseSettingsEditModal;
