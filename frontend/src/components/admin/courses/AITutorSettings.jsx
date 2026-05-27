import React, { useState } from 'react';

/**
 * Asistent AI settings - Conform defacut.md secțiunea 7.2
 * Creator Controls:
 * - Tone
 * - Depth
 * - Allowed topics
 * - Restricted topics
 */
const AITutorSettings = ({ courseData, onUpdate }) => {
	const [settings, setSettings] = useState({
		tone: courseData.ai_tutor_tone || 'friendly',
		depth: courseData.ai_tutor_depth || 'medium',
		allowed_topics: courseData.ai_tutor_allowed_topics || [],
		restricted_topics: courseData.ai_tutor_restricted_topics || []
	});

	const tones = [
		{ id: 'friendly', label: 'Prietenos', description: 'Tone relaxat și prietenos' },
		{ id: 'professional', label: 'Profesional', description: 'Tone formal și profesional' },
		{ id: 'encouraging', label: 'Încurajator', description: 'Tone motivațional și suportiv' },
		{ id: 'casual', label: 'Casual', description: 'Tone lejer și conversațional' }
	];

	const depths = [
		{ id: 'basic', label: 'Bază', description: 'Explicații simple și directe' },
		{ id: 'medium', label: 'Medie', description: 'Explicații detaliate cu exemple' },
		{ id: 'advanced', label: 'Avansată', description: 'Explicații profunde cu context extins' }
	];

	const handleUpdate = (updates) => {
		const newSettings = { ...settings, ...updates };
		setSettings(newSettings);
		onUpdate({
			ai_tutor_tone: newSettings.tone,
			ai_tutor_depth: newSettings.depth,
			ai_tutor_allowed_topics: newSettings.allowed_topics,
			ai_tutor_restricted_topics: newSettings.restricted_topics
		});
	};

	const handleAddTopic = (type, topic) => {
		if (!topic.trim()) return;
		const key = type === 'allowed' ? 'allowed_topics' : 'restricted_topics';
		handleUpdate({
			[key]: [...settings[key], topic.trim()]
		});
	};

	const handleRemoveTopic = (type, index) => {
		const key = type === 'allowed' ? 'allowed_topics' : 'restricted_topics';
		handleUpdate({
			[key]: settings[key].filter((_, i) => i !== index)
		});
	};

	return (
		<div className="ai-tutor-settings">
			<h3 className="admin-form-section-title">⚡ Setări Asistent AI</h3>
			<p className="admin-form-hint">
				Configurează comportamentul Asistent AI pentru acest curs. Aceste setări se aplică tuturor cursanților.
			</p>

			{/* Tone */}
			<div className="admin-form-group">
				<label className="admin-form-label">Tone</label>
				<div className="tone-selector">
					{tones.map((tone) => (
						<button
							key={tone.id}
							type="button"
							className={`tone-option ${settings.tone === tone.id ? 'active' : ''}`}
							onClick={() => handleUpdate({ tone: tone.id })}
						>
							<div className="tone-label">{tone.label}</div>
							<div className="tone-description">{tone.description}</div>
						</button>
					))}
				</div>
			</div>

			{/* Depth */}
			<div className="admin-form-group">
				<label className="admin-form-label">Depth (Adâncime Explicații)</label>
				<select
					className="admin-form-select"
					value={settings.depth}
					onChange={(e) => handleUpdate({ depth: e.target.value })}
				>
					{depths.map((depth) => (
						<option key={depth.id} value={depth.id}>
							{depth.label} - {depth.description}
						</option>
					))}
				</select>
			</div>

			{/* Allowed Topics */}
			<div className="admin-form-group">
				<label className="admin-form-label">Teme permise</label>
				<p className="admin-form-hint">
					Asistent AI va răspunde doar despre aceste teme. Lasă gol pentru a permite toate temele.
				</p>
				<div className="topics-input-group">
					<input
						type="text"
						className="admin-form-input"
						placeholder="Adaugă temă permisă"
						onKeyPress={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								handleAddTopic('allowed', e.target.value);
								e.target.value = '';
							}
						}}
					/>
					<button
						type="button"
						className="admin-btn admin-btn-sm admin-btn-secondary"
						onClick={(e) => {
							const input = e.target.previousElementSibling;
							handleAddTopic('allowed', input.value);
							input.value = '';
						}}
					>
						+ Adaugă
					</button>
				</div>
				{settings.allowed_topics.length > 0 && (
					<div className="topics-list">
						{settings.allowed_topics.map((topic, idx) => (
							<div key={idx} className="topic-tag">
								{topic}
								<button
									type="button"
									className="topic-remove"
									onClick={() => handleRemoveTopic('allowed', idx)}
								>
									×
								</button>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Restricted Topics */}
			<div className="admin-form-group">
				<label className="admin-form-label">Restricted Topics (Teme Restricționate)</label>
				<p className="admin-form-hint">
					Asistent AI NU va răspunde despre aceste teme. Util pentru a evita subiecte sensibile sau off-topic.
				</p>
				<div className="topics-input-group">
					<input
						type="text"
						className="admin-form-input"
						placeholder="Adaugă temă restricționată"
						onKeyPress={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								handleAddTopic('restricted', e.target.value);
								e.target.value = '';
							}
						}}
					/>
					<button
						type="button"
						className="admin-btn admin-btn-sm admin-btn-secondary"
						onClick={(e) => {
							const input = e.target.previousElementSibling;
							handleAddTopic('restricted', input.value);
							input.value = '';
						}}
					>
						+ Adaugă
					</button>
				</div>
				{settings.restricted_topics.length > 0 && (
					<div className="topics-list">
						{settings.restricted_topics.map((topic, idx) => (
							<div key={idx} className="topic-tag restricted">
								{topic}
								<button
									type="button"
									className="topic-remove"
									onClick={() => handleRemoveTopic('restricted', idx)}
								>
									×
								</button>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default AITutorSettings;




