import React from 'react';
import './Step6Review.css';

/**
 * Step 6 — Publishing (instructiuni.md): draft vs published, access, enrollment type.
 * Plus rezumat și buton Creează curs.
 */
const Step6Review = ({ data, onUpdate, onCreate, loading }) => {
	const modules = data.structure?.modules || [];
	const totalModules = modules.length;
	const totalLessons = modules.reduce((s, m) => s + (m.lessons?.length || 0), 0);
	const publishStatus = data.publish_status ?? 'draft';
	const accessType = data.access_type ?? 'free';
	const enrollmentType = data.enrollment_type ?? 'open';

	return (
		<div className="step6-review">
			<div className="step6-header">
				<h3>Publicare</h3>
				<p className="step6-description">
					Alege dacă cursul este ciornă sau publicat, tipul de acces și tipul de înscriere. Apoi creează cursul.
				</p>
			</div>

			<div className="step6-content">
				<div className="step6-publishing">
					<h4>Setări publicare</h4>
					<div className="step6-form-group">
						<label className="step6-label">Status</label>
						<select
							value={publishStatus}
							onChange={(e) => onUpdate({ publish_status: e.target.value })}
							className="step6-select"
						>
							<option value="draft">Ciornă – vizibil doar în admin</option>
							<option value="published">Publicat – vizibil pentru cursanți</option>
						</select>
					</div>
					<div className="step6-form-group">
						<label className="step6-label">Tip acces</label>
						<select
							value={accessType}
							onChange={(e) => onUpdate({ access_type: e.target.value })}
							className="step6-select"
						>
							<option value="free">Gratuit</option>
						</select>
					</div>
					<div className="step6-form-group">
						<label className="step6-label">Tip înscriere</label>
						<select
							value={enrollmentType}
							onChange={(e) => onUpdate({ enrollment_type: e.target.value })}
							className="step6-select"
						>
							<option value="open">Deschis – oricine se poate înscrie</option>
							<option value="by_invite">Doar pe invitație</option>
							<option value="paid">Plătit</option>
						</select>
					</div>
					<p className="step6-hint-block">
						Poți atașa echipe și quiz-uri din Course Builder după ce creezi cursul.
					</p>
				</div>

				<div className="step6-summary">
					<h4>Rezumat curs</h4>
					<div className="step6-summary-grid">
						<div className="step6-summary-item">
							<div className="step6-summary-label">Titlu</div>
							<div className="step6-summary-value">{data.title || '—'}</div>
						</div>
						<div className="step6-summary-item">
							<div className="step6-summary-label">Module</div>
							<div className="step6-summary-value">{totalModules}</div>
						</div>
						<div className="step6-summary-item">
							<div className="step6-summary-label">Lecții</div>
							<div className="step6-summary-value">{totalLessons}</div>
						</div>
						<div className="step6-summary-item">
							<div className="step6-summary-label">Vizibilitate</div>
							<div className="step6-summary-value">{data.visibility || 'public'}</div>
						</div>
					</div>
				</div>

				<div className="step6-actions">
					<button
						type="button"
						className="step6-publish-btn"
						onClick={onCreate}
						disabled={loading || !data.title?.trim()}
					>
						{loading ? 'Se creează...' : 'Creează curs'}
					</button>
					{!data.title?.trim() && (
						<p className="step6-hint">Completează titlul cursului (pasul 1) pentru a continua.</p>
					)}
				</div>
			</div>
		</div>
	);
};

export default Step6Review;
