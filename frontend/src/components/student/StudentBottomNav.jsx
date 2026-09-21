import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	BookOpenText,
	CheckCircle,
	ListBullets,
	UserCircle,
} from '@phosphor-icons/react';
import './StudentBottomNav.css';

function isCoursesTabActive(pathname) {
	return pathname === '/courses' || pathname.startsWith('/courses/map');
}

function isResultsTabActive(pathname) {
	return (
		pathname === '/exam-results'
		|| pathname.startsWith('/exam-results/')
		|| pathname === '/catalog-exam-results'
		|| pathname.startsWith('/catalog-exam-results/')
	);
}

function BottomNavItem({ active, icon: Icon, label, onClick, current }) {
	return (
		<button
			type="button"
			className={`student-bottom-nav__item${active ? ' is-active' : ''}`}
			aria-current={current ? 'page' : undefined}
			onClick={onClick}
		>
			<Icon size={22} weight="regular" aria-hidden />
			<span>{label}</span>
		</button>
	);
}

export default function StudentBottomNav({
	onOpenMenu,
}) {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const coursesActive = isCoursesTabActive(pathname);
	const resultsActive = isResultsTabActive(pathname);
	const profileActive = pathname === '/profile' || pathname.startsWith('/profile/');

	return (
		<nav className="student-bottom-nav" aria-label="Navigare principală">
			<BottomNavItem
				active={coursesActive}
				current={coursesActive}
				icon={BookOpenText}
				label="Cursuri"
				onClick={() => navigate('/courses')}
			/>
			<BottomNavItem
				active={resultsActive}
				current={resultsActive}
				icon={CheckCircle}
				label="Rezultate"
				onClick={() => navigate('/exam-results')}
			/>
			<BottomNavItem
				active={profileActive}
				current={profileActive}
				icon={UserCircle}
				label="Profil"
				onClick={() => navigate('/profile')}
			/>
			<BottomNavItem
				icon={ListBullets}
				label="Meniu"
				onClick={onOpenMenu}
			/>
		</nav>
	);
}
