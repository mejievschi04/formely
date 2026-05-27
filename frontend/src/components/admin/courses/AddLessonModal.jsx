import React, { useState, useEffect, useRef } from 'react';
import './AddLessonModal.css';

/**
 * Modal rapid „Adaugă lecție” – conform standardelor LMS moderne (Teachable, Thinkific).
 * Titlu + tip lecție înainte de creare; Escape închide; focus pe primul câmp.
 */
const LESSON_TYPES = [
	{ value: 'text', label: 'Text / Lectură', desc: 'Conținut scris, imagini, formatare', icon: '📄' },
	{ value: 'video', label: 'Video', desc: 'YouTube, Vimeo sau încărcare video', icon: '🎥' },
	{ value: 'assignment', label: 'Temă / Exercițiu', desc: 'Sarcină de lucru pentru cursant', icon: '📝' },
];

const AddLessonModal = ({ moduleTitle, onClose, onSubmit, loading }) => {
	const [title, setTitle] = useState('');
	const [type, setType] = useState('text');
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
			setError('Titlul lecției este obligatoriu.');
			return;
		}
		onSubmit({ title: t, type });
	};

	return (
		<div className="add-lesson-modal-backdrop" onClick={onClose}>
			<div className="add-lesson-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="add-lesson-title" aria-modal="true">
				<header className="add-lesson-modal-header">
					<h2 id="add-lesson-title">Adaugă lecție</h2>
					{moduleTitle && <p className="add-lesson-modal-module">Modul: {moduleTitle}</p>}
					<button type="button" className="add-lesson-modal-close" onClick={onClose} aria-label="Închide">×</button>
				</header>

				<form onSubmit={handleSubmit} className="add-lesson-modal-form">
					<div className="add-lesson-modal-field">
						<label className="add-lesson-modal-label" htmlFor="add-lesson-title-input">
							Titlu lecție <span className="add-lesson-modal-required">*</span>
						</label>
						<input
							ref={firstInputRef}
							id="add-lesson-title-input"
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Titlul lecției"
							className="add-lesson-modal-input"
							disabled={loading}
							aria-invalid={!!error}
							aria-describedby={error ? 'add-lesson-error' : undefined}
						/>
						{error && <p id="add-lesson-error" className="add-lesson-modal-error" role="alert">{error}</p>}
					</div>

					<div className="add-lesson-modal-field">
						<label className="add-lesson-modal-label">Tip lecție</label>
						<p className="add-lesson-modal-hint">Alege tipul conținutului; poți adăuga mai multe blocuri în lecție după ce o creezi.</p>
						<div className="add-lesson-modal-types" role="group" aria-label="Tip lecție">
							{LESSON_TYPES.map((opt) => (
								<button
									key={opt.value}
									type="button"
									className={`add-lesson-modal-type-card ${type === opt.value ? 'selected' : ''}`}
									onClick={() => setType(opt.value)}
									disabled={loading}
									aria-pressed={type === opt.value}
								>
									<span className="add-lesson-modal-type-icon">{opt.icon}</span>
									<span className="add-lesson-modal-type-label">{opt.label}</span>
									<span className="add-lesson-modal-type-desc">{opt.desc}</span>
								</button>
							))}
						</div>
					</div>

					<div className="add-lesson-modal-actions">
						<button type="button" className="add-lesson-modal-btn-cancel" onClick={onClose} disabled={loading}>
							Anulare
						</button>
						<button type="submit" className="add-lesson-modal-btn-submit" disabled={loading}>
							{loading ? 'Se creează...' : 'Adaugă lecția'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default AddLessonModal;
