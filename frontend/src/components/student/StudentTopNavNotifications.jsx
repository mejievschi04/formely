import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { dashboardService, notificationsService } from '../../services/api';
import { countPrimite } from '../../utils/notificationInboxStorage';
import NotificationsDrawer from '../common/NotificationsDrawer';
import { Bell } from '@phosphor-icons/react';

const POLL_MS = 30000;
const COOLDOWN_MS_429 = 120000;

const StudentTopNavNotifications = () => {
	const [apiItems, setApiItems] = useState([]);
	const [loading, setLoading] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [inboxTick, setInboxTick] = useState(0);
	const [serverUnread, setServerUnread] = useState(0);
	const pollInFlightRef = useRef(false);
	const pollCooldownUntilRef = useRef(0);
	const pollFailuresRef = useRef(0);

	const loadFull = useCallback(async () => {
		try {
			setLoading(true);
			const data = await dashboardService.getStudentDashboard();
			setApiItems(Array.isArray(data?.notifications) ? data.notifications : []);
		} catch (err) {
			console.error('Error loading student notifications:', err);
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
				pollCooldownUntilRef.current = Date.now() + (status === 429 ? COOLDOWN_MS_429 : 60000);
				pollFailuresRef.current = 0;
			}
		} finally {
			pollInFlightRef.current = false;
		}
	}, []);

	useEffect(() => {
		pollBadge();
	}, [pollBadge]);

	useEffect(() => {
		const intervalId = window.setInterval(pollBadge, POLL_MS);
		const onVisibilityChange = () => {
			if (!document.hidden) pollBadge();
		};
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => {
			window.clearInterval(intervalId);
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	}, [pollBadge]);

	useEffect(() => {
		if (drawerOpen) loadFull();
	}, [drawerOpen, loadFull]);

	const onLocalStateChange = useCallback(() => setInboxTick((t) => t + 1), []);

	const localPrimite = useMemo(() => countPrimite(apiItems, 'student'), [apiItems, inboxTick]);
	const primiteCount = drawerOpen || apiItems.length > 0 ? localPrimite : Math.max(serverUnread, localPrimite);

	return (
		<div className="va-topnav-notifications admin-topnav-notifications">
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
				variant="student"
				apiItems={apiItems}
				loading={loading}
				onLocalStateChange={onLocalStateChange}
				onRefresh={loadFull}
			/>
		</div>
	);
};

export default StudentTopNavNotifications;
