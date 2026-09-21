import { isStaffAdminRole } from '../constants/staffRoles';

/** Unde trimitem utilizatorul după login, în funcție de rol. */
export function getPostLoginPath(userOrPayload) {
	const user = userOrPayload?.user && (userOrPayload.user.id || userOrPayload.user.email)
		? userOrPayload.user
		: userOrPayload;
	const ar = user?.actualRole ?? user?.role ?? 'student';

	if (user?.is_platform_admin) {
		if (typeof window !== 'undefined') {
			window.location.href = import.meta.env.VITE_BACKOFFICE_URL || 'http://localhost:5180';
		}
		return '/login';
	}

	if (['admin', 'company_owner'].includes(ar)) {
		const mode =
			typeof sessionStorage !== 'undefined'
				? sessionStorage.getItem('formelyAdminViewMode')
				: null;
		return mode === 'student' ? '/courses' : '/admin';
	}
	if (ar === 'hr_admin') return '/admin/users';
	if (ar === 'manager') return '/admin/statistics';
	if (isStaffAdminRole(ar)) return '/admin';
	return '/courses';
}
