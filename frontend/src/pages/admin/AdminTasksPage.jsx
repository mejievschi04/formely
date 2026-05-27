import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

/**
 * Hub scurt pentru „taskuri” operaționale până la un modul dedicat de ticketing.
 */
const AdminTasksPage = () => {
	const navigate = useNavigate();

	return (
		<div className="admin-container">
			<div className="admin-page-header">
				<div>
					<button
						type="button"
						onClick={() => navigate('/admin')}
						className="lms-btn-secondary"
						style={{ marginBottom: 'var(--space-4)' }}
					>
						← Înapoi la Dashboard
					</button>
					<h1 className="admin-page-title">Taskuri</h1>
					<p className="admin-page-subtitle">Verificări și urmăriri rapide</p>
				</div>
			</div>

			<div className="lms-empty-state" style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'left' }}>
				<div className="lms-empty-icon">✅</div>
				<h3 className="lms-empty-title">Ce poți face de aici</h3>
				<p className="lms-empty-description" style={{ marginBottom: '1.25rem' }}>
					Lista de taskuri formale (tichetare) nu e încă implementată. Folosește legăturile de mai jos pentru
					verificări manuale și conținut.
				</p>
				<ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
					<li>
						<Link to="/admin/tests/pending-review" className="lms-btn-primary" style={{ display: 'inline-block' }}>
							Teste în așteptare la verificare manuală
						</Link>
					</li>
					<li>
						<Link to="/admin/content?tab=manual-review" className="lms-btn-secondary" style={{ display: 'inline-block' }}>
							Verificare manuală conținut
						</Link>
					</li>
				</ul>
			</div>
		</div>
	);
};

export default AdminTasksPage;
