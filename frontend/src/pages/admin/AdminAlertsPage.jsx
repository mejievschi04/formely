import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../../services/api';
import AlertsSection from '../../components/admin/AlertsSection';

const AdminAlertsPage = () => {
	const navigate = useNavigate();
	const [dashboardData, setDashboardData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		const fetchDashboard = async () => {
			try {
				setLoading(true);
				setError(null);
				const data = await adminService.getDashboard({ period: 'month' });
				setDashboardData(data);
			} catch (err) {
				console.error('Error fetching alerts:', err);
				setError('Nu s-au putut încărca datele');
			} finally {
				setLoading(false);
			}
		};
		fetchDashboard();
	}, []);

	const handleDismiss = async (alertId) => {
		try {
			await adminService.dismissDashboardAlert(alertId);
			setDashboardData((prev) => {
				if (!prev) return prev;
				return {
					...prev,
					alerts: (prev.alerts || []).filter((a) => a.id !== alertId),
					notifications: (prev.notifications || []).filter((n) => n.id !== alertId),
				};
			});
		} catch (err) {
			console.error('Dismiss alert failed:', err);
		}
	};

	return (
		<div className="admin-container">
			<div className="admin-page-header">
				<div>
					<button 
						onClick={() => navigate('/admin')}
						className="lms-btn-secondary"
						style={{ marginBottom: 'var(--space-4)' }}
					>
						← Înapoi la Dashboard
					</button>
					<h1 className="admin-page-title">Alerte</h1>
					<p className="admin-page-subtitle">Acțiuni care necesită atenție</p>
				</div>
			</div>
			{error && (
				<div className="admin-error-message">
					<p>{error}</p>
				</div>
			)}
			<AlertsSection 
				alerts={dashboardData?.alerts || []} 
				loading={loading}
				onDismiss={handleDismiss}
			/>
		</div>
	);
};

export default AdminAlertsPage;

