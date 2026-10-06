import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContextShared.js';
import { isStaffAdminRole } from '../constants/staffRoles';

/**
 * Afișată pentru orice adresă din aplicație care nu corespunde unei pagini,
 * în loc de un conținut gol în layout.
 */
export default function NotFoundPage() {
	const { user } = useAuth();
	const isStaff = isStaffAdminRole(user?.actualRole);
	const homePath = isStaff ? '/admin' : '/courses';

	return (
		<div className="admin-container">
			<div className="lms-empty-state" role="alert">
				<h1 className="lms-empty-title">Pagina nu a fost găsită</h1>
				<p className="lms-empty-description">
					Adresa nu mai există sau a fost mutată. Verifică linkul sau întoarce-te la pagina principală.
				</p>
				<Link to={homePath} className="lms-btn-primary">
					{isStaff ? 'Înapoi la administrare' : 'Înapoi la cursuri'}
				</Link>
			</div>
		</div>
	);
}
