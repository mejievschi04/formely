import React, { useState, useEffect, useRef } from 'react';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';
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
		min_test_score: course?.min_test_score ?? certificateSettings?.min_score ?? 70,
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
			payload.append('min_test_score', String(courseEditDraft.min_test_score ?? 70));
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

	return (
		<div className="admin-course-builder-test-modal-overlay" onClick={() => !courseEditSaving && onClose()}>
			<div className="admin-course-builder-test-modal admin-course-builder-course-edit-modal" onClick={(e) => e.stopPropagation()}>
				<h3>Editare curs</h3>
				<div className="admin-course-builder-test-modal-form admin-course-builder-course-edit-form">
					<div className="admin-course-builder-course-edit-grid">
						<div className="admin-course-builder-course-edit-field">
							<label htmlFor="course-settings-edit-title">Titlu curs *</label>
							<input
								id="course-settings-edit-title"
								type="text"
								value={courseEditDraft.title}
								onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, title: e.target.value }))}
								placeholder="Titlu curs"
								disabled={courseEditSaving}
							/>
						</div>
						<div className="admin-course-builder-course-edit-field">
							<label htmlFor="course-settings-edit-card-color">Culoare cartonaș</label>
							<input
								id="course-settings-edit-card-color"
								type="color"
								value={courseEditDraft.card_color || '#5b72ff'}
								onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, card_color: e.target.value }))}
								disabled={courseEditSaving}
							/>
							<div
								className="admin-course-builder-card-color-preview"
								style={{ '--course-preview-accent': courseEditDraft.card_color || '#5b72ff' }}
							>
								<span className="admin-course-builder-card-color-preview-swatch" aria-hidden="true" />
								<div className="admin-course-builder-card-color-preview-copy">
									<strong>Previzualizare</strong>
									<p>Cardul din listă va folosi această culoare.</p>
								</div>
							</div>
						</div>
					</div>

					<div className="admin-course-builder-course-edit-field">
						<label htmlFor="course-settings-edit-description">Descriere</label>
						<textarea
							id="course-settings-edit-description"
							rows={4}
							value={courseEditDraft.description}
							onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, description: e.target.value }))}
							placeholder="Descrierea cursului"
							disabled={courseEditSaving}
						/>
					</div>

					<div className="admin-course-builder-course-edit-field">
						<label htmlFor="course-settings-edit-short-description">Descriere scurtă</label>
						<textarea
							id="course-settings-edit-short-description"
							rows={2}
							value={courseEditDraft.short_description}
							onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, short_description: e.target.value }))}
							placeholder="Rezumatul care apare în carduri sau liste"
							disabled={courseEditSaving}
						/>
					</div>

					<div className="admin-course-builder-course-edit-grid">
						<div className="admin-course-builder-course-edit-field">
							<label htmlFor="course-settings-edit-level">Nivel</label>
							<select
								id="course-settings-edit-level"
								value={courseEditDraft.level || 'beginner'}
								onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, level: e.target.value }))}
								disabled={courseEditSaving}
							>
								<option value="beginner">Începător</option>
								<option value="intermediate">Intermediar</option>
								<option value="advanced">Avansat</option>
							</select>
						</div>
						<div className="admin-course-builder-course-edit-field">
							<label htmlFor="course-settings-edit-status">Status</label>
							<select
								id="course-settings-edit-status"
								value={courseEditDraft.status || 'draft'}
								onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, status: e.target.value }))}
								disabled={courseEditSaving}
							>
								<option value="draft">Draft</option>
								<option value="published">Publicat</option>
							</select>
						</div>
					</div>

					<div className="admin-course-builder-course-edit-grid">
						<div className="admin-course-builder-course-edit-field">
							<label htmlFor="course-settings-edit-visibility">Vizibilitate</label>
							<select
								id="course-settings-edit-visibility"
								value={courseEditDraft.visibility || 'public'}
								onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, visibility: e.target.value }))}
								disabled={courseEditSaving}
							>
								<option value="public">Public</option>
								<option value="private">Privat</option>
								<option value="hidden">Ascuns</option>
							</select>
						</div>
						<div className="admin-course-builder-course-edit-field">
							<label htmlFor="course-settings-edit-hours">Durată estimată (ore)</label>
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
					</div>

					<div className="admin-course-builder-course-edit-grid">
						<div className="admin-course-builder-course-edit-field">
							<label htmlFor="course-settings-edit-min-score">Scor minim quiz (%)</label>
							<input
								id="course-settings-edit-min-score"
								type="number"
								min={0}
								max={100}
								value={courseEditDraft.min_test_score ?? 70}
								onChange={(e) => setCourseEditDraft((prev) => ({
									...prev,
									min_test_score: e.target.value ? parseInt(e.target.value, 10) : 70,
								}))}
								disabled={courseEditSaving}
							/>
						</div>
						<div className="admin-course-builder-course-edit-field">
							<div className="admin-course-builder-course-edit-media">
								<div className="admin-course-builder-course-edit-media-preview">
									{(courseEditImagePreviewUrl || courseCoverSrc(course)) ? (
										<img src={courseEditImagePreviewUrl || courseCoverSrc(course)} alt="" />
									) : (
										<div className="admin-course-builder-course-edit-media-placeholder">
											<span>Fără copertă</span>
										</div>
									)}
								</div>
								<div className="admin-course-builder-course-edit-media-copy">
									<div className="admin-course-builder-course-edit-media-head">
										<label htmlFor="course-settings-edit-image">Poză curs {courseCoverSrc(course) ? '' : '*'}</label>
										<span className="admin-course-builder-course-edit-media-chip">
											{courseEditImageFile ? 'Previzualizare nouă' : courseCoverSrc(course) ? 'Copertă curentă' : 'Lipsă'}
										</span>
									</div>
									<p className="admin-course-builder-course-edit-media-note">
										Thumbnail-ul apare în cardul cursului. Recomandat 16:9, max. 4MB.
									</p>
									<div className="admin-course-builder-course-edit-media-actions">
										<button
											type="button"
											className="admin-course-builder-course-edit-media-button"
											onClick={openCourseEditImagePicker}
											disabled={courseEditSaving}
										>
											Alege imaginea
										</button>
										{courseEditImageFile ? (
											<button
												type="button"
												className="admin-course-builder-course-edit-media-button admin-course-builder-course-edit-media-button--ghost"
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
					</div>

					<div className="admin-course-builder-course-edit-checks">
						<label className="admin-course-builder-course-edit-check">
							<input
								type="checkbox"
								checked={courseEditDraft.sequential_unlock !== false}
								onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, sequential_unlock: e.target.checked }))}
								disabled={courseEditSaving}
							/>
							<span>Deblocare secvențială</span>
						</label>
						<label className="admin-course-builder-course-edit-check">
							<input
								type="checkbox"
								checked={courseEditDraft.has_certificate === true}
								onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, has_certificate: e.target.checked }))}
								disabled={courseEditSaving}
							/>
							<span>Certificat la finalizare</span>
						</label>
					</div>

					<p className="admin-course-builder-course-edit-note">
						Cursul rămâne gratuit și deschis implicit; aici ajustezi doar setările importante de publicare și finalizare.
					</p>
				</div>

				<div className="admin-course-builder-test-modal-actions">
					<button type="button" className="admin-btn admin-btn-secondary" onClick={onClose} disabled={courseEditSaving}>
						Anulează
					</button>
					<button type="button" className="admin-btn admin-btn-primary" onClick={handleSaveCourseEdit} disabled={courseEditSaving}>
						{courseEditSaving ? 'Se salvează...' : 'Salvează'}
					</button>
				</div>
			</div>
		</div>
	);
};

export default CourseSettingsEditModal;
