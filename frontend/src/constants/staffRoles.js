/** Roluri cu acces la zona /admin (shell + API staff). */
export const STAFF_ADMIN_ROLES = ['admin', 'analyst', 'instructor'];

export function isStaffAdminRole(role) {
	return STAFF_ADMIN_ROLES.includes(role ?? '');
}
