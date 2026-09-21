import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { eventsService } from '../services/api';
import EventDescriptionExpandable from '../components/common/EventDescriptionExpandable';

const CalendarPage = () => {

	const formatDate = (dateString) => {
		const date = new Date(dateString);
		return date.toLocaleDateString('ro-RO', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
		});
	};

	const formatTime = (dateString) => {
		const date = new Date(dateString);
		return date.toLocaleTimeString('ro-RO', {
			hour: '2-digit',
			minute: '2-digit',
		});
	};

	const getEventTypeColor = (type) => {
		const colors = {
			curs: 'rgba(var(--formely-white-rgb), 0.2)',
			workshop: 'rgba(8, 145, 178, 0.2)',
			examen: 'rgba(255, 107, 107, 0.2)',
			webinar: 'rgba(255, 206, 84, 0.2)',
		};
		return colors[type] || 'rgba(var(--formely-white-rgb), 0.2)';
	};

	const getEventTypeBorder = (type) => {
		const borders = {
			curs: 'rgba(var(--formely-white-rgb), 0.4)',
			workshop: 'rgba(8, 145, 178, 0.4)',
			examen: 'rgba(255, 107, 107, 0.4)',
			webinar: 'rgba(255, 206, 84, 0.4)',
		};
		return borders[type] || 'rgba(var(--formely-white-rgb), 0.4)';
	};

	const getEventTypeLabel = (type) => {
		const labels = {
			curs: 'Curs',
			workshop: 'Workshop',
			examen: 'Examen',
			webinar: 'Webinar',
		};
		return labels[type] || 'Eveniment';
	};

	const [events, setEvents] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		const fetchEvents = async () => {
			try {
				setLoading(true);
				const data = await eventsService.getAll();
				setEvents(data);
			} catch (err) {
				console.error('Error fetching events:', err);
				setError('Nu s-au putut încărca evenimentele');
			} finally {
				setLoading(false);
			}
		};
		fetchEvents();
	}, []);

	if (loading) { return null; }

	if (error) {
		return (
			<div className="va-calendar-like">
				<p style={{ color: 'red' }}>{error}</p>
			</div>
		);
	}

	const sortedEvents = [...events].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

	return (
		<div className="va-calendar-like">
			<div className="va-calendar-header">
				<div>
					<h1 className="va-page-title">Calendar</h1>
					<p className="va-muted">
						Vezi toate evenimentele planificate: cursuri, workshop-uri, examene și webinar-uri.
					</p>
				</div>
				<Link to="/calendar/view" className="lms-btn-primary">
					<span>Deschide calendar vizual</span>
					<span>📅</span>
				</Link>
			</div>

			<div className="va-events-grid">
				{sortedEvents.map((event) => (
					<div
						key={event.id}
						className="va-event-card"
						style={{
							background: getEventTypeColor(event.type),
							borderColor: getEventTypeBorder(event.type),
						}}
					>
						<div className="va-event-header">
							<div className="va-event-date">
								<div className="va-event-day">{new Date(event.startDate).getDate()}</div>
								<div className="va-event-month">
									{new Date(event.startDate).toLocaleDateString('ro-RO', { month: 'short' })}
								</div>
							</div>
							<div className="va-event-type-badge">{getEventTypeLabel(event.type)}</div>
						</div>
						<div className="va-event-body">
							<h3 className="va-event-title">{event.title}</h3>
							{event.description ? (
								<EventDescriptionExpandable
									text={event.description}
									className="va-event-description-wrap"
									textClassName="va-event-description"
								/>
							) : null}
							<div className="va-event-meta">
								<div className="va-event-time">
									<span className="va-event-icon">🕐</span>
									<span>
										{formatTime(event.startDate)} - {formatTime(event.endDate)}
									</span>
								</div>
								{event.location && (
									<div className="va-event-location">
										<span className="va-event-icon">📍</span>
										<span>{event.location}</span>
									</div>
								)}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

export default CalendarPage;

