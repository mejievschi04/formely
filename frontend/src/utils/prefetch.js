/**
 * Route prefetching - load chunks on link hover for instant navigation
 * Checks path prefixes (e.g. /courses/123 -> prefetch CoursesPage)
 */
const prefetched = new Set();

// Prefetch likely next pages when browser is idle (after initial load)
if (typeof requestIdleCallback !== 'undefined') {
	requestIdleCallback(
		() => {
			Promise.all([
				import('../pages/CoursesPage'),
				import('../pages/admin/AdminDashboardPage'),
			]).then(() => {
				['/courses', '/admin'].forEach((p) => prefetched.add(p));
			}).catch(() => {});
		},
		{ timeout: 2000 }
	);
}

const routePrefetchers = [
	{ prefix: '/courses', fn: () => import('../pages/CoursesPage') },
	{ prefix: '/courses/map', fn: () => import('../pages/CourseMapPage') },
	{ prefix: '/admin/maps', fn: () => import('../pages/CourseMapPage') },
	{ prefix: '/messages', fn: () => import('../pages/MessagesPage') },
	{ prefix: '/events', fn: () => import('../pages/EventsPage') },
	{ prefix: '/library', fn: () => import('../pages/LibraryPage') },
	{ prefix: '/settings', fn: () => import('../pages/StudentSettingsPage') },
	{ prefix: '/profile/activity', fn: () => import('../pages/StudentActivityPage') },
	{ prefix: '/profile', fn: () => import('../pages/ProfilePage') },
	{ prefix: '/achievements', fn: () => import('../pages/AchievementsPage') },
	{ prefix: '/exam-results', fn: () => import('../pages/ExamResultsPage') },
	{ prefix: '/pro-dashboard', fn: () => import('../pages/ProDashboard') },
	{ prefix: '/pro-courses', fn: () => import('../pages/ProCourses') },
	{ prefix: '/completed-courses', fn: () => import('../pages/CompletedCoursesPage') },
	{ prefix: '/admin', fn: () => import('../pages/admin/AdminDashboardPage') },
	{ prefix: '/admin/analytics', fn: () => import('../pages/admin/AdminAnalyticsPage') },
	{ prefix: '/admin/courses', fn: () => import('../pages/admin/AdminCoursesPage') },
	{ prefix: '/admin/events', fn: () => import('../pages/admin/AdminEventsPage') },
	{ prefix: '/admin/teams', fn: () => import('../pages/admin/AdminTeamsPage') },
	{ prefix: '/admin/team-members', fn: () => import('../pages/admin/AdminTeamsPage') },
	{ prefix: '/admin/users', fn: () => import('../pages/admin/AdminUsersPage') },
	{ prefix: '/admin/activity-logs', fn: () => import('../pages/admin/AdminActivityLogsPage') },
	{ prefix: '/admin/tests/pending-review', fn: () => import('../pages/admin/AdminTestsPendingReviewsPage') },
	{ prefix: '/admin/question-banks', fn: () => import('../pages/admin/AdminQuestionBanksPage') },
	{ prefix: '/admin/settings', fn: () => import('../pages/admin/AdminSettingsPage') },
];

export function prefetchRoute(path) {
	const normalized = (path || '/').replace(/\/$/, '') || '/';
	if (prefetched.has(normalized)) return;
	// Match longest prefix first (e.g. /admin/team-members before /admin)
	const match = routePrefetchers
		.filter((r) => normalized === r.prefix || normalized.startsWith(r.prefix + '/'))
		.sort((a, b) => b.prefix.length - a.prefix.length)[0];
	if (match) {
		prefetched.add(normalized);
		match.fn().catch(() => prefetched.delete(normalized));
	}
}
