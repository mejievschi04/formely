import React, { useState, useEffect, useRef } from 'react';
import './AddModuleModal.css';

/**
 * Modal „Adaugă modul” – conform standardelor LMS moderne (Teachable, Thinkific).
 * Titlu obligatoriu, descriere opțională, apoi creare.
 */
const AddModuleModal = ({ onClose, onSubmit, loading }) => {
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [error, setError] = useState('');
	const firstInputRef = useRef(null);

	useEffect(() => {
		firstInputRef.current?.focus();
	}, []);

	useEffect(() => {
		const onKeyDown = (e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onClose();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [onClose]);

	useEffect(() => {
		setError('');
	}, [title]);

	const handleSubmit = (e) => {
		e.preventDefault();
		const t = title?.trim();
		if (!t) {
			setError('Titlul modulului este obligatoriu.');
			return;
		}
		onSubmit({ title: t, description: description?.trim() || '' });
	};

	return (
		<div className="add-module-modal-backdrop" onClick={onClose}>
			<div className="add-module-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="add-module-title" aria-modal="true">
				<header className="add-module-modal-header">
					<h2 id="add-module-title">Adaugă modul</h2>
					<p className="add-module-modal-subtitle">Modulele grupează lecțiile în secțiuni logice.</p>
					<button type="button" className="add-module-modal-close" onClick={onClose} aria-label="Închide">×</button>
				</header>

				<form onSubmit={handleSubmit} className="add-module-modal-form">
					<div className="add-module-modal-field">
						<label className="add-module-modal-label" htmlFor="add-module-title-input">
							Titlu modul <span className="add-module-modal-required">*</span>
						</label>
						<input
							ref={firstInputRef}
							id="add-module-title-input"
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Titlul modulului"
							className="add-module-modal-input"
							disabled={loading}
							aria-invalid={!!error}
							aria-describedby={error ? 'add-module-error' : undefined}
						/>
						{error && <p id="add-module-error" className="add-module-modal-error" role="alert">{error}</p>}
					</div>

					<div className="add-module-modal-field">
						<label className="add-module-modal-label" htmlFor="add-module-desc-input">Descriere (opțional)</label>
						<textarea
							id="add-module-desc-input"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Ce vor învăța cursanții în acest modul?"
							className="add-module-modal-textarea"
							rows={3}
							disabled={loading}
						/>
					</div>

					<div className="add-module-modal-actions">
						<button type="button" className="add-module-modal-btn-cancel" onClick={onClose} disabled={loading}>
							Anulare
						</button>
						<button type="submit" className="add-module-modal-btn-submit" disabled={loading}>
							{loading ? 'Se creează...' : 'Adaugă modulul'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default AddModuleModal;
