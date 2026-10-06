import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContextShared.js';
import { companyHasFeature } from '../utils/entitlements';

/** Formely: rutele de produs care nu sunt în planul academiei trimit la cursuri. */
const FeatureRoute = ({ feature, children, fallback = '/courses' }) => {
	const { user } = useAuth();

	if (user && !companyHasFeature(user, feature)) {
		return <Navigate to={fallback} replace />;
	}

	return children;
};

export default FeatureRoute;
