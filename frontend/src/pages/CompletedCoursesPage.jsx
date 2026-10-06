import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { profileService } from '../services/api';
import { ArrowLeft } from '@phosphor-icons/react';



const CompletedCoursesPage = () => {
	const navigate = useNavigate();

	const [coursesCompleted, setCoursesCompleted] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		const fetchCompletedCourses = async () => {
			try {
				setLoading(true);
				const profile = await profileService.getProfile();
				setCoursesCompleted(profile.coursesCompleted || []);
			} catch (err) {
				console.error('Error fetching completed courses:', err);
				setError('Nu s-a putut încărca cursurile finalizate');
			} finally {
				setLoading(false);
			}
		};
		fetchCompletedCourses();
	}, []);

	if (loading) {
		return (
			<div className="admin-container">
				<div className="lms-dashboard-loading">Se încarcă...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="admin-container">
				<p style={{ color: 'red' }}>{error}</p>
			</div>
		);
	}

	return (
		<div className="admin-container">
			{/* Header */}
			<div className="admin-page-header">
				<div className="admin-page-header-content">
					<button
						type="button"
						onClick={() => navigate('/profile')}
						className="va-btn-back"
						style={{ alignSelf: 'flex-start', width: 'auto', marginBottom: '1rem' }}
					>
						<ArrowLeft size={18} weight="bold" aria-hidden />
						<span>Înapoi la Profil</span>
					</button>
					<h1 className="admin-page-title">Cursuri finalizate</h1>
					<p className="admin-page-subtitle">
						{coursesCompleted.length} curs{coursesCompleted.length !== 1 ? 'uri' : ''} completat{coursesCompleted.length !== 1 ? 'e' : ''}
					</p>
				</div>
			</div>

			{/* Content */}
			<div className="va-completed-courses-cards">
				{coursesCompleted.length > 0 ? (
					coursesCompleted.map((course) => (
						<div className="va-completed-course-card" key={course.id}>
							<div className="va-completed-course-card-header">
								<h3 className="va-completed-course-card-title">{course.title}</h3>
								<div className="va-completed-course-card-badge">
									✓ Completat
								</div>
							</div>
							<p className="va-completed-course-card-description">{course.description}</p>
							<div className="va-completed-course-card-actions">
								<Link
									to={`/courses/${course.id}`}
									className="lms-btn-secondary lms-btn-sm"
								>
									Revizualizează cursul
								</Link>
							</div>
						</div>
					))
				) : (
					<div className="lms-empty-state">
						<p className="lms-empty-description">Nu ai finalizat niciun curs încă.</p>
						<Link to="/courses" className="lms-btn-primary">
							Explorează cursuri
						</Link>
					</div>
				)}
			</div>
		</div>
	);
};

export default CompletedCoursesPage;
