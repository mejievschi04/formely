import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { eventsService } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { logger } from '../utils/logger';
import EventDescriptionExpandable from '../components/common/EventDescriptionExpandable';

const STATUS_BADGES = {
	published: { label: 'Publicat', color: '#10b981' },
	upcoming: { label: 'Viitor', color: '#f59e0b' },
	live: { label: 'Live', color: '#ef4444' },
	completed: { label: 'Finalizat', color: '#64748b' },
	cancelled: { label: 'Anulat', color: '#94a3b8' },
};

const parseEventDate = (dateString) => {
	if (!dateString) return null;
	const parts = dateString.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
	if (!parts) return null;
	return new Date(
		Number(parts[1]),
		Number(parts[2]) - 1,
		Number(parts[3]),
		Number(parts[4]),
		Number(parts[5]),
	);
};

const getTimelineGroup = (event) => {
	if (event?.is_completed || event?.status === 'completed') {
		return 'completed';
	}
	const endDate = parseEventDate(event?.end_date);
	return endDate && endDate.getTime() < Date.now() ? 'completed' : 'upcoming';
};

const EventsPage = () => {
	const navigate = useNavigate();
	const { success: showSuccess, error: showError } = useToast();
	const [events, setEvents] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [filters, setFilters] = useState({
		type: 'all',
	});
	useEffect(() => {
		fetchEvents();
	}, [filters]);

	const fetchEvents = async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await eventsService.getAll({ ...filters, date_filter: 'all' });
			// Handle pagination if present
			const eventsList = Array.isArray(data) ? data : (data?.data || []);
			setEvents(
				[...eventsList].sort((a, b) => {
					const aGroup = getTimelineGroup(a);
					const bGroup = getTimelineGroup(b);
					if (aGroup !== bGroup) {
						return aGroup === 'upcoming' ? -1 : 1;
					}
					return (parseEventDate(a.start_date)?.getTime() || 0) - (parseEventDate(b.start_date)?.getTime() || 0);
				}),
			);
		} catch (err) {
			console.error('Error fetching events:', err);
			setError('Nu s-au putut încărca evenimentele');
		} finally {
			setLoading(false);
		}
	};

	const groupedEvents = useMemo(() => {
		return events.reduce(
			(acc, event) => {
				acc[getTimelineGroup(event)].push(event);
				return acc;
			},
			{ upcoming: [], completed: [] },
		);
	}, [events]);

	const formatDate = (dateString) => {
		const date = parseEventDate(dateString);
		if (!date) return dateString || 'N/A';
		const pad = (value) => String(value).padStart(2, '0');
		return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
	};

	const formatTime = (dateString) => {
		const date = parseEventDate(dateString);
		if (!date) return '';
		const pad = (value) => String(value).padStart(2, '0');
		return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
	};

	const formatDuration = (startDateString, endDateString) => {
		const start = parseEventDate(startDateString);
		const end = parseEventDate(endDateString);
		if (!start || !end) return null;
		const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
		const hours = Math.floor(minutes / 60);
		const remainingMinutes = minutes % 60;
		const hourLabel = hours === 1 ? 'ora' : 'ore';
		if (hours > 0 && remainingMinutes > 0) return `${hours} ${hourLabel} ${remainingMinutes} min`;
		if (hours > 0) return `${hours} ${hourLabel}`;
		return `${remainingMinutes} min`;
	};


	const getEventTypeLabel = (type) => {
		const labels = {
			live_online: 'Online',
			physical: 'Fizic',
		};
		return labels[type] || type;
	};

	const getStatusBadge = (event) => {
		return STATUS_BADGES[event.status] || STATUS_BADGES[getTimelineGroup(event) === 'completed' ? 'completed' : 'upcoming'];
	};

	const handleRegister = async (eventId, e) => {
		e.stopPropagation();
		try {
			await eventsService.register(eventId);
			await fetchEvents();
			showSuccess('Te-ai înscris cu succes la eveniment!');
		} catch (err) {
			logger.error('Error registering:', err);
			showError(err.response?.data?.message || 'Eroare la înscriere');
		}
	};

	const renderEventSection = (title, subtitle, sectionEvents) => {
		if (!sectionEvents.length) return null;

		return (
			<section key={title} style={{ marginTop: '2rem' }}>
				<div style={{ marginBottom: '1rem' }}>
					<h2 style={{ marginBottom: '0.35rem' }}>{title}</h2>
					<p style={{ color: 'var(--va-muted)', margin: 0 }}>{subtitle}</p>
				</div>
				<div className="events-grid">
					{sectionEvents.map((event) => {
						const statusBadge = getStatusBadge(event);
						const isFull = event.max_capacity && event.registrations_count >= event.max_capacity;
						const isCompleted = getTimelineGroup(event) === 'completed';
						const duration = formatDuration(event.start_date, event.end_date);

						return (
							<div
								key={event.id}
								className="va-card-enhanced stagger-item"
								style={{ cursor: 'pointer' }}
								onClick={() => navigate(`/events/${event.id}`)}
							>
								{event.thumbnail && (
									<div
										className="events-card-thumbnail"
										style={{
											width: '100%',
											height: '200px',
											backgroundImage: `url(${event.thumbnail})`,
											backgroundSize: 'cover',
											backgroundPosition: 'center',
											borderRadius: '8px 8px 0 0',
										}}
									/>
								)}
								<div className="va-card-body">
									<div className="events-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem', gap: '0.75rem' }}>
										<h3 className="va-card-title" style={{ marginBottom: 0, flex: 1 }}>
											📅 {event.title}
										</h3>
										{statusBadge && (
											<span className="events-card-status-badge" style={{
												padding: '0.25rem 0.75rem',
												borderRadius: '12px',
												fontSize: '0.75rem',
												fontWeight: 'bold',
												background: statusBadge.color,
												color: '#fff',
											}}>
												{statusBadge.label}
											</span>
										)}
									</div>
									{event.short_description && (
										<p style={{ color: 'var(--va-muted)', marginBottom: '0.75rem', lineHeight: '1.6', fontSize: '0.9rem' }}>
											{event.short_description}
										</p>
									)}
									{event.description ? (
										<EventDescriptionExpandable
											text={event.description}
											className="events-card-desc"
										/>
									) : null}
									<div style={{ fontSize: '0.875rem', color: 'var(--va-muted)', lineHeight: '1.8', marginBottom: '1rem' }}>
										<div style={{ marginBottom: '0.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
											<span>🏷️ <strong style={{ color: 'var(--va-text)' }}>{getEventTypeLabel(event.type)}</strong></span>
											{duration && <span>⏱️ <strong style={{ color: 'var(--va-text)' }}>{duration}</strong></span>}
										</div>
										{event.instructor && (
											<div style={{ marginBottom: '0.5rem' }}>
												👤 <strong style={{ color: 'var(--va-text)' }}>{event.instructor.name}</strong>
											</div>
										)}
										<div style={{ marginBottom: '0.5rem' }}>
											📍 <strong style={{ color: 'var(--va-text)' }}>
												{event.location || event.live_link || 'N/A'}
											</strong>
										</div>
										<div style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
											🕐 <strong style={{ color: 'var(--va-text)' }}>{formatDate(event.start_date)}</strong>
											{event.end_date && (
												<span style={{ marginLeft: '0.5rem' }}>
													- {formatTime(event.end_date)}
												</span>
											)}
										</div>
										{event.max_capacity && (
											<div style={{ marginBottom: '0.5rem' }}>
												👥 <strong style={{ color: 'var(--va-text)' }}>
													{event.registrations_count || 0} / {event.max_capacity} înscriși
													{isFull && <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>• PLIN</span>}
												</strong>
											</div>
										)}
									</div>
									<div className="events-card-actions">
										<button
											className="lms-btn-primary"
											onClick={(e) => {
												e.stopPropagation();
												navigate(`/events/${event.id}`);
											}}
											style={{ flex: 1 }}
										>
											Vezi Detalii
										</button>
										{!isCompleted && !event.user_registered && !isFull && event.status !== 'cancelled' && (
											<button
												className="lms-btn-secondary"
												onClick={(e) => handleRegister(event.id, e)}
												style={{ background: '#10b981', color: '#fff' }}
											>
												Înscrie-te
											</button>
										)}
										{event.user_registered && (
											<button
												className="lms-btn-secondary"
												disabled
												style={{ background: '#10b981', color: '#fff', cursor: 'not-allowed' }}
											>
												Înscris
											</button>
										)}
									</div>
								</div>
							</div>
						);
					})}
				</div>
			</section>
		);
	};

	if (loading) {
		return (
			<div className="va-main fade-in">
				<div className="skeleton-card" style={{ marginBottom: '2rem' }}>
					<div className="skeleton skeleton-title"></div>
					<div className="skeleton skeleton-text"></div>
				</div>
				<div className="skeleton-card">
					<div className="skeleton skeleton-text" style={{ height: '200px' }}></div>
				</div>
			</div>
		);
	}

	return (
		<div className="events-page">
			<div className="events-page-header">
				<h1 className="events-page-title">
					Evenimente
				</h1>
				<p className="events-page-subtitle">
					Evenimente online și fizice planificate în platformă.
				</p>
			</div>

			{/* Filters */}
			<div className="va-events-filters">
				<select
					value={filters.type}
					onChange={(e) => setFilters({ ...filters, type: e.target.value })}
					className="events-filter-select"
				>
					<option value="all">Toate</option>
					<option value="live_online">Online</option>
					<option value="physical">Fizic</option>
				</select>
			</div>

			{error && (
				<div style={{ padding: '1rem', background: '#fee', color: '#c33', borderRadius: '8px', marginBottom: '1.5rem' }}>
					{error}
				</div>
			)}

			{events.length > 0 && (
				<div className="va-card" style={{ marginBottom: '1.5rem' }}>
					<div className="va-card-body" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
						<div style={{ flex: 1, minWidth: '180px' }}>
							<div style={{ fontSize: '0.8rem', color: 'var(--va-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
								Evenimente viitoare
							</div>
							<div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{groupedEvents.upcoming.length}</div>
						</div>
						<div style={{ flex: 1, minWidth: '180px' }}>
							<div style={{ fontSize: '0.8rem', color: 'var(--va-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
								Evenimente finalizate
							</div>
							<div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{groupedEvents.completed.length}</div>
						</div>
					</div>
				</div>
			)}

			{events.length > 0 ? (
						<div className="events-grid">
							{events.map((event) => {
								const statusBadge = getStatusBadge(event);
								const isFull = event.max_capacity && event.registrations_count >= event.max_capacity;
								const isCompleted = getTimelineGroup(event) === 'completed';
								const duration = formatDuration(event.start_date, event.end_date);
								
								return (
									<div
										key={event.id}
										className="va-card-enhanced stagger-item"
										style={{ cursor: 'pointer' }}
										onClick={() => navigate(`/events/${event.id}`)}
									>
										{event.thumbnail && (
											<div
												className="events-card-thumbnail"
												style={{
													width: '100%',
													height: '200px',
													backgroundImage: `url(${event.thumbnail})`,
													backgroundSize: 'cover',
													backgroundPosition: 'center',
													borderRadius: '8px 8px 0 0',
												}}
											/>
										)}
										<div className="va-card-body">
											<div className="events-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
												<h3 className="va-card-title" style={{ marginBottom: 0, flex: 1 }}>
													📅 {event.title}
												</h3>
												{statusBadge && (
													<span className="events-card-status-badge" style={{
														padding: '0.25rem 0.75rem',
														borderRadius: '12px',
														fontSize: '0.75rem',
														fontWeight: 'bold',
														background: statusBadge.color,
														color: '#fff',
													}}>
														{statusBadge.label}
													</span>
												)}
											</div>
											{event.short_description && (
												<p style={{ color: 'var(--va-muted)', marginBottom: '0.75rem', lineHeight: '1.6', fontSize: '0.9rem' }}>
													{event.short_description}
												</p>
											)}
											{event.description ? (
												<EventDescriptionExpandable
													text={event.description}
													className="events-card-desc"
												/>
											) : null}
											<div style={{ fontSize: '0.875rem', color: 'var(--va-muted)', lineHeight: '1.8', marginBottom: '1rem' }}>
												<div style={{ marginBottom: '0.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
													<span>🏷️ <strong style={{ color: 'var(--va-text)' }}>{getEventTypeLabel(event.type)}</strong></span>
												</div>
												{event.instructor && (
													<div style={{ marginBottom: '0.5rem' }}>
														👤 <strong style={{ color: 'var(--va-text)' }}>{event.instructor.name}</strong>
													</div>
												)}
												<div style={{ marginBottom: '0.5rem' }}>
													📍 <strong style={{ color: 'var(--va-text)' }}>
														{event.location || event.live_link || 'N/A'}
													</strong>
												</div>
												<div style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
													🕐 <strong style={{ color: 'var(--va-text)' }}>{formatDate(event.start_date)}</strong>
													{event.end_date && (
														<span style={{ marginLeft: '0.5rem' }}>
															- {formatTime(event.end_date)}
														</span>
													)}
												</div>
												{event.max_capacity && (
													<div style={{ marginBottom: '0.5rem' }}>
														👥 <strong style={{ color: 'var(--va-text)' }}>
															{event.registrations_count || 0} / {event.max_capacity} înscriși
															{isFull && <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>• PLIN</span>}
														</strong>
													</div>
												)}
											</div>
											<div className="events-card-actions">
												<button
													className="lms-btn-primary"
													onClick={(e) => {
														e.stopPropagation();
														navigate(`/events/${event.id}`);
													}}
													style={{ flex: 1 }}
												>
													Vezi Detalii
												</button>
												{!event.user_registered && !isFull && !isCompleted && event.status !== 'cancelled' && (
													<button
														className="lms-btn-secondary"
														onClick={(e) => handleRegister(event.id, e)}
														style={{ 
															background: '#10b981',
															color: '#fff',
														}}
													>
														{'✓ Înscrie-te'}
													</button>
												)}
												{event.user_registered && (
													<button
														className="lms-btn-secondary"
														disabled
														style={{ 
															background: '#10b981',
															color: '#fff',
															cursor: 'not-allowed',
														}}
													>
														✓ Înscris
													</button>
												)}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div className="va-card">
							<div className="va-card-body">
								<div className="empty-state">
									<div className="empty-state-icon">📅</div>
									<div className="empty-state-title">Nu există evenimente</div>
									<div className="empty-state-description">Nu sunt programate evenimente momentan.</div>
								</div>
							</div>
						</div>
					)}
		</div>
	);
};

export default EventsPage;
