import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { adminService, notificationsService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import AdminCalendarDrawer from './AdminCalendarDrawer';
import NotificationsDrawer from '../common/NotificationsDrawer';
import { countPrimite } from '../../utils/notificationInboxStorage';
import { Bell, CalendarDots } from '@phosphor-icons/react';

const AdminTopNavControls = () => {
	const { user } = useAuth();
	const showEventsCalendar = user?.actualRole !== 'instructor';
	const [calendarOpen, setCalendarOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [apiItems, setApiItems] = useState([]);
	const [loading, setLoading] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [inboxTick, setInboxTick] = useState(0);
	const [serverUnread, setServerUnread] = useState(0);
	const location = useLocation();
	const pollInFlightRef = useRef(false);
	const pollCooldownUntilRef = useRef(0);
	const pollFailuresRef = useRef(0);
	const isAdminArea = location.pathname.startsWith('/admin');

	const loadNotifications = useCallback(async () => {
		try {
			setLoading(true);
			const data = await adminService.getDashboard({ period: 'month' });
			setApiItems(Array.isArray(data?.notifications) ? data.notifications : []);
		} catch (err) {
			console.error('Error loading notifications:', err);
			setApiItems([]);
		} finally {
			setLoading(false);
		}
	}, []);

	const pollBadge = useCallback(async () => {
		if (Date.now() < pollCooldownUntilRef.current) return;
		if (pollInFlightRef.current) return;
		pollInFlightRef.current = true;

		try {
			const count = await notificationsService.getUnreadCount();
			setServerUnread(count);
			pollFailuresRef.current = 0;
		} catch (err) {
			const status = err?.response?.status;
			pollFailuresRef.current += 1;
			if (status === 429 || pollFailuresRef.current >= 3) {
				pollCooldownUntilRef.current = Date.now() + (status === 429 ? 120000 : 60000);
				pollFailuresRef.current = 0;
			}
		} finally {
			pollInFlightRef.current = false;
		}
	}, []);

	useEffect(() => {
		if (!isAdminArea) return;
		pollBadge();
	}, [isAdminArea, pollBadge]);

	useEffect(() => {
		if (!isAdminArea) return undefined;
		const intervalId = window.setInterval(pollBadge, 30000);
		const onVisibilityChange = () => {
			if (!document.hidden) pollBadge();
		};
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => {
			window.clearInterval(intervalId);
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	}, [isAdminArea, pollBadge]);

	useEffect(() => {
		if (drawerOpen && isAdminArea) loadNotifications();
	}, [drawerOpen, isAdminArea, loadNotifications]);

	const onLocalStateChange = useCallback(() => setInboxTick((t) => t + 1), []);

	const localPrimite = useMemo(() => countPrimite(apiItems, 'admin'), [apiItems, inboxTick]);
	const primiteCount = drawerOpen || apiItems.length > 0 ? localPrimite : Math.max(serverUnread, localPrimite);

	return (
		<>
			<div className="admin-topnav-search">
				<input
					type="text"
					placeholder="Căută utilizatori, cursuri, evenimente..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className="admin-topnav-search-input"
					aria-label="Caută utilizatori, cursuri, evenimente"
				/>
			</div>

			<div className="admin-topnav-trailing-icons">
				{showEventsCalendar && (
					<>
						<button
							type="button"
							className="admin-topnav-calendar-btn"
							onClick={() => setCalendarOpen(true)}
							aria-label="Deschide calendarul de evenimente"
							title="Calendar evenimente"
						>
							<CalendarDots size={20} weight="duotone" aria-hidden />
						</button>
						<AdminCalendarDrawer open={calendarOpen} onClose={() => setCalendarOpen(false)} />
					</>
				)}
				<div className="admin-topnav-notifications">
					<button
						type="button"
						className="admin-topnav-notification-btn"
						onClick={() => setDrawerOpen(true)}
						aria-label="Deschide notificările"
						aria-expanded={drawerOpen}
					>
						<Bell size={20} weight="duotone" aria-hidden />
						{primiteCount > 0 && <span className="admin-topnav-notification-badge">{primiteCount}</span>}
					</button>
					<NotificationsDrawer
						open={drawerOpen}
						onClose={() => setDrawerOpen(false)}
						variant="admin"
						apiItems={apiItems}
						loading={loading}
						onLocalStateChange={onLocalStateChange}
						onRefresh={loadNotifications}
					/>
				</div>
			</div>
		</>
	);
};

export default AdminTopNavControls;
