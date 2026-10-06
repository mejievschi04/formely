import { notifyAdminEventsRefresh } from './AdminCalendarDrawerShared.js';
import { X } from '@phosphor-icons/react';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { adminService } from '../../services/api';

import { useAuth } from '../../contexts/AuthContextShared.js';
import AdminEventFormModal from './events/AdminEventFormModal';
import AdminEventDetailModal from './events/AdminEventDetailModal';
import { useScrollResetOnOpen } from '../../hooks/useScrollResetOnOpen';
import './AdminCalendarDrawer.css';

const WEEKDAYS = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];

function getDaysInMonth(date) {
	const year = date.getFullYear();
	const month = date.getMonth();
	const firstDay = new Date(year, month, 1);
	const lastDay = new Date(year, month + 1, 0);
	const daysInMonth = lastDay.getDate();
	let startingDayOfWeek = firstDay.getDay() - 1;
	if (startingDayOfWeek < 0) startingDayOfWeek = 6;

	const days = [];
	for (let i = 0; i < startingDayOfWeek; i++) {
		days.push(null);
	}
	for (let day = 1; day <= daysInMonth; day++) {
		days.push(new Date(year, month, day));
	}
	return days;
}

function getMonthLabel(date) {
	return date.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' });
}

function getEventsForDate(events, date) {
	if (!date) return [];
	const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	return events.filter((event) => {
		const eventDateMatch = event.start_date?.match(/(\d{4})-(\d{2})-(\d{2})/);
		if (!eventDateMatch) return false;
		const eventDateStr = `${eventDateMatch[1]}-${eventDateMatch[2]}-${eventDateMatch[3]}`;
		return eventDateStr === dateStr;
	});
}



