import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isStaffAdminRole } from '../constants/staffRoles';
import { companyHasFeature, isPlatformAdmin } from '../utils/entitlements';

const INSTRUCTOR_BLOCKED_PREFIXES = [
	'/admin/events',
	'/admin/teams',
	'/admin/users',
	'/admin/activity-logs',
	'/admin/statistics',
	'/admin/settings',
	'/admin/top-courses',
	'/admin/problematic-courses',
	'/admin/activity',
	'/admin/alerts',
	'/admin/tasks',
	'/admin/analytics',
];

/** HR: utilizatori + organizație, fără conținut LMS și fără setări platformă */
const HR_ADMIN_BLOCKED_PREFIXES = [
	'/admin/content',
	'/admin/course-builder',
	'/admin/courses',
	'/admin/course-maps',
	'/admin/tests',
	'/admin/exams',
	'/admin/lessons',
	'/admin/settings',
];

const MANAGER_DEFAULT_PATH = '/admin/statistics';
const HR_ADMIN_DEFAULT_PATH = '/admin/users';

function isInstructorBlockedPath(pathname) {
	return INSTRUCTOR_BLOCKED_PREFIXES.some(
		(p) => pathname === p || pathname.startsWith(`${p}/`)
	);
}

const AdminRoute = ({ children }) => {
	const { user, loading } = useAuth();
	const location = useLocation();

	if (loading) {
		return null;
	}

	if (!user) {
		return <Navigate to="/login" replace />;
	}

	if (isPlatformAdmin(user)) {
		window.location.href = import.meta.env.VITE_BACKOFFICE_URL || 'http://localhost:5180';
		return null;
	}

	if (!isStaffAdminRole(user.actualRole)) {
		return <Navigate to="/courses" replace />;
	}

	const onPlatform = location.pathname === '/admin/platform'
		|| location.pathname.startsWith('/admin/platform/');
	if (onPlatform) {
		return <Navigate to="/admin" replace />;
	}

	if (location.pathname === '/admin/events' || location.pathname.startsWith('/admin/events/')) {
		if (!companyHasFeature(user, 'events')) {
			return <Navigate to="/admin" replace />;
		}
	}

	if (user.actualRole === 'instructor' && isInstructorBlockedPath(location.pathname)) {
		return <Navigate to="/admin/content?tab=courses" replace />;
	}

	if (user.actualRole === 'hr_admin') {
		const blocked = HR_ADMIN_BLOCKED_PREFIXES.some(
			(p) => location.pathname === p || location.pathname.startsWith(`${p}/`)
		);
		if (blocked) {
			return <Navigate to={HR_ADMIN_DEFAULT_PATH} replace />;
		}
	}

	if (user.actualRole === 'manager') {
		const blocked =
			isInstructorBlockedPath(location.pathname) ||
			HR_ADMIN_BLOCKED_PREFIXES.some(
				(p) => location.pathname === p || location.pathname.startsWith(`${p}/`)
			);
		if (blocked) {
			return <Navigate to={MANAGER_DEFAULT_PATH} replace />;
		}
	}

	return children;
};

export default AdminRoute;
