import React, { lazy, Suspense, useState, useEffect, useLayoutEffect, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { BrowserRouter as Router, Routes, Route, NavLink, Link, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth, AuthContext } from './contexts/AuthContext';
import { CompanyBrandingProvider, useCompanyBranding } from './contexts/CompanyBrandingContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import AdminRoute from './components/AdminRoute';
import UserRoute from './components/UserRoute';
import FeatureRoute from './components/FeatureRoute';
import ChangePasswordModal from './components/ChangePasswordModal';
import LoadingOverlay from './components/LoadingOverlay';
import { authExperienceElement } from './components/auth/AuthExperience';
import GlobalSearch from './components/GlobalSearch';
import AdminTopNavControls from './components/admin/AdminTopNavControls';
import AdminViewSwitcher from './components/admin/AdminViewSwitcher';
import StudentTopNavNotifications from './components/student/StudentTopNavNotifications';
import AdminStylesLoader from './components/AdminStylesLoader';
import ErrorBoundary from './components/common/ErrorBoundary';
import ScrollToTop from './components/common/ScrollToTop';
import AdminOnboardingBanner from './components/admin/AdminOnboardingBanner';
import StudentBottomNav from './components/student/StudentBottomNav';
import { prefetchRoute } from './utils/prefetch';
import { toImageUrl } from './utils/imageUrl';
import { isStaffAdminRole, getRoleLabel } from './constants/staffRoles';
import {
	ArrowLeft,
	BookOpenText,
	Books,
	CalendarDots,
	CaretDown,
	ChartLineUp,
	CheckCircle,
	GearSix,
	House,
	ListBullets,
	Medal,
	SignOut,
	X,
	SquaresFour,
	TreeStructure,
	Users,
	UserCircle,
} from '@phosphor-icons/react';
import { companyHasFeature, isPlatformAdmin } from './utils/entitlements';
import { canUseAiFeature } from './utils/aiAvailability';
/* Modern Design System - Unified & Standardized */
import './styles/design-system.css';
import './styles/light-theme-wcag.css';
import './styles/dark-theme.css';
import './styles/unified-cards.css';
import './styles/components.css';
import './styles/button-modern.css';
import './styles/common-patterns.css';
import './styles/micro-interactions.css';
import './styles/empty-states.css';
import './styles/loading-states.css';
import './styles/toast-system.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/ui-components.css';
import './styles/additional-pages.css';
import './styles/exam-results-modern.css';
import './styles/profile-modern.css';
import './styles/student-settings.css';
import './styles/lms-dashboard-enterprise.css';
import './styles/achievements-modern.css';
import './styles/library-page.css';
import './styles/library-reader-page.css';
import './styles/library-compose-page.css';
import './components/SplashScreen.css';
/* Student styles - loaded after shared to ensure proper cascade */
import './styles/student-navigation-modern.css';
import './styles/admin-view-switcher.css';
import './styles/student-components.css';
import './styles/student-overrides.css';
import './styles/common-components.css';
import './styles/auth-modern.css';
import './styles/course-detail-modern.css';
import './styles/builder-overrides.css';
import './components/auth/AuthExperience.css';
/* Mobile optimizations must be last to override base styles */
import './styles/mobile-optimizations.css';

// Lazy load pages for code splitting
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CoursesPage = lazy(() => import('./pages/CoursesPage'));
const CourseMapPage = lazy(() => import('./pages/CourseMapPage'));
const QuizPage = lazy(() => import('./pages/QuizPage'));
const ExamPage = lazy(() => import('./pages/ExamPage'));
const AchievementsPage = lazy(() => import('./pages/AchievementsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const StudentActivityPage = lazy(() => import('./pages/StudentActivityPage'));
const StudentSettingsPage = lazy(() => import('./pages/StudentSettingsPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const EventDetailPage = lazy(() => import('./pages/EventDetailPage'));
const ExamResultsPage = lazy(() => import('./pages/ExamResultsPage'));
const CatalogExamResultsPage = lazy(() => import('./pages/CatalogExamResultsPage'));
const AiAssistantWidget = lazy(() => import('./components/ai/AiAssistantWidget'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminAnalyticsPage = lazy(() => import('./pages/admin/AdminAnalyticsPage'));
const AdminCoursesPage = lazy(() => import('./pages/admin/AdminCoursesPage'));
const AdminCourseDetailPage = lazy(() => import('./pages/admin/AdminCourseDetailPage'));
const AdminEventsPage = lazy(() => import('./pages/admin/AdminEventsPage'));
const AdminTeamsPage = lazy(() => import('./pages/admin/AdminTeamsPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminInviteUsersPage = lazy(() => import('./pages/admin/AdminInviteUsersPage'));
const AdminActivityLogsPage = lazy(() => import('./pages/admin/AdminActivityLogsPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));
const AdminStatisticsHubPage = lazy(() => import('./pages/admin/AdminStatisticsHubPage'));
const AdminTopCoursesPage = lazy(() => import('./pages/admin/AdminTopCoursesPage'));
const AdminProblematicCoursesPage = lazy(() => import('./pages/admin/AdminProblematicCoursesPage'));
const AdminAlertsPage = lazy(() => import('./pages/admin/AdminAlertsPage'));
const AdminTasksPage = lazy(() => import('./pages/admin/AdminTasksPage'));
const AdminActivityPage = lazy(() => import('./pages/admin/AdminActivityPage'));
const ModuleCreatorPage = lazy(() => import('./pages/admin/ModuleCreatorPage'));
const LessonCreatorPage = lazy(() => import('./pages/admin/LessonCreatorPage'));
// const CourseCreatorPage = lazy(() => import('./pages/admin/CourseCreatorPage')); // Removed - will be rebuilt from scratch
// const AdminCourseEditPage = lazy(() => import('./pages/admin/AdminCourseEditPage')); // Removed - will be rebuilt from scratch
const CourseCreationPage = lazy(() => import('./pages/admin/CourseCreationPage'));
const AdminCourseBuilderPage = lazy(() => import('./pages/admin/AdminCourseBuilderPage'));
const AdminQuestionBanksPage = lazy(() => import('./pages/admin/AdminQuestionBanksPage'));
const AdminQuestionBankFolderDetailsPage = lazy(() => import('./pages/admin/AdminQuestionBankFolderDetailsPage'));
const AdminContentPage = lazy(() => import('./pages/admin/AdminContentPage'));
const AdminTestsPendingReviewsPage = lazy(() => import('./pages/admin/AdminTestsPendingReviewsPage'));
const AdminTestBuilderPage = lazy(() => import('./pages/admin/AdminTestBuilderPage'));
// const AdminQuestionBankQuestionsPage = lazy(() => import('./pages/admin/AdminQuestionBankQuestionsPage')); // Removed - will be rebuilt from scratch
const QuestionBankBuilder = lazy(() => import('./components/admin/question-banks/QuestionBankBuilder'));
const CompletedCoursesPage = lazy(() => import('./pages/CompletedCoursesPage'));
const LessonsPage = lazy(() => import('./pages/LessonsPage'));
const LessonPage = lazy(() => import('./pages/LessonPage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const LibraryComposePage = lazy(() => import('./pages/LibraryComposePage'));
const LibraryReaderPage = lazy(() => import('./pages/LibraryReaderPage'));

// Loading component (post-login: no full-screen overlay)
const PageLoader = () => (
	<div className="va-main" style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
		<p>Se încarcă...</p>
	</div>
);

function ProtectedRoute({ children }) {
	const { user, loading } = useAuth();

	if (loading) {
		return null;
	}

	if (!user) {
		return <Navigate to="/login" replace />;
	}

	return children;
}

function RedirectDetailToCourse() {
	const { courseId } = useParams();
	return <Navigate to={`/courses/${courseId}`} replace />;
}

function isStudentLessonPath(pathname) {
	return /^\/courses\/(?!map(?:\/|$))[^/]+$/.test(pathname);
}

/** Rolul afișat în badge-ul din topnav (cont real, nu modul de vizualizare admin/student). */
function getTopnavStaffRoleLabel(user, isStudentPreviewMode) {
	if (!user) return '';
	if (isStudentPreviewMode) return 'Cursant';
	return getRoleLabel(user.actualRole ?? user.role);
}

/** Compat Volta: /register/invite/:token → fluxul Formely /accept-invite?token= */
function RedirectInviteRegister() {
	const { token } = useParams();
	const query = token ? `?token=${encodeURIComponent(token)}` : '';
	return <Navigate to={`/accept-invite${query}`} replace />;
}

function Layout({ children }) {
	const authContext = useContext(AuthContext);
	
	if (!authContext) {
		// Context not available yet, show loading
		return (
			<div className="va-main" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
				<p>Se încarcă...</p>
			</div>
		);
	}
	const { user, logout, setAdminViewMode, adminViewMode } = authContext;
	const { branding } = useCompanyBranding();
	const companyName = branding?.name || 'Formely';
	const navigate = useNavigate();
	const location = useLocation();

	if (isPlatformAdmin(user)) {
		window.location.href = import.meta.env.VITE_BACKOFFICE_URL || 'http://localhost:5180';
		return (
			<div className="va-main" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
				<p>Redirecționare către backoffice…</p>
			</div>
		);
	}
	const isAdminContentSubmenuChildActive = React.useCallback(
		(child) => {
			if (location.pathname.startsWith('/admin/maps/')) {
				if (child.path !== '/admin/content') return false;
				const childParams = new URLSearchParams(child.search || '');
				if (childParams.get('tab') !== 'courses') return false;
				const childView = childParams.get('view');
				if (childView === 'maps') return true;
				if (!childView && user?.actualRole === 'instructor') return true;
				return false;
			}
			const childTab = child.search ? new URLSearchParams(child.search).get('tab') : null;
			const currentTab = new URLSearchParams(location.search).get('tab');
			return location.pathname === child.path && (!childTab || currentTab === childTab);
		},
		[location.pathname, location.search, user?.actualRole]
	);
	const isTrueAdminAccount = ['admin', 'company_owner'].includes(
		user?.actualRole ?? user?.role
	);
	const hasStaffAdminShell = isStaffAdminRole(user?.actualRole);
	const isAdmin = ['admin', 'company_owner'].includes(user?.role);
	
	const isLibraryPage = location.pathname === '/library'
		|| location.pathname.startsWith('/library/items/')
		|| location.pathname.startsWith('/library/compose');
	const isLibraryReaderPage = location.pathname.startsWith('/library/items/');
	const isAdminPage = location.pathname.startsWith('/admin');
	const isStaffLibraryPage = isLibraryPage
		&& hasStaffAdminShell
		&& user?.role !== 'student'
		&& adminViewMode !== 'student';
	const isAdminShellPage = isAdminPage || isStaffLibraryPage;
	const isUserPage = !isAdminShellPage;
	const isStudent = !isAdmin || (user?.role === 'student' || !user?.role || user?.role === '');
	// Cont admin + mod student: shell admin cât timp URL e /admin* (evită topnav peste conținut admin înainte de redirect).
	const showUserLayout = !hasStaffAdminShell
		? isStudent
			? true
			: !isAdminShellPage
		: !isAdminShellPage;

	// Overlay doar în mod admin efectiv (nu resetăm „ready” la trecere student pe același frame).
	const requiresAdminChromePaintHold =
		isTrueAdminAccount && ['admin', 'company_owner'].includes(user?.actualRole ?? user?.role) && !showUserLayout;
	const [adminChromePaintReady, setAdminChromePaintReady] = React.useState(
		!requiresAdminChromePaintHold
	);
	// Doar dezactivăm overlay-ul când nu mai e nevoie de hold. NU setăm false aici când hold e true —
	// același tick, efectul poate rula după AdminStylesLoader.onReady și anulează true → spinner infinit.
	React.useEffect(() => {
		if (!requiresAdminChromePaintHold) {
			setAdminChromePaintReady(true);
		}
	}, [requiresAdminChromePaintHold]);
	
	// State for admin view toggle (active when on admin page or messages from admin)
	const [isSidebarExpanded, setIsSidebarExpanded] = React.useState(() => {
		const saved = localStorage.getItem('sidebarExpanded');
		return saved !== null ? saved === 'true' : false;
	});
	const prevShowUserLayoutRef = React.useRef(null);
	React.useEffect(() => {
		const prev = prevShowUserLayoutRef.current;
		if (prev !== null && showUserLayout && !prev) {
			setIsSidebarExpanded(false);
			document.body.classList.remove('sidebar-expanded');
		}
		prevShowUserLayoutRef.current = showUserLayout;
	}, [showUserLayout]);

	// Submeniul "Cursuri, Teste & Bănci" se deschide doar la click pe parent
	const [contentSubmenuOpen, setContentSubmenuOpen] = React.useState(false);
	const adminContentNavGroupRef = React.useRef(null);
	const adminContentFlyoutPortalRef = React.useRef(null);
	const [contentFlyoutPos, setContentFlyoutPos] = React.useState({ top: 0, left: 0 });

	const updateContentFlyoutPosition = React.useCallback(() => {
		const root = adminContentNavGroupRef.current;
		if (!root) return;
		const btn = root.querySelector('button.modern-nav-group-label');
		if (!btn) return;
		const r = btn.getBoundingClientRect();
		const gap = 10;
		const menuW = 200;
		let left = r.right + gap;
		if (left + menuW > window.innerWidth - 12) {
			left = Math.max(12, window.innerWidth - menuW - 12);
		}
		setContentFlyoutPos({ top: r.top, left });
	}, []);

	useLayoutEffect(() => {
		if (!contentSubmenuOpen || isSidebarExpanded) return;
		updateContentFlyoutPosition();
		const onWin = () => updateContentFlyoutPosition();
		window.addEventListener('resize', onWin);
		window.addEventListener('scroll', onWin, true);
		return () => {
			window.removeEventListener('resize', onWin);
			window.removeEventListener('scroll', onWin, true);
		};
	}, [contentSubmenuOpen, isSidebarExpanded, updateContentFlyoutPosition]);

	React.useEffect(() => {
		if (!contentSubmenuOpen || isSidebarExpanded) return;
		const close = () => setContentSubmenuOpen(false);
		const onDown = (e) => {
			if (adminContentNavGroupRef.current?.contains(e.target)) return;
			if (adminContentFlyoutPortalRef.current?.contains(e.target)) return;
			close();
		};
		const onKey = (e) => {
			if (e.key === 'Escape') close();
		};
		document.addEventListener('mousedown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	}, [contentSubmenuOpen, isSidebarExpanded]);

	// Detect mobile viewport
	const [isMobile, setIsMobile] = React.useState(() =>
		typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false
	);
	const [adminTopnavContext, setAdminTopnavContext] = React.useState(null);
	const [lessonCourseTitle, setLessonCourseTitle] = React.useState('');
	
	React.useEffect(() => {
		const mq = window.matchMedia('(max-width: 768px)');
		const handleChange = () => setIsMobile(mq.matches);
		handleChange();
		mq.addEventListener('change', handleChange);
		return () => mq.removeEventListener('change', handleChange);
	}, []);

	React.useEffect(() => {
		if (isMobile) {
			setIsSidebarExpanded(false);
			document.body.classList.remove('sidebar-expanded');
		}
	}, [isMobile, location.pathname]);

	React.useEffect(() => {
		const handleTopnavContextEvent = (event) => {
			const detail = event?.detail || null;
			if (!detail || detail?.visible === false) {
				setAdminTopnavContext(null);
				return;
			}
			setAdminTopnavContext(detail);
		};
		window.addEventListener('admin-topnav-context', handleTopnavContextEvent);
		return () => window.removeEventListener('admin-topnav-context', handleTopnavContextEvent);
	}, []);

	React.useEffect(() => {
		const handleLessonCourseTitle = (event) => {
			setLessonCourseTitle(typeof event?.detail === 'string' ? event.detail : '');
		};
		window.addEventListener('formely-lesson-course-title', handleLessonCourseTitle);
		return () => window.removeEventListener('formely-lesson-course-title', handleLessonCourseTitle);
	}, []);

	React.useEffect(() => {
		if (!/^\/courses\/(?!map(?:\/|$))[^/]+$/.test(location.pathname)) {
			setLessonCourseTitle('');
		}
	}, [location.pathname]);

	React.useEffect(() => {
		if (!location.pathname.startsWith('/admin/course-builder')) {
			setAdminTopnavContext(null);
		}
	}, [location.pathname]);

	const isStudentPreviewMode = isTrueAdminAccount
		&& showUserLayout
		&& (adminViewMode === 'student' || sessionStorage.getItem('studentPreviewFromAdmin') === 'true');

	const topnavStaffRoleLabel = getTopnavStaffRoleLabel(user, isStudentPreviewMode);

	const handleAdminViewSwitch = useCallback(() => {
		if (isUserPage) {
			sessionStorage.removeItem('studentPreviewFromAdmin');
			setAdminViewMode('admin');
			navigate('/admin', { replace: true });
		} else {
			sessionStorage.setItem('studentPreviewFromAdmin', 'true');
			setAdminViewMode('student');
			navigate('/courses', { replace: true });
		}
	}, [isUserPage, setAdminViewMode, navigate]);
	
	// Save sidebar state to localStorage and update body class
	React.useEffect(() => {
		localStorage.setItem('sidebarExpanded', isSidebarExpanded.toString());
		// Add class to body for CSS targeting
		if (isSidebarExpanded) {
			document.body.classList.add('sidebar-expanded');
		} else {
			document.body.classList.remove('sidebar-expanded');
		}
		return () => {
			document.body.classList.remove('sidebar-expanded');
		};
	}, [isSidebarExpanded]);

	// Admin-only layout styling hooks (avoid impacting student UI)
	React.useEffect(() => {
		const isAdminLayoutActive = !showUserLayout && hasStaffAdminShell;
		document.body.classList.toggle('admin-view', isAdminLayoutActive);
		return () => {
			document.body.classList.remove('admin-view');
		};
	}, [showUserLayout, hasStaffAdminShell]);

	React.useEffect(() => {
		const useBottomNav = Boolean(showUserLayout && isMobile && user);
		document.body.classList.toggle('student-has-bottom-nav', useBottomNav);
		return () => {
			document.body.classList.remove('student-has-bottom-nav');
		};
	}, [showUserLayout, isMobile, user]);
	
	// Check must_change_password - handle boolean, number, or string values
	const mustChangePassword = user?.must_change_password === true || 
		user?.must_change_password === 1 || 
		user?.must_change_password === '1' ||
		user?.must_change_password === 'true' ||
		user?.must_change_password === true;
	
	// Determine courses path based on user role and current view
	// All users use /courses (which redirects appropriately based on role)
	const coursesPath = '/courses';

	/* Ordine aliniată cu LMS Pro (Formely): Cursuri → Evenimente → … → Profil la final */
	const navItems = [
		{ 
			path: '/courses', 
			label: 'Cursuri',
			title: 'Mape (parcursuri) și examene independente pe aceeași pagină. Testele din curs se deschid din curs.',
			icon: (
				<BookOpenText size={20} weight="duotone" aria-hidden />
			)
		},
		{
			path: '/exam-results',
			label: 'Rezultate',
			title: 'Rezultate teste din cursuri și examene din catalog',
			matchPaths: ['/exam-results', '/catalog-exam-results'],
			prefetchPaths: ['/exam-results', '/catalog-exam-results'],
			icon: (
				<CheckCircle size={20} weight="duotone" aria-hidden />
			),
		},
		...(companyHasFeature(user, 'events')
			? [{
				path: '/events',
				label: 'Evenimente',
				icon: (
					<CalendarDots size={20} weight="duotone" aria-hidden />
				),
			}]
			: []),
		...(companyHasFeature(user, 'library')
			? [{
				path: '/library',
				label: 'Bibliotecă',
				title: 'Materiale partajate: cărți, PDF-uri și documente',
				icon: (
					<Books size={20} weight="duotone" aria-hidden />
				),
			}]
			: []),
		{ 
			path: '/profile', 
			label: 'Profil', 
			icon: (
				<UserCircle size={20} weight="duotone" aria-hidden />
			)
		},
		{
			path: '/settings',
			label: 'Setări',
			icon: (
				<GearSix size={20} weight="duotone" aria-hidden />
			)
		},
	];

	const isStudentNavItemActive = useCallback((item, pathname, linkActive) => {
		if (item.path === '/exam-results' || item.matchPaths?.includes('/exam-results')) {
			return pathname === '/exam-results'
				|| pathname.startsWith('/exam-results/')
				|| pathname === '/catalog-exam-results'
				|| pathname.startsWith('/catalog-exam-results/');
		}
		if (item.path === '/courses') {
			return pathname === '/courses' || pathname.startsWith('/courses/map');
		}
		if (item.matchPaths?.length) {
			return item.matchPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
		}
		if (linkActive) return true;
		return pathname === item.path || pathname.startsWith(`${item.path}/`);
	}, []);

	const mobileTopnavTitle = React.useMemo(() => {
		const pathname = location.pathname;
		const navMatch = navItems.find((item) => isStudentNavItemActive(item, pathname, false));
		if (navMatch) return navMatch.label;
		if (/^\/courses\/(?!map(?:\/|$))[^/]+$/.test(pathname)) return lessonCourseTitle || 'Curs';
		if (pathname.startsWith('/lessons') || /\/lesson(s)?(\/|$)/.test(pathname)) return lessonCourseTitle || 'Lecții';
		if (pathname.startsWith('/exams/')) return 'Test';
		if (pathname.startsWith('/achievements')) return 'Realizări';
		return companyName;
	}, [location.pathname, companyName, lessonCourseTitle, navItems]);

	/* Admin academie: conținut & evenimente, apoi oameni, activitate, analize, setări */
	const academyAdminNavItemsAll = [
		{
			path: '/admin',
			label: 'Panou',
			icon: (
				<House size={18} weight="duotone" aria-hidden />
			)
		},
		{
			path: '/admin/content',
			label: 'Content',
			icon: (
				<SquaresFour size={18} weight="duotone" aria-hidden />
			),
			children:
				user?.actualRole === 'instructor'
					? [
						{ path: '/admin/content', search: '?tab=courses', label: 'Cursuri' },
						{ path: '/admin/content', search: '?tab=tests', label: 'Teste' },
						{ path: '/admin/content', search: '?tab=exams', label: 'Examene' },
						{ path: '/admin/content', search: '?tab=manual-review', label: 'Verificare manuală' },
						{ path: '/admin/content', search: '?tab=banks', label: 'Întrebări' },
					]
					: [
						{ path: '/admin/content', search: '?tab=courses&view=maps', label: 'Cursuri' },
						{ path: '/admin/content', search: '?tab=tests', label: 'Teste' },
						{ path: '/admin/content', search: '?tab=exams', label: 'Examene' },
						{ path: '/admin/content', search: '?tab=manual-review', label: 'Verificare manuală' },
						{ path: '/admin/content', search: '?tab=banks', label: 'Întrebări' },
					],
		},
		...(companyHasFeature(user, 'events')
			? [{
				path: '/admin/events',
				label: 'Evenimente',
				icon: (
					<CalendarDots size={18} weight="duotone" aria-hidden />
				)
			}]
			: []),
		{
			path: '/admin/users',
			label: 'Utilizatori',
			icon: (
				<Users size={18} weight="duotone" aria-hidden />
			)
		},
		{
			path: '/admin/teams',
			label: 'Organizație',
			icon: (
				<TreeStructure size={18} weight="duotone" aria-hidden />
			)
		},
		{
			path: '/admin/activity-logs',
			label: 'Activitate elevi',
			icon: (
				<ListBullets size={18} weight="duotone" aria-hidden />
			)
		},
		{
			path: '/admin/statistics',
			label: 'Statistică',
			icon: (
				<ChartLineUp size={18} weight="duotone" aria-hidden />
			)
		},
		...(companyHasFeature(user, 'library')
			? [{
				path: '/library',
				label: 'Bibliotecă',
				icon: (
					<Books size={18} weight="duotone" aria-hidden />
				),
			}]
			: []),
		{
			path: '/admin/settings',
			label: 'Setări',
			icon: (
				<GearSix size={18} weight="duotone" aria-hidden />
			)
		},
	];
	const adminNavItemsAll = academyAdminNavItemsAll;
	const instructorHiddenAdminNavPaths = new Set([
		'/admin/events',
		'/admin/teams',
		'/admin/users',
		'/admin/activity-logs',
		'/admin/statistics',
		'/admin/settings',
	]);
	const adminNavItems =
		user?.actualRole === 'instructor'
			? adminNavItemsAll.filter((item) => !instructorHiddenAdminNavPaths.has(item.path))
			: adminNavItemsAll;
	const adminContentSubmenuChildren = adminNavItems.find((i) => i.children)?.children ?? [];

	if (isLibraryReaderPage) {
		return (
			<div className="va-library-reader-shell">
				{mustChangePassword && <ChangePasswordModal />}
				{children}
			</div>
		);
	}

	return (
		<div className={`${showUserLayout ? "va-shell va-shell-topnav" : "va-shell"} ${isStudentPreviewMode ? "student-preview-mode" : ""}`}>
			<AdminStylesLoader
				loadOnAdminPagesOnly={true}
				waitForStylesBeforePaint={requiresAdminChromePaintHold}
				onArmHold={() => setAdminChromePaintReady(false)}
				onReady={() => setAdminChromePaintReady(true)}
			/>
			{requiresAdminChromePaintHold && !adminChromePaintReady && (
				<div
					className="va-admin-chrome-loading-overlay"
					role="status"
					aria-live="polite"
					aria-busy="true"
					aria-label="Se încarcă interfața"
				>
					<div className="va-spinner va-spinner-lg" aria-hidden />
					<p className="va-admin-chrome-loading-text">Se încarcă interfața…</p>
				</div>
			)}
			{mustChangePassword && (
				<ChangePasswordModal />
			)}
			
			{!showUserLayout && hasStaffAdminShell ? (
				// Admin keeps sidebar layout with top navigation
				<>
					{/* Backdrop overlay for mobile */}
					{isSidebarExpanded && (
						<div 
							className="sidebar-backdrop"
							onClick={() => setIsSidebarExpanded(false)}
							aria-hidden="true"
						/>
					)}
					
					<aside
						className={['modern-sidebar', 'va-sidebar', isSidebarExpanded ? 'expanded open' : ''].filter(Boolean).join(' ')}
					>
						<div className="modern-sidebar-brand va-sidebar-brand">
							<button
								type="button"
								className="modern-sidebar-logo-toggle va-sidebar-logo-toggle"
								onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
								title={isSidebarExpanded ? 'Restrânge meniul' : 'Extinde meniul'}
								aria-expanded={isSidebarExpanded}
								aria-label={isSidebarExpanded ? 'Restrânge meniul' : 'Extinde meniul'}
							>
								<img
									className="modern-sidebar-logo-img"
									src="/logo.png"
									alt="Formely"
								/>
							</button>
							{isSidebarExpanded && (
								<span className="modern-sidebar-brand-text">{companyName}</span>
							)}
						</div>

						<nav className="modern-nav va-sidebar-nav">
							<div className="va-sidebar-nav-scroll">
								{adminNavItems
									.filter((item) => item.path !== '/admin/settings')
									.map((item) =>
										item.children ? (
											<div
												key={item.path}
												ref={adminContentNavGroupRef}
												className="modern-nav-group va-nav-group"
											>
												{isSidebarExpanded ? (
													<button
														type="button"
														className={`modern-nav-item modern-nav-group-label va-nav-btn ${contentSubmenuOpen ? 'submenu-open' : ''}`}
														aria-expanded={contentSubmenuOpen}
														aria-haspopup="true"
														data-tooltip={undefined}
														onClick={() => setContentSubmenuOpen((o) => !o)}
														onMouseEnter={() => prefetchRoute(item.path)}
													>
														<span className="modern-nav-item-icon va-nav-icon">{item.icon}</span>
														<span className="modern-nav-item-label va-nav-label">{item.label}</span>
														<span className="modern-nav-submenu-chevron" aria-hidden>
															<CaretDown size={14} weight="bold" aria-hidden />
														</span>
													</button>
												) : (
													<button
														type="button"
														className={`modern-nav-item modern-nav-group-label va-nav-btn ${contentSubmenuOpen ? 'submenu-open' : ''}`}
														aria-expanded={contentSubmenuOpen}
														aria-haspopup="true"
														data-tooltip={contentSubmenuOpen ? undefined : item.label}
														title={contentSubmenuOpen ? undefined : item.label}
														onClick={() => setContentSubmenuOpen((o) => !o)}
														onMouseEnter={() => {
															item.children.forEach((c) => prefetchRoute(c.path));
														}}
													>
														<span className="modern-nav-item-icon va-nav-icon">{item.icon}</span>
														<span className="modern-nav-item-label va-nav-label">{item.label}</span>
													</button>
												)}
												{contentSubmenuOpen && isSidebarExpanded && (
													<div className="modern-nav-submenu">
														{item.children.map((child) => {
															const isChildActive = isAdminContentSubmenuChildActive(child);
															return (
																<Link
																	key={child.path + (child.search || '')}
																	to={{ pathname: child.path, search: child.search || '' }}
																	className={['modern-nav-item', 'modern-nav-subitem', 'va-nav-btn', isChildActive ? 'active is-active' : ''].join(' ').trim()}
																	aria-current={isChildActive ? 'page' : undefined}
																	onMouseEnter={() => prefetchRoute(child.path)}
																	onClick={() => {
																		setContentSubmenuOpen(false);
																		if (window.matchMedia('(max-width: 768px)').matches) setIsSidebarExpanded(false);
																	}}
																>
																	<span className="modern-nav-item-label va-nav-label">{child.label}</span>
																</Link>
															);
														})}
													</div>
												)}
											</div>
										) : (
											<NavLink
												key={item.path}
												to={item.path}
												title={!isSidebarExpanded ? item.label : undefined}
												data-tooltip={!isSidebarExpanded ? item.label : undefined}
												className={({ isActive }) => ['modern-nav-item', 'va-nav-btn', isActive ? 'active is-active' : ''].join(' ').trim()}
												end={item.path === '/admin' || item.path === '/admin/platform'}
												onMouseEnter={() => prefetchRoute(item.path)}
												onClick={() => {
													if (window.matchMedia('(max-width: 768px)').matches) setIsSidebarExpanded(false);
												}}
											>
												<span className="modern-nav-item-icon va-nav-icon">{item.icon}</span>
												<span className="modern-nav-item-label va-nav-label">{item.label}</span>
											</NavLink>
										)
									)}
							</div>
							{adminNavItems.some((i) => i.path === '/admin/settings') && (
								<div className="va-sidebar-nav-bottom">
									{adminNavItems
										.filter((i) => i.path === '/admin/settings')
										.map((item) => (
											<NavLink
												key={item.path}
												to={item.path}
												title={!isSidebarExpanded ? item.label : undefined}
												data-tooltip={!isSidebarExpanded ? item.label : undefined}
												className={({ isActive }) => ['modern-nav-item', 'va-nav-btn', isActive ? 'active is-active' : ''].join(' ').trim()}
												end={false}
												onMouseEnter={() => prefetchRoute(item.path)}
												onClick={() => {
													if (window.matchMedia('(max-width: 768px)').matches) setIsSidebarExpanded(false);
												}}
											>
												<span className="modern-nav-item-icon va-nav-icon">{item.icon}</span>
												<span className="modern-nav-item-label va-nav-label">{item.label}</span>
											</NavLink>
										))}
								</div>
							)}
						</nav>

						{!isSidebarExpanded &&
							contentSubmenuOpen &&
							adminContentSubmenuChildren.length > 0 &&
							createPortal(
								<div
									ref={adminContentFlyoutPortalRef}
									className="admin-content-submenu-portal"
									role="menu"
									aria-label="Content"
									style={{
										position: 'fixed',
										top: contentFlyoutPos.top,
										left: contentFlyoutPos.left,
										zIndex: 10050,
									}}
								>
									{adminContentSubmenuChildren.map((child) => {
										const isChildActive = isAdminContentSubmenuChildActive(child);
										return (
											<Link
												key={child.path + (child.search || '')}
												role="menuitem"
												to={{ pathname: child.path, search: child.search || '' }}
												className={[
													'modern-nav-item',
													'modern-nav-subitem',
													'va-nav-btn',
													'admin-content-submenu-portal__link',
													isChildActive ? 'active is-active' : '',
												].join(' ').trim()}
												aria-current={isChildActive ? 'page' : undefined}
												onMouseEnter={() => prefetchRoute(child.path)}
												onClick={() => {
													setContentSubmenuOpen(false);
													if (window.matchMedia('(max-width: 768px)').matches) setIsSidebarExpanded(false);
												}}
											>
												<span className="modern-nav-item-label va-nav-label">{child.label}</span>
											</Link>
										);
									})}
								</div>,
								document.body
							)}

						{/* View switcher mobil (tema e în Setări) */}
						{isMobile && isSidebarExpanded && !isPlatformAdmin(user) && (
							<div className="sidebar-mobile-controls">
								<div className="sidebar-mobile-control-item sidebar-mobile-control-item--view-switch">
									<div className="sidebar-mobile-control-content sidebar-mobile-control-content--view-switch">
										<AdminViewSwitcher
											isStudentView={isUserPage}
											onSwitch={handleAdminViewSwitch}
											variant="sidebar"
										/>
									</div>
								</div>
							</div>
						)}

						{/* Mobile Logout Button - positioned at bottom - only on mobile */}
						{isMobile && user && (
							<div className="sidebar-mobile-logout">
								<button
									onClick={logout}
									className="sidebar-mobile-logout-btn"
									title="Deconectare"
									aria-label="Deconectare"
								>
									<SignOut size={18} weight="bold" aria-hidden />
									{isSidebarExpanded && <span className="sidebar-mobile-logout-label">Deconectare</span>}
								</button>
							</div>
						)}
					</aside>

					{/* Top Navigation Bar for Admin */}
					<header className={`modern-topnav admin-topnav ${isSidebarExpanded ? 'sidebar-expanded' : ''}`}>
						<div className="modern-topnav-left">
							{/* Mobile hamburger button */}
							<button
								className="mobile-sidebar-toggle"
								onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
								title={isSidebarExpanded ? 'Închide meniul' : 'Deschide meniul'}
								aria-label={isSidebarExpanded ? 'Închide meniul' : 'Deschide meniul'}
								aria-expanded={isSidebarExpanded}
							>
								<ListBullets size={24} weight="bold" aria-hidden />
							</button>
							{!isMobile && (
								<span className="va-logo-text">
									<img className="va-logo-icon-img" src="/logo.png" alt="Formely" />
								</span>
							)}
							{adminTopnavContext && (
								<div className="admin-topnav-page-context desktop-only">
									<button
										type="button"
										className="admin-topnav-page-context-back"
										onClick={() => navigate(adminTopnavContext.backTo || '/admin/content?tab=courses&view=maps')}
									>
										<ArrowLeft size={14} weight="bold" aria-hidden /> {adminTopnavContext.backLabel || 'Înapoi'}
									</button>
									<span className="admin-topnav-page-context-title">
										{adminTopnavContext.title || ''}
									</span>
								</div>
							)}
							{/* Formely text - shown when sidebar is closed on mobile */}
							{isMobile && !isSidebarExpanded && (
								<span className="va-topnav-page-title">{companyName}</span>
							)}
						</div>
						
						<div className="modern-topnav-right">
							{/* Search and Notifications */}
							{!isPlatformAdmin(user) && <AdminTopNavControls />}

							{/* View Switcher - Desktop only */}
							{!isPlatformAdmin(user) && (
								<div className="admin-topnav-control desktop-only">
									<AdminViewSwitcher
										isStudentView={isUserPage}
										onSwitch={handleAdminViewSwitch}
									/>
								</div>
							)}

							{/* User Info */}
							{user && (
								<div className="admin-topnav-user">
									<div className="admin-topnav-user-avatar">
										{user.avatar ? (
											<img src={toImageUrl(user.avatar) || user.avatar} alt={user.name || ''} />
										) : (
											user.name
												?.split(' ')
												.map((n) => n[0])
												.join('')
												.toUpperCase() || 'A'
										)}
									</div>
									<div className="admin-topnav-user-info">
										<p className="admin-topnav-user-name">{user.name || 'Utilizator'}</p>
										<p className="admin-topnav-user-role">{topnavStaffRoleLabel}</p>
									</div>
									<button
										onClick={logout}
										className="admin-topnav-logout"
										title="Deconectare"
										aria-label="Deconectare"
									>
										<SignOut size={18} weight="bold" aria-hidden />
									</button>
								</div>
							)}
						</div>
					</header>

					<div className="va-shell-main va-shell-main-topnav">
						<main className="va-main">
							<AdminOnboardingBanner />
							{children}
						</main>
					</div>
					
				</>
			) : (
				// Regular users get modern top navigation with sidebar on mobile
				<>
					{/* Backdrop overlay for mobile */}
					{isSidebarExpanded && (
						<div 
							className="sidebar-backdrop"
							onClick={() => setIsSidebarExpanded(false)}
							aria-hidden="true"
						/>
					)}

					{/* Student Sidebar — mobil (drawer) */}
					<aside
						className={`modern-sidebar va-sidebar student-sidebar ${isSidebarExpanded ? 'open' : ''}`}
						inert={!isSidebarExpanded ? true : undefined}
						aria-hidden={!isSidebarExpanded}
					>
						<div className="sidebar-mobile-header">
							<button
								type="button"
								className="sidebar-mobile-close"
								onClick={() => setIsSidebarExpanded(false)}
								title="Închide meniul"
								aria-label="Închide meniul"
							>
								<X size={22} weight="bold" aria-hidden />
							</button>
							<div className="sidebar-mobile-header-brand">
								<img
									className="modern-sidebar-logo-img sidebar-mobile-header-logo"
									src="/logo.png"
									alt="Formely"
								/>
								<span className="modern-sidebar-brand-text">{companyName}</span>
							</div>
						</div>

						<nav className="modern-nav va-sidebar-nav">
							<div className="va-sidebar-nav-scroll">
								{navItems.map((item) => (
									<NavLink
										key={item.path}
										to={item.path}
										title={item.title || item.label}
										className={({ isActive }) => {
											const active = isStudentNavItemActive(item, location.pathname, isActive);
											return ['modern-nav-item', 'va-nav-btn', active ? 'active is-active' : ''].join(' ').trim();
										}}
										end={item.path === '/courses'}
										onMouseEnter={() => {
											prefetchRoute(item.path);
											(item.prefetchPaths || []).forEach((path) => prefetchRoute(path));
										}}
										onClick={() => {
											if (window.matchMedia('(max-width: 768px)').matches) {
												setIsSidebarExpanded(false);
											}
										}}
									>
										<span className="modern-nav-item-icon va-nav-icon">{item.icon}</span>
										<span className="modern-nav-item-label va-nav-label">{item.label}</span>
									</NavLink>
								))}
							</div>
						</nav>

						{(user || (isTrueAdminAccount && !isStudentPreviewMode)) && (
							<div className="sidebar-mobile-footer">
								{isTrueAdminAccount && !isStudentPreviewMode && !isPlatformAdmin(user) && (
									<div className="sidebar-mobile-footer-switch">
										<AdminViewSwitcher
											isStudentView={isUserPage}
											onSwitch={handleAdminViewSwitch}
											variant="sidebar"
										/>
									</div>
								)}
								{user && (
									<button
										type="button"
										onClick={logout}
										className="sidebar-mobile-logout-btn"
										title="Deconectare"
										aria-label="Deconectare"
									>
										<SignOut size={18} weight="bold" aria-hidden />
										<span className="sidebar-mobile-logout-label">Deconectare</span>
									</button>
								)}
							</div>
						)}
					</aside>

					<header className={`modern-topnav va-topnav ${isSidebarExpanded ? 'sidebar-expanded' : ''}`}>
						<div className="modern-topnav-left va-topnav-brand">
							{isMobile && showUserLayout && isStudentLessonPath(location.pathname) ? (
								<button
									type="button"
									className="admin-topnav-notification-btn va-topnav-lessons-btn"
									onClick={() => window.dispatchEvent(new Event('formely-open-lessons-sidebar'))}
									title="Lecții"
									aria-label="Deschide meniul lecțiilor"
								>
									<ListBullets size={20} weight="duotone" aria-hidden />
								</button>
							) : null}
							{!(isMobile && showUserLayout) ? (
								<button
									className="mobile-sidebar-toggle"
									onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
									title={isSidebarExpanded ? 'Închide meniul' : 'Deschide meniul'}
									aria-label={isSidebarExpanded ? 'Închide meniul' : 'Deschide meniul'}
									aria-expanded={isSidebarExpanded}
								>
									<ListBullets size={24} weight="bold" aria-hidden />
								</button>
							) : null}
							{!isMobile && (
								<span className="va-logo-text">
									<img className="va-logo-icon-img" src="/logo.png" alt="Formely" />
								</span>
							)}
						</div>
						{isMobile && !isSidebarExpanded ? (
							<span className="va-topnav-page-title">{mobileTopnavTitle}</span>
						) : null}

						<nav className="modern-topnav-nav va-topnav-nav desktop-only">
							{navItems.map((item) => (
								<NavLink
									key={item.path}
									to={item.path}
									title={item.title || item.label}
									className={({ isActive }) => {
										const active = isStudentNavItemActive(item, location.pathname, isActive);
										return ['modern-topnav-item', 'va-topnav-btn', active ? 'active is-active' : ''].join(' ').trim();
									}}
									end={item.path === '/courses'}
									onMouseEnter={() => {
										prefetchRoute(item.path);
										(item.prefetchPaths || []).forEach((path) => prefetchRoute(path));
									}}
								>
									<span className="modern-topnav-item-icon va-topnav-icon">{item.icon}</span>
									<span className="modern-topnav-item-label va-topnav-label">{item.label}</span>
								</NavLink>
							))}
						</nav>

						<div className="modern-topnav-right">
							{user && (
								<>
									{isStudentPreviewMode && (
										<button
											type="button"
											className="student-preview-back-to-admin student-preview-back-to-admin--topnav"
											onClick={() => {
												sessionStorage.removeItem('studentPreviewFromAdmin');
												setAdminViewMode('admin');
												navigate('/admin', { replace: true });
											}}
											title="Înapoi la Admin"
											aria-label="Înapoi la Admin"
										>
											<ArrowLeft size={14} weight="bold" aria-hidden /> Admin
										</button>
									)}
									<StudentTopNavNotifications />

									{/* View Switcher (only for admins, hidden in student preview mode) - Desktop only */}
									{isTrueAdminAccount && !isStudentPreviewMode && !isPlatformAdmin(user) && (
										<div className="admin-topnav-control desktop-only">
											<AdminViewSwitcher
												isStudentView={isUserPage}
												onSwitch={handleAdminViewSwitch}
											/>
										</div>
									)}

									{/* User Info - Desktop only */}
									<div className="admin-topnav-user desktop-only">
										<div className="admin-topnav-user-avatar">
											{user.avatar ? (
												<img src={toImageUrl(user.avatar) || user.avatar} alt={user.name || ''} />
											) : (
												user.name
													?.split(' ')
													.map((n) => n[0])
													.join('')
													.toUpperCase() || 'U'
											)}
										</div>
										<div className="admin-topnav-user-info">
											<p className="admin-topnav-user-name">{user.name || 'Utilizator'}</p>
										<p className="admin-topnav-user-role">{topnavStaffRoleLabel}</p>
										</div>
										<button
											onClick={logout}
											className="admin-topnav-logout"
											title="Deconectare"
											aria-label="Deconectare"
										>
											<SignOut size={18} weight="bold" aria-hidden />
										</button>
									</div>
								</>
							)}
						</div>
					</header>

					{isMobile && showUserLayout && user ? (
						<StudentBottomNav
							onOpenMenu={() => setIsSidebarExpanded((open) => !open)}
						/>
					) : null}

					<div className="va-shell-main va-shell-main-topnav">
						<main className="va-main">{children}</main>
					</div>
					{isTrueAdminAccount && !isStudentPreviewMode && !isPlatformAdmin(user) && canUseAiFeature(user, 'ai_builder') ? (
						<Suspense fallback={null}>
							<AiAssistantWidget />
						</Suspense>
					) : null}
				</>
			)}
		</div>
	);
}

function App() {
	const [isSearchOpen, setIsSearchOpen] = useState(false);

	useEffect(() => {
		const handleOpenSearch = () => setIsSearchOpen(true);
		document.addEventListener('openGlobalSearch', handleOpenSearch);
		return () => document.removeEventListener('openGlobalSearch', handleOpenSearch);
	}, []);

	return (
		<ThemeProvider>
			<ToastProvider>
				<AuthProvider>
					<Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
						<CompanyBrandingProvider>
						<ScrollToTop />
						<GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
				<Routes>
					{/* Splash first page - if authenticated, redirect to app */}
					{/* Auth: splash → logo sus → login / register (același ecran) */}
					<Route path="/" element={authExperienceElement} />
					<Route path="/login" element={authExperienceElement} />
					<Route path="/register" element={authExperienceElement} />
					<Route path="/forgot-password" element={authExperienceElement} />
					<Route path="/reset-password" element={authExperienceElement} />
					<Route path="/accept-invite" element={authExperienceElement} />
					<Route path="/register/invite/:token" element={<RedirectInviteRegister />} />
					
					{/* Protected routes */}
					<Route
						path="/*"
						element={
							<Layout>
								<Routes>
									<Route
										path="/home"
										element={<Navigate to="/courses" replace />}
									/>
									<Route
										path="/courses"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<CoursesPage />
												</Suspense>
											</UserRoute>
										}
									/>
									<Route
										path="/courses/map/:mapId"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<CourseMapPage />
												</Suspense>
											</UserRoute>
										}
									/>
						{/* Course Lessons Page - Main course view */}
									<Route
										path="/courses/:courseId"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<LessonsPage />
												</Suspense>
											</UserRoute>
										}
									/>
						{/* Individual Lesson Page */}
									<Route
										path="/courses/:courseId/lessons/:lessonId"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<LessonPage />
												</Suspense>
											</UserRoute>
										}
									/>
						{/* Redirect /courses/:id/detail → /courses/:id (începe direct cursul) */}
									<Route
										path="/courses/:courseId/detail"
										element={
											<UserRoute>
												<RedirectDetailToCourse />
											</UserRoute>
										}
									/>
									{/* Examen independent (fără curs în URL) */}
									<Route
										path="/exams/:examId"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<ExamPage />
												</Suspense>
											</UserRoute>
										}
									/>
									{/* Test din context curs (CourseTest) — course_id pentru atribuire */}
									<Route
										path="/courses/:courseId/exams/:examId"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<ExamPage />
												</Suspense>
											</UserRoute>
										}
									/>
									{/* Legacy routes - kept for backward compatibility */}
									<Route
										path="/courses/:courseId/quiz"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<QuizPage />
												</Suspense>
											</UserRoute>
										}
									/>
									<Route
										path="/events"
										element={
											<UserRoute>
												<FeatureRoute feature="events">
													<Suspense fallback={<PageLoader />}>
														<EventsPage />
													</Suspense>
												</FeatureRoute>
											</UserRoute>
										}
									/>
									<Route
										path="/events/:id"
										element={
											<UserRoute>
												<FeatureRoute feature="events">
													<Suspense fallback={<PageLoader />}>
														<EventDetailPage />
													</Suspense>
												</FeatureRoute>
											</UserRoute>
										}
									/>
									<Route
										path="/library"
										element={
											<UserRoute>
												<FeatureRoute feature="library">
													<Suspense fallback={<PageLoader />}>
														<LibraryPage />
													</Suspense>
												</FeatureRoute>
											</UserRoute>
										}
									/>
									<Route
										path="/library/compose"
										element={
											<UserRoute>
												<FeatureRoute feature="library">
													<Suspense fallback={<PageLoader />}>
														<LibraryComposePage />
													</Suspense>
												</FeatureRoute>
											</UserRoute>
										}
									/>
									<Route
										path="/library/compose/:itemId"
										element={
											<UserRoute>
												<FeatureRoute feature="library">
													<Suspense fallback={<PageLoader />}>
														<LibraryComposePage />
													</Suspense>
												</FeatureRoute>
											</UserRoute>
										}
									/>
									<Route
										path="/library/items/:itemId"
										element={
											<UserRoute>
												<FeatureRoute feature="library">
													<Suspense fallback={<PageLoader />}>
														<LibraryReaderPage />
													</Suspense>
												</FeatureRoute>
											</UserRoute>
										}
									/>
									<Route
										path="/learning-paths/:pathId"
										element={<Navigate to="/courses" replace />}
									/>
									<Route
										path="/learning-paths"
										element={<Navigate to="/courses" replace />}
									/>
									<Route
										path="/exam-results"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<ExamResultsPage />
												</Suspense>
											</UserRoute>
										}
									/>
									<Route
										path="/catalog-exam-results"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<CatalogExamResultsPage />
												</Suspense>
											</UserRoute>
										}
									/>
									<Route
										path="/achievements"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<AchievementsPage />
												</Suspense>
											</UserRoute>
										}
									/>
									<Route
										path="/settings"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<StudentSettingsPage />
												</Suspense>
											</UserRoute>
										}
									/>
									<Route
										path="/profile"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<ProfilePage />
												</Suspense>
											</UserRoute>
										}
									/>
									<Route
										path="/profile/activity"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<StudentActivityPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/messages"
										element={<Navigate to="/courses" replace />}
									/>
									<Route
										path="/completed-courses"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<CompletedCoursesPage />
												</Suspense>
											</UserRoute>
										}
									/>
									{/* Admin viewing user profile */}
									<Route
										path="/admin/users/:userId/profile"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<ProfilePage />
												</Suspense>
											</AdminRoute>
										}
									/>
									{/* Admin Routes */}
									<Route
										path="/admin"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminDashboardPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/analytics"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminAnalyticsPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/content"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminContentPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/learning-paths/:pathId"
										element={<Navigate to="/admin/content" replace />}
									/>
									<Route
										path="/admin/maps/:mapId"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<CourseMapPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/tests/pending-review"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminTestsPendingReviewsPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/courses"
										element={<Navigate to="/admin/content?tab=courses&view=maps" replace />}
									/>
									{/* Course Creation Route */}
									<Route
										path="/admin/courses/new"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<CourseCreationPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									{/* Course Detail Route */}
									<Route
										path="/admin/courses/:id"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminCourseDetailPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/courses/:id/builder"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminCourseBuilderPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/tests/:testId/builder"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminTestBuilderPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									{/* Course Edit/Detail Routes - Removed - will be rebuilt from scratch */}
									{/* <Route
										path="/admin/courses/new"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminCourseEditPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/courses/:id/builder"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminCourseEditPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/courses/:id/edit"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminCourseEditPage />
												</Suspense>
											</AdminRoute>
										}
									/> */}
									<Route
										path="/admin/modules/:id?"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<ModuleCreatorPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/lessons/:id?"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<LessonCreatorPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									{/* Question Bank list redirect; builder routes below */}
									<Route
										path="/admin/question-banks"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminQuestionBanksPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/question-banks/:id"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminQuestionBankFolderDetailsPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/question-banks/new/builder"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<QuestionBankBuilder />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/question-banks/:id/builder"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<QuestionBankBuilder />
												</Suspense>
											</AdminRoute>
										}
									/>
									{/* <Route
										path="/admin/question-banks/:bankId/questions"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminQuestionBankQuestionsPage />
												</Suspense>
											</AdminRoute>
										}
									/> */}
									<Route
										path="/admin/events"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminEventsPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/teams"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminTeamsPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/team-members"
										element={<Navigate to="/admin/users?tab=staff" replace />}
									/>
									<Route
										path="/admin/users"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminUsersPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/users/invite"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminInviteUsersPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/activity-logs"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminActivityLogsPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/statistics"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminStatisticsHubPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/settings"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminSettingsPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/platform"
										element={<Navigate to="/admin" replace />}
									/>
									<Route
										path="/admin/platform/companies"
										element={<Navigate to="/admin" replace />}
									/>
									<Route
										path="/admin/top-courses"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminTopCoursesPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/problematic-courses"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminProblematicCoursesPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/activity"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminActivityPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/alerts"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminAlertsPage />
												</Suspense>
											</AdminRoute>
										}
									/>
									<Route
										path="/admin/tasks"
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminTasksPage />
												</Suspense>
											</AdminRoute>
										}
									/>
								</Routes>
							</Layout>
						}
					/>
				</Routes>
						</CompanyBrandingProvider>
			</Router>
		</AuthProvider>
		</ToastProvider>
		</ThemeProvider>
	);
}

// Wrap App with ErrorBoundary
function AppWithErrorBoundary() {
	return (
		<ErrorBoundary showDetails={import.meta.env.DEV}>
			<App />
		</ErrorBoundary>
	);
}

export default AppWithErrorBoundary;

