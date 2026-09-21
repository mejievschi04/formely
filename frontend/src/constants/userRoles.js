/** Roluri LMS (fără operatori platformă — aceia stau în backoffice). */

export const ROLES = {
	COMPANY_OWNER: 'company_owner',
	HR_ADMIN: 'hr_admin',
	MANAGER: 'manager',
	EMPLOYEE: 'employee',
	INSTRUCTOR: 'instructor',
	ANALYST: 'analyst',
	LEGACY_ADMIN: 'admin',
	LEGACY_STUDENT: 'student',
};

export function normalizeRole(role) {
	if (role === 'admin' || role === 'super_admin') return ROLES.COMPANY_OWNER;
	if (role === 'student') return ROLES.EMPLOYEE;
	return role ?? ROLES.EMPLOYEE;
}

export const ROLE_LABELS = {
	company_owner: 'Proprietar companie',
	hr_admin: 'Administrator HR',
	manager: 'Manager',
	employee: 'Cursant',
	instructor: 'Instructor',
	analyst: 'Analist',
	admin: 'Administrator',
	student: 'Cursant',
};

export function getRoleLabel(role) {
	return ROLE_LABELS[role] ?? ROLE_LABELS[normalizeRole(role)] ?? role ?? '—';
}

export const STAFF_ADMIN_ROLES = [
	'company_owner',
	'hr_admin',
	'manager',
	'instructor',
	'analyst',
	'admin',
];

export function isStaffAdminRole(role) {
	return STAFF_ADMIN_ROLES.includes(role ?? '');
}

export const ASSIGNABLE_ROLES = [
	{ value: 'employee', label: 'Cursant' },
	{ value: 'manager', label: 'Manager' },
	{ value: 'hr_admin', label: 'Administrator HR' },
	{ value: 'company_owner', label: 'Proprietar companie' },
	{ value: 'instructor', label: 'Instructor' },
	{ value: 'analyst', label: 'Analist' },
];

export function computeAdminPermissions(actualRole) {
	const r = normalizeRole(actualRole);
	return {
		can_access_admin: isStaffAdminRole(actualRole) || isStaffAdminRole(r),
		can_mutate_admin: ['company_owner', 'hr_admin', 'instructor'].includes(r),
		can_manage_users: ['company_owner', 'hr_admin'].includes(r),
		can_manage_organization: ['company_owner', 'hr_admin'].includes(r),
		can_manage_settings: ['company_owner'].includes(r),
		can_edit_courses: ['company_owner', 'instructor'].includes(r),
		is_read_only_admin: ['analyst', 'manager'].includes(r),
	};
}
