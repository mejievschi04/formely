import React from 'react';
import { mockEvents } from '../data/mockData';

const CalendarViewPage = () => {
	const getDaysInMonth = (date) => {
		const year = date.getFullYear();
		const month = date.getMonth();
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const daysInMonth = lastDay.getDate();
		const startingDayOfWeek = firstDay.getDay();

		return { daysInMonth, startingDayOfWeek, year, month };
	};

	const [currentDate, setCurrentDate] = React.useState(new Date());
	const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);

	const monthNames = [
		'Ianuarie',
		'Februarie',
		'Martie',
		'Aprilie',
		'Mai',
		'Iunie',
		'Iulie',
		'August',
		'Septembrie',
		'Octombrie',
		'Noiembrie',
		'Decembrie',
	];

	const weekDays = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];

	const getEventsForDate = (day) => {
		const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		return mockEvents.filter((event) => {
			const eventDate = new Date(event.startDate);
			return (
				eventDate.getDate() === day &&
				eventDate.getMonth() === month &&
				eventDate.getFullYear() === year
			);
		});
	};

	const getEventTypeColor = (type) => {
		const colors = {
			curs: 'var(--formely-white)',
			workshop: '#ffcc00',
			examen: '#ff6b6b',
			webinar: '#ffce54',
		};
		return colors[type] || 'var(--formely-white)';
	};

	const prevMonth = () => {
		setCurrentDate(new Date(year, month - 1, 1));
	};

	const nextMonth = () => {
		setCurrentDate(new Date(year, month + 1, 1));
	};

	const goToToday = () => {
		setCurrentDate(new Date());
	};

	const days = [];
	const adjustedStartingDay = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;

	for (let i = 0; i < adjustedStartingDay; i++) {
		days.push(null);
	}

	for (let day = 1; day <= daysInMonth; day++) {
		days.push(day);
	}

	const today = new Date();
	const isToday = (day) =>
		day === today.getDate() &&
		month === today.getMonth() &&
		year === today.getFullYear();

	return (
		<div className="va-calendar-view">
			<div className="va-calendar-header-view">
				<div className="va-calendar-nav">
					<button type="button" className="lms-btn-secondary" onClick={prevMonth}>
						←
					</button>
					<h1 className="va-calendar-month-title">
						{monthNames[month]} {year}
					</h1>
					<button type="button" className="lms-btn-secondary" onClick={nextMonth}>
						→
					</button>
				</div>
				<button type="button" className="lms-btn-primary" onClick={goToToday}>
					Astăzi
				</button>
			</div>

			<div className="va-calendar-grid">
				<div className="va-calendar-weekdays">
					{weekDays.map((day) => (
						<div key={day} className="va-calendar-weekday">
							{day}
						</div>
					))}
				</div>

				<div className="va-calendar-days">
					{days.map((day, index) => {
						if (day === null) {
							return <div key={`empty-${index}`} className="va-calendar-day va-calendar-day-empty"></div>;
						}

						const events = getEventsForDate(day);
						const todayClass = isToday(day) ? 'va-calendar-day-today' : '';

						return (
							<div key={day} className={`va-calendar-day ${todayClass}`}>
								<div className="va-calendar-day-number">{day}</div>
								<div className="va-calendar-day-events">
									{events.slice(0, 3).map((event) => (
										<div
											key={event.id}
											className="va-calendar-event-dot"
											style={{ backgroundColor: getEventTypeColor(event.type) }}
											title={event.title}
										></div>
									))}
									{events.length > 3 && (
										<div className="va-calendar-event-more">+{events.length - 3}</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<div className="va-calendar-legend">
				<div className="va-calendar-legend-item">
					<div className="va-calendar-legend-dot" style={{ backgroundColor: 'var(--formely-white)' }}></div>
					<span>Curs</span>
				</div>
				<div className="va-calendar-legend-item">
					<div className="va-calendar-legend-dot" style={{ backgroundColor: '#ffcc00' }}></div>
					<span>Workshop</span>
				</div>
				<div className="va-calendar-legend-item">
					<div className="va-calendar-legend-dot" style={{ backgroundColor: '#ff6b6b' }}></div>
					<span>Examen</span>
				</div>
				<div className="va-calendar-legend-item">
					<div className="va-calendar-legend-dot" style={{ backgroundColor: '#ffce54' }}></div>
					<span>Webinar</span>
				</div>
			</div>
		</div>
	);
};

export default CalendarViewPage;

