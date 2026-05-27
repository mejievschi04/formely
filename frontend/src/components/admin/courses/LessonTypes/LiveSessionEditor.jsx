import React, { useState } from 'react';
import RichTextEditor from '../../../RichTextEditor';
import { openaiService } from '../../../../services/openaiService';
import { useToast } from '../../../../contexts/ToastContext';
import { buildLiveSessionAgendaPrompt } from '../../../../utils/aiPrompts';
import { runAiAction } from '../../../../utils/aiAvailability';

/**
 * Live Session Editor - Conform defacut.md secțiunea 5.4
 * Features:
 * - Schedule
 * - Agenda (AI generated)
 * - Post-session summary (auto-generated)
 */
const LiveSessionEditor = ({ lesson, onUpdate }) => {
	const { showToast } = useToast();
	const [aiGenerating, setAiGenerating] = useState(false);
	const [generatedAgenda, setGeneratedAgenda] = useState(null);

	// Generate agenda with AI
	const handleGenerateAgenda = async () => {
		if (!lesson.title || !lesson.title.trim()) {
			showToast('Te rugăm să introduci mai întâi titlul sesiunii', 'info');
			return;
		}

		setAiGenerating(true);
		try {
			const prompt = buildLiveSessionAgendaPrompt({
				title: lesson.title,
				description: lesson.description,
				durationMinutes: lesson.duration_minutes,
			});

			let fullResponse = '';
			await openaiService.streamCourseGeneration(
				prompt,
				[],
				null,
				(chunk) => {
					if (chunk) {
						fullResponse += chunk;
					}
				},
				() => {}
			);

			// Parse response
			try {
				const jsonMatch = fullResponse.match(/```json\s*([\s\S]*?)\s*```/) || 
				                  fullResponse.match(/```\s*([\s\S]*?)\s*```/);
				const jsonStr = jsonMatch ? jsonMatch[1] : fullResponse;
				const parsed = JSON.parse(jsonStr);
				
				if (parsed.agenda) {
					setGeneratedAgenda(parsed);
					onUpdate({ 
						ai_generated_agenda: parsed.agenda,
						agenda: parsed.agenda,
						duration_minutes: parsed.total_duration_minutes || lesson.duration_minutes
					});
				}
			} catch (e) {
				console.error('Error parsing agenda response:', e);
				showToast('Eroare la parsarea răspunsului AI. Vezi consola pentru detalii.', 'error');
			}
		} catch (error) {
			console.error('Error generating agenda:', error);
			showToast('Eroare la generarea agendei: ' + (error.message || 'Eroare necunoscută'), 'error');
		} finally {
			setAiGenerating(false);
		}
	};

	return (
		<div className="live-session-editor">
			{/* Schedule */}
			<div className="admin-form-group">
				<label className="admin-form-label">Programare</label>
				<div className="admin-form-row">
					<div className="admin-form-group">
						<label className="admin-form-label">Data</label>
						<input
							type="date"
							className="admin-form-input"
							value={lesson.scheduled_date || ''}
							onChange={(e) => onUpdate({ scheduled_date: e.target.value })}
						/>
					</div>
					<div className="admin-form-group">
						<label className="admin-form-label">Ora</label>
						<input
							type="time"
							className="admin-form-input"
							value={lesson.scheduled_time || ''}
							onChange={(e) => onUpdate({ scheduled_time: e.target.value })}
						/>
					</div>
					<div className="admin-form-group">
						<label className="admin-form-label">Durată (minute)</label>
						<input
							type="number"
							className="admin-form-input"
							value={lesson.duration_minutes || ''}
							onChange={(e) => onUpdate({ duration_minutes: parseInt(e.target.value) || null })}
							min="1"
						/>
					</div>
				</div>
			</div>

			{/* Generate Agenda Button */}
			<div className="admin-form-group">
				<button
					type="button"
					className="admin-btn admin-btn-primary"
					onClick={() => runAiAction(showToast, handleGenerateAgenda)}
					disabled={aiGenerating || !lesson.title}
				>
					{aiGenerating ? '⏳ Generează agendă...' : '🤖 Generează agendă cu AI'}
				</button>
				<p className="admin-form-hint">
					AI va genera o agendă detaliată pentru sesiunea live
				</p>
			</div>

			{/* Generated Agenda */}
			{generatedAgenda && generatedAgenda.agenda && (
				<div className="agenda-panel">
					<div className="agenda-header">
						<h4>📅 Agendă Generată</h4>
						<p>Durată totală: {generatedAgenda.total_duration_minutes || lesson.duration_minutes} minute</p>
					</div>
					<div className="agenda-items">
						{generatedAgenda.agenda.map((item, idx) => (
							<div key={idx} className="agenda-item">
								<div className="agenda-item-time">{item.time}</div>
								<div className="agenda-item-content">
									<h5>{item.title}</h5>
									<p>{item.description}</p>
									<span className="agenda-item-duration">{item.duration_minutes} min</span>
								</div>
							</div>
						))}
					</div>
					<button
						type="button"
						className="admin-btn admin-btn-secondary"
						onClick={() => {
							// Save agenda to content
							onUpdate({ 
								content: JSON.stringify(generatedAgenda.agenda, null, 2),
								agenda: generatedAgenda.agenda
							});
						}}
					>
						💾 Salvează Agendă
					</button>
				</div>
			)}

			{/* Manual Agenda Editor */}
			<div className="admin-form-group">
				<label className="admin-form-label">Agendă Manuală (opțional)</label>
				<RichTextEditor
					value={lesson.content || ''}
					onChange={(content) => onUpdate({ content })}
					placeholder="Sau scrie manual agenda aici..."
					style={{ minHeight: '300px' }}
				/>
			</div>

			{/* Post-session Summary (will be auto-generated after session) */}
			<div className="admin-form-group">
				<label className="admin-form-label">Rezumat Post-Sesiune</label>
				<textarea
					className="admin-form-textarea"
					value={lesson.post_session_summary || ''}
					onChange={(e) => onUpdate({ post_session_summary: e.target.value })}
					placeholder="Rezumatul va fi generat automat după sesiune (sau poate fi completat manual)"
					rows={4}
					readOnly={!!lesson.post_session_summary_auto_generated}
				/>
				{lesson.post_session_summary_auto_generated && (
					<p className="admin-form-hint">
						✨ Rezumat generat automat după sesiune
					</p>
				)}
			</div>
		</div>
	);
};

export default LiveSessionEditor;
