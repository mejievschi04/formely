import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { dashboardService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import ResumeLearningWidget from '../components/student/ResumeLearningWidget';
import CourseProgressWidget from '../components/student/CourseProgressWidget';
import IncompleteLessonsWidget from '../components/student/IncompleteLessonsWidget';
import PendingExamsWidget from '../components/student/PendingExamsWidget';

const DashboardPage = () => {
	const { user } = useAuth();
	const navigate = useNavigate();
	const [dashboardData, setDashboardData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		const fetchDashboard = async () => {
			try {
				setLoading(true);
				setError(null);
				const data = await dashboardService.getStudentDashboard();
				setDashboardData(data);
			} catch (err) {
				console.error('Error fetching dashboard:', err);
				setError(`Nu s-a putut încărca dashboard-ul: ${err.response?.data?.message || err.message || 'Eroare necunoscută'}`);
			} finally {
				setLoading(false);
			}
		};
		fetchDashboard();
	}, []);

	if (loading) {
		return (
			<div className="student-dashboard-page">
				<div className="student-dashboard-loading">
					<div className="student-loading-spinner"></div>
					<p>Se încarcă dashboard-ul...</p>
				</div>
			</div>
		);
	}

	if (error || !dashboardData) {
		return (
			<div className="student-dashboard-page">
				<div className="student-dashboard-error">
					<p>{error || 'Eroare la încărcarea datelor'}</p>
					<button onClick={() => window.location.reload()}>Reîncearcă</button>
				</div>
			</div>
		);
	}

	const { 
		global_progress, 
		active_courses, 
		next_lesson, 
		test_completion_percentage, 
		incomplete_lessons, 
		pending_exams, 
		stats 
	} = dashboardData;

	// Mandatory courses (optional courses merged into main list)
	const mandatoryCourses = active_courses.filter(course => course.is_mandatory === true || course.pivot?.is_mandatory === true);

	return (
		<div className="student-dashboard-page">
			{/* Page Header */}
			<div className="student-dashboard-header">
				<div className="student-dashboard-welcome">
					<span className="student-dashboard-welcome-icon">👋</span>
					<span>Bună ziua, {user?.name || 'Angajat'}!</span>
				</div>
				<h1 className="student-dashboard-title">
					Platforma de Dezvoltare Profesională
				</h1>
				<p className="student-dashboard-subtitle">
					Urmărește-ți progresul, finalizează cursurile obligatorii și dezvoltă-ți competențele
				</p>
			</div>

			{/* Hero Section */}
			<section className="student-dashboard-hero">
				<div className="student-dashboard-hero-content">
					{/* Global Progress */}
					<div className="student-dashboard-global-progress">
						<div className="student-global-progress-header">
							<h2>Progres Global</h2>
							<div className="student-global-progress-stats">
								<div className="student-global-progress-stat">
									<span className="student-global-progress-stat-value">
										{global_progress.completed_courses}
									</span>
									<span className="student-global-progress-stat-label">din {global_progress.total_courses} cursuri</span>
								</div>
								<div className="student-global-progress-stat">
									<span className="student-global-progress-stat-value">
										{global_progress.completed_lessons}
									</span>
									<span className="student-global-progress-stat-label">din {global_progress.total_lessons} lecții</span>
								</div>
							</div>
						</div>
						<div className="student-global-progress-bar-container">
							<div className="student-global-progress-bar-header">
								<span className="student-global-progress-percentage">
									{global_progress.percentage}%
								</span>
							</div>
							<div className="student-global-progress-bar">
								<div
									className="student-global-progress-fill"
									style={{ width: `${global_progress.percentage}%` }}
								/>
							</div>
						</div>
					</div>

					{/* Quick Stats - Corporate Metrics */}
					<div className="student-dashboard-quick-stats">
						<div className="student-quick-stat student-quick-stat-primary">
							<div className="student-quick-stat-icon">📚</div>
							<div className="student-quick-stat-content">
								<div className="student-quick-stat-value">{stats.total_courses}</div>
								<div className="student-quick-stat-label">Cursuri Asignate</div>
							</div>
						</div>
						<div className="student-quick-stat student-quick-stat-success">
							<div className="student-quick-stat-icon">✅</div>
							<div className="student-quick-stat-content">
								<div className="student-quick-stat-value">{stats.completed_courses_count}</div>
								<div className="student-quick-stat-label">Cursuri Finalizate</div>
							</div>
						</div>
						<div className="student-quick-stat student-quick-stat-info">
							<div className="student-quick-stat-icon">📖</div>
							<div className="student-quick-stat-content">
								<div className="student-quick-stat-value">{stats.total_lessons_completed}</div>
								<div className="student-quick-stat-label">Lecții Completate</div>
							</div>
						</div>
						<div className="student-quick-stat student-quick-stat-warning">
							<div className="student-quick-stat-icon">📝</div>
							<div className="student-quick-stat-content">
								<div className="student-quick-stat-value">{test_completion_percentage?.formatted ?? (test_completion_percentage?.value ?? 0) + '%'}</div>
								<div className="student-quick-stat-label">Procent realizare teste</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Main Content */}
			<div className="student-dashboard-content">
				{/* Left Column */}
				<div className="student-dashboard-left">
					{/* Resume Learning */}
					<ResumeLearningWidget nextLesson={next_lesson} />

					{/* Mandatory Courses */}
					{mandatoryCourses.length > 0 && (
						<div className="student-widget student-mandatory-courses-widget">
							<div className="student-widget-header">
								<div>
									<h3>
										<span className="student-widget-badge student-widget-badge-required">Obligatoriu</span>
										Cursuri Obligatorii
									</h3>
									<p className="student-widget-subtitle">Finalizează aceste cursuri pentru a-ți îndeplini responsabilitățile</p>
								</div>
								<span className="student-widget-count student-widget-count-urgent">{mandatoryCourses.length}</span>
							</div>
							<div className="student-widget-content">
								<div className="student-active-courses-grid">
									{mandatoryCourses.map((course) => (
										<CourseProgressWidget key={course.id} course={course} isMandatory={true} />
									))}
								</div>
							</div>
						</div>
					)}

					{/* Cursuri - non-mandatory courses, or empty state when no courses */}
					{(() => {
						const otherCourses = active_courses.filter(c => !(c.is_mandatory === true || c.pivot?.is_mandatory === true));
						if (otherCourses.length === 0 && active_courses.length > 0) return null; // only mandatory, no second section
						return (
							<div className="student-widget student-active-courses-widget">
								<div className="student-widget-header">
									<div>
										<h3>Cursuri</h3>
										<p className="student-widget-subtitle">Continuă dezvoltarea profesională</p>
									</div>
									<span className="student-widget-count">{otherCourses.length || active_courses.length}</span>
								</div>
								<div className="student-widget-content">
									{active_courses.length === 0 ? (
										<div className="student-widget-empty-state">
											<div className="student-widget-empty-icon">📚</div>
											<p className="student-widget-empty">Nu ai cursuri active momentan.</p>
											<button 
												className="student-btn student-btn-primary"
												onClick={() => navigate('/courses')}
											>
												Explorează Cursuri
											</button>
										</div>
									) : (
										<div className="student-active-courses-grid">
											{otherCourses.map((course) => (
												<CourseProgressWidget key={course.id} course={course} />
											))}
										</div>
									)}
								</div>
							</div>
						);
					})()}
				</div>

				{/* Right Column */}
				<div className="student-dashboard-right">
					{/* Incomplete Lessons */}
					<IncompleteLessonsWidget lessons={incomplete_lessons} />

					{/* Pending Exams */}
					<PendingExamsWidget exams={pending_exams} />
				</div>
			</div>
		</div>
	);
};

export default DashboardPage;
