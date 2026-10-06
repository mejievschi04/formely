import React, { useEffect, useRef } from 'react';

import { useAuth } from '../contexts/AuthContextShared.js';
import { isStaffAdminRole } from '../constants/staffRoles';
import { useLocation } from 'react-router-dom';

/** Loads admin CSS only when user is admin - reduces initial load for students.
 *  When loadOnAdminPagesOnly=true, loads on /admin/*, /library and /guides
 *  pages that use the admin/staff shell.
 *  If waitForStylesBeforePaint=true, call onArmHold then onReady after the bundle loads.
 *  (Layout must not set "not ready" in an effect that runs after onReady — race → spinner infinit.) */
export default function AdminStylesLoader({
	loadOnAdminPagesOnly = false,
	waitForStylesBeforePaint = false,
	onArmHold,
	onReady,
}) {
	const { user } = useAuth();
	const location = useLocation();
	const loadedRef = useRef(false);
	const onReadyRef = useRef(onReady);
	const onArmHoldRef = useRef(onArmHold);
	onReadyRef.current = onReady;
	onArmHoldRef.current = onArmHold;

	useEffect(() => {
		const done = () => {
			onReadyRef.current?.();
		};

		const isStaffAdminUser = isStaffAdminRole(user?.actualRole);
		const isAdminPage = location.pathname.startsWith('/admin');
		// Biblioteca și Ghidurile folosesc cadrul de admin pentru staff (fără stiluri, meniul apărea ca listă simplă)
		const isLibraryPage =
			location.pathname === '/library'
			|| location.pathname.startsWith('/library/items/')
			|| location.pathname === '/guides';
		const isLibraryAdminShellPage = isLibraryPage && user?.role !== 'student';
		const needBundle =
			isStaffAdminUser && (!loadOnAdminPagesOnly || isAdminPage || isLibraryAdminShellPage);

		if (!waitForStylesBeforePaint) {
			done();
			if (needBundle && !loadedRef.current) {
				loadedRef.current = true;
				import('../styles/admin-styles-bundle.js').catch(() => {});
			}
			return;
		}

		if (!needBundle) {
			done();
			return;
		}

		if (loadedRef.current) {
			done();
			return;
		}

		onArmHoldRef.current?.();
		loadedRef.current = true;
		import('../styles/admin-styles-bundle.js')
			.then(() => done())
			.catch(() => done());
	}, [user?.role, loadOnAdminPagesOnly, location.pathname, waitForStylesBeforePaint]);

	return null;
}
