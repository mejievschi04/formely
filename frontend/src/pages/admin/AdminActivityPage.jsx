import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../../services/api';
import ActivityFeed from '../../components/admin/ActivityFeed';

const AdminActivityPage = () => {
	const navigate = useNavigate();
	const [dashboardData, setDashboardData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		const fetchActivity = async () => {
			try {
				setLoading(true);
				setError(null);
				const data = await adminService.getDashboard({ period: 'month' });
				console.log('Dashboard data:', data);
				setDashboardData(data);
			} catch (err) {
				console.error('Error fetching activity:', err);
				setError('Nu s-au putut încărca datele: ' + (err.response?.data?.message || err.message));
			} finally {
				setLoading(false);
			}
		};
		fetchActivity();
	}, []);

	return (
		<div className="admin-container">
			<div className="admin-page-header">
				<div>
					<button 
						onClick={() => navigate('/admin')}
						className="btn btn-ghost"
						style={{ marginBottom: '1rem' }}
					>
						← Înapoi la Dashboard
					</button>
					<h1 className="admin-page-title">Activitate Recentă</h1>
					<p className="admin-page-subtitle">Ultimele evenimente din platformă</p>
				</div>
			</div>
			{error && (
				<div className="admin-error-message">
					<p>{error}</p>
				</div>
			)}
			{!loading && dashboardData && (
				<ActivityFeed 
					activities={dashboardData.recent_activities || []} 
					loading={loading}
				/>
			)}
		</div>
	);
};

export default AdminActivityPage;

