import React from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminExamManualReviewPanel from '../../components/admin/manual-review/AdminExamManualReviewPanel';
import TestManualReviewPanel from '../../components/admin/manual-review/TestManualReviewPanel';
import './AdminManualReviewPage.css';

export default function AdminManualReviewPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const kind = searchParams.get('kind') === 'tests' ? 'tests' : 'exams';

	const setKind = (next) => {
		setSearchParams(
			(prev) => {
				const n = new URLSearchParams(prev);
				n.set('tab', 'manual-review');
				n.set('kind', next);
				return n;
			},
			{ replace: true },
		);
	};

	return (
		<div className="admin-manual-review-page">
			<header className="admin-manual-review-page-header">
				<div>
					<h1>Verificare manuală</h1>
					<p className="admin-page-subtitle">
						Coadă unică Formely pentru răspunsuri care necesită corectare manuală.
					</p>
				</div>
				<nav className="admin-manual-review-kind-tabs" aria-label="Tip conținut">
					<button type="button" className={kind === 'exams' ? 'is-active' : ''} onClick={() => setKind('exams')}>
						Examene
					</button>
					<button type="button" className={kind === 'tests' ? 'is-active' : ''} onClick={() => setKind('tests')}>
						Teste
					</button>
				</nav>
			</header>

			{kind === 'exams' ? <AdminExamManualReviewPanel /> : <TestManualReviewPanel />}
		</div>
	);
}
