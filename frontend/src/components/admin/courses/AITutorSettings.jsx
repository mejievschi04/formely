import React, { useState } from 'react';

const DEFAULT_SETTINGS = {
	enabled: true,
	tone: 'friendly',
	depth: 'medium',
	allowed_topics: [],
	restricted_topics: [],
};

function readInitialSettings(courseData) {
	const ai = courseData?.settings?.ai_tutor || {};
	return {
		enabled: ai.enabled !== false,
		tone: courseData?.ai_tutor_tone || ai.tone || DEFAULT_SETTINGS.tone,
		depth: courseData?.ai_tutor_depth || ai.depth || DEFAULT_SETTINGS.depth,
		allowed_topics: courseData?.ai_tutor_allowed_topics || ai.allowed_topics || [],
		restricted_topics: courseData?.ai_tutor_restricted_topics || ai.restricted_topics || [],
	};
}

/**
 * Formely AI tutor preferences for a course.
 */
const AITutorSettings = ({ courseData, onUpdate }) => {
	const [settings, setSettings] = useState(() => readInitialSettings(courseData));

	const tones = [
		{ id: 'friendly', label: 'Prietenos', description: 'Tone relaxat și prietenos' },
		{ id: 'professional', label: 'Profesional', description: 'Tone formal și profesional' },
		{ id: 'encouraging', label: 'Încurajator', description: 'Tone motivațional și suportiv' },
		{ id: 'casual', label: 'Casual', description: 'Tone lejer și conversațional' },
	];

	const depths = [
		{ id: 'basic', label: 'Bază', description: 'Explicații simple și directe' },
		{ id: 'medium', label: 'Medie', description: 'Explicații detaliate cu exemple' },
		{ id: 'advanced', label: 'Avansată', description: 'Explicații profunde cu context extins' },
	];

	const emitUpdate = (newSettings) => {
		setSettings(newSettings);
		onUpdate?.({
			ai_tutor: {
				enabled: newSettings.enabled,
				tone: newSettings.tone,
				depth: newSettings.depth,
				allowed_topics: newSettings.allowed_topics,
				restricted_topics: newSettings.restricted_topics,
			},
		});
	};

	const handleUpdate = (updates) => {
		emitUpdate({ ...settings, ...updates });
	};

	const handleAddTopic = (type, topic) => {
		if (!topic.trim()) return;
		const key = type === 'allowed' ? 'allowed_topics' : 'restricted_topics';
		handleUpdate({
			[key]: [...settings[key], topic.trim()],
		});
	};

	const handleRemoveTopic = (type, index) => {
		const key = type === 'allowed' ? 'allowed_topics' : 'restricted_topics';
		handleUpdate({
			[key]: settings[key].filter((_, i) => i !== index),
		});
	};

	return (
		<div className="ai-tutor-settings">
			<h3 className="admin-form-section-title">Setări Formely AI</h3>

			<label className="admin-course-builder-course-edit-check">
				<input
					type="checkbox"
					checked={settings.enabled !== false}
					onChange={(e) => handleUpdate({ enabled: e.target.checked })}
				/>
				<span>Activează tutorul AI pentru cursanți în lecții</span>
			</label>

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

			<div className="admin-form-group">
				<label className="admin-form-label">Depth (Adâncime explicații)</label>
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

			<div className="admin-form-group">
				<label className="admin-form-label">Teme permise</label>
				<p className="admin-form-hint">
					Tutorul AI va răspunde doar despre aceste teme. Lasă gol pentru a permite toate temele.
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

			<div className="admin-form-group">
				<label className="admin-form-label">Teme restricționate</label>
				<p className="admin-form-hint">
					Tutorul AI nu va răspunde despre aceste teme. Util pentru subiecte sensibile sau off-topic.
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
