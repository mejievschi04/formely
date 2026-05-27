import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';
import { useScrollResetOnOpen } from '../../../hooks/useScrollResetOnOpen';
import { pickRegisteredUsers, formatPivotDate } from './adminEventParticipantsUtils';
import './AdminEventParticipantsModal.css';

/**
 * Modal unic: lista înscrișilor + bifă prezență (admin).
 */
const AdminEventParticipantsModal = ({
	open,
	eventId,
	eventTitle,
	onClose,
	onUpdated,
	readOnly = false,
	inline = false,
}) => {
	const { error: showError } = useToast();
	const [event, setEvent] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [savingUserId, setSavingUserId] = useState(null);
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
			setError('Nu s-au putut încărca participanții');
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
		if (!open) {
			setEvent(null);
			setError(null);
			setSavingUserId(null);
		}
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [open, onClose]);

	const handleAttendanceToggle = async (user, checked) => {
		if (readOnly || savingUserId != null) return;

		const prevAttended = Boolean(user.pivot?.attended);
		if (prevAttended === checked) return;

		setSavingUserId(user.id);
		setEvent((prev) => {
			if (!prev) return prev;
			const users = pickRegisteredUsers(prev).map((u) =>
				u.id === user.id
					? {
							...u,
							pivot: {
								...u.pivot,
								attended: checked,
								attended_at: checked ? new Date().toISOString() : null,
							},
						}
					: u,
			);
			return {
				...prev,
				registeredUsers: users,
				registered_users: users,
				attendance_count: Math.max(
					0,
					(prev.attendance_count ?? 0) + (checked ? 1 : -1),
				),
			};
		});

		try {
			const data = await adminService.setEventParticipantAttendance(eventId, user.id, checked);
			const users = data.registered_users ?? pickRegisteredUsers(data);
			setEvent((prev) => ({
				...(prev || {}),
				registrations_count: data.registrations_count ?? prev?.registrations_count,
				attendance_count: data.attendance_count ?? prev?.attendance_count,
				registeredUsers: users,
				registered_users: users,
			}));
			onUpdated?.({
				registrations_count: data.registrations_count,
				attendance_count: data.attendance_count,
				registered_users: users,
			});
		} catch (e) {
			console.error(e);
			showError(e.response?.data?.message || 'Nu s-a putut actualiza prezența');
			await loadEvent();
		} finally {
			setSavingUserId(null);
		}
	};

	if (!open) return null;

	const registered = pickRegisteredUsers(event);
	const title = event?.title || eventTitle || 'Eveniment';
	const attendanceCount =
		event?.attendance_count ??
		registered.filter((u) => Boolean(u.pivot?.attended)).length;

	const portal = (
		<div
			className="admin-event-modal-overlay aev-participants-overlay"
			role="presentation"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className="admin-event-modal aev-participants-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="aev-participants-title"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="admin-event-modal-header">
					<div className="aev-participants-header-text">
						<h2 id="aev-participants-title" className="admin-event-modal-title">
							Înscriși
							<span className="aev-participants-count">({registered.length})</span>
						</h2>
						<p className="aev-participants-subtitle">{title}</p>
					</div>
					<button type="button" className="admin-event-modal-close" onClick={onClose} title="Închide">
						×
					</button>
				</div>

				<div ref={bodyRef} className="admin-event-modal-body aev-participants-body">
					{loading && (
						<div className="aev-participants-loading">
							<div className="lms-spinner" aria-hidden />
						</div>
					)}
					{error && !loading && <p className="aev-participants-error">{error}</p>}
					{!loading && !error && (
						<>
							<p className="aev-participants-intro">
								Bifează prezența pentru fiecare participant. Prezență confirmată:{' '}
								<strong>{attendanceCount}</strong>
								{readOnly ? ' (doar vizualizare)' : ''}.
							</p>
							{registered.length === 0 ? (
								<p className="aev-participants-empty">Nicio înscriere încă.</p>
							) : (
								<ul className="aev-participants-list">
									{registered.map((u) => {
										const attended = Boolean(u.pivot?.attended);
										const busy = savingUserId === u.id;
										return (
											<li key={u.id} className="aev-participants-row">
												<div className="aev-participants-user">
													<span className="aev-participants-name">{u.name}</span>
													<span className="aev-participants-email">{u.email}</span>
													{formatPivotDate(u.pivot?.registered_at) ? (
														<span className="aev-participants-date">
															Înscris: {formatPivotDate(u.pivot.registered_at)}
														</span>
													) : null}
												</div>
												<label
													className={`aev-participants-check${readOnly ? ' is-readonly' : ''}`}
												>
													<input
														type="checkbox"
														checked={attended}
														disabled={readOnly || busy || savingUserId != null}
														onChange={(e) => handleAttendanceToggle(u, e.target.checked)}
														aria-label={`Prezență: ${u.name}`}
													/>
													<span className="aev-participants-check-label">Prezență</span>
												</label>
											</li>
										);
									})}
								</ul>
							)}
						</>
					)}
				</div>

				<div className="aev-participants-footer">
					<button type="button" className="admin-event-btn-secondary" onClick={onClose}>
						Închide
					</button>
				</div>
			</div>
		</div>
	);

	if (inline) return portal;
	return createPortal(portal, document.body);
};

export default AdminEventParticipantsModal;
