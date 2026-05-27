import React, { useState } from 'react';
import './Step0Context.css';

/** Step 1 — Course Setup (instructiuni.md): title, description, category, tags, difficulty, duration, visibility */
const DIFFICULTY_OPTIONS = [
	{ value: 'beginner', label: 'Începător' },
	{ value: 'intermediate', label: 'Intermediar' },
	{ value: 'advanced', label: 'Avansat' },
];

const VISIBILITY_OPTIONS = [
	{ value: 'public', label: 'Public' },
	{ value: 'private', label: 'Privat' },
	{ value: 'hidden', label: 'Ascuns' },
];

const Step0Context = ({ data, onUpdate }) => {
	const [tagInput, setTagInput] = useState('');
	const tags = Array.isArray(data.marketing_tags) ? data.marketing_tags : (data.tags ? [].concat(data.tags) : []);

	const addTag = () => {
		const t = tagInput.trim();
		if (!t || tags.includes(t)) return;
		onUpdate({ marketing_tags: [...tags, t] });
		setTagInput('');
	};

	const removeTag = (index) => {
		const next = tags.filter((_, i) => i !== index);
		onUpdate({ marketing_tags: next });
	};

	return (
		<div className="step0-context">
			<div className="step0-header">
				<h3>Setare curs</h3>
				<p className="step0-description">
					Titlu, descriere, categorie, etichete, dificultate, durată și vizibilitate.
				</p>
			</div>

			<div className="step0-content">
				<div className="step0-section">
					<label className="step0-label">Titlu Curs <span className="step0-required">*</span></label>
					<p className="step0-hint">Numele cursului</p>
					<div className="step0-form-group">
						<input
							type="text"
							placeholder="Titlul cursului"
							value={data.title || ''}
							onChange={(e) => onUpdate({ title: e.target.value })}
							className="step0-input"
							required
						/>
					</div>
				</div>

				<div className="step0-section">
					<label className="step0-label">Descriere</label>
					<p className="step0-hint">Scopul și conținutul cursului</p>
					<div className="step0-form-group">
						<textarea
							placeholder="Descrie conținutul și scopul cursului..."
							value={data.description || ''}
							onChange={(e) => onUpdate({ description: e.target.value })}
							className="step0-textarea"
							rows={4}
						/>
					</div>
				</div>

				<div className="step0-form-row">
					<div className="step0-section">
						<label className="step0-label">Categorie</label>
						<div className="step0-form-group">
							<input
								type="text"
								placeholder="Domeniu / arie tematică"
								value={data.category || ''}
								onChange={(e) => onUpdate({ category: e.target.value })}
								className="step0-input"
							/>
						</div>
					</div>
					<div className="step0-section">
						<label className="step0-label">Nivel dificultate</label>
						<div className="step0-form-group">
							<select
								value={data.level || 'beginner'}
								onChange={(e) => onUpdate({ level: e.target.value })}
								className="step0-select"
							>
								{DIFFICULTY_OPTIONS.map((o) => (
									<option key={o.value} value={o.value}>{o.label}</option>
								))}
							</select>
						</div>
					</div>
				</div>

				<div className="step0-section">
					<label className="step0-label">Etichete (tags)</label>
					<p className="step0-hint">Adaugă etichete separate prin Enter sau buton</p>
					<div className="step0-form-group">
						<div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
							<input
								type="text"
								placeholder="Cuvinte-cheie, separate prin virgulă"
								value={tagInput}
								onChange={(e) => setTagInput(e.target.value)}
								onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
								className="step0-input"
								style={{ flex: '1', minWidth: '120px' }}
							/>
							<button type="button" className="step0-btn step0-btn-secondary" onClick={addTag}>Adaugă</button>
						</div>
						{tags.length > 0 && (
							<div className="step0-tags-list">
								{tags.map((t, i) => (
									<span key={i} className="step0-tag">
										{t}
										<button type="button" className="step0-tag-remove" onClick={() => removeTag(i)} aria-label="Elimină">×</button>
									</span>
								))}
							</div>
						)}
					</div>
				</div>

				<div className="step0-form-row">
					<div className="step0-section">
						<label className="step0-label">Durată estimată (ore)</label>
						<p className="step0-hint">Timp total estimat pentru parcurgere</p>
						<div className="step0-form-group">
							<input
								type="number"
								min={1}
								placeholder="Durată în ore"
								value={data.estimated_duration_hours ?? ''}
								onChange={(e) => onUpdate({ estimated_duration_hours: e.target.value ? parseInt(e.target.value, 10) : null })}
								className="step0-input"
							/>
						</div>
					</div>
					<div className="step0-section">
						<label className="step0-label">Vizibilitate</label>
						<div className="step0-form-group">
							<select
								value={data.visibility || 'public'}
								onChange={(e) => onUpdate({ visibility: e.target.value })}
								className="step0-select"
							>
								{VISIBILITY_OPTIONS.map((o) => (
									<option key={o.value} value={o.value}>{o.label}</option>
								))}
							</select>
						</div>
					</div>
				</div>

				<div className="step0-section">
					<label className="step0-label">Imagine curs</label>
					<p className="step0-hint">Imagine reprezentativă (opțional)</p>
					<div className="step0-form-group">
						<input
							type="file"
							accept="image/jpeg,image/png,image/jpg,image/gif,image/webp"
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (file) onUpdate({ image: file });
							}}
							className="step0-input"
						/>
						{data.image && (
							<div className="step0-image-preview">
								<img
									src={typeof data.image === 'string' ? data.image : URL.createObjectURL(data.image)}
									alt="Previzualizare"
									loading="lazy"
									decoding="async"
								/>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default Step0Context;
