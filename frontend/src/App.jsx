import React, { lazy, Suspense, useState, useEffect, useLayoutEffect, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { BrowserRouter as Router, Routes, Route, NavLink, Link, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth, AuthContext } from './contexts/AuthContextShared.js';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import AdminRoute from './components/AdminRoute';
import UserRoute from './components/UserRoute';
import ChangePasswordModal from './components/ChangePasswordModal';
import LoadingOverlay from './components/LoadingOverlay';
import GlobalSearch from './components/GlobalSearch';
import { isVoltEnabled } from './utils/voltAvailability';
import { filterNavByPlan } from './utils/entitlements';
import FeatureRoute from './components/FeatureRoute';
import AdminTopNavControls from './components/admin/AdminTopNavControls';
import AdminViewSwitcher from './components/admin/AdminViewSwitcher';
import StudentTopNavNotifications from './components/student/StudentTopNavNotifications';
import AdminStylesLoader from './components/AdminStylesLoader';
import ErrorBoundary from './components/common/ErrorBoundary';
import ScrollToTop from './components/common/ScrollToTop';
import { prefetchRoute } from './utils/prefetch';
import { toImageUrl } from './utils/imageUrl';
import { isStaffAdminRole } from './constants/staffRoles';
import { BackButton } from './components/ui/ActionButtons';
import { adminService } from './services/api';
import {
	BookOpenText,
	Books,
	CalendarDots,
	CaretDown,
	ChartLineUp,
	CheckCircle,
	ClipboardText,
	Compass,
	DotsThree,
	GearSix,
	House,
	ListBullets,
	SignOut,
	X,
	SquaresFour,
	Users,
	UsersThree,
	UserCircle,
} from '@phosphor-icons/react';
/* Modern Design System - Unified & Standardized */
import './styles/design-system.css';
import './styles/light-theme-wcag.css';
import './styles/unified-cards.css';
import './styles/components.css';
import './styles/button-modern.css';
import './styles/micro-interactions.css';
import './styles/loading-states.css';
import './styles/toast-system.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/ui-components.css';
import './styles/additional-pages.css';
// Shared LMS buttons and loading states are also used outside the dashboard.
import './styles/lms-dashboard-enterprise.css';
/* Student styles - loaded after shared to ensure proper cascade */
import './styles/student-navigation-modern.css';
import './styles/admin-view-switcher.css';
import './styles/student-components.css';
import './styles/student-overrides.css';
import './styles/common-components.css';
import './styles/builder-overrides.css';
/* Mobile optimizations must be last to override base styles */
import './styles/mobile-optimizations.css';
/* One control style, after every other global sheet. */
import './styles/control-system.css';
import './styles/dialog-system.css';
import './styles/primary-surface-contrast.css';
import formelyLogo from './assets/Formely logo.png';
import { nameInitials } from './utils/initials';

// Lazy load pages for code splitting
const VoltAssistantWidget = lazy(() => import('./components/ai/VoltAssistantWidget'));
const CoursesPage = lazy(() => import('./pages/CoursesPage'));
const CourseMapPage = lazy(() => import('./pages/CourseMapPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const ExamPage = lazy(() => import('./pages/ExamPage'));
const AchievementsPage = lazy(() => import('./pages/AchievementsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const StudentActivityPage = lazy(() => import('./pages/StudentActivityPage'));
const StudentSettingsPage = lazy(() => import('./pages/StudentSettingsPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const MonthlyTestsPage = lazy(() => import('./pages/MonthlyTestsPage'));
const ExamResultsPage = lazy(() => import('./pages/ExamResultsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const InviteRegisterPage = lazy(() => import('./pages/InviteRegisterPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminAnalyticsPage = lazy(() => import('./pages/admin/AdminAnalyticsPage'));
const AdminCoursesPage = lazy(() => import('./pages/admin/AdminCoursesPage'));
const AdminCourseDetailPage = lazy(() => import('./pages/admin/AdminCourseDetailPage'));
const AdminEventsPage = lazy(() => import('./pages/admin/AdminEventsPage'));
const AdminTeamsPage = lazy(() => import('./pages/admin/AdminTeamsPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
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
const CourseCreationPage = lazy(() => import('./pages/admin/CourseCreationPage'));
const AdminCourseBuilderPage = lazy(() => import('./pages/admin/AdminCourseBuilderPage'));
const AdminQuestionBanksPage = lazy(() => import('./pages/admin/AdminQuestionBanksPage'));
const AdminQuestionBankFolderDetailsPage = lazy(() => import('./pages/admin/AdminQuestionBankFolderDetailsPage'));
const AdminContentPage = lazy(() => import('./pages/admin/AdminContentPage'));
const AdminTestsPendingReviewsPage = lazy(() => import('./pages/admin/AdminTestsPendingReviewsPage'));
const AdminTestBuilderPage = lazy(() => import('./pages/admin/AdminTestBuilderPage'));
const QuestionBankBuilder = lazy(() => import('./components/admin/question-banks/QuestionBankBuilder'));
const CompletedCoursesPage = lazy(() => import('./pages/CompletedCoursesPage'));
const LessonsPage = lazy(() => import('./pages/LessonsPage'));
const LessonPage = lazy(() => import('./pages/LessonPage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const LibraryReaderPage = lazy(() => import('./pages/LibraryReaderPage'));
const LibraryComposePage = lazy(() => import('./pages/LibraryComposePage'));
const GuidesPage = lazy(() => import('./pages/GuidesPage'));

// Loading component (post-login: no full-screen overlay)
const PageLoader = () => (
	<div className="va-main" style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
		<p>Se încarcă...</p>
	</div>
);

/** Formely: linkurile de invitație trimise înainte de aliniere (/accept-invite?token=). */
function LegacyAcceptInviteRedirect() {
	const { search } = useLocation();
	const token = new URLSearchParams(search).get('token');
	return <Navigate to={token ? `/register/invite/${encodeURIComponent(token)}` : '/login'} replace />;
}

function RedirectDetailToCourse() {
	const { courseId } = useParams();
	return <Navigate to={`/courses/${courseId}`} replace />;
}

/** Rolul afișat în badge-ul din topnav (cont real, nu modul de vizualizare admin/student). */
function getTopnavStaffRoleLabel(user, isStudentPreviewMode) {
	if (!user) return '';
	if (isStudentPreviewMode) return 'Utilizator';
	const ar = user.actualRole ?? user.role ?? 'student';
	switch (ar) {
		case 'analyst':
			return 'Analist';
		case 'instructor':
			return 'Instructor';
		case 'admin':
			return 'Administrator';
		case 'student':
			return 'Utilizator';
		default:
			return ar;
	}
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
	return <AuthenticatedLayout authContext={authContext}>{children}</AuthenticatedLayout>;
}

function AuthenticatedLayout({ children, authContext }) {
	const { user, logout, setAdminViewMode } = authContext;
	const navigate = useNavigate();
	const location = useLocation();
	const isAdminContentSubmenuChildActive = React.useCallback(
		(child) => {
			const childParams = new URLSearchParams(child.search || '');
			const childTab = childParams.get('tab');
			const childView = childParams.get('view') || '';
			if (location.pathname.startsWith('/admin/maps/')) {
				return child.path === '/admin/content' && childTab === 'courses' && childView === 'maps';
			}
			if (location.pathname !== child.path) return false;
			const currentTab = new URLSearchParams(location.search).get('tab') || 'courses';
			const currentView = new URLSearchParams(location.search).get('view') || '';
			if (!childTab || currentTab !== childTab) return false;
			if (childTab !== 'courses') return true;
			const showingMaps = currentView === 'maps' || (currentView === '' && user?.actualRole !== 'instructor');
			if (childView === 'maps') return showingMaps;
			if (childView === 'list') return !showingMaps;
			return currentView === childView;
		},
		[location.pathname, location.search, user?.actualRole]
	);
	const isTrueAdminAccount = user?.actualRole === 'admin';
	const hasStaffAdminShell = isStaffAdminRole(user?.actualRole);
	const isAdmin = user?.role === 'admin';
	
	// Check if we're on a user page (not admin pages)
	const isLibraryPage =
		location.pathname === '/library' ||
		location.pathname.startsWith('/library/items/') ||
		location.pathname.startsWith('/library/compose');
	const isGuidesPage = location.pathname === '/guides';
	const isLibraryReaderPage =
		location.pathname.startsWith('/library/items/') && !location.pathname.includes('/edit');
	const isAdminPage = location.pathname.startsWith('/admin');
	const isStaffLibraryPage = (isLibraryPage || isGuidesPage) && hasStaffAdminShell && user?.role !== 'student';
	const isAdminShellPage = isAdminPage || isStaffLibraryPage;
	
	const isUserPage = !isAdminShellPage;
	
	// For regular users (students): always show user layout
	// For admin: 
	//   - If on admin pages: use admin layout
	//   - If on other user pages: use user layout (student interface)
	const isStudent = !isAdmin || (user?.role === 'student' || !user?.role || user?.role === '');
	// Cont admin + mod student: shell admin cât timp URL e /admin* (evită topnav peste conținut admin înainte de redirect).
	const showUserLayout = !hasStaffAdminShell
		? isStudent
			? true
			: !isAdminShellPage
		: user?.actualRole === 'admin' && user?.role === 'student'
			? !isAdminShellPage
			: !isAdminShellPage;

	// Overlay doar în mod admin efectiv (nu resetăm „ready” la trecere student pe același frame).
	const requiresAdminChromePaintHold =
		isTrueAdminAccount && user?.role === 'admin' && !showUserLayout;
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
	
	// State for admin view toggle (active when on admin page)
	const [, setIsAdminView] = React.useState(!isUserPage && isAdmin);
	
	// State for sidebar expanded/collapsed
	const [isSidebarExpanded, setIsSidebarExpanded] = React.useState(() => {
		if (window.innerWidth <= 768) return false;
		const saved = localStorage.getItem('sidebarExpanded');
		return saved !== null ? saved === 'true' : false;
	});
	const [moreMenuOpen, setMoreMenuOpen] = React.useState(false);
	const [pendingReviewCount, setPendingReviewCount] = React.useState(0);

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
	const [isMobile, setIsMobile] = React.useState(() => window.innerWidth <= 768);
	const [adminTopnavContext, setAdminTopnavContext] = React.useState(null);
	
	React.useEffect(() => {
		const handleResize = () => {
			setIsMobile(window.innerWidth <= 768);
		};
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	// Keep the mobile drawer's scroll and keyboard focus inside the menu.
	React.useEffect(() => {
		if (!isMobile || !isSidebarExpanded) return;
		const drawer = document.querySelector('.va-sidebar');
		const previousFocus = document.activeElement;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const getControls = () => [...drawer.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')]
			.filter(element => element.getClientRects().length > 0);
		getControls()[0]?.focus();
		const handleKey = (event) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				setIsSidebarExpanded(false);
			}
			if (event.key !== 'Tab') return;
			const controls = getControls();
			const first = controls[0];
			const last = controls[controls.length - 1];
			if (!drawer.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
				event.preventDefault();
				(event.shiftKey ? last : first)?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first?.focus();
			}
		};
		document.addEventListener('keydown', handleKey);
		return () => {
			document.body.style.overflow = previousOverflow;
			document.removeEventListener('keydown', handleKey);
			if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
		};
	}, [isMobile, isSidebarExpanded]);

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
		if (!location.pathname.startsWith('/admin/course-builder')) {
			setAdminTopnavContext(null);
		}
	}, [location.pathname]);

	const loadPendingReviewCount = React.useCallback(async () => {
		if (!user || !isStaffAdminRole(user?.actualRole)) {
			setPendingReviewCount(0);
			return;
		}
		try {
			const [testCount, examCount] = await Promise.all([
				adminService.getPendingTestReviewsCount(),
				adminService.getPendingExamReviewsCount(),
			]);
			setPendingReviewCount(testCount + examCount);
		} catch {
			/* keep last count */
		}
	}, [user]);

	React.useEffect(() => {
		if (!user || !isStaffAdminRole(user?.actualRole)) {
			setPendingReviewCount(0);
			return;
		}
		loadPendingReviewCount();
		const intervalId = window.setInterval(loadPendingReviewCount, 60000);
		return () => clearInterval(intervalId);
	}, [loadPendingReviewCount, user]);


	// Student preview mode: admin viewing as student - no admin UI, 100% student experience
	const isStudentPreviewMode = isTrueAdminAccount && showUserLayout && sessionStorage.getItem('studentPreviewFromAdmin') === 'true';

	const topnavStaffRoleLabel = getTopnavStaffRoleLabel(user, isStudentPreviewMode);

	const handleAdminViewSwitch = useCallback(() => {
		if (isUserPage) {
			setAdminViewMode('admin');
			navigate('/admin', { replace: true });
		} else {
			setAdminViewMode('student');
			navigate('/courses', { replace: true });
		}
	}, [isUserPage, setAdminViewMode, navigate]);
	
	// Update toggle state when location changes
	React.useEffect(() => {
		if (hasStaffAdminShell) {
			// Admin view is active when on admin pages
			setIsAdminView(!isUserPage && isAdmin);
		}
	}, [location.pathname, hasStaffAdminShell, isUserPage, isAdmin]);
	
	// Save sidebar state to localStorage and update body class
	React.useEffect(() => {
		if (!isMobile) localStorage.setItem('sidebarExpanded', isSidebarExpanded.toString());
		// Add class to body for CSS targeting
		if (isSidebarExpanded) {
			document.body.classList.add('sidebar-expanded');
		} else {
			document.body.classList.remove('sidebar-expanded');
		}
		return () => {
			document.body.classList.remove('sidebar-expanded');
		};
	}, [isSidebarExpanded, isMobile]);

	// Admin-only layout styling hooks (avoid impacting student UI)
	React.useEffect(() => {
		const isAdminLayoutActive = !showUserLayout && hasStaffAdminShell;
		document.body.classList.toggle('admin-view', isAdminLayoutActive);
		return () => {
			document.body.classList.remove('admin-view');
		};
	}, [showUserLayout, hasStaffAdminShell]);
	
	// Check must_change_password - handle boolean, number, or string values
	const mustChangePassword = user?.must_change_password === true || 
		user?.must_change_password === 1 || 
		user?.must_change_password === '1' ||
		user?.must_change_password === 'true' ||
		user?.must_change_password === true;
	
	// Determine courses path based on user role and current view
	// All users use /courses (which redirects appropriately based on role)

	// Formely: shell-ul poartă numele și logo-ul academiei utilizatorului.
	const brandName = user?.company?.name || 'Formely';
	const brandLogo = user?.company?.logo_url ? toImageUrl(user.company.logo_url) : formelyLogo;

	const navItems = filterNavByPlan(user, [
		{
			path: '/courses',
			label: 'Cursuri',
			title: 'Mape și cursuri. Testele din curs se deschid din curs.',
			icon: (
				<BookOpenText size={20} weight="duotone" aria-hidden />
			)
		},
		{
			path: '/monthly-tests',
			label: 'Teste lunare',
			mobileLabel: 'Teste',
			title: 'Examenele pe care le poți susține',
			icon: (
				<ClipboardText size={20} weight="duotone" aria-hidden />
			)
		},
		{
			path: '/events',
			label: 'Evenimente',
			icon: (
				<CalendarDots size={20} weight="duotone" aria-hidden />
			)
		},
		{
			path: '/profile',
			label: 'Profil',
			icon: (
				<UserCircle size={20} weight="duotone" aria-hidden />
			)
		},
	]);

	const moreNavItems = filterNavByPlan(user, [
		{
			path: '/exam-results',
			label: 'Rezultate teste',
			icon: <CheckCircle size={20} weight="duotone" aria-hidden />,
		},
		{
			path: '/library',
			label: 'Bibliotecă',
			title: 'Materiale partajate: cărți, PDF-uri și documente',
			icon: <Books size={20} weight="duotone" aria-hidden />,
		},
		{
			path: '/guides',
			label: 'Ghiduri',
			title: 'Linkuri utile și resurse externe recomandate',
			icon: <Compass size={20} weight="duotone" aria-hidden />,
		},
		{
			path: '/settings',
			label: 'Setări',
			icon: <GearSix size={20} weight="duotone" aria-hidden />,
		},
	]);

	const moreMenuActive = moreNavItems.some((item) => (
		location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
	));
	const mobileMoreNavItems = [
		navItems.find((item) => item.path === '/profile'),
		...moreNavItems,
	].filter(Boolean);
	const mobileMoreMenuActive = mobileMoreNavItems.some((item) => (
		location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
	));

	const mobileTopnavTitle = (() => {
		const pathname = location.pathname;
		const navMatch = navItems.find((item) => {
			if (item.path === '/courses') {
				return pathname === '/courses' || pathname.startsWith('/courses/map');
			}
			return pathname === item.path || pathname.startsWith(`${item.path}/`);
		});
		if (navMatch) return navMatch.label;
		if (pathname.startsWith('/lessons') || /\/lesson(s)?(\/|$)/.test(pathname)) return 'Lecții';
		if (pathname.startsWith('/monthly-tests')) return 'Teste lunare';
		if (pathname.startsWith('/exam-results')) return 'Rezultate teste';
		if (pathname.startsWith('/library')) return 'Bibliotecă';
		if (pathname.startsWith('/guides')) return 'Ghiduri';
		if (pathname.startsWith('/settings')) return 'Setări';
		if (pathname.startsWith('/exams/') || /^\/courses\/[^/]+\/exams\//.test(pathname)) return 'Test';
		if (pathname.startsWith('/achievements')) return 'Realizări';
		if (pathname.startsWith('/completed-courses')) return 'Cursuri finalizate';
		return brandName;
	})();

	/* Admin: același flux ca Pro — conținut & evenimente sus, apoi oameni, activitate, analize, setări */
	const adminNavItemsAll = filterNavByPlan(user, [
		{
			path: '/admin',
			label: 'Panou',
			icon: (
				<House size={18} weight="duotone" aria-hidden />
			)
		},
		{
			path: '/admin/content',
			label: 'Conținut',
			icon: (
				<SquaresFour size={18} weight="duotone" aria-hidden />
			),
			children:
				user?.actualRole === 'instructor'
					? [
						{ path: '/admin/content', search: '?tab=courses&view=list', label: 'Toate cursurile' },
						{ path: '/admin/content', search: '?tab=tests', label: 'Teste' },
						{ path: '/admin/content', search: '?tab=exams', label: 'Examene' },
						{ path: '/admin/content', search: '?tab=manual-review', label: 'De corectat', badge: pendingReviewCount },
						{ path: '/admin/content', search: '?tab=banks', label: 'Întrebări' },
						{ path: '/admin/content', search: '?tab=media', label: 'Fișiere media' },
					]
					: [
						{ path: '/admin/content', search: '?tab=courses&view=list', label: 'Toate cursurile' },
						{ path: '/admin/content', search: '?tab=courses&view=maps', label: 'Mape' },
						{ path: '/admin/content', search: '?tab=tests', label: 'Teste' },
						{ path: '/admin/content', search: '?tab=exams', label: 'Examene' },
						{ path: '/admin/content', search: '?tab=manual-review', label: 'De corectat', badge: pendingReviewCount },
						{ path: '/admin/content', search: '?tab=banks', label: 'Întrebări' },
						{ path: '/admin/content', search: '?tab=media', label: 'Fișiere media' },
					],
		},
		{
			path: '/admin/events',
			label: 'Evenimente',
			icon: (
				<CalendarDots size={18} weight="duotone" aria-hidden />
			)
		},
		{
			path: '/admin/users',
			label: 'Utilizatori',
			icon: (
				<Users size={18} weight="duotone" aria-hidden />
			)
		},
		{
			path: '/admin/team-members',
			label: 'Echipe',
			icon: (
				<UsersThree size={18} weight="duotone" aria-hidden />
			)
		},
		{
			path: '/admin/activity-logs',
			label: 'Activitate utilizatori',
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
		{
			path: '/library',
			label: 'Bibliotecă',
			icon: (
				<Books size={18} weight="duotone" aria-hidden />
			),
		},
		{
			path: '/guides',
			label: 'Ghiduri',
			icon: (
				<Compass size={18} weight="duotone" aria-hidden />
			),
		},
		{
			path: '/admin/settings',
			label: 'Setări',
			icon: (
				<GearSix size={18} weight="duotone" aria-hidden />
			)
		},
	]);
	const instructorHiddenAdminNavPaths = new Set([
		'/admin/events',
		'/admin/team-members',
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

	React.useEffect(() => {
		setMoreMenuOpen(false);
	}, [location.pathname]);

	React.useEffect(() => {
		if (!moreMenuOpen) return undefined;
		const onPointerDown = (event) => {
			if (!event.target.closest('.student-more-menu-wrap')) setMoreMenuOpen(false);
		};
		const onKeyDown = (event) => {
			if (event.key === 'Escape') setMoreMenuOpen(false);
		};
		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [moreMenuOpen]);

	const renderMoreMenu = (placement) => (
		<div className={`student-more-menu-wrap student-more-menu-wrap--${placement}`}>
			<button
				type="button"
				className={[
					placement === 'desktop' ? 'modern-topnav-item va-topnav-btn' : 'student-mobile-tab',
					moreMenuOpen || (placement === 'mobile' ? mobileMoreMenuActive : moreMenuActive) ? 'active is-active' : '',
				].join(' ').trim()}
				aria-expanded={moreMenuOpen}
				aria-haspopup="menu"
				onClick={() => setMoreMenuOpen((open) => !open)}
			>
				<span className={placement === 'desktop' ? 'modern-topnav-item-icon va-topnav-icon' : 'student-mobile-tab-icon'}>
					<DotsThree size={placement === 'desktop' ? 20 : 23} weight="bold" aria-hidden />
				</span>
				<span className={placement === 'desktop' ? 'modern-topnav-item-label va-topnav-label' : 'student-mobile-tab-label'}>Mai multe</span>
			</button>
			{moreMenuOpen ? (
				<div className="student-more-menu" role="menu">
					{(placement === 'mobile' ? mobileMoreNavItems : moreNavItems).map((item) => (
						<NavLink
							key={item.path}
							to={item.path}
							role="menuitem"
							title={item.title || item.label}
							className={({ isActive }) => `student-more-menu-item${isActive ? ' active' : ''}`}
							onMouseEnter={() => prefetchRoute(item.path)}
							onClick={() => setMoreMenuOpen(false)}
						>
							{item.icon}
							<span>{item.label}</span>
						</NavLink>
					))}
				</div>
			) : null}
		</div>
	);

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
						inert={isMobile && !isSidebarExpanded ? '' : undefined}
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
								<span className="modern-sidebar-logo va-logo-text">
									<img 
										src={brandLogo} 
										alt="" 
										aria-hidden="true"
										className="va-logo-icon-img"
										style={{ width: '32px', height: '32px', objectFit: 'contain' }}
									/>
								</span>
							</button>
							{isSidebarExpanded && (
								<span className="modern-sidebar-brand-text">{brandName}</span>
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
																		if (window.innerWidth <= 768) setIsSidebarExpanded(false);
																	}}
																>
																	<span className="va-nav-label-row">
																		<span className="modern-nav-item-label va-nav-label">{child.label}</span>
																		{child.badge > 0 ? (
																			<span className="messages-menu-badge" aria-label={`${child.badge} lucrări de corectat`}>
																				{child.badge > 99 ? '99+' : child.badge}
																			</span>
																		) : null}
																	</span>
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
												end={item.path === '/admin'}
												onMouseEnter={() => prefetchRoute(item.path)}
												onClick={() => {
													if (window.innerWidth <= 768) setIsSidebarExpanded(false);
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
													if (window.innerWidth <= 768) setIsSidebarExpanded(false);
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
									aria-label="Conținut"
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
													if (window.innerWidth <= 768) setIsSidebarExpanded(false);
												}}
											>
												<span className="va-nav-label-row">
													<span className="modern-nav-item-label va-nav-label">{child.label}</span>
													{child.badge > 0 ? (
														<span className="messages-menu-badge" aria-label={`${child.badge} lucrări de corectat`}>
															{child.badge > 99 ? '99+' : child.badge}
														</span>
													) : null}
												</span>
											</Link>
										);
									})}
								</div>,
								document.body
							)}

						{/* View switcher mobil (tema e în Setări) */}
						{isMobile && isSidebarExpanded && (
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
								aria-expanded={isSidebarExpanded}
								onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
								title="Deschide meniul"
								aria-label="Deschide meniul"
							>
								<ListBullets size={24} weight="bold" aria-hidden />
							</button>
							{!isMobile && (
								<span className="va-logo-text">
									<img
										src={brandLogo}
										alt={brandName}
										className="va-logo-icon-img"
										style={{ width: '32px', height: '32px', objectFit: 'contain' }}
									/>
								</span>
							)}
							{adminTopnavContext && (
								<div className="admin-topnav-page-context desktop-only">
									<BackButton
										className="va-btn-back admin-topnav-page-context-back"
										onClick={() => navigate(adminTopnavContext.backTo || '/admin/content?tab=courses&view=maps')}
									>
										{adminTopnavContext.backLabel || 'Înapoi'}
									</BackButton>
									<span className="admin-topnav-page-context-title">
										{adminTopnavContext.title || ''}
									</span>
								</div>
							)}
							{/* Formely text - shown when sidebar is closed on mobile */}
							{isMobile && !isSidebarExpanded && (
								<span className="va-topnav-page-title">{brandName}</span>
							)}
						</div>
						
						<div className="modern-topnav-right">
							{/* Search and Notifications */}
							<AdminTopNavControls />

							{/* View Switcher - Desktop only */}
							<div className="admin-topnav-control desktop-only">
								<AdminViewSwitcher
									isStudentView={isUserPage}
									onSwitch={handleAdminViewSwitch}
								/>
							</div>

							{/* User Info */}
							{user && (
								<div className="admin-topnav-user">
									<div className="admin-topnav-user-avatar">
										{user.avatar ? (
											<img src={toImageUrl(user.avatar) || user.avatar} alt={user.name || ''} />
										) : (
											nameInitials(user.name, 'A')
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

					<div className="va-shell-main">
						<main className="va-main">{children}</main>
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
					<aside id="student-mobile-menu" role={isMobile && isSidebarExpanded ? 'dialog' : undefined} aria-modal={isMobile && isSidebarExpanded ? true : undefined} aria-label="Meniu principal" inert={isMobile && !isSidebarExpanded ? '' : undefined} className={`modern-sidebar va-sidebar student-sidebar ${isSidebarExpanded ? 'expanded open' : ''}`}>
						<div className="sidebar-mobile-header">
							<button
								type="button"
								className="sidebar-mobile-close va-close-btn"
								onClick={() => setIsSidebarExpanded(false)}
								title="Închide meniul"
								aria-label="Închide meniul"
							>
								<X size={18} weight="bold" aria-hidden="true" />
							</button>
							<div className="sidebar-mobile-header-brand">
								<img
									src={brandLogo}
									alt=""
									aria-hidden="true"
									className="va-logo-icon-img sidebar-mobile-header-logo"
								/>
								<span className="modern-sidebar-brand-text">{brandName}</span>
							</div>
						</div>

						<nav className="modern-nav va-sidebar-nav">
							<div className="va-sidebar-nav-scroll">
								{navItems.map((item) => (
									<NavLink
										key={item.path}
										to={item.path}
										title={item.title || item.label}
										className={({ isActive }) => ['modern-nav-item', 'va-nav-btn', isActive ? 'active is-active' : ''].join(' ').trim()}
										end={item.path === '/courses'}
										onMouseEnter={() => prefetchRoute(item.path)}
										onClick={() => {
											if (window.innerWidth <= 768) {
												setIsSidebarExpanded(false);
												document.querySelector('.student-mobile-tab[aria-controls="student-mobile-menu"]')?.blur();
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
								{isTrueAdminAccount && !isStudentPreviewMode && (
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
							{!isMobile && (
								<span className="va-logo-text">
									<img
										src={brandLogo}
										alt={brandName}
										className="va-logo-icon-img"
										style={{ width: '32px', height: '32px', objectFit: 'contain' }}
									/>
								</span>
							)}
							{isMobile && !isSidebarExpanded && (
								<span className="va-topnav-page-title">{mobileTopnavTitle}</span>
							)}
						</div>

						<nav className="modern-topnav-nav va-topnav-nav desktop-only">
							{navItems.map((item) => (
								<NavLink
									key={item.path}
									to={item.path}
									title={item.title || item.label}
									className={({ isActive }) => ['modern-topnav-item', 'va-topnav-btn', isActive ? 'active is-active' : ''].join(' ').trim()}
									end={item.path === '/courses'}
									onMouseEnter={() => prefetchRoute(item.path)}
								>
									<span className="modern-topnav-item-icon va-topnav-icon">{item.icon}</span>
									<span className="modern-topnav-item-label va-topnav-label">{item.label}</span>
								</NavLink>
							))}
							{renderMoreMenu('desktop')}
						</nav>

						<div className="modern-topnav-right">
							{user && (
								<>
									<StudentTopNavNotifications />

									{/* View Switcher (only for admins, hidden in student preview mode) - Desktop only */}
									{isTrueAdminAccount && !isStudentPreviewMode && (
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
												nameInitials(user.name, 'U')
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

					{isMobile && (
						<nav className="student-mobile-tabs" aria-label="Navigare principală">
							{navItems.filter((item) => item.path !== '/profile').map((item) => (
								<NavLink
									key={item.path}
									to={item.path}
									className={({ isActive }) => `student-mobile-tab${isActive ? ' active' : ''}`}
									end={item.path === '/courses'}
								>
									<span className="student-mobile-tab-icon">
										{item.icon}
										
									</span>
									<span className="student-mobile-tab-label">{item.mobileLabel || item.label}</span>
								</NavLink>
							))}
							{renderMoreMenu('mobile')}
						</nav>
					)}

					<div className="va-shell-main va-shell-main-topnav">
						<main className="va-main">{children}</main>
					</div>
					

					{/* Înapoi la Admin - minimal button when admin views as student */}
					{isStudentPreviewMode && (
						<BackButton
							className="va-btn-back student-preview-back-to-admin"
							onClick={() => {
								sessionStorage.removeItem('studentPreviewFromAdmin');
								setAdminViewMode('admin');
								navigate('/admin/courses', { replace: true });
							}}
							title="Înapoi la Admin"
							aria-label="Înapoi la Admin"
						>
							Admin
						</BackButton>
					)}
				</>
			)}

            {user && isTrueAdminAccount && user.role === 'admin' && isVoltEnabled('ai_builder') && (
				<ErrorBoundary fallback={() => null}>
					<Suspense fallback={null}>
						<VoltAssistantWidget />
					</Suspense>
				</ErrorBoundary>
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

	useEffect(() => {
		const id = window.setTimeout(() => {
			try {
				sessionStorage.removeItem('va:chunk-reload');
			} catch {
				/* ignore */
			}
		}, 4000);
		return () => window.clearTimeout(id);
	}, []);

	return (
		<ThemeProvider>
			<ToastProvider>
				<AuthProvider>
					<Router>
						<ScrollToTop />
						<GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
				<Routes>
					{/* Splash first page - if authenticated, redirect to app */}
					<Route path="/" element={authEntryElement} />
					{/* Public routes */}
					<Route path="/login" element={authEntryElement} />
					<Route path="/register/invite/:token" element={<Suspense fallback={<PageLoader />}><InviteRegisterPage /></Suspense>} />
					<Route path="/accept-invite" element={<LegacyAcceptInviteRedirect />} />
					<Route path="/register" element={<Suspense fallback={<PageLoader />}><RegisterPage /></Suspense>} />
					
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
										path="/monthly-tests"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<MonthlyTestsPage />
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
										element={<Navigate to="/events" replace />}
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
										path="/guides"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<GuidesPage />
												</Suspense>
											</UserRoute>
										}
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
												<FeatureRoute feature="events">
												<Suspense fallback={<PageLoader />}>
													<AdminEventsPage />
												</Suspense>
												</FeatureRoute>
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
										element={
											<AdminRoute>
												<Suspense fallback={<PageLoader />}>
													<AdminTeamsPage />
												</Suspense>
											</AdminRoute>
										}
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
									{/* Orice altă adresă: pagină 404 în loc de conținut gol */}
									<Route
										path="*"
										element={
											<UserRoute>
												<Suspense fallback={<PageLoader />}>
													<NotFoundPage />
												</Suspense>
											</UserRoute>
										}
									/>
								</Routes>
							</Layout>
						}
					/>
				</Routes>
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

/** „/” și „/login”: același ecran (splash → logo sus → formular), deci același element de rută. */
function AuthEntry() {
	const { user, loading } = useAuth();
	const navigate = useNavigate();
	const [prefetchDone, setPrefetchDone] = useState(false);

	// Prefetch pagini critice – logo-ul urcă și formularul apare doar după ce totul e încărcat
	useEffect(() => {
		Promise.all([
			import('./pages/CoursesPage'),
		])
			.then(() => setPrefetchDone(true))
			.catch(() => setPrefetchDone(true));
	}, []);

	useEffect(() => {
		if (!loading && user) {
			if (user.actualRole === 'admin') {
				const mode =
					typeof sessionStorage !== 'undefined'
						? sessionStorage.getItem('voltaAdminViewMode')
						: null;
				navigate(mode === 'student' ? '/courses' : '/admin', { replace: true });
			} else if (isStaffAdminRole(user.actualRole)) {
				navigate('/admin', { replace: true });
			} else {
				navigate('/courses', { replace: true });
			}
		}
	}, [user, loading, navigate]);

	if (user) {
		return null;
	}

	// appReady = auth gata ȘI prefetch gata
	const appReady = !loading && prefetchDone;

	return (
		<Suspense fallback={null}>
			<LoginPage splashReady={appReady} />
		</Suspense>
	);
}

// Același element pentru „/” și „/login”: la trecerea splash → login componenta rămâne montată.
const authEntryElement = <AuthEntry />;
