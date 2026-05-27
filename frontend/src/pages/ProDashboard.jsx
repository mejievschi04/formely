import React from 'react';
import { NavLink } from 'react-router-dom';
import StatCard from '../components/ui/StatCard';
import ProgressChart from '../components/ui/ProgressChart';
import CourseCard from '../components/ui/CourseCard';

const sampleStats = [
	{ title: 'Progres curs', value: '62%', subtitle: 'Progres total', icon: '📈' },
	{ title: 'Teste finalizate', value: '18', subtitle: 'Ultimele 30 zile', icon: '✅' },
	{ title: 'Recomandate', value: '5', subtitle: 'Bazat pe interese', icon: '💡' },
	{ title: 'Timp învățare', value: '24h', subtitle: 'Luna aceasta', icon: '⏱️' },
];

const sampleCourses = [
	{ id: 1, title: 'Modern JS Patterns', instructor: 'Jane Doe', image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=1400&auto=format&fit=crop&crop=faces', category: 'Development', progress: 62, popularity: 4.5, trend: [10, 30, 50, 62] },
	{ id: 2, title: 'Design Systems 101', instructor: 'John Smith', image: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=1400&auto=format&fit=crop&crop=faces', category: 'Design', progress: 0, popularity: 4.8, trend: [0, 0, 10, 0] },
	{ id: 3, title: 'UX Writing', instructor: 'Alex Roe', image: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?q=80&w=1400&auto=format&fit=crop&crop=faces', category: 'Design', progress: 42, popularity: 4.1, trend: [20, 30, 40, 42] }
];

const ProDashboard = () => {
	const handleStart = (course) => {
		console.log('Start course', course);
		// Example: navigate to /courses/:id
	};

	return (
		<div className="pro-page">
			<aside className="pro-sidebar" aria-label="Navigare principală">
				<div className="pro-brand">Formely</div>
				<nav className="pro-nav">
					<NavLink to="/pro-dashboard" end className={({ isActive }) => `pro-nav-item${isActive ? ' active' : ''}`}>Panou Pro</NavLink>
					<NavLink to="/courses" className={({ isActive }) => `pro-nav-item${isActive ? ' active' : ''}`}>Cursuri</NavLink>
					<NavLink to="/events" className={({ isActive }) => `pro-nav-item${isActive ? ' active' : ''}`}>Evenimente</NavLink>
					<NavLink to="/messages" className={({ isActive }) => `pro-nav-item${isActive ? ' active' : ''}`}>Mesagerie</NavLink>
					<NavLink to="/exam-results" className={({ isActive }) => `pro-nav-item${isActive ? ' active' : ''}`}>Rezultate teste</NavLink>
					<NavLink to="/profile" className={({ isActive }) => `pro-nav-item${isActive ? ' active' : ''}`}>Profil</NavLink>
					<NavLink to="/pro-courses" className={({ isActive }) => `pro-nav-item${isActive ? ' active' : ''}`}>Demo catalog</NavLink>
				</nav>
			</aside>

			<main className="pro-main">
				<header className="pro-hero">
					<div>
						<h1 className="pro-title">Bine ai revenit — continuă de unde ai rămas</h1>
						<p className="pro-subtitle">Profilul tău personalizat cu statistici rapide</p>
					</div>
					<div className="pro-hero-stats">
						{sampleStats.map((s) => (
							<StatCard key={s.title} {...s} />
						))}
					</div>
				</header>

				<section className="pro-section">
					<div className="pro-section-row">
						<div className="pro-card">
							<h3>Progres săptămânal</h3>
							<ProgressChart data={[20, 30, 40, 50, 62]} />
						</div>

						<div className="pro-card">
							<h3>Recomandate pentru tine</h3>
							<div className="pro-course-grid">
								{sampleCourses.map(c => <CourseCard key={c.id} course={c} onStart={handleStart} />)}
							</div>
						</div>
					</div>
				</section>
			</main>
		</div>
	);
};

export default ProDashboard;
