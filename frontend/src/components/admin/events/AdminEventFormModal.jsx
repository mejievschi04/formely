import React, { useState, useEffect, useCallback, useRef } from 'react';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';
import { useScrollResetOnOpen } from '../../../hooks/useScrollResetOnOpen';

const DEFAULT_TIMEZONE = 'Europe/Chisinau';
const DEFAULT_DURATION_MINUTES = 60;
const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const emptyEventForm = () => ({
	title: '',
	description: '',
	type: 'live_online',
	event_date: '',
	start_time: '09:00',
	duration_minutes: DEFAULT_DURATION_MINUTES,
	location: '',
	live_link: '',
});

const trimOrNull = (v) => {
	const t = typeof v === 'string' ? v.trim() : '';
	return t || null;
};

const normalizeTimeInput = (rawValue) => {
	const onlyDigitsAndColon = rawValue.replace(/[^\d:]/g, '');
	const compact = onlyDigitsAndColon.replace(/:+/g, ':');
	if (compact.includes(':')) {
		const [h = '', m = ''] = compact.split(':');
		return `${h.slice(0, 2)}:${m.slice(0, 2)}`;
	}
	if (compact.length <= 2) return compact;
	return `${compact.slice(0, 2)}:${compact.slice(2, 4)}`;
};

