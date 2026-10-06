import React, { useState, useEffect } from 'react';
import { eventsService } from '../services/api';

import { useToast } from '../contexts/ToastContextShared.js';
import { logger } from '../utils/logger';
import ConfirmModal from '../components/common/ConfirmModal';
import { CalendarBlank } from '@phosphor-icons/react';

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
	const { success: showSuccess, error: showError } = useToast();
	const [events, setEvents] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [cancelTarget, setCancelTarget] = useState(null);
	const [cancelLoading, setCancelLoading] = useState(false);

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

	const handleCancelRegistrationClick = (event, e) => {
		e.stopPropagation();
		setCancelTarget(event);
	};

	const handleConfirmCancelRegistration = async () => {
		if (!cancelTarget) return;
		setCancelLoading(true);
		try {
			await eventsService.cancelRegistration(cancelTarget.id);
			setCancelTarget(null);
			await fetchEvents();
			showSuccess('Înscriere anulată');
		} catch (err) {
			logger.error('Error canceling registration:', err);
			showError(err.response?.data?.message || 'Eroare la anulare');
		} finally {
			setCancelLoading(false);
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
			</div>

			{error && (
				<div className="lms-error-message" role="alert">
					{error}
				</div>
			)}

			{events.length > 0 ? (
				<div className="events-grid">
					{events.map((event) => {
						const isFull = event.max_capacity && event.registrations_count >= event.max_capacity;
						const details = String(event.description || event.short_description || '').trim();
						return (
							<article key={event.id} className="va-card-enhanced stagger-item events-card">
								{event.thumbnail && (
									<div
										className="events-card-thumbnail"
										style={{
											backgroundImage: `url(${event.thumbnail})`,
										}}
									/>
								)}
								<div className="va-card-body events-card-body">
									<h3 className="va-card-title events-card-title">{event.title}</h3>
									{details ? (
										<p className="events-card-text">{details}</p>
									) : null}
									<div className="events-card-meta">
										{event.instructor?.name ? (
											<div className="events-card-meta-row">
												<span className="events-card-meta-icon" aria-hidden>👤</span>
												<span>{event.instructor.name}</span>
											</div>
										) : null}
										{(event.location || event.live_link) ? (
											<div className="events-card-meta-row">
												<span className="events-card-meta-icon" aria-hidden>📍</span>
												<span>{event.location || 'Online'}</span>
											</div>
										) : null}
										<div className="events-card-meta-row">
											<span className="events-card-meta-icon" aria-hidden>🕐</span>
											<span>
												{formatDate(event.start_date)}
												{event.end_date ? ` – ${formatTime(event.end_date)}` : ''}
											</span>
										</div>
										{event.max_capacity ? (
											<div className="events-card-meta-row">
												<span className="events-card-meta-icon" aria-hidden>👥</span>
												<span>
													{event.registrations_count || 0} / {event.max_capacity} înscriși
													{isFull ? <span className="events-card-full"> • PLIN</span> : null}
												</span>
											</div>
										) : null}
									</div>
									<div className="events-card-actions">
										{!event.user_registered && !isFull && event.status !== 'cancelled' && (
											<button
												className="lms-btn-primary"
												onClick={(e) => handleRegister(event.id, e)}
											>
												Înscrie-te
											</button>
										)}
										{event.user_registered && (
											<>
												<button className="lms-btn-secondary" disabled>
													✓ Înscris
												</button>
												{event.status !== 'cancelled' && event.status !== 'completed' ? (
													<button
														type="button"
														className="lms-btn-secondary events-card-cancel-btn"
														onClick={(e) => handleCancelRegistrationClick(event, e)}
													>
														Anulează înscrierea
													</button>
												) : null}
											</>
										)}
									</div>
								</div>
							</article>
						);
					})}
				</div>
			) : (
				<div className="va-card">
					<div className="va-card-body">
						<div className="empty-state">
							<div className="empty-state-icon"><CalendarBlank size={56} weight="duotone" aria-hidden /></div>
							<div className="empty-state-title">Nu există evenimente</div>
							<div className="empty-state-description">Nu sunt programate evenimente momentan.</div>
						</div>
					</div>
				</div>
			)}

			<ConfirmModal
				open={Boolean(cancelTarget)}
				onClose={() => !cancelLoading && setCancelTarget(null)}
				onConfirm={handleConfirmCancelRegistration}
				title="Anulare înscriere"
				message={cancelTarget ? `Sigur dorești să anulezi înscrierea la „${cancelTarget.title}”?` : ''}
				confirmLabel="Anulează înscrierea"
				cancelLabel="Rămân"
				variant="danger"
				loading={cancelLoading}
			/>
		</div>
	);
};

export default EventsPage;
