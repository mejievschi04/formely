import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { eventsService } from '../services/api';

import { useToast } from '../contexts/ToastContext';
import { logger } from '../utils/logger';
import EventDescriptionExpandable from '../components/common/EventDescriptionExpandable';

const parseEventDate = (dateString) => {
	if (!dateString) return null;
	const parts = String(dateString).match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
	if (!parts) return null;
	return new Date(
		Number(parts[1]),
		Number(parts[2]) - 1,
		Number(parts[3]),
		Number(parts[4]),
		Number(parts[5]),
	);
};

const EventsPage = () => {
	const navigate = useNavigate();
	const { success: showSuccess, error: showError } = useToast();
	const [events, setEvents] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	const fetchEvents = async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await eventsService.getAll();
			const eventsList = Array.isArray(data) ? data : (data?.data || []);
			setEvents(
				[...eventsList].sort(
					(a, b) => (parseEventDate(a.start_date)?.getTime() || 0) - (parseEventDate(b.start_date)?.getTime() || 0),
				),
			);
		} catch (err) {
			console.error('Error fetching events:', err);
			setError('Nu s-au putut încărca evenimentele');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchEvents();
	}, []);

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

	if (loading) {
		return (
			<div className="va-main fade-in">
				<div className="skeleton-card" style={{ marginBottom: '2rem' }}>
					<div className="skeleton skeleton-title"></div>
					<div className="skeleton skeleton-text"></div>
				</div>
			</div>
		);
	}

	return (
		<div className="events-page">
			<div className="events-page-header">
				<h1 className="events-page-title">Evenimente</h1>
				<p className="events-page-subtitle">Lista evenimentelor disponibile.</p>
			</div>

			{error && (
				<div style={{ padding: '1rem', background: '#fee', color: '#c33', borderRadius: '8px', marginBottom: '1.5rem' }}>
					{error}
				</div>
			)}

			{events.length > 0 ? (
				<div className="events-grid">
					{events.map((event) => {
						const isFull = event.max_capacity && event.registrations_count >= event.max_capacity;
						return (
							<div
								key={event.id}
								className="va-card-enhanced stagger-item events-card-clickable"
								onClick={() => navigate(`/events/${event.id}`)}
							>
								{event.thumbnail && (
									<div
										className="events-card-thumbnail"
										style={{
											width: '100%',
											height: '148px',
											backgroundImage: `url(${event.thumbnail})`,
											backgroundSize: 'cover',
											backgroundPosition: 'center',
											borderRadius: '8px 8px 0 0',
										}}
									/>
								)}
								<div className="va-card-body">
									<h3 className="va-card-title">📅 {event.title}</h3>
									{event.short_description && (
										<p style={{ color: 'var(--va-muted)', marginBottom: '0.75rem', lineHeight: '1.6', fontSize: '0.9rem' }}>
											{event.short_description}
										</p>
									)}
									{event.description ? (
										<EventDescriptionExpandable text={event.description} className="events-card-desc" />
									) : null}
									<div style={{ fontSize: '0.875rem', color: 'var(--va-muted)', lineHeight: '1.8', marginBottom: '1rem' }}>
										{event.instructor && (
											<div style={{ marginBottom: '0.5rem' }}>
												👤 <strong style={{ color: 'var(--va-text)' }}>{event.instructor.name}</strong>
											</div>
										)}
										{(event.location || event.live_link) && (
											<div style={{ marginBottom: '0.5rem' }}>
												📍 <strong style={{ color: 'var(--va-text)' }}>{event.location || 'Online'}</strong>
											</div>
										)}
										<div style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
											🕐 <strong style={{ color: 'var(--va-text)' }}>{formatDate(event.start_date)}</strong>
											{event.end_date && (
												<span style={{ marginLeft: '0.5rem' }}>- {formatTime(event.end_date)}</span>
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
											type="button"
											className="lms-btn-secondary"
											onClick={(e) => {
												e.stopPropagation();
												navigate(`/events/${event.id}`);
											}}
										>
											Detalii
										</button>
										{!event.user_registered && !isFull && event.status !== 'cancelled' && (
											<button
												type="button"
												className="lms-btn-primary"
												onClick={(e) => handleRegister(event.id, e)}
											>
												Înscrie-te
											</button>
										)}
										{event.user_registered && (
											<button type="button" className="lms-btn-secondary" disabled>
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
