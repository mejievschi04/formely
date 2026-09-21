import React, { useEffect, useId, useState } from 'react';
import { PencilSimple, X } from '@phosphor-icons/react';
import Modal from '../../common/Modal';
import { adminService } from '../../../services/api';
import { normalizeColorInputToHex } from '../../../utils/color';
import { useToast } from '../../../contexts/ToastContext';

const MAP_ACCENT_FALLBACK = '#059669';
const MAP_TEXT_FALLBACK = '#f8fafc';

function resolveMapUpdateId(map) {
	if (!map?.id && map?.id !== 0) return null;
	return String(map.id) === 'unassigned' ? 'unassigned' : map.id;
}

export default function CourseMapHeaderStyleEditor({ map, onSaved }) {
	const { showToast } = useToast();
	const titleId = useId();
	const [open, setOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [formName, setFormName] = useState('');
	const [formDescription, setFormDescription] = useState('');
	const [formAccent, setFormAccent] = useState(MAP_ACCENT_FALLBACK);
	const [formHeaderBg, setFormHeaderBg] = useState('');
	const [formHeaderText, setFormHeaderText] = useState('');

	useEffect(() => {
		if (!open || !map) return;
		setFormName(map.name || '');
		setFormDescription(map.description || '');
		setFormAccent(map.accent_color || MAP_ACCENT_FALLBACK);
		setFormHeaderBg(map.header_bg_color || '');
		setFormHeaderText(map.header_text_color || '');
	}, [open, map]);

	const handleClose = () => {
		if (saving) return;
		setOpen(false);
	};

	const handleSave = async () => {
		const mapUpdateId = resolveMapUpdateId(map);
		if (!mapUpdateId) return;
		const name = formName.trim();
		if (!name) {
			showToast('Numele mapei este obligatoriu', 'error');
			return;
		}

		setSaving(true);
		try {
			await adminService.updateCourseMap(mapUpdateId, {
				name,
				description: formDescription.trim() || null,
				accent_color: normalizeColorInputToHex(formAccent, MAP_ACCENT_FALLBACK),
				header_bg_color: formHeaderBg.trim()
					? normalizeColorInputToHex(formHeaderBg, null)
					: null,
				header_text_color: formHeaderText.trim()
					? normalizeColorInputToHex(formHeaderText, null)
					: null,
			});
			const refreshed = await adminService.getCourseMap(mapUpdateId);
			onSaved?.(refreshed);
			showToast('Aspectul mapei a fost actualizat', 'success');
			setOpen(false);
		} catch (err) {
			showToast(err?.response?.data?.message || 'Nu s-a putut salva mapa', 'error');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="course-map-page-header-edit-wrap">
			<button
				type="button"
				className="course-map-page-header-edit-btn"
				onClick={() => setOpen(true)}
				aria-haspopup="dialog"
				aria-expanded={open}
				title="Editează aspectul mapei"
			>
				<PencilSimple size={16} weight="bold" aria-hidden="true" />
				<span>Editează</span>
			</button>

			<Modal
				isOpen={open}
				onClose={handleClose}
				ariaLabelledby={titleId}
				className="course-map-header-edit-modal-overlay"
			>
				<div className="course-map-page-header-edit-modal">
					<div className="course-map-page-header-edit-panel__head">
						<strong id={titleId}>Aspect mapă</strong>
						<button
							type="button"
							className="course-map-page-header-edit-panel__close"
							onClick={handleClose}
							aria-label="Închide"
							disabled={saving}
						>
							<X size={16} weight="bold" aria-hidden="true" />
						</button>
					</div>

					<label className="course-map-page-header-edit-field">
						<span>Titlu</span>
						<input
							type="text"
							className="course-map-page-header-edit-input"
							value={formName}
							onChange={(e) => setFormName(e.target.value)}
						/>
					</label>

					<label className="course-map-page-header-edit-field">
						<span>Descriere</span>
						<textarea
							className="course-map-page-header-edit-textarea"
							value={formDescription}
							onChange={(e) => setFormDescription(e.target.value)}
							rows={2}
						/>
					</label>

					<label className="course-map-page-header-edit-field">
						<span>Culoare accent</span>
						<div className="course-map-page-header-edit-color-row">
							<input
								type="color"
								value={normalizeColorInputToHex(formAccent, MAP_ACCENT_FALLBACK)}
								onChange={(e) => setFormAccent(e.target.value)}
								aria-label="Culoare accent"
							/>
							<input
								type="text"
								className="course-map-page-header-edit-input"
								value={formAccent}
								onChange={(e) => setFormAccent(e.target.value)}
								placeholder={MAP_ACCENT_FALLBACK}
							/>
						</div>
					</label>

					<label className="course-map-page-header-edit-field">
						<span>Fundal header</span>
						<div className="course-map-page-header-edit-color-row">
							<input
								type="color"
								value={normalizeColorInputToHex(formHeaderBg || MAP_ACCENT_FALLBACK, MAP_ACCENT_FALLBACK)}
								onChange={(e) => setFormHeaderBg(e.target.value)}
								aria-label="Culoare fundal header"
							/>
							<input
								type="text"
								className="course-map-page-header-edit-input"
								value={formHeaderBg}
								onChange={(e) => setFormHeaderBg(e.target.value)}
								placeholder="Gradient automat"
							/>
							{formHeaderBg.trim() ? (
								<button
									type="button"
									className="course-map-page-header-edit-reset"
									onClick={() => setFormHeaderBg('')}
								>
									Reset
								</button>
							) : null}
						</div>
					</label>

					<label className="course-map-page-header-edit-field">
						<span>Text header</span>
						<div className="course-map-page-header-edit-color-row">
							<input
								type="color"
								value={normalizeColorInputToHex(formHeaderText || MAP_TEXT_FALLBACK, MAP_TEXT_FALLBACK)}
								onChange={(e) => setFormHeaderText(e.target.value)}
								aria-label="Culoare text header"
							/>
							<input
								type="text"
								className="course-map-page-header-edit-input"
								value={formHeaderText}
								onChange={(e) => setFormHeaderText(e.target.value)}
								placeholder={MAP_TEXT_FALLBACK}
							/>
							{formHeaderText.trim() ? (
								<button
									type="button"
									className="course-map-page-header-edit-reset"
									onClick={() => setFormHeaderText('')}
								>
									Reset
								</button>
							) : null}
						</div>
					</label>

					<div className="course-map-page-header-edit-panel__actions">
						<button
							type="button"
							className="course-map-page-header-edit-cancel"
							onClick={handleClose}
							disabled={saving}
						>
							Anulează
						</button>
						<button
							type="button"
							className="course-map-page-header-edit-save"
							onClick={handleSave}
							disabled={saving}
						>
							{saving ? 'Se salvează...' : 'Salvează'}
						</button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
