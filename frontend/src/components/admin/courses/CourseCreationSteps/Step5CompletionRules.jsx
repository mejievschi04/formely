import React from 'react';
import './Step5CompletionRules.css';

/**
 * Step 5 — Completion rules (instructiuni.md):
 * Required lessons, required quiz score, completion certificate trigger.
 */
const Step5CompletionRules = ({ data, onUpdate }) => {
	const completion = data.completion_rules || {};
	const modules = data.structure?.modules || [];
	const allLessons = modules.flatMap((m) => (m.lessons || []).map((l) => ({ ...l, __moduleTitle: m.title })));

	const setCompletion = (updates) => {
		onUpdate({ completion_rules: { ...completion, ...updates } });
	};

	return (
		<div className="step5-completion-rules">
			<div className="step5-cr-header">
				<h3>Reguli de finalizare</h3>
				<p className="step5-cr-description">
					Definește ce trebuie îndeplinit pentru a finaliza cursul: lecții obligatorii, scor minim la quiz, certificat.
				</p>
			</div>
			<div className="step5-cr-content">
				<div className="step5-cr-section">
					<label className="step5-cr-label">Lecții obligatorii</label>
					<p className="step5-cr-hint">
						Toate lecțiile sunt considerate obligatorii pentru finalizare.
					</p>
					<label className="step5-cr-checkbox">
						<input
							type="checkbox"
							checked={completion.sequential_unlock !== false}
							onChange={(e) => setCompletion({ sequential_unlock: e.target.checked })}
						/>
						<span>Deblocare secvențială – cursantul trebuie să parcurgă lecțiile în ordine</span>
					</label>
				</div>

				<div className="step5-cr-section">
					<label className="step5-cr-label">Scor minim la quiz pentru trecere (%)</label>
					<p className="step5-cr-hint">Scorul minim necesar la testele atașate cursului pentru a considera cursul trecut.</p>
					<input
						type="number"
						min={0}
						max={100}
						value={completion.min_test_score ?? 70}
						onChange={(e) => setCompletion({ min_test_score: e.target.value ? parseInt(e.target.value, 10) : 70 })}
						className="step5-cr-input"
					/>
				</div>

				<div className="step5-cr-section">
					<label className="step5-cr-label">Certificat de finalizare</label>
					<p className="step5-cr-hint">Acordă certificat când cursantul îndeplinește condițiile de finalizare.</p>
					<label className="step5-cr-checkbox">
						<input
							type="checkbox"
							checked={completion.has_certificate === true}
							onChange={(e) => setCompletion({ has_certificate: e.target.checked })}
						/>
						<span>Emitere certificat la finalizarea cursului</span>
					</label>
				</div>

				{allLessons.length > 0 && (
					<div className="step5-cr-section">
						<label className="step5-cr-label">Rezumat structură</label>
						<p className="step5-cr-hint">{modules.length} module, {allLessons.length} lecții</p>
					</div>
				)}
			</div>
		</div>
	);
};

export default Step5CompletionRules;
