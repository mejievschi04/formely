import React, { useState, useEffect, useCallback, useRef } from 'react';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';

/**
 * Atribuire curs ↔ echipe (sincronizare) și elevi (atașare fără a șterge alte cursuri).
 */
const CourseDistributionPanel = ({ course, readOnly, onUpdated }) => {
	const { showToast } = useToast();
	const [allTeams, setAllTeams] = useState([]);
	const [selectedTeamIds, setSelectedTeamIds] = useState([]);
	const [learnerSearch, setLearnerSearch] = useState('');
	const [learnerOptions, setLearnerOptions] = useState([]);
	const [learnerHint, setLearnerHint] = useState('');
	const [loadingTeams, setLoadingTeams] = useState(true);
	const [savingTeams, setSavingTeams] = useState(false);
	const [attachBusy, setAttachBusy] = useState(false);
	const [detachBusy, setDetachBusy] = useState(null);
	const [mandatory, setMandatory] = useState(true);
	const teamSaveTimer = useRef(null);

	const assignedUsers = course?.assigned_users || course?.assignedUsers || [];
	const assignedIds = new Set(assignedUsers.map((u) => u.id));

	const teamIdsKey = (course?.teams || [])
		.map((t) => t.id)
		.sort((a, b) => a - b)
		.join(',');

	useEffect(() => {
		if (!course?.id) return;
		setSelectedTeamIds((course.teams || []).map((t) => t.id));
	}, [course?.id, teamIdsKey]);

	useEffect(() => {
		if (!course?.id || readOnly) {
			setLoadingTeams(false);
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				setLoadingTeams(true);
				const data = await adminService.getAssignableTeamsForCourse(course.id);
				if (!cancelled) setAllTeams(data.teams || []);
			} catch {
				if (!cancelled) showToast('Nu s-au putut încărca echipele', 'error');
			} finally {
				if (!cancelled) setLoadingTeams(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [course?.id, readOnly, showToast]);

	const fetchLearners = useCallback(async () => {
		if (!course?.id || readOnly) return;
		try {
			const data = await adminService.getAssignableLearnersForCourse(course.id, {
				search: learnerSearch.trim() || undefined,
			});
			setLearnerOptions(data.learners || []);
			setLearnerHint(data.hint || '');
		} catch {
			showToast('Nu s-au putut încărca elevii', 'error');
		}
	}, [course?.id, learnerSearch, readOnly, showToast]);

	useEffect(() => {
		const t = setTimeout(fetchLearners, 200);
		return () => clearTimeout(t);
	}, [fetchLearners]);

	const persistTeams = async (ids) => {
		if (readOnly || !course?.id) return;
		setSavingTeams(true);
		try {
			await adminService.attachTeamsToCourse(course.id, ids);
			showToast('Echipe actualizate', 'success');
			await onUpdated?.();
		} catch (e) {
			showToast(e?.response?.data?.message || 'Eroare la salvarea echipelor', 'error');
			setSelectedTeamIds((course.teams || []).map((t) => t.id));
		} finally {
			setSavingTeams(false);
		}
	};

	const onTeamToggle = (teamId, checked) => {
		if (readOnly) return;
		const next = checked
			? Array.from(new Set([...selectedTeamIds, teamId]))
			: selectedTeamIds.filter((id) => id !== teamId);
		setSelectedTeamIds(next);
		if (teamSaveTimer.current) clearTimeout(teamSaveTimer.current);
		teamSaveTimer.current = setTimeout(() => persistTeams(next), 400);
	};

	const attachLearner = async (userId) => {
		if (readOnly || !course?.id || attachBusy) return;
		setAttachBusy(true);
		try {
			await adminService.attachLearnersToCourse(course.id, [userId], {
				is_mandatory: mandatory,
			});
			showToast('Curs atribuit elevului', 'success');
			setLearnerSearch('');
			await onUpdated?.();
		} catch (e) {
			showToast(e?.response?.data?.message || e?.response?.data?.error || 'Nu s-a putut atribui cursul', 'error');
		} finally {
			setAttachBusy(false);
		}
	};

	const detachLearner = async (userId) => {
		if (readOnly || !course?.id) return;
		setDetachBusy(userId);
		try {
			await adminService.detachLearnerFromCourse(course.id, userId);
			showToast('Atribuire eliminată', 'success');
			await onUpdated?.();
		} catch (e) {
			showToast(e?.response?.data?.message || 'Eroare la eliminare', 'error');
		} finally {
			setDetachBusy(null);
		}
	};

	const pickableLearners = learnerOptions.filter((u) => !assignedIds.has(u.id));

	if (!course?.id) return null;

	return (
		<section className="course-distribution-panel" aria-labelledby="course-distribution-heading">
			<h2 id="course-distribution-heading" className="course-distribution-title">
				Echipe și elevi
			</h2>
			<p className="course-distribution-intro">
				Atașează echipe la curs (toți membrii pot primi acces prin echipă) și, dacă e nevoie, atribuie cursul direct unor elevi.
				Atribuirea directă nu șterge celelalte cursuri ale elevului.
			</p>

			<div className="course-distribution-grid">
				<div className="course-distribution-card">
					<h3 className="course-distribution-card-title">Echipe</h3>
					{readOnly ? (
						<ul className="course-distribution-list">
							{(course.teams || []).length === 0 ? (
								<li className="course-distribution-muted">Nicio echipă atașată.</li>
							) : (
								(course.teams || []).map((t) => (
									<li key={t.id}>{t.name}</li>
								))
							)}
						</ul>
					) : loadingTeams ? (
							<p className="course-distribution-muted">Se încarcă echipele…</p>
					) : (
						<>
							{savingTeams && (
								<p className="course-distribution-muted course-distribution-saving">Se salvează…</p>
							)}
							<ul className="course-distribution-checklist">
								{allTeams.map((t) => (
									<li key={t.id}>
										<label className="course-distribution-check">
											<input
												type="checkbox"
												checked={selectedTeamIds.includes(t.id)}
												onChange={(e) => onTeamToggle(t.id, e.target.checked)}
											/>
											<span>{t.name}</span>
										</label>
									</li>
								))}
							</ul>
						</>
					)}
				</div>

				<div className="course-distribution-card">
					<h3 className="course-distribution-card-title">Elevi atribuiți direct</h3>
					{assignedUsers.length === 0 ? (
						<p className="course-distribution-muted">Niciun elev cu atribuire directă.</p>
					) : (
						<ul className="course-distribution-assigned">
							{assignedUsers.map((u) => (
								<li key={u.id} className="course-distribution-assigned-row">
									<div>
										<div className="course-distribution-name">{u.name}</div>
										<div className="course-distribution-email">{u.email}</div>
									</div>
									{!readOnly && (
										<button
											type="button"
											className="course-distribution-btn-remove"
											disabled={detachBusy === u.id}
											onClick={() => detachLearner(u.id)}
										>
											{detachBusy === u.id ? '…' : 'Elimină'}
										</button>
									)}
								</li>
							))}
						</ul>
					)}

					{!readOnly && (
						<div className="course-distribution-add">
							<label className="course-distribution-label">
								<span>Caută elev</span>
								<input
									type="search"
									className="course-distribution-input"
									value={learnerSearch}
									onChange={(e) => setLearnerSearch(e.target.value)}
									placeholder="Nume sau e-mail…"
									autoComplete="off"
								/>
							</label>
							<label className="course-distribution-check course-distribution-mandatory">
								<input
									type="checkbox"
									checked={mandatory}
									onChange={(e) => setMandatory(e.target.checked)}
								/>
								<span>Curs obligatoriu (necesită test obligatoriu la curs)</span>
							</label>
							{learnerHint && <p className="course-distribution-hint">{learnerHint}</p>}
							{pickableLearners.length > 0 && (
								<ul className="course-distribution-pick-list">
									{pickableLearners.slice(0, 20).map((u) => (
										<li key={u.id}>
											<button
												type="button"
												className="course-distribution-pick-btn"
												disabled={attachBusy}
												onClick={() => attachLearner(u.id)}
											>
												+ {u.name}
												<span className="course-distribution-email-inline">{u.email}</span>
											</button>
										</li>
									))}
								</ul>
							)}
							{!learnerHint && pickableLearners.length === 0 && learnerOptions.length > 0 && (
								<p className="course-distribution-muted">Toți elevii din listă au deja acest curs.</p>
							)}
							{!learnerHint && pickableLearners.length === 0 && learnerOptions.length === 0 && learnerSearch.trim().length >= 2 && (
								<p className="course-distribution-muted">Niciun rezultat.</p>
							)}
						</div>
					)}
				</div>
			</div>
		</section>
	);
};

export default CourseDistributionPanel;
