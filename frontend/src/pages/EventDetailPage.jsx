import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { eventsService } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { logger } from '../utils/logger';
import { handleApiError } from '../utils/errorHandler';
import ConfirmModal from '../components/common/ConfirmModal';

const EventDetailPage = () => {
	const { id } = useParams();
	const navigate = useNavigate();
	const { success: showSuccess, error: showError } = useToast();
	const [event, setEvent] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [actionLoading, setActionLoading] = useState(false);
	const [showCancelRegConfirm, setShowCancelRegConfirm] = useState(false);
	useEffect(() => {
		fetchEvent();
	}, [id]);

	const fetchEvent = async () => {
		try {
			setLoading(true);
			const data = await eventsService.getById(id);
			setEvent(data);
		} catch (err) {
			handleApiError(err, 'fetchEvent');
			setError('Nu s-a putut încărca evenimentul');
		} finally {
			setLoading(false);
		}
	};

	const formatDate = (dateString) => {
		if (!dateString) return 'N/A';
		const parts = dateString.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):?(\d{2})?/);
		if (!parts) return dateString;
		const [, year, month, day, hour, minute] = parts;
		return `${day}.${month}.${year}, ${hour}:${minute}`;
	};

	const formatTime = (dateString) => {
		if (!dateString) return '';
		const parts = dateString.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):?(\d{2})?/);
		if (!parts) return dateString;
		const [, , , , hour, minute] = parts;
		return `${hour}:${minute}`;
	};

	const getEventTypeLabel = (type) => {
		const labels = {
			live_online: 'Online',
			physical: 'Fizic',
		};
		return labels[type] || type;
	};

	const getStatusBadge = (status) => {
		const badges = {
			published: { label: 'Publicat', color: '#10b981' },
			upcoming: { label: 'Viitor', color: 'var(--formely-white)' },
			live: { label: 'Live', color: '#ef4444' },
			completed: { label: 'Finalizat', color: 'var(--formely-white)' },
			cancelled: { label: 'Anulat', color: '#64748b' },
		};
		return badges[status] || null;
	};

	const handleRegister = async () => {
		setActionLoading(true);
		try {
			await eventsService.register(id);
			await fetchEvent(); // Refresh to update registration status
			showSuccess('Te-ai înscris cu succes la eveniment!');
		} catch (err) {
			logger.error('Error registering:', err);
			showError(err.response?.data?.message || 'Eroare la înscriere');
		} finally {
			setActionLoading(false);
		}
	};

	const handleCancelRegistrationClick = () => {
		setShowCancelRegConfirm(true);
	};

	const handleConfirmCancelRegistration = async () => {
		setActionLoading(true);
		try {
			await eventsService.cancelRegistration(id);
			setShowCancelRegConfirm(false);
			await fetchEvent();
			showSuccess('Înscriere anulată cu succes');
		} catch (err) {
			logger.error('Error canceling registration:', err);
			showError(err.response?.data?.message || 'Eroare la anulare');
		} finally {
			setActionLoading(false);
		}
	};

	const handleMarkAttendance = async () => {
		setActionLoading(true);
		try {
			await eventsService.markAttendance(id);
			await fetchEvent();
			showSuccess('Prezență înregistrată!');
		} catch (err) {
			logger.error('Error marking attendance:', err);
			showError(err.response?.data?.message || 'Eroare la înregistrarea prezenței');
		} finally {
			setActionLoading(false);
		}
	};

	const handleWatchReplay = async () => {
		if (event.replay_url) {
			window.open(event.replay_url, '_blank');
			// Mark as watched
			try {
				await eventsService.markReplayWatched(id);
				await fetchEvent();
			} catch (err) {
				handleApiError(err, 'markReplayWatched');
			}
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

	if (error || !event) {
		return (
			<div className="va-main fade-in">
				<div className="va-card">
					<div className="va-card-body">
						<div className="empty-state">
							<div className="empty-state-icon">❌</div>
							<div className="empty-state-title">Eroare</div>
							<div className="empty-state-description">{error || 'Evenimentul nu a fost găsit'}</div>
							<button className="lms-btn-primary" onClick={() => navigate('/events')}>
								Înapoi la Evenimente
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	}

	const statusBadge = getStatusBadge(event.status);
	const isFull = event.max_capacity && event.registrations_count >= event.max_capacity;
	const canRegister = !event.user_registered && !isFull && 
		event.status !== 'completed' && event.status !== 'cancelled';

	return (
		<div className="va-main event-detail-page fade-in">
			<button
				type="button"
				className="event-detail-back"
				onClick={() => navigate('/events')}
			>
				← Înapoi la Evenimente
			</button>

			<div className="va-card-enhanced event-detail-card">
				{event.thumbnail && (
					<div 
						className="event-detail-thumbnail"
						style={{
							width: '100%',
							height: '300px',
							backgroundImage: `url(${event.thumbnail})`,
							backgroundSize: 'cover',
							backgroundPosition: 'center',
							borderRadius: '8px 8px 0 0',
						}} 
					/>
				)}
				<div className="va-card-body event-detail-body">
					<div className="event-detail-header">
						<h1 className="va-page-title">
							{event.title}
						</h1>
						{statusBadge && (
							<span
								className="event-detail-status-badge"
								style={{
									background: statusBadge.color,
									color: '#fff',
								}}
							>
								{statusBadge.label}
							</span>
						)}
					</div>

					{event.short_description && (
						<p className="event-detail-short-desc">
							{event.short_description}
						</p>
					)}

					<div className="event-detail-meta-grid">
						<div>
							<div className="event-detail-meta-label">🏷️ Tip</div>
							<div className="event-detail-meta-value">{getEventTypeLabel(event.type)}</div>
						</div>
						{event.instructor && (
							<div>
								<div className="event-detail-meta-label">👤 Instructor</div>
								<div className="event-detail-meta-value">{event.instructor.name}</div>
							</div>
						)}
						<div>
							<div className="event-detail-meta-label">🕐 Data început</div>
							<div className="event-detail-meta-value">{formatDate(event.start_date)}</div>
						</div>
						<div>
							<div className="event-detail-meta-label">🕐 Data sfârșit</div>
							<div className="event-detail-meta-value">{formatDate(event.end_date)}</div>
						</div>
						<div>
							<div className="event-detail-meta-label">📍 Locație</div>
							<div className="event-detail-meta-value">{event.location || event.live_link || 'N/A'}</div>
						</div>
						{event.max_capacity && (
							<div>
								<div className="event-detail-meta-label">👥 Capacitate</div>
								<div className="event-detail-meta-value">
									{event.registrations_count || 0} / {event.max_capacity} înscriși
									{isFull && <span style={{ color: 'var(--color-error)', marginLeft: '0.5rem' }}>• PLIN</span>}
								</div>
							</div>
						)}
					</div>

					{event.description && (
						<div className="event-detail-description">
							<h2>Descriere</h2>
							<div className="event-detail-description-text">
								{event.description}
							</div>
						</div>
					)}

					<div className="event-detail-actions">
						{canRegister && (
							<button
								type="button"
								className="lms-btn-primary event-detail-action-btn"
								onClick={handleRegister}
								disabled={actionLoading}
								style={{ flex: 1, minWidth: '200px', background: '#10b981', color: '#fff' }}
							>
								{actionLoading ? 'Se procesează...' : '✓ Înscrie-te'}
							</button>
						)}
						{event.user_registered && (
							<>
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
								{event.status === 'live' && !event.user_attended && (
									<button
										className="lms-btn-primary"
										onClick={handleMarkAttendance}
										disabled={actionLoading}
									>
										{actionLoading ? 'Se procesează...' : '✓ Confirmă Prezența'}
									</button>
								)}
								{event.user_attended && (
									<button
										className="lms-btn-secondary"
										disabled
										style={{ 
											background: '#10b981',
											color: '#fff',
											cursor: 'not-allowed',
										}}
									>
										✓ Prezență Confirmată
									</button>
								)}
								{event.status === 'completed' && event.replay_url && (
									<button
										className="lms-btn-primary"
										onClick={handleWatchReplay}
										style={{ background: 'var(--formely-white)' }}
									>
										🎬 Vezi Replay
									</button>
								)}
								{event.status !== 'completed' && event.status !== 'cancelled' && (
									<button
										className="lms-btn-secondary"
										onClick={handleCancelRegistrationClick}
										disabled={actionLoading}
										style={{ background: '#ef4444', color: '#fff' }}
									>
										{actionLoading ? 'Se procesează...' : 'Anulează Înscrierea'}
									</button>
								)}
							</>
						)}
						{event.live_link && (event.status === 'live' || event.status === 'upcoming') && (
							<button
								className="lms-btn-primary"
								onClick={() => window.open(event.live_link, '_blank')}
								style={{ background: '#ef4444' }}
							>
								🔴 Accesează Live
							</button>
						)}
					</div>

					{event.registrations_count > 0 && (
						<div className="event-detail-stats">
							<h3>Statistici</h3>
							<div className="event-detail-stats-grid">
								<div>
									<div className="event-detail-meta-label">Înscrieri</div>
									<div className="event-detail-meta-value" style={{ fontSize: '1.5rem', color: 'var(--color-brand-primary)' }}>
										{event.registrations_count || 0}
									</div>
								</div>
								<div>
									<div className="event-detail-meta-label">Prezență</div>
									<div className="event-detail-meta-value" style={{ fontSize: '1.5rem', color: '#10b981' }}>
										{event.attendance_count || 0}
									</div>
								</div>
								{event.replay_views_count > 0 && (
									<div>
										<div className="event-detail-meta-label">Replay</div>
										<div className="event-detail-meta-value" style={{ fontSize: '1.5rem', color: 'var(--color-brand-primary)' }}>
											{event.replay_views_count}
										</div>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</div>

			<ConfirmModal
				open={showCancelRegConfirm}
				onClose={() => setShowCancelRegConfirm(false)}
				onConfirm={handleConfirmCancelRegistration}
				title="Anulare înscriere"
				message="Sigur dorești să anulezi înscrierea la acest eveniment?"
				confirmLabel="Anulează înscrierea"
				cancelLabel="Rămân"
				variant="danger"
				loading={actionLoading}
			/>
		</div>
	);
};

export default EventDetailPage;

