import React from 'react';
import { Navigate } from 'react-router-dom';

export default function AdminTestsPendingReviewsPage() {
	return <Navigate to="/admin/content?tab=manual-review&kind=tests" replace />;
}