const toDateTimeLocal = (eventDate, timeHm) => {
	if (!eventDate || !timeHm) return '';
	const [h, rest = '00'] = timeHm.split(':');
	const m = (rest || '00').slice(0, 2);
	return `${eventDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const addMinutesToDateTimeLocal = (dateTimeLocal, minutesToAdd) => {
	const m = dateTimeLocal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
	if (!m) return null;
	const d = new Date(
		parseInt(m[1], 10),
		parseInt(m[2], 10) - 1,
		parseInt(m[3], 10),
		parseInt(m[4], 10),
		parseInt(m[5], 10)
	);
	d.setTime(d.getTime() + minutesToAdd * 60000);
	const pad = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const calculateDurationMinutes = (startDate, endDate) => {
	if (!startDate || !endDate) return DEFAULT_DURATION_MINUTES;
	const start = new Date(startDate);
	const end = new Date(endDate);
	const diff = Math.round((end.getTime() - start.getTime()) / 60000);
	return Number.isFinite(diff) && diff > 0 ? diff : DEFAULT_DURATION_MINUTES;
};

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {object | null} props.editingEvent
 * @param {{ event_date?: string, start_time?: string } | null} props.prefill
 * @param {() => void} props.onSaved
 */
const AdminEventFormModal = ({ open, onClose, editingEvent, prefill, onSaved }) => {
	const { success: showSuccess, error: showError } = useToast();
	const [formData, setFormData] = useState(emptyEventForm);
	const [errors, setErrors] = useState({});
	const [touched, setTouched] = useState({});
	const bodyRef = useRef(null);
	useScrollResetOnOpen(open, bodyRef);

	const resetForm = useCallback(() => {
		setFormData(emptyEventForm());
		setErrors({});
		setTouched({});
	}, []);

	useEffect(() => {
		if (!open) return;
		if (editingEvent) {
			let eventDate = '';
			let startTime = '09:00';
			if (editingEvent.start_date) {
				const match = editingEvent.start_date.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):?(\d{2})?/);
				if (match) {
					const [, year, month, day, hour, minute] = match;
					eventDate = `${year}-${month}-${day}`;
					startTime = `${hour}:${minute}`;
				}
			}
			const rawType = editingEvent.type || 'live_online';
			const formType = rawType === 'physical' ? 'physical' : 'live_online';
			setFormData({
				title: editingEvent.title || '',
				description: editingEvent.description || '',
				type: formType,
				event_date: eventDate,
				start_time: startTime,
				duration_minutes: calculateDurationMinutes(editingEvent.start_date, editingEvent.end_date),
				location: formType === 'physical' ? (editingEvent.location || '') : '',
				live_link: formType === 'live_online' ? (editingEvent.live_link || '') : '',
			});
			setErrors({});
			setTouched({});
			return;
		}
		if (prefill?.event_date) {
			setFormData({
				...emptyEventForm(),
				event_date: prefill.event_date,
				start_time: prefill.start_time || '09:00',
				duration_minutes: DEFAULT_DURATION_MINUTES,
			});
		} else {
			setFormData(emptyEventForm());
		}
		setErrors({});
		setTouched({});
	}, [open, editingEvent, prefill]);

	const validate = useCallback(() => {
		const newErrors = {};
		if (!formData.title || formData.title.trim().length < 3) {
			newErrors.title = 'Titlul trebuie să aibă minim 3 caractere';
		}
		if (!formData.description || formData.description.trim().length < 10) {
			newErrors.description = 'Descrierea trebuie să aibă minim 10 caractere';
		}
		if (!formData.event_date) {
			newErrors.event_date = 'Alege data evenimentului';
		}
		if (!formData.start_time) {
			newErrors.start_time = 'Alege ora de început';
		} else if (!TIME_24H_REGEX.test(formData.start_time.trim())) {
			newErrors.start_time = 'Folosește formatul 24h: HH:mm (ex. 09:30)';
		}
		if (!formData.duration_minutes || Number(formData.duration_minutes) < 5) {
			newErrors.duration_minutes = 'Durata trebuie să fie de cel puțin 5 minute';
		}
		if (formData.type === 'physical') {
			if (!formData.location || formData.location.trim().length < 2) {
				newErrors.location = 'Introdu locația pentru evenimentul fizic';
			}
		}
		if (formData.type === 'live_online' && trimOrNull(formData.live_link)) {
			const u = formData.live_link.trim();
			try {
				const parsed = new URL(u);
				if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
					newErrors.live_link = 'Folosește http:// sau https://';
				}
			} catch {
				newErrors.live_link = 'Introdu un link valid (https://…)';
			}
		}
		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	}, [formData]);

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!validate()) {
			setTouched({
				title: true,
				description: true,
				event_date: true,
				start_time: true,
				duration_minutes: true,
				location: true,
				live_link: true,
			});
			return;
		}

		try {
			const formatDateForBackend = (dateString) => {
				if (!dateString) return null;
				if (dateString.includes('T')) {
					return dateString;
				}
				const date = new Date(dateString);
				const year = date.getFullYear();
				const month = String(date.getMonth() + 1).padStart(2, '0');
				const day = String(date.getDate()).padStart(2, '0');
				const hours = String(date.getHours()).padStart(2, '0');
				const minutes = String(date.getMinutes()).padStart(2, '0');
				return `${year}-${month}-${day}T${hours}:${minutes}`;
			};

			const startLocal = toDateTimeLocal(formData.event_date, formData.start_time);
			const endLocal = addMinutesToDateTimeLocal(startLocal, Number(formData.duration_minutes));
			if (!startLocal || !endLocal) {
				showError('Dată sau oră invalidă.');
				return;
			}

			const dataToSend = {
				title: formData.title.trim(),
				description: formData.description.trim(),
				short_description: editingEvent?.short_description?.trim() || null,
				type: formData.type,
				status: editingEvent ? (editingEvent.status ?? 'published') : 'published',
				start_date: formatDateForBackend(startLocal),
				end_date: formatDateForBackend(endLocal),
				timezone: DEFAULT_TIMEZONE,
				location: formData.type === 'physical' ? trimOrNull(formData.location) : null,
				live_link: formData.type === 'live_online' ? trimOrNull(formData.live_link) : null,
				max_capacity: editingEvent?.max_capacity ?? null,
				instructor_id: editingEvent?.instructor_id ?? null,
				access_type: 'free',
				course_id: null,
				replay_url: editingEvent?.replay_url?.trim() || null,
				thumbnail: editingEvent?.thumbnail?.trim() || null,
			};

			if (editingEvent) {
				await adminService.updateEvent(editingEvent.id, dataToSend);
				showSuccess('Eveniment actualizat.');
			} else {
				await adminService.createEvent(dataToSend);
				showSuccess('Eveniment creat.');
			}

			onClose();
			resetForm();
			onSaved?.();
		} catch (err) {
			const errorMessage =
				err.response?.data?.message ||
				(err.response?.data?.errors ? JSON.stringify(err.response.data.errors) : null) ||
				err.message ||
				'Eroare necunoscută';
			showError('Eroare la salvare: ' + errorMessage);
		}
	};

	if (!open) return null;

	return (
		<div
			className="admin-event-modal-overlay va-cal-event-modal-overlay"
			onClick={(e) => {
				if (e.target === e.currentTarget) {
					onClose();
					resetForm();
				}
			}}
			role="presentation"
		>
			<div className="admin-event-modal" role="dialog" aria-modal="true" aria-labelledby="va-evt-modal-title">
				<div className="admin-event-modal-header">
					<h2 id="va-evt-modal-title" className="admin-event-modal-title">
						{editingEvent ? '✏️ Editează eveniment' : '➕ Eveniment nou'}
					</h2>
					<button
						type="button"
						className="admin-event-modal-close"
						onClick={() => {
							onClose();
							resetForm();
						}}
						title="Închide"
					>
						×
					</button>
				</div>
				<div ref={bodyRef} className="admin-event-modal-body">
					<form onSubmit={handleSubmit} className="admin-event-form">
						<section className="admin-form-section">
							<div className="admin-form-group">
								<label className="admin-form-label" htmlFor="va-evt-title">
									Titlu
								</label>
								<input
									id="va-evt-title"
									type="text"
									className="admin-form-input admin-event-input"
									value={formData.title}
									onChange={(e) => {
										setFormData({ ...formData, title: e.target.value });
										if (touched.title) validate();
									}}
									onBlur={() => {
										setTouched({ ...touched, title: true });
										validate();
									}}
									placeholder="Ex.: Workshop pentru începători"
									autoComplete="off"
									required
								/>
								{errors.title && touched.title && <div className="admin-event-error">{errors.title}</div>}
							</div>
							<div className="admin-form-group">
								<label className="admin-form-label" htmlFor="va-evt-desc">
									Descriere
								</label>
								<textarea
									id="va-evt-desc"
									className="admin-form-input admin-event-input"
									value={formData.description}
									onChange={(e) => {
										setFormData({ ...formData, description: e.target.value });
										if (touched.description) validate();
									}}
									onBlur={() => {
										setTouched({ ...touched, description: true });
										validate();
									}}
									placeholder="Agendă, ce vor învăța participanții…"
									required
									rows={4}
								/>
								{errors.description && touched.description && (
									<div className="admin-event-error">{errors.description}</div>
								)}
							</div>
						</section>

						<section className="admin-form-section">
							<fieldset className="admin-event-format-fieldset">
								<legend className="admin-event-format-legend">Unde are loc evenimentul?</legend>
								<div className="admin-event-format-options">
									<label className="admin-event-format-option">
										<input
											type="radio"
											name="va-evt-format"
											checked={formData.type === 'live_online'}
											onChange={() => setFormData((prev) => ({ ...prev, type: 'live_online' }))}
										/>
										<span>Online</span>
									</label>
									<label className="admin-event-format-option">
										<input
											type="radio"
											name="va-evt-format"
											checked={formData.type === 'physical'}
											onChange={() => setFormData((prev) => ({ ...prev, type: 'physical' }))}
										/>
										<span>Fizic</span>
									</label>
								</div>
							</fieldset>
						</section>

						<section className="admin-form-section">
							<p className="admin-event-form-hint admin-event-form-intro">
								Alege data, ora de început și durata evenimentului.
							</p>
							<div className="admin-event-form-grid-2">
								<div className="admin-form-group">
									<label className="admin-form-label" htmlFor="va-evt-date">
										Data
									</label>
									<input
										id="va-evt-date"
										type="date"
										className="admin-form-input admin-event-input"
										value={formData.event_date}
										onChange={(e) => {
											setFormData({ ...formData, event_date: e.target.value });
											if (touched.event_date) validate();
										}}
										onBlur={() => {
											setTouched({ ...touched, event_date: true });
											validate();
										}}
										required
									/>
									{errors.event_date && touched.event_date && (
										<div className="admin-event-error">{errors.event_date}</div>
									)}
								</div>
								<div className="admin-form-group">
									<label className="admin-form-label" htmlFor="va-evt-time">
										Ora început (24h, {DEFAULT_TIMEZONE})
									</label>
									<input
										id="va-evt-time"
										type="text"
										inputMode="numeric"
										placeholder="HH:mm"
										maxLength={5}
										className="admin-form-input admin-event-input"
										value={formData.start_time}
										onChange={(e) => {
											setFormData({ ...formData, start_time: normalizeTimeInput(e.target.value) });
											if (touched.start_time) validate();
										}}
										onBlur={() => {
											setTouched({ ...touched, start_time: true });
											validate();
										}}
										required
									/>
									{errors.start_time && touched.start_time && (
										<div className="admin-event-error">{errors.start_time}</div>
									)}
								</div>
								<div className="admin-form-group">
									<label className="admin-form-label" htmlFor="va-evt-duration">
										Durată (minute)
									</label>
									<input
										id="va-evt-duration"
										type="number"
										min={5}
										step={5}
										className="admin-form-input admin-event-input"
										value={formData.duration_minutes}
										onChange={(e) => {
											setFormData({ ...formData, duration_minutes: e.target.value });
											if (touched.duration_minutes) validate();
										}}
										onBlur={() => {
											setTouched({ ...touched, duration_minutes: true });
											validate();
										}}
										required
									/>
									<p className="admin-event-form-hint">Ex.: 30, 60, 90, 120</p>
									{errors.duration_minutes && touched.duration_minutes && (
										<div className="admin-event-error">{errors.duration_minutes}</div>
									)}
								</div>
							</div>
						</section>

						<section className="admin-form-section">
							{formData.type === 'physical' ? (
								<div className="admin-form-group">
									<label className="admin-form-label" htmlFor="va-evt-loc">
										Locație
									</label>
									<input
										id="va-evt-loc"
										type="text"
										className="admin-form-input admin-event-input"
										value={formData.location}
										onChange={(e) => {
											setFormData({ ...formData, location: e.target.value });
											if (touched.location) validate();
										}}
										onBlur={() => {
											setTouched({ ...touched, location: true });
											validate();
										}}
										placeholder="Adresă, sală, oraș…"
										autoComplete="street-address"
									/>
									{errors.location && touched.location && (
										<div className="admin-event-error">{errors.location}</div>
									)}
								</div>
							) : (
								<div className="admin-form-group">
									<label className="admin-form-label" htmlFor="va-evt-live">
										Link participare online <span className="admin-event-optional">(opțional)</span>
									</label>
									<input
										id="va-evt-live"
										type="url"
										className="admin-form-input admin-event-input"
										value={formData.live_link}
										onChange={(e) => {
											setFormData({ ...formData, live_link: e.target.value });
											if (touched.live_link) validate();
										}}
										onBlur={() => {
											setTouched({ ...touched, live_link: true });
											validate();
										}}
										placeholder="https://…"
									/>
									<p className="admin-event-form-hint">Lasă gol dacă trimiți linkul altfel.</p>
									{errors.live_link && touched.live_link && (
										<div className="admin-event-error">{errors.live_link}</div>
									)}
								</div>
							)}
						</section>

						<div className="admin-event-form-actions">
							<button
								type="button"
								className="admin-event-btn-secondary"
								onClick={() => {
									onClose();
									resetForm();
								}}
							>
								Anulează
							</button>
							<button type="submit" className="admin-event-btn-primary">
								{editingEvent ? 'Salvează modificările' : 'Creează evenimentul'}
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
};

export default AdminEventFormModal;
