import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { UserList } from '@phosphor-icons/react';
import { adminService } from '../../../services/api';
import EventDescriptionExpandable from '../../common/EventDescriptionExpandable';
import { useScrollResetOnOpen } from '../../../hooks/useScrollResetOnOpen';
import AdminEventParticipantsModal from './AdminEventParticipantsModal';
import { pickRegisteredUsers } from './adminEventParticipantsUtils';
import './AdminEventDetailModal.css';

const TYPE_LABELS = {
	live_online: 'Online',
	physical: 'Fizic',
	webinar: 'Webinar',
	workshop: 'Workshop',
};

function parseWallClock(dateString) {
	if (!dateString) return '—';
	const m = String(dateString).match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
	if (!m) return dateString;
	const [, y, mo, d, h, mi] = m;
	return `${d}.${mo}.${y}, ${h}:${mi}`;
}

function durationLabel(start, end) {
	if (!start || !end) return '';
	const sm = String(start).match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
	const em = String(end).match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
	if (!sm || !em) return '';
	const s = new Date(+sm[1], +sm[2] - 1, +sm[3], +sm[4], +sm[5]);
	const e = new Date(+em[1], +em[2] - 1, +em[3], +em[4], +em[5]);
	const mins = Math.round((e - s) / 60000);
	if (!Number.isFinite(mins) || mins <= 0) return '';
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	if (h > 0 && m > 0) return `${h} h ${m} min`;
	if (h > 0) return `${h} h`;
	return `${m} min`;
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {number | string | null} props.eventId
 * @param {() => void} props.onClose
 * @param {(event: object) => void} [props.onEdit]
 * @param {boolean} [props.readOnly]
 */
const AdminEventDetailModal = ({ open, eventId, onClose, onEdit, readOnly = false }) => {
	const [event, setEvent] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [showParticipants, setShowParticipants] = useState(false);
	const bodyRef = useRef(null);
	useScrollResetOnOpen(open, bodyRef);

	const loadEvent = useCallback(async () => {
		if (!eventId) return;
		try {
			setLoading(true);
			setError(null);
			const data = await adminService.getEvent(eventId);
			setEvent(data);
		} catch (e) {
			console.error(e);
			setError('Nu s-au putut încărca detaliile evenimentului');
			setEvent(null);
		} finally {
			setLoading(false);
		}
	}, [eventId]);

	useEffect(() => {
		if (!open) return;
		loadEvent();
	}, [open, loadEvent]);

	useEffect(() => {
		if (!open) setShowParticipants(false);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e) => {
			if (e.key !== 'Escape') return;
			if (showParticipants) {
				setShowParticipants(false);
				return;
			}
			onClose();
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [open, onClose, showParticipants]);

	useEffect(() => {
		if (!open) return undefined;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	}, [open]);

	const handleParticipantsUpdated = useCallback((payload) => {
		if (!payload) return;
		setEvent((prev) =>
			prev
				? {
						...prev,
						registrations_count: payload.registrations_count ?? prev.registrations_count,
						attendance_count: payload.attendance_count ?? prev.attendance_count,
						registeredUsers: payload.registered_users ?? prev.registeredUsers,
						registered_users: payload.registered_users ?? prev.registered_users,
					}
				: prev,
		);
		window.dispatchEvent(new CustomEvent('formely-admin-events-refresh'));
	}, []);

	if (!open) return null;

	const description = event?.description?.trim() || '';
	const registered = pickRegisteredUsers(event);
	const regCount = event?.registrations_count ?? registered.length;
	const attCount =
		event?.attendance_count ?? registered.filter((u) => Boolean(u.pivot?.attended)).length;
	const place =
		event?.location?.trim() || event?.live_link?.trim() || (event?.type === 'live_online' ? 'Online' : '—');
	const regLabel =
		event?.max_capacity != null ? `${regCount} / ${event.max_capacity}` : String(regCount);

	const portal = (
		<>
			<div
				className="admin-event-modal-overlay va-cal-event-modal-overlay aev-detail-overlay"
				role="presentation"
				onClick={(e) => {
					if (e.target === e.currentTarget) onClose();
				}}
			>
				<div
					className="admin-event-modal aev-detail-modal"
					role="dialog"
					aria-modal="true"
					aria-labelledby="aev-detail-title"
					onClick={(e) => e.stopPropagation()}
				>
					<div className="admin-event-modal-header">
						<h2 id="aev-detail-title" className="admin-event-modal-title">
							{loading ? 'Se încarcă…' : event?.title || 'Eveniment'}
						</h2>
						<button type="button" className="admin-event-modal-close" onClick={onClose} title="Închide">
							×
						</button>
					</div>

					<div ref={bodyRef} className="admin-event-modal-body aev-detail-body">
						{loading && (
							<div className="aev-detail-loading">
								<div className="lms-spinner" aria-hidden />
							</div>
						)}
						{error && !loading && <p className="aev-detail-error">{error}</p>}
						{event && !loading && (
							<>
								<dl className="aev-detail-meta">
									<div>
										<dt>Data</dt>
										<dd>
											{parseWallClock(event.start_date)}
											{event.end_date ? (
												<span className="aev-detail-meta-muted">
													{' '}
													· {durationLabel(event.start_date, event.end_date)}
												</span>
											) : null}
										</dd>
									</div>
									<div>
										<dt>Tip</dt>
										<dd>{TYPE_LABELS[event.type] || event.type}</dd>
									</div>
									<div>
										<dt>Loc</dt>
										<dd className="aev-detail-meta-break">{place}</dd>
									</div>
									{event.instructor?.name ? (
										<div>
											<dt>Instructor</dt>
											<dd>{event.instructor.name}</dd>
										</div>
									) : null}
								</dl>

								<div className="aev-detail-participants">
									<div className="aev-detail-participants-stats">
										<div className="aev-detail-participants-stat">
											<span className="aev-detail-participants-stat-label">Înscrieri</span>
											<span className="aev-detail-participants-stat-value">{regLabel}</span>
										</div>
										<div className="aev-detail-participants-stat aev-detail-participants-stat--att">
											<span className="aev-detail-participants-stat-label">Prezență</span>
											<span className="aev-detail-participants-stat-value">{attCount}</span>
										</div>
									</div>
									<button
										type="button"
										className="aev-detail-participants-btn"
										onClick={() => setShowParticipants(true)}
									>
										<UserList size={18} weight="duotone" aria-hidden />
										Vezi înscriși și prezență
									</button>
									{!readOnly ? (
										<p className="aev-detail-participants-hint">
											În listă bifezi prezența pentru fiecare participant.
										</p>
									) : null}
								</div>

								{description ? (
									<section className="aev-detail-desc" aria-labelledby="aev-detail-desc-heading">
										<h3 id="aev-detail-desc-heading" className="aev-detail-section-title">
											Descriere
										</h3>
										<EventDescriptionExpandable
											text={description}
											textClassName="aev-detail-desc-text"
											clampLines={5}
										/>
									</section>
								) : null}
							</>
						)}
					</div>

					<div className="aev-detail-footer">
						<button type="button" className="admin-event-btn-secondary" onClick={onClose}>
							Închide
						</button>
						{!readOnly && event && onEdit ? (
							<button
								type="button"
								className="admin-event-btn-primary"
								onClick={() => onEdit(event)}
							>
								Editează
							</button>
						) : null}
					</div>
				</div>
			</div>

			<AdminEventParticipantsModal
				inline
				open={showParticipants}
				eventId={eventId}
				eventTitle={event?.title}
				readOnly={readOnly}
				onClose={() => setShowParticipants(false)}
				onUpdated={handleParticipantsUpdated}
			/>
		</>
	);

	return createPortal(portal, document.body);
};

export default AdminEventDetailModal;
