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
		<div className="admin-manual-review-page admin-tests-page">
			<header className="admin-tests-header">
				<div>
					<h1>Verificare manuală</h1>
					<p className="admin-tests-header-lead">Coadă unică pentru examene și teste cu răspunsuri deschise.</p>
				</div>
			</header>

			<nav className="admin-manual-review-kind-tabs" aria-label="Tip conținut">
				<button type="button" className={kind === 'exams' ? 'is-active' : ''} onClick={() => setKind('exams')}>
					Examene
				</button>
				<button type="button" className={kind === 'tests' ? 'is-active' : ''} onClick={() => setKind('tests')}>
					Teste
				</button>
			</nav>

			<div className="admin-manual-review-panel-wrap">
				{kind === 'exams' ? <AdminExamManualReviewPanel /> : <TestManualReviewPanel embedded />}
			</div>
		</div>
	);
}
