import React, { useEffect, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { adminService } from '../../../services/api';
import { teamAccent } from '../../../utils/teamAccent';
import {
	clearPublishDraft,
	groupPublishIssues,
	readPublishDraft,
	writePublishDraft,
} from '../../../utils/publishCourseIssues';
import Modal from '../../common/Modal';

function normalizeTeams(raw) {
	return Array.isArray(raw) ? raw : raw?.data || [];
}

function extractAssignedUsers(courseData) {
	if (!courseData || typeof courseData !== 'object') return [];
	const users = courseData.assigned_users || courseData.assignedUsers || [];
	return Array.isArray(users) ? users : [];
}

function extractTeamIds(courseData, fallbackCourse) {
	const teams = courseData?.teams || fallbackCourse?.teams || [];
	return (Array.isArray(teams) ? teams : []).map((t) => t.id).filter(Boolean);
}

function PublishIssueList({ errors, onFixIssue }) {
	const groups = groupPublishIssues(errors);
	if (!groups.length) return null;

	return (
		<div role="alert" className="admin-form-error-inline publish-course-error-block">
			<div className="publish-course-error-block-title">Cursul nu este pregătit pentru publicare</div>
			{groups.map((group) => (
				<div key={group.key} className="publish-course-error-group">
					<h3 className="publish-course-error-group-title">{group.label}</h3>
					<ul className="publish-course-error-list">
						{group.items.map((issue, i) => (
							<li key={`${issue.path}-${i}`}>
								<span>{issue.message}</span>
								{issue.actionLabel && typeof onFixIssue === 'function' ? (
									<button
										type="button"
										className="publish-course-error-action"
										onClick={() => onFixIssue(issue)}
									>
										{issue.actionLabel}
									</button>
								) : null}
							</li>
						))}
					</ul>
				</div>
			))}
		</div>
	);
}

const PublishCourseModal = ({
	open,
	onClose,
	course,
	onPublished,
	validationReport,
	onValidate,
	onFixIssue,
}) => {
	const courseId = course?.id;
	const [teams, setTeams] = useState([]);
	const [audience, setAudience] = useState('all');
	const [selectedTeamIds, setSelectedTeamIds] = useState([]);
	const [assignedUsers, setAssignedUsers] = useState([]);
	const [catalogOutsideMap, setCatalogOutsideMap] = useState(false);
	const [loading, setLoading] = useState(false);
	const [loadingTeams, setLoadingTeams] = useState(true);
	const [validating, setValidating] = useState(false);
	const [error, setError] = useState(null);
	const [publishErrorReport, setPublishErrorReport] = useState(null);

	const hasErrors = validationReport && !validationReport.ok;
	const errors = Array.isArray(validationReport?.errors) ? validationReport.errors : [];
	const backendErrors = Array.isArray(publishErrorReport?.errors) ? publishErrorReport.errors : [];
	const displayErrors = backendErrors.length > 0 ? backendErrors : errors;
	const teamsRequired = audience === 'teams';
	const missingTeams = teamsRequired && selectedTeamIds.length === 0;
	const canPublish = Boolean(validationReport?.ok) && !loading && !loadingTeams && !missingTeams;

	const persistDraft = (next) => {
		if (!courseId) return;
		writePublishDraft(courseId, next);
	};

	useEffect(() => {
		if (!open || !courseId) return;

		let cancelled = false;
		setError(null);
		setPublishErrorReport(null);
		setLoadingTeams(true);

		(async () => {
			try {
				const [teamsData, courseData] = await Promise.all([
					adminService.getTeams(),
					adminService.getCourse(courseId),
				]);
				if (cancelled) return;

				const fullCourse = courseData?.course || courseData;
				const existingTeamIds = extractTeamIds(fullCourse, course);
				const users = extractAssignedUsers(fullCourse);
				const saved = readPublishDraft(courseId);
				const nextAudience = saved?.audience === 'teams' || saved?.audience === 'all'
					? saved.audience
					: existingTeamIds.length > 0
						? 'teams'
						: 'all';
				const nextTeamIds = Array.isArray(saved?.selectedTeamIds)
					? saved.selectedTeamIds
					: existingTeamIds;
				const nextCatalog = typeof saved?.catalogOutsideMap === 'boolean'
					? saved.catalogOutsideMap
					: Boolean(fullCourse?.settings?.catalog_outside_map ?? course?.settings?.catalog_outside_map);

				setTeams(normalizeTeams(teamsData));
				setAudience(nextAudience);
				setSelectedTeamIds(nextTeamIds);
				setAssignedUsers(users);
				setCatalogOutsideMap(nextCatalog);
				writePublishDraft(courseId, {
					audience: nextAudience,
					selectedTeamIds: nextTeamIds,
					catalogOutsideMap: nextCatalog,
				});
			} catch {
				if (cancelled) return;
				setTeams([]);
				setSelectedTeamIds(extractTeamIds(null, course));
				setAssignedUsers([]);
			} finally {
				if (!cancelled) setLoadingTeams(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [open, courseId]);

	const handleValidateClick = async () => {
		if (!onValidate) return;
		setValidating(true);
		try {
			await onValidate();
		} finally {
			setValidating(false);
		}
	};

	const handlePublish = async () => {
		if (!courseId || missingTeams) return;
		setError(null);
		setLoading(true);
		try {
			if (onValidate) {
				const report = await onValidate();
				if (report && report.ok === false) {
					return;
				}
			}
			const teamIds = audience === 'teams' ? selectedTeamIds : [];
			const res = await adminService.builderPublishCourse(courseId, teamIds, { catalogOutsideMap });
			clearPublishDraft(courseId);
			onPublished?.(res, { catalogOutsideMap, teamIds, audience });
			onClose?.();
		} catch (e) {
			console.error('Publish failed:', e);
			if (e?.response?.status === 422 && Array.isArray(e?.response?.data?.errors) && e.response.data.errors.length > 0) {
				setPublishErrorReport(e.response.data);
				setError(null);
			} else {
				setPublishErrorReport(null);
				setError(e?.response?.data?.message || e?.message || 'Eroare la publicare. Încearcă din nou.');
			}
		} finally {
			setLoading(false);
		}
	};

	const toggleTeam = (id) => {
		setSelectedTeamIds((prev) => {
			const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
			persistDraft({ audience, selectedTeamIds: next, catalogOutsideMap });
			return next;
		});
	};

	const publishLabel = audience === 'teams' ? 'Publică pentru echipe' : 'Publică';
	const blockedReason = !validationReport
		? 'Verifică mai întâi.'
		: hasErrors
			? 'Remediază blocajele, apoi verifică din nou.'
			: missingTeams
				? 'Alege cel puțin o echipă.'
				: null;

	return (
		<Modal
			isOpen={open}
			onClose={onClose}
			closeOnBackdropClick={!loading}
			closeOnEscape={!loading}
			unstyledContent
			ariaLabelledby="publish-course-modal-title"
			className="publish-course-modal-overlay"
			contentClassName="publish-course-modal-shell"
		>
			<div className="admin-team-modal publish-course-modal-panel">
				<div className="admin-team-modal-header">
					<h2 id="publish-course-modal-title" className="admin-team-modal-title">
						Publicare curs
					</h2>
					<button type="button" className="admin-team-modal-close va-close-btn" onClick={onClose} aria-label="Închide"><X size={18} weight="bold" aria-hidden="true" /></button>
				</div>
				<div className="admin-team-modal-body">
					{error && (
						<p className="admin-form-error-inline publish-course-error-margin" role="alert">
							{error}
						</p>
					)}

					<section className="publish-course-section">
						<h3 className="publish-course-section-title">Este cursul pregătit?</h3>
						{!validationReport && (
							<div className="admin-form-section publish-course-validate-section">
								<button
									type="button"
									className="admin-btn admin-btn-secondary"
									onClick={handleValidateClick}
									disabled={validating}
								>
									{validating ? 'Se verifică...' : 'Verifică acum'}
								</button>
							</div>
						)}
						{validationReport?.ok && displayErrors.length === 0 && (
							<p className="publish-course-ready" role="status">Pregătit de publicare.</p>
						)}
						<PublishIssueList errors={displayErrors} onFixIssue={onFixIssue} />
						{validationReport && (
							<button
								type="button"
								className="admin-btn admin-btn-secondary"
								onClick={handleValidateClick}
								disabled={validating}
							>
								{validating ? 'Se verifică...' : 'Verifică din nou'}
							</button>
						)}
					</section>

					<fieldset className="publish-course-section">
						<legend className="publish-course-section-title">Cine primește acces?</legend>
						<label className="publish-course-choice">
							<input
								type="radio"
								name="publish-audience"
								checked={audience === 'all'}
								onChange={() => {
									setAudience('all');
									persistDraft({ audience: 'all', selectedTeamIds, catalogOutsideMap });
								}}
							/>
							<span><strong>Toți cursanții</strong></span>
						</label>
						<label className="publish-course-choice">
							<input
								type="radio"
								name="publish-audience"
								checked={audience === 'teams'}
								onChange={() => {
									setAudience('teams');
									persistDraft({ audience: 'teams', selectedTeamIds, catalogOutsideMap });
								}}
							/>
							<span><strong>Echipe selectate</strong></span>
						</label>
						{audience === 'teams' && (
							<div className="admin-form-group">
								{loadingTeams ? (
									<p className="publish-course-teams-muted">Se încarcă echipele...</p>
								) : teams.length === 0 ? (
									<p className="publish-course-teams-muted">Nu există echipe.</p>
								) : (
									<div className="publish-course-teams-list">
										{teams.map((t) => (
											<label key={t.id} className="publish-course-team-item">
												<input
													type="checkbox"
													checked={selectedTeamIds.includes(t.id)}
													onChange={() => toggleTeam(t.id)}
												/>
												<span
													className="publish-course-team-swatch"
													style={{ background: teamAccent(t) }}
													aria-hidden
												/>
												<span>{t.name}</span>
											</label>
										))}
									</div>
								)}
								{missingTeams && (
									<p className="admin-form-error-inline" role="alert">Selectează cel puțin o echipă.</p>
								)}
							</div>
						)}
						{assignedUsers.length > 0 && (
							<div className="admin-form-group publish-course-assigned-users">
								<p className="admin-settings-label">Atribuiți direct</p>
								<ul className="publish-course-assigned-users-list">
									{assignedUsers.map((user) => (
										<li key={user.id}>
											<strong>{user.name}</strong>
											{user.email ? <span>{user.email}</span> : null}
										</li>
									))}
								</ul>
							</div>
						)}
					</fieldset>

					<fieldset className="publish-course-section">
						<legend className="publish-course-section-title">Unde apare cursul?</legend>
						<p className="publish-course-section-hint">
							Cursanții îl văd în mapele în care e pus. Dacă nu e în nicio mapă, apare direct în pagina Cursuri.
						</p>
					</fieldset>

					{blockedReason && (
						<p id="publish-blocked-reason" className="publish-course-blocked-reason" role="status">{blockedReason}</p>
					)}

					<div className="publish-course-actions">
						<button type="button" className="admin-btn admin-btn-secondary" onClick={onClose}>
							Anulare
						</button>
						<button
							type="button"
							className="admin-btn lms-btn-primary"
							onClick={handlePublish}
							disabled={!canPublish}
							aria-busy={loading}
							aria-describedby={blockedReason ? 'publish-blocked-reason' : undefined}
						>
							{loading ? 'Se publică...' : publishLabel}
						</button>
					</div>
				</div>
			</div>
		</Modal>
	);
};

export default PublishCourseModal;
