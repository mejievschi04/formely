import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isPlatformAdmin } from '../utils/entitlements';

const UserRoute = ({ children }) => {
	const { user, loading } = useAuth();

	if (loading) { return null; }

	if (!user) {
		return <Navigate to="/login" replace />;
	}

	if (isPlatformAdmin(user)) {
		window.location.href = import.meta.env.VITE_BACKOFFICE_URL || 'http://localhost:5180';
		return null;
	}

	return children;
};

export default UserRoute;

