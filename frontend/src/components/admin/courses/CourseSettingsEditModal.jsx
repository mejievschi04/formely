import React, { useState, useEffect, useRef } from 'react';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';
import { courseCoverSrc } from '../../../utils/imageUrl';
import AITutorSettings from './AITutorSettings';
import { useAuth } from '../../../contexts/AuthContext';
import { canUseAiFeature, isAiEnabled } from '../../../utils/aiAvailability';
import '../../../styles/admin-course-builder.css';

const COURSE_ACCENT_COLORS = [
	'#0891b2',
	'#10b981',
	'#38bdf8',
	'#8b5cf6',
	'#ec4899',
	'#f43f5e',
	'#f97316',
	'#0f172a',
	'#64748b',
];

function hydrateDraftFromCourse(course) {
	const tags = Array.isArray(course?.marketing_tags) ? course.marketing_tags : [];
	const colorTag = tags.find((tag) => String(tag).startsWith('card_color:'));
	const courseSettings = course?.settings || {};
	const certificateSettings = courseSettings?.certificate || {};
	const accessSettings = courseSettings?.access || {};
	return {
		title: course?.title || '',
		description: course?.description || '',
		short_description: course?.short_description || '',
		card_color: course?.card_color || (colorTag ? String(colorTag).replace('card_color:', '') : '#0891b2'),
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
	const { user } = useAuth();
	const showAiTutorSettings = canUseAiFeature(user, 'ai_tutor');
	const [courseEditSaving, setCourseEditSaving] = useState(false);
	const [courseEditImageFile, setCourseEditImageFile] = useState(null);
	const [courseEditImagePreviewUrl, setCourseEditImagePreviewUrl] = useState(null);
	const courseEditImageInputRef = useRef(null);
	const [courseEditDraft, setCourseEditDraft] = useState(() => hydrateDraftFromCourse({}));
	const [aiTutorDraft, setAiTutorDraft] = useState(() => course?.settings?.ai_tutor || {
		enabled: true,
		tone: 'friendly',
		depth: 'medium',
		allowed_topics: [],
		restricted_topics: [],
	});

	const openCourseEditImagePicker = () => courseEditImageInputRef.current?.click();
	const wasOpenRef = useRef(false);

	useEffect(() => {
		if (open && course?.id) {
			if (!wasOpenRef.current) {
				setCourseEditDraft(hydrateDraftFromCourse(course));
				setAiTutorDraft(course?.settings?.ai_tutor || {
					enabled: true,
					tone: 'friendly',
					depth: 'medium',
					allowed_topics: [],
					restricted_topics: [],
				});
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
			payload.append('card_color', courseEditDraft.card_color || '#0891b2');
			payload.append('level', course?.level || 'beginner');
			payload.append('status', course?.status || 'draft');
			payload.append('visibility', course?.visibility || course?.settings?.visibility || 'public');
			payload.append('sequential_unlock', courseEditDraft.sequential_unlock !== false ? '1' : '0');
			payload.append('min_test_score', String(courseEditDraft.min_test_score ?? 70));
			payload.append('has_certificate', courseEditDraft.has_certificate ? '1' : '0');
			if (course?.estimated_duration_hours != null && course.estimated_duration_hours !== '') {
				payload.append('estimated_duration_hours', String(course.estimated_duration_hours));
			}
			payload.append('access_type', courseEditDraft.access_type || 'free');
			payload.append('enrollment_type', courseEditDraft.enrollment_type || 'open');

			const existingTags = Array.isArray(course?.marketing_tags) ? [...course.marketing_tags] : [];
			const nonColorTags = existingTags.filter((tag) => !String(tag).startsWith('card_color:'));
			const nextTags = [...nonColorTags, `card_color:${courseEditDraft.card_color || '#0891b2'}`];
			nextTags.forEach((tag, index) => payload.append(`marketing_tags[${index}]`, String(tag)));

			if (courseEditImageFile) {
				payload.append('image', courseEditImageFile);
			}

			const mergedSettings = {
				...(course?.settings || {}),
				ai_tutor: aiTutorDraft,
			};
			payload.append('settings', JSON.stringify(mergedSettings));

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

	const coverSrc = courseEditImagePreviewUrl || courseCoverSrc(course);
	const accent = courseEditDraft.card_color || '#0891b2';
	const coverChip = courseEditImageFile ? 'Imagine nouă' : coverSrc ? 'Copertă' : 'Fără imagine';

	return (
		<div className="admin-course-builder-test-modal-overlay" onClick={() => !courseEditSaving && onClose()}>
			<div className="admin-course-builder-test-modal admin-course-builder-course-edit-modal" onClick={(e) => e.stopPropagation()}>
				<header className="admin-course-builder-course-edit-header">
					<h3>Editare curs</h3>
					<p>Titlu, copertă și cum apare cursul în catalog.</p>
				</header>

				<div className="admin-course-builder-test-modal-form admin-course-builder-course-edit-form">
					<section className="admin-course-builder-course-edit-hero">
						<button
							type="button"
							className="admin-course-builder-course-edit-cover"
							onClick={openCourseEditImagePicker}
							disabled={courseEditSaving}
							style={{ '--course-preview-accent': accent }}
						>
							{coverSrc ? (
								<img src={coverSrc} alt="" />
							) : (
								<span>Adaugă copertă</span>
							)}
							<em>{coverChip}</em>
						</button>
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

						<div className="admin-course-builder-course-edit-identity">
							<div className="admin-course-builder-course-edit-field">
								<label htmlFor="course-settings-edit-title">Titlu</label>
								<input
									id="course-settings-edit-title"
									type="text"
									value={courseEditDraft.title}
									onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, title: e.target.value }))}
									placeholder="Numele cursului"
									disabled={courseEditSaving}
								/>
							</div>
							<div className="admin-course-builder-course-edit-field">
								<label htmlFor="course-settings-edit-short-description">Rezumat</label>
								<input
									id="course-settings-edit-short-description"
									type="text"
									value={courseEditDraft.short_description}
									onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, short_description: e.target.value }))}
									placeholder="Text scurt pe card"
									disabled={courseEditSaving}
								/>
							</div>
							<div className="admin-course-builder-course-edit-field">
								<label htmlFor="course-settings-edit-description">Descriere</label>
								<textarea
									id="course-settings-edit-description"
									rows={3}
									value={courseEditDraft.description}
									onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, description: e.target.value }))}
									placeholder="Opțional"
									disabled={courseEditSaving}
								/>
							</div>
						</div>
					</section>

					<section className="admin-course-builder-course-edit-field">
						<span className="admin-course-builder-course-edit-swatch-label">Culoare card</span>
						<div className="admin-course-builder-course-edit-swatches" role="listbox" aria-label="Culoare card">
							{COURSE_ACCENT_COLORS.map((color) => {
								const selected = String(accent).toLowerCase() === color;
								return (
									<button
										key={color}
										type="button"
										role="option"
										aria-selected={selected}
										className={`admin-course-builder-course-edit-swatch${selected ? ' is-selected' : ''}`}
										style={{ background: color }}
										onClick={() => setCourseEditDraft((prev) => ({ ...prev, card_color: color }))}
										disabled={courseEditSaving}
										title={color}
									/>
								);
							})}
							<label className="admin-course-builder-course-edit-swatch-custom">
								<input
									id="course-settings-edit-card-color"
									type="color"
									value={accent}
									onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, card_color: e.target.value }))}
									disabled={courseEditSaving}
									aria-label="Culoare personalizată"
								/>
							</label>
						</div>
					</section>

					<section className="admin-course-builder-course-edit-toggles">
						<label className="admin-course-builder-course-edit-toggle">
							<input
								type="checkbox"
								checked={courseEditDraft.sequential_unlock !== false}
								onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, sequential_unlock: e.target.checked }))}
								disabled={courseEditSaving}
							/>
							<span>
								<strong>Lecțiile se deschid pe rând</strong>
								<small>Următoarea lecție rămâne blocată până se parcurge cea curentă.</small>
							</span>
						</label>
						<label className="admin-course-builder-course-edit-toggle">
							<input
								type="checkbox"
								checked={courseEditDraft.has_certificate === true}
								onChange={(e) => setCourseEditDraft((prev) => ({ ...prev, has_certificate: e.target.checked }))}
								disabled={courseEditSaving}
							/>
							<span>
								<strong>Certificat la finalizare</strong>
								<small>Se emite după ce cursul e completat.</small>
							</span>
						</label>
						{courseEditDraft.has_certificate ? (
							<div className="admin-course-builder-course-edit-field admin-course-builder-course-edit-score">
								<label htmlFor="course-settings-edit-min-score">Prag certificat (%)</label>
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
						) : null}
					</section>

					{isAiEnabled() && showAiTutorSettings ? (
						<AITutorSettings
							courseData={{ ...course, settings: { ...(course?.settings || {}), ai_tutor: aiTutorDraft } }}
							onUpdate={(updates) => {
								if (updates?.ai_tutor) {
									setAiTutorDraft(updates.ai_tutor);
								}
							}}
						/>
					) : null}
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
