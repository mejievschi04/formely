import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { adminService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { logger } from '../../utils/logger';
import AdminEventListCard from '../../components/admin/events/AdminEventListCard';
import AdminEventFormModal from '../../components/admin/events/AdminEventFormModal';
import AdminEventDetailModal from '../../components/admin/events/AdminEventDetailModal';
import { useAuth } from '../../contexts/AuthContext';
import { scrollElementToTop } from '../../utils/scrollToTop';

/** Parse dată/oră din API (YYYY-MM-DD HH:mm sau T) ca timp local, fără UTC shift. */
function parseWallClockToMs(dateString) {
	if (!dateString) return null;
	const s = String(dateString);
	const m = s.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
	if (!m) {
		const t = Date.parse(s);
		return Number.isFinite(t) ? t : null;
	}
	const [, y, mo, d, h, mi] = m;
	return new Date(
		parseInt(y, 10),
		parseInt(mo, 10) - 1,
		parseInt(d, 10),
		parseInt(h, 10),
		parseInt(mi, 10),
	).getTime();
}

const AdminEventsPage = () => {
	const { canMutateInAdminArea } = useAuth();
	const { error: showError } = useToast();
	const [events, setEvents] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [showModal, setShowModal] = useState(false);
	const [editingEvent, setEditingEvent] = useState(null);
	const [viewingEventId, setViewingEventId] = useState(null);

	const [searchQuery, setSearchQuery] = useState('');
	const [filters, setFilters] = useState({
		type: 'all',
	});

	/** Reîmparte viitor/trecut fără refresh manual (actualizare la ~1 min). */
	const [nowTick, setNowTick] = useState(() => Date.now());
	useEffect(() => {
		const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
		return () => window.clearInterval(id);
	}, []);

	const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
	/** Meniu: o singură listă vizibilă — viitoare sau trecute */
	const [timeScope, setTimeScope] = useState('upcoming');
	const eventsPanelRef = useRef(null);

	useLayoutEffect(() => {
		scrollElementToTop(eventsPanelRef.current);
	}, [timeScope]);

	const fetchEvents = useCallback(async () => {
		try {
			setLoading(true);
			const params = {
				search: searchQuery,
				type: filters.type !== 'all' ? filters.type : null,
				sort_by: 'start_date',
				sort_direction: 'asc',
				per_page: 500,
			};
			const data = await adminService.getEvents(params);
			setEvents(Array.isArray(data) ? data : (data?.data || []));
		} catch (err) {
			console.error('Error fetching events:', err);
			setError('Nu s-au putut încărca evenimentele');
		} finally {
			setLoading(false);
		}
	}, [searchQuery, filters.type]);

	useEffect(() => {
		const timeoutId = setTimeout(() => {
			fetchEvents();
		}, 300);
		return () => clearTimeout(timeoutId);
	}, [fetchEvents]);

	useEffect(() => {
		const onRefresh = () => {
			fetchEvents();
		};
		window.addEventListener('formely-admin-events-refresh', onRefresh);
		return () => window.removeEventListener('formely-admin-events-refresh', onRefresh);
	}, [fetchEvents]);

	const { upcomingEvents, pastEvents } = useMemo(() => {
		const now = nowTick;
		const upcoming = [];
		const past = [];
		for (const ev of events) {
			const endMs = parseWallClockToMs(ev.end_date);
			if (endMs == null) {
				upcoming.push(ev);
				continue;
			}
			if (endMs >= now) {
				upcoming.push(ev);
			} else {
				past.push(ev);
			}
		}
		upcoming.sort((a, b) => {
			const ta = parseWallClockToMs(a.start_date) ?? 0;
			const tb = parseWallClockToMs(b.start_date) ?? 0;
			return ta - tb;
		});
		past.sort((a, b) => {
			const ta = parseWallClockToMs(a.end_date) ?? 0;
			const tb = parseWallClockToMs(b.end_date) ?? 0;
			return tb - ta;
		});
		return { upcomingEvents: upcoming, pastEvents: past };
	}, [events, nowTick]);

	const handleView = (event) => {
		setViewingEventId(event.id);
	};

	const handleEdit = (event) => {
		setViewingEventId(null);
		setEditingEvent(event);
		setShowModal(true);
	};

	const handleDelete = async (id) => {
		setShowDeleteConfirm(id);
	};

	const confirmDelete = async () => {
		if (!showDeleteConfirm) return;

		try {
			await adminService.deleteEvent(showDeleteConfirm);
			setShowDeleteConfirm(null);
			fetchEvents();
		} catch (err) {
			logger.error('Error deleting event:', err);
			showError('Eroare la ștergerea evenimentului');
		}
	};

	const formatDate = (dateString) => {
		if (!dateString) return 'N/A';
		const parts = dateString.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):?(\d{2})?/);
		if (!parts) return dateString;

		const [, year, month, day, hour, minute] = parts;
		return `${day}.${month}.${year}, ${hour}:${minute}`;
	};

	const calculateDuration = (startDateString, endDateString) => {
		if (!startDateString || !endDateString) return '';

		try {
			const startMatch = startDateString.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):?(\d{2})?/);
			const endMatch = endDateString.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):?(\d{2})?/);

			if (!startMatch || !endMatch) return '';

			const start = new Date(
				parseInt(startMatch[1], 10),
				parseInt(startMatch[2], 10) - 1,
				parseInt(startMatch[3], 10),
				parseInt(startMatch[4], 10),
				parseInt(startMatch[5], 10),
			);
			const end = new Date(
				parseInt(endMatch[1], 10),
				parseInt(endMatch[2], 10) - 1,
				parseInt(endMatch[3], 10),
				parseInt(endMatch[4], 10),
				parseInt(endMatch[5], 10),
			);

			const durationMinutes = Math.round((end - start) / 60000);
			const hours = Math.floor(durationMinutes / 60);
			const minutes = durationMinutes % 60;
			const hourLabel = hours === 1 ? 'ora' : 'ore';

			if (hours > 0 && minutes > 0) {
				return `${hours} ${hourLabel} ${minutes} min`;
			}
			if (hours > 0) {
				return `${hours} ${hourLabel}`;
			}
			return `${minutes} min`;
		} catch {
			return '';
		}
	};

	const renderEventGrid = (list) => (
		<div className="aev-list-grid">
			{list.map((event) => (
				<AdminEventListCard
					key={event.id}
					event={event}
					formatDate={formatDate}
					calculateDuration={calculateDuration}
					onView={handleView}
					onEdit={handleEdit}
					onDelete={handleDelete}
					readOnly={!canMutateInAdminArea}
				/>
			))}
		</div>
	);

	if (loading) {
		return (
			<div className="admin-container">
				<div className="lms-dashboard-loading">
					<div className="lms-spinner"></div>
				</div>
			</div>
		);
	}

	const hasAny = upcomingEvents.length > 0 || pastEvents.length > 0;
	const filtersActive = searchQuery || filters.type !== 'all';
	const activeList = timeScope === 'upcoming' ? upcomingEvents : pastEvents;

	return (
		<div className="admin-container admin-events-page">
			<div className="admin-page-header">
				<div className="admin-page-header-content">
					<h1 className="admin-page-title">Gestionare Evenimente</h1>
					<p className="admin-page-subtitle">
						Alege din meniu „Viitoare” sau „Trecute”. Evenimentele noi se publică automat; după data de
						sfârșit trec singure la trecute. Calendar rapid: iconița din bară.
					</p>
				</div>
				{canMutateInAdminArea && (
					<button
						type="button"
						className="lms-btn-primary"
						onClick={() => {
							setEditingEvent(null);
							setShowModal(true);
						}}
					>
						+ Adaugă Eveniment Nou
					</button>
				)}
			</div>

			<div className="admin-courses-toolbar">
				<div className="admin-courses-search">
					<input
						type="text"
						className="admin-search-input"
						placeholder="Caută evenimente..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
					{searchQuery && (
						<button
							className="admin-search-clear-btn"
							onClick={() => setSearchQuery('')}
							aria-label="Golește căutarea"
							type="button"
						>
							×
						</button>
					)}
				</div>
				<div className="admin-courses-actions">
					<select
						className="admin-filter-select"
						value={filters.type}
						onChange={(e) => setFilters({ ...filters, type: e.target.value })}
					>
						<option value="all">Toate</option>
						<option value="live_online">Online</option>
						<option value="physical">Fizic</option>
					</select>
				</div>
			</div>

			{error && <div className="lms-error-message">{error}</div>}

			{hasAny && (
				<nav
					className="admin-events-view-toggle admin-events-time-menu"
					role="tablist"
					aria-label="Afișare evenimente după timp"
				>
					<button
						type="button"
						role="tab"
						id="admin-events-tab-upcoming"
						aria-selected={timeScope === 'upcoming'}
						aria-controls="admin-events-panel"
						className={`lms-btn-secondary lms-btn-sm${timeScope === 'upcoming' ? ' active' : ''}`}
						onClick={() => setTimeScope('upcoming')}
					>
						Viitoare și în desfășurare ({upcomingEvents.length})
					</button>
					<button
						type="button"
						role="tab"
						id="admin-events-tab-past"
						aria-selected={timeScope === 'past'}
						aria-controls="admin-events-panel"
						className={`lms-btn-secondary lms-btn-sm${timeScope === 'past' ? ' active' : ''}`}
						onClick={() => setTimeScope('past')}
					>
						Trecute ({pastEvents.length})
					</button>
				</nav>
			)}

			<div
				ref={eventsPanelRef}
				id="admin-events-panel"
				role="tabpanel"
				aria-labelledby={timeScope === 'upcoming' ? 'admin-events-tab-upcoming' : 'admin-events-tab-past'}
				style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
			>
				{!hasAny ? (
					<div className="lms-empty-state">
						<div className="lms-empty-icon">📅</div>
						<h3 className="lms-empty-title">Nu există evenimente</h3>
						<p className="lms-empty-description">
							{filtersActive
								? 'Încearcă să modifici filtrele sau căutarea'
								: 'Creează primul eveniment pentru a începe'}
						</p>
						{!filtersActive && canMutateInAdminArea && (
							<button
								type="button"
								className="lms-btn-primary"
								onClick={() => {
									setEditingEvent(null);
									setShowModal(true);
								}}
							>
								<span className="admin-btn-icon">+</span>
								Adaugă Eveniment Nou
							</button>
						)}
					</div>
				) : activeList.length === 0 ? (
					<div className="lms-empty-state admin-events-tab-empty">
						<div className="lms-empty-icon">📅</div>
						<h3 className="lms-empty-title">
							{timeScope === 'upcoming' ? 'Niciun eveniment viitor' : 'Niciun eveniment trecut'}
						</h3>
						<p className="lms-empty-description">
							{timeScope === 'upcoming'
								? pastEvents.length > 0
									? 'Toate evenimentele sunt deja încheiate. Poți vedea istoricul la „Trecute”.'
									: 'Adaugă un eveniment nou pentru a-l vedea aici.'
								: upcomingEvents.length > 0
									? 'Evenimentele încheiate apar aici. Pentru cele viitoare, deschide „Viitoare și în desfășurare”.'
									: 'Nu există evenimente încheiate încă.'}
						</p>
						{timeScope === 'upcoming' && pastEvents.length > 0 && (
							<button
								type="button"
								className="lms-btn-secondary"
								onClick={() => setTimeScope('past')}
							>
								Mergi la evenimente trecute
							</button>
						)}
						{timeScope === 'past' && upcomingEvents.length > 0 && (
							<button
								type="button"
								className="lms-btn-secondary"
								onClick={() => setTimeScope('upcoming')}
							>
								Mergi la evenimente viitoare
							</button>
						)}
					</div>
				) : (
					renderEventGrid(activeList)
				)}
			</div>

			<AdminEventDetailModal
				open={viewingEventId != null}
				eventId={viewingEventId}
				onClose={() => setViewingEventId(null)}
				onEdit={canMutateInAdminArea ? handleEdit : undefined}
				readOnly={!canMutateInAdminArea}
			/>

			{showModal && canMutateInAdminArea && (
				<AdminEventFormModal
					open={showModal}
					onClose={() => {
						setShowModal(false);
						setEditingEvent(null);
					}}
					editingEvent={editingEvent}
					prefill={null}
					onSaved={() => {
						fetchEvents();
					}}
				/>
			)}

			{showDeleteConfirm && (
				<div
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						background: 'rgba(0, 0, 0, 0.3)',
						backdropFilter: 'blur(10px)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						zIndex: 10001,
						padding: '1rem',
					}}
					onClick={() => setShowDeleteConfirm(null)}
					role="presentation"
				>
					<div
						style={{
							background: 'var(--bg-elevated)',
							border: '1px solid var(--border-primary)',
							borderRadius: 'var(--radius-xl)',
							boxShadow: 'var(--shadow-lg)',
							padding: 'var(--space-6)',
							maxWidth: '400px',
							width: '100%',
						}}
						onClick={(e) => e.stopPropagation()}
						role="presentation"
					>
						<h3 style={{ margin: '0 0 var(--space-4) 0', color: 'var(--text-primary)' }}>
							Confirmă ștergerea
						</h3>
						<p style={{ margin: '0 0 var(--space-4) 0', color: 'var(--text-secondary)' }}>
							Ești sigur că vrei să ștergi acest eveniment? Această acțiune nu poate fi anulată.
						</p>
						<div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
							<button
								type="button"
								className="lms-btn-secondary"
								onClick={() => setShowDeleteConfirm(null)}
							>
								Anulează
							</button>
							<button
								type="button"
								className="lms-btn-secondary va-btn-danger"
								onClick={() => {
									if (showDeleteConfirm) {
										confirmDelete();
									}
								}}
							>
								Șterge
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default AdminEventsPage;
