import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isStaffAdminRole } from '../constants/staffRoles';

const INSTRUCTOR_BLOCKED_PREFIXES = [
	'/admin/events',
	'/admin/teams',
	'/admin/team-members',
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

	if (!isStaffAdminRole(user.actualRole)) {
		return <Navigate to="/courses" replace />;
	}

	if (user.actualRole === 'instructor' && isInstructorBlockedPath(location.pathname)) {
		return <Navigate to="/admin/content?tab=courses" replace />;
	}

	return children;
};

export default AdminRoute;
