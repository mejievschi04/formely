import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const DashboardHeader = ({
	period,
	onPeriodChange
}) => {
	const navigate = useNavigate();
	const [selectedOrg, setSelectedOrg] = useState('');
	const [selectedCourse, setSelectedCourse] = useState('');

	const dateRanges = [
		{ value: 'today', label: 'Azi' },
		{ value: '7d', label: '7 zile' },
		{ value: '30d', label: '30 zile' },
		{ value: 'custom', label: 'Personalizat' },
	];

	// Mock data - in real app, this would come from API
	const organizations = [
		{ value: '', label: 'Toate organizațiile' },
		{ value: 'org1', label: 'Organizație 1' },
		{ value: 'org2', label: 'Organizație 2' },
	];

	const courses = [
		{ value: '', label: 'Toate cursurile' },
		{ value: 'course1', label: 'Curs 1' },
		{ value: 'course2', label: 'Curs 2' },
	];

	const handleCreateCourse = () => {
		navigate('/admin/courses/create');
	};

	const handleInviteUsers = () => {
		navigate('/admin/users/invite');
	};

	return (
		<header className="admin-dashboard-header">
			<div className="admin-dashboard-header-left">
				<h1 className="admin-dashboard-title">Panou admin</h1>
			</div>

			<div className="admin-dashboard-header-center">
				<div className="admin-dashboard-filters">
					{/* Date Range Selector */}
					<div className="admin-filter-group">
						<label className="admin-filter-label">Perioadă</label>
						<select
							value={period}
							onChange={(e) => onPeriodChange(e.target.value)}
							className="admin-filter-select"
						>
							{dateRanges.map(range => (
								<option key={range.value} value={range.value}>{range.label}</option>
							))}
						</select>
					</div>

					{/* Organization Filter */}
					<div className="admin-filter-group">
						<label className="admin-filter-label">Organization</label>
						<select
							value={selectedOrg}
							onChange={(e) => setSelectedOrg(e.target.value)}
							className="admin-filter-select"
						>
							{organizations.map(org => (
								<option key={org.value} value={org.value}>{org.label}</option>
							))}
						</select>
					</div>

					{/* Course Filter */}
					<div className="admin-filter-group">
						<label className="admin-filter-label">Curs</label>
						<select
							value={selectedCourse}
							onChange={(e) => setSelectedCourse(e.target.value)}
							className="admin-filter-select"
						>
							{courses.map(course => (
								<option key={course.value} value={course.value}>{course.label}</option>
							))}
						</select>
					</div>
				</div>
			</div>

			<div className="admin-dashboard-header-right">
				<div className="admin-dashboard-actions">
					<button
						className="admin-action-btn admin-action-btn-secondary"
						onClick={handleInviteUsers}
					>
						Invită utilizatori
					</button>
					<button
						className="admin-action-btn admin-action-btn-primary"
						onClick={handleCreateCourse}
					>
						Creează curs
					</button>
				</div>
			</div>
		</header>
	);
};

export default DashboardHeader;