const AdminCalendarDrawer = ({ open, onClose }) => {
	const { canMutateInAdminArea, user } = useAuth();
	const allowAdminCalendarEdit = canMutateInAdminArea;
	const panelRef = useRef(null);
	const [events, setEvents] = useState([]);
	const [, setLoading] = useState(false);
	const [currentDate, setCurrentDate] = useState(() => new Date());
	const [showModal, setShowModal] = useState(false);
	const [editingEvent, setEditingEvent] = useState(null);
	const [prefill, setPrefill] = useState(null);
	const [viewingEventId, setViewingEventId] = useState(null);

	useScrollResetOnOpen(open || showModal || viewingEventId != null);

	const loadEvents = useCallback(async () => {
		try {
			setLoading(true);
			const data = await adminService.getEvents({
				sort_by: 'start_date',
				sort_direction: 'asc',
			});
			setEvents(Array.isArray(data) ? data : data?.data || []);
		} catch (e) {
			console.error(e);
			setEvents([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (open) {
			loadEvents();
		}
	}, [open, loadEvents]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [open, onClose]);

	useEffect(() => {
		if (!open) return undefined;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	}, [open]);

	const navigateMonth = (dir) => {
		setCurrentDate((prev) => {
			const d = new Date(prev);
			d.setMonth(prev.getMonth() + dir);
			return d;
		});
	};

	const handleDayClick = (date) => {
		if (!date || !allowAdminCalendarEdit) return;
		const y = date.getFullYear();
		const mo = String(date.getMonth() + 1).padStart(2, '0');
		const da = String(date.getDate()).padStart(2, '0');
		setEditingEvent(null);
		setPrefill({ event_date: `${y}-${mo}-${da}`, start_time: '09:00' });
		setShowModal(true);
	};

	const handleEventChipClick = (e, event) => {
		e.stopPropagation();
		if (!event?.id) return;
		setViewingEventId(event.id);
	};

	const handleEditFromDetail = (event) => {
		if (!allowAdminCalendarEdit) return;
		setViewingEventId(null);
		setEditingEvent(event);
		setPrefill(null);
		setShowModal(true);
	};

	const handleSaved = () => {
		loadEvents();
		notifyAdminEventsRefresh();
	};

	const days = getDaysInMonth(currentDate);
	const weeks = Math.ceil(days.length / 7);

	if (!open) return null;

	const portal = (
		<>
			<div
				className="va-cal-drawer-backdrop"
				aria-hidden
				onClick={onClose}
			/>
			<aside
				ref={panelRef}
				className="va-cal-drawer-panel"
				aria-label="Calendar evenimente"
			>
				<div className="va-cal-drawer-header">
					<div>
						<h2 className="va-cal-drawer-title">Calendar</h2>
						<p className="va-cal-drawer-sub">Evenimente planificate</p>
					</div>
					<button type="button" className="va-cal-drawer-close va-close-btn" onClick={onClose} aria-label="Închide">
						<X size={18} weight="bold" aria-hidden="true" />
					</button>
				</div>

				<div className="va-cal-drawer-toolbar">
					{allowAdminCalendarEdit && (
						<button
							type="button"
							className="lms-btn-primary va-cal-drawer-btn-primary"
							onClick={() => {
								setEditingEvent(null);
								setPrefill(null);
								setShowModal(true);
							}}
						>
							+ Eveniment nou
						</button>
					)}
					<Link
						to="/admin/events"
						className="va-cal-drawer-link-all"
						onClick={onClose}
					>
						Listă evenimente →
					</Link>
				</div>

				<div className="va-cal-drawer-calendar-wrap">
					<div className="va-cal-drawer-month-nav">
						<button type="button" className="va-cal-drawer-nav-btn" onClick={() => navigateMonth(-1)} aria-label="Luna anterioară">
							‹
						</button>
						<span className="va-cal-drawer-month-label">{getMonthLabel(currentDate)}</span>
						<button type="button" className="va-cal-drawer-nav-btn" onClick={() => navigateMonth(1)} aria-label="Luna următoare">
							›
						</button>
						<button
							type="button"
							className="va-cal-drawer-today"
							onClick={() => setCurrentDate(new Date())}
						>
							Astăzi
						</button>
					</div>

					<div className="va-cal-drawer-weekdays">
						{WEEKDAYS.map((d) => (
							<div key={d} className="va-cal-drawer-wd">
								{d}
							</div>
						))}
					</div>
					<div className="va-cal-drawer-grid" style={{ gridTemplateRows: `repeat(${weeks}, minmax(92px, 1.15fr))` }}>
						{days.map((date, index) => {
							if (!date) {
								return <div key={`e-${index}`} className="va-cal-drawer-cell va-cal-drawer-cell--empty" />;
							}
							const dayEvents = getEventsForDate(events, date);
							const isToday = date.toDateString() === new Date().toDateString();
							const inMonth = date.getMonth() === currentDate.getMonth();
							return (
								<div
									key={date.toISOString()}
									role={allowAdminCalendarEdit ? 'button' : undefined}
									tabIndex={allowAdminCalendarEdit ? 0 : undefined}
									className={[
										'va-cal-drawer-cell',
										isToday ? 'va-cal-drawer-cell--today' : '',
										!inMonth ? 'va-cal-drawer-cell--muted' : '',
										allowAdminCalendarEdit ? 'va-cal-drawer-cell--clickable' : '',
									]
										.filter(Boolean)
										.join(' ')}
									onClick={allowAdminCalendarEdit ? () => handleDayClick(date) : undefined}
									onKeyDown={
										allowAdminCalendarEdit
											? (ke) => {
													if (ke.key === 'Enter' || ke.key === ' ') {
														ke.preventDefault();
														handleDayClick(date);
													}
												}
											: undefined
									}
								>
									<span className="va-cal-drawer-daynum">{date.getDate()}</span>
									<div className="va-cal-drawer-dots">
										{dayEvents.slice(0, 3).map((ev) => (
											<button
												key={ev.id}
												type="button"
												className="va-cal-drawer-chip"
												title={ev.title}
												onClick={(evClick) => handleEventChipClick(evClick, ev)}
											>
												{ev.title}
											</button>
										))}
										{dayEvents.length > 3 && (
											<span className="va-cal-drawer-more">+{dayEvents.length - 3}</span>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>

				{user?.actualRole === 'analyst' && (
					<p className="va-cal-drawer-hint">Cont analist: poți vedea calendarul; crearea evenimentelor este dezactivată.</p>
				)}
			</aside>

			<AdminEventDetailModal
					open={viewingEventId != null}
					eventId={viewingEventId}
					onClose={() => setViewingEventId(null)}
					onEdit={allowAdminCalendarEdit ? handleEditFromDetail : undefined}
					readOnly={!allowAdminCalendarEdit}
				/>

			{showModal && allowAdminCalendarEdit && (
				<AdminEventFormModal
					open={showModal}
					onClose={() => {
						setShowModal(false);
						setEditingEvent(null);
						setPrefill(null);
					}}
					editingEvent={editingEvent}
					prefill={prefill}
					onSaved={handleSaved}
				/>
			)}
		</>
	);

	return createPortal(portal, document.body);
};

export default AdminCalendarDrawer;
