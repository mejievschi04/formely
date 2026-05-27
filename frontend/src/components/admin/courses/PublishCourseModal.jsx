import React, { useState, useEffect } from 'react';
import { adminService } from '../../../services/api';
import { teamAccentNeutral } from '../../../utils/teamAccent';

const PublishCourseModal = ({ open, onClose, courseId, onPublished, validationReport, onValidate }) => {
	const [teams, setTeams] = useState([]);
	const [selectedTeamIds, setSelectedTeamIds] = useState([]);
	const [loading, setLoading] = useState(false);
	const [loadingTeams, setLoadingTeams] = useState(true);
	const [validating, setValidating] = useState(false);
	const [error, setError] = useState(null);
	const [publishErrorReport, setPublishErrorReport] = useState(null);

	const hasErrors = validationReport && !validationReport.ok;
	const errors = Array.isArray(validationReport?.errors) ? validationReport.errors : [];
	const backendErrors = Array.isArray(publishErrorReport?.errors) ? publishErrorReport.errors : [];
	const canPublish = validationReport?.ok && !loading;

	useEffect(() => {
		if (open) {
			setError(null);
			setPublishErrorReport(null);
			setLoadingTeams(true);
			adminService.getTeams().then((data) => {
				setTeams(Array.isArray(data) ? data : data?.data || []);
				setSelectedTeamIds([]);
			}).catch(() => setTeams([])).finally(() => setLoadingTeams(false));
		}
	}, [open]);

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
		if (!canPublish) return;
		setError(null);
		setLoading(true);
		try {
			const res = await adminService.builderPublishCourse(courseId, selectedTeamIds);
			onPublished?.(res);
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
		setSelectedTeamIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
		);
	};

	if (!open) return null;

	return (
		<div className="admin-team-modal-overlay publish-course-modal-overlay" onClick={onClose}>
			<div className="admin-team-modal" onClick={(e) => e.stopPropagation()}>
				<div className="admin-team-modal-header">
					<h2 className="admin-team-modal-title">Publicare curs</h2>
					<button type="button" className="admin-team-modal-close" onClick={onClose} aria-label="Închide">×</button>
				</div>
				<div className="admin-team-modal-body">
					{error && (
						<p className="admin-form-error-inline publish-course-error-margin" role="alert">
							{error}
						</p>
					)}

					{publishErrorReport && backendErrors.length > 0 && (
						<div role="alert" className="admin-form-error-inline publish-course-error-block">
							<div className="publish-course-error-block-title">Serverul a respins publicarea: cursul are erori de validare</div>
							<ul className="publish-course-error-list">
								{backendErrors.slice(0, 5).map((err, i) => (
									<li key={i}>{err.message || err}</li>
								))}
								{backendErrors.length > 5 && <li className="publish-course-error-more">... și încă {backendErrors.length - 5} erori</li>}
							</ul>
							<p className="publish-course-error-hint">
								Apasă „Verifică acum” mai sus sau închide și folosește „Verifică” în tab-ul Workflow, remediază erorile, apoi încearcă din nou.
							</p>
						</div>
					)}

					{!validationReport && (
						<div className="admin-form-section publish-course-validate-section">
							<p className="publish-course-validate-text">
								Rulează validarea pentru a verifica că cursul este complet înainte de publicare.
							</p>
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

					{hasErrors && errors.length > 0 && (
						<div role="alert" className="admin-form-error-inline publish-course-error-block">
							<div className="publish-course-error-block-title">Cursul are erori de validare</div>
							<ul className="publish-course-error-list">
								{errors.slice(0, 5).map((err, i) => (
									<li key={i}>{err.message || err}</li>
								))}
								{errors.length > 5 && <li className="publish-course-error-more">... și încă {errors.length - 5} erori</li>}
							</ul>
							<p className="publish-course-error-hint">
								Închide modalul, apasă „Verifică” în tab-ul Workflow și remediază erorile, apoi încearcă din nou să publici.
							</p>
						</div>
					)}

					<p className="admin-page-subtitle publish-course-subtitle-margin">
						Poți limita cursul la anumite echipe. Dacă nu selectezi nicio echipă, cursul va fi disponibil pentru toți studenții și vor primi notificare.
					</p>
					<div className="admin-form-group">
						<label className="admin-settings-label">Echipe (opțional)</label>
						{loadingTeams ? (
							<p className="publish-course-teams-muted">Se încarcă echipele...</p>
						) : teams.length === 0 ? (
							<p className="publish-course-teams-muted">Nu există echipe. Cursul va fi pentru toți studenții.</p>
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
											style={{ background: teamAccentNeutral(t) }}
											aria-hidden
										/>
										<span>{t.name}</span>
									</label>
								))}
							</div>
						)}
					</div>
					<div className="publish-course-actions">
						<button type="button" className="admin-btn admin-btn-secondary" onClick={onClose}>
							Anulare
						</button>
						<button
							type="button"
							className="admin-btn admin-btn-primary"
							onClick={handlePublish}
							disabled={loading || !canPublish}
							aria-busy={loading}
							title={!validationReport ? 'Rulează mai întâi validarea' : hasErrors ? 'Remediază erorile de validare' : undefined}
						>
							{loading ? 'Se publică...' : 'Publică'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default PublishCourseModal;
