/**
 * Academia demo din marketing („Vezi demo”).
 * UI-ul de admin e ca pe o academie normală; mutațiile sunt blocate pe API.
 */
export function isDemoSession(user) {
	if (!user) return false;
	if (user.is_demo === true) return true;
	return user.company?.is_demo === true;
}
