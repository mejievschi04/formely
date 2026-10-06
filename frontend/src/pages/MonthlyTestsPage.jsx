import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardText, Clock, ArrowRight, SealCheck, Repeat } from '@phosphor-icons/react';
import { examService } from '../services/api';
import './MonthlyTestsPage.css';

const MonthlyTestsPage = () => {
	const navigate = useNavigate();
	const [exams, setExams] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				setLoading(true);
				setError(null);
				const data = await examService.listStandaloneExams();
				if (!cancelled) setExams(Array.isArray(data) ? data : []);
			} catch (err) {
				console.error('Error fetching monthly tests:', err);
				if (!cancelled) setError('Nu s-au putut încărca testele lunare');
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	if (loading) {
		return (
			<div className="monthly-tests-page">
				<div className="monthly-tests-loading">
					<div className="va-spinner" />
					<p>Se încarcă testele lunare...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="monthly-tests-page">
			<header className="monthly-tests-header">
				<h1 className="monthly-tests-title">Teste lunare</h1>
				<p className="monthly-tests-subtitle">Examenele pe care le poți susține acum.</p>
			</header>

			{error ? (
				<p className="monthly-tests-error" role="alert">{error}</p>
			) : exams.length === 0 ? (
				<section className="monthly-tests-empty" aria-label="Teste lunare">
					<ClipboardText size={36} weight="duotone" aria-hidden />
					<h2>Nu ai teste lunare momentan</h2>
					<p>Când un examen îți este atribuit, apare aici.</p>
				</section>
			) : (
				<div className="monthly-tests-grid">
					{exams.map((exam) => {
						const minutes = Number(exam.time_limit_minutes) > 0 ? `${exam.time_limit_minutes} min` : null;
						const passing = exam.passing_score != null ? `Promovare ${exam.passing_score}%` : null;
						const attempts = Number(exam.max_attempts) > 0
							? `${exam.max_attempts} ${Number(exam.max_attempts) === 1 ? 'încercare' : 'încercări'}`
							: null;
						return (
							<button
								key={exam.id}
								type="button"
								className="monthly-tests-tile"
								onClick={() => navigate(`/exams/${exam.id}`)}
							>
								<span className="monthly-tests-tile-top">
									<span className="monthly-tests-tile-icon" aria-hidden>
										<ClipboardText size={22} weight="duotone" />
									</span>
									<span className="monthly-tests-tile-go" aria-hidden>
										<ArrowRight size={16} weight="bold" />
									</span>
								</span>
								<span className="monthly-tests-tile-copy">
									<strong>{exam.title || 'Test lunar'}</strong>
									{exam.description ? <span className="monthly-tests-tile-desc">{exam.description}</span> : null}
								</span>
								<span className="monthly-tests-tile-chips">
									{minutes ? (
										<span className="monthly-tests-tile-chip">
											<Clock size={14} weight="bold" aria-hidden />
											{minutes}
										</span>
									) : null}
									{passing ? (
										<span className="monthly-tests-tile-chip">
											<SealCheck size={14} weight="bold" aria-hidden />
											{passing}
										</span>
									) : null}
									{attempts ? (
										<span className="monthly-tests-tile-chip">
											<Repeat size={14} weight="bold" aria-hidden />
											{attempts}
										</span>
									) : null}
									{!minutes && !passing && !attempts ? (
										<span className="monthly-tests-tile-chip">Deschide testul</span>
									) : null}
								</span>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
};

export default MonthlyTestsPage;
