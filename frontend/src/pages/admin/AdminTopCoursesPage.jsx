import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../../services/api';
import TopCourses from '../../components/admin/TopCourses';

const AdminTopCoursesPage = () => {
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
				console.error('Error fetching top courses:', err);
				setError('Nu s-au putut încărca datele');
			} finally {
				setLoading(false);
			}
		};
		fetchDashboard();
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
					<h1 className="admin-page-title">Top Cursuri</h1>
					<p className="admin-page-subtitle">Cursurile cu cele mai bune performanțe</p>
				</div>
			</div>
			{error && (
				<div className="admin-error-message">
					<p>{error}</p>
				</div>
			)}
			<TopCourses 
				courses={dashboardData?.top_courses || []} 
				loading={loading}
			/>
		</div>
	);
};

export default AdminTopCoursesPage;

