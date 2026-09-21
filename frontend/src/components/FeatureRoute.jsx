import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { companyHasFeature } from '../utils/entitlements';

/** Blochează rutele de produs care nu sunt în plan. */
const FeatureRoute = ({ feature, children, fallback = '/courses' }) => {
	const { user, loading } = useAuth();

	if (loading) {
		return (
			<div className="page-loader" role="status" aria-live="polite">
				Se încarcă…
			</div>
		);
	}

	if (!user || !companyHasFeature(user, feature)) {
		return <Navigate to={fallback} replace />;
	}

	return children;
};

export default FeatureRoute;
