import React, { useState } from 'react';
import AdminCalendarDrawer from '../admin/AdminCalendarDrawer';
import { CalendarDots } from '@phosphor-icons/react';

const StudentTopNavCalendar = () => {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				className="admin-topnav-calendar-btn"
				onClick={() => setOpen(true)}
				aria-label="Deschide calendarul de evenimente"
				title="Calendar evenimente"
			>
				<CalendarDots size={20} weight="duotone" aria-hidden />
			</button>
			<AdminCalendarDrawer open={open} onClose={() => setOpen(false)} variant="student" />
		</>
	);
};

export default StudentTopNavCalendar;
