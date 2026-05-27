import React, { useState } from 'react';
import RichTextEditor from '../../../RichTextEditor';
import { openaiService } from '../../../../services/openaiService';
import { useToast } from '../../../../contexts/ToastContext';
import { buildAssignmentLessonPrompt } from '../../../../utils/aiPrompts';
import { runAiAction } from '../../../../utils/aiAvailability';

/**
 * Assignment / Practice Lesson Editor - Conform defacut.md secțiunea 5.3
 * Features:
 * - Creator defines: objective, constraints
 * - AI: generates exercises, auto-feedback, scoring
 */
const AssignmentLessonEditor = ({ lesson, onUpdate }) => {
	const { showToast } = useToast();
	const [aiGenerating, setAiGenerating] = useState(false);
	const [generatedExercises, setGeneratedExercises] = useState([]);

	// Generate exercises with AI
	const handleGenerateExercises = async () => {
		if (!lesson.objective || !lesson.objective.trim()) {
			showToast('Te rugăm să definiți mai întâi obiectivul exercițiului', 'info');
			return;
		}

		setAiGenerating(true);
		try {
			const prompt = buildAssignmentLessonPrompt({
				objective: lesson.objective,
				constraints: lesson.constraints,
				content: lesson.content ? lesson.content.substring(0, 500) : '',
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
				
				if (parsed.exercises) {
					setGeneratedExercises(parsed.exercises);
					onUpdate({ 
						ai_generated_exercises: parsed.exercises,
						content: JSON.stringify(parsed.exercises, null, 2) // Store as JSON in content
					});
				}
			} catch (e) {
				console.error('Error parsing exercises response:', e);
				showToast('Eroare la parsarea răspunsului AI. Vezi consola pentru detalii.', 'error');
			}
		} catch (error) {
			console.error('Error generating exercises:', error);
			showToast('Eroare la generarea exercițiilor: ' + (error.message || 'Eroare necunoscută'), 'error');
		} finally {
			setAiGenerating(false);
		}
	};

	return (
		<div className="assignment-lesson-editor">
			{/* Objective */}
			<div className="admin-form-group">
				<label className="admin-form-label">
					Obiectiv <span className="admin-form-required">*</span>
				</label>
				<textarea
					className="admin-form-textarea"
					value={lesson.objective || ''}
					onChange={(e) => onUpdate({ objective: e.target.value })}
					placeholder="Ce ar trebui să realizeze studentul în acest exercițiu?"
					rows={3}
				/>
			</div>

			{/* Constraints */}
			<div className="admin-form-group">
				<label className="admin-form-label">Constrângeri</label>
				<textarea
					className="admin-form-textarea"
					value={lesson.constraints || ''}
					onChange={(e) => onUpdate({ constraints: e.target.value })}
					placeholder="Constrângeri, limitări sau cerințe speciale (opțional)"
					rows={2}
				/>
			</div>

			{/* Generate Exercises Button */}
			<div className="admin-form-group">
				<button
					type="button"
					className="admin-btn admin-btn-primary"
					onClick={() => runAiAction(showToast, handleGenerateExercises)}
					disabled={aiGenerating || !lesson.objective}
				>
					{aiGenerating ? '⏳ Generează exerciții...' : '🤖 Generează exerciții cu AI'}
				</button>
				<p className="admin-form-hint">
					AI va genera exerciții practice pe baza obiectivului și constrângerilor definite
				</p>
			</div>

			{/* Generated Exercises */}
			{generatedExercises.length > 0 && (
				<div className="generated-exercises-panel">
					<div className="generated-exercises-header">
						<h4>✨ Exerciții Generate</h4>
					</div>
					{generatedExercises.map((exercise, idx) => (
						<div key={idx} className="exercise-item">
							<h5>{exercise.title}</h5>
							<p><strong>Descriere:</strong> {exercise.description}</p>
							
							{exercise.instructions && (
								<div className="exercise-section">
									<strong>Instrucțiuni:</strong>
									<ol>
										{exercise.instructions.map((inst, instIdx) => (
											<li key={instIdx}>{inst}</li>
										))}
									</ol>
								</div>
							)}

							{exercise.evaluation_criteria && (
								<div className="exercise-section">
									<strong>Criterii de evaluare:</strong>
									<ul>
										{exercise.evaluation_criteria.map((crit, critIdx) => (
											<li key={critIdx}>{crit}</li>
										))}
									</ul>
								</div>
							)}

							{exercise.auto_feedback && (
								<div className="exercise-section">
									<strong>Feedback automat:</strong>
									<p>{exercise.auto_feedback}</p>
								</div>
							)}

							{exercise.scoring && (
								<div className="exercise-section">
									<strong>Scoring:</strong>
									<p>Max puncte: {exercise.scoring.max_points}</p>
								</div>
							)}

							<button
								type="button"
								className="admin-btn admin-btn-sm admin-btn-secondary"
								onClick={() => {
									// Edit exercise
									const updated = [...generatedExercises];
									updated[idx] = { ...exercise, editing: true };
									setGeneratedExercises(updated);
								}}
							>
								✏️ Editează
							</button>
						</div>
					))}
				</div>
			)}

			{/* Manual Content Editor (fallback) */}
			<div className="admin-form-group">
				<label className="admin-form-label">Conținut Manual (opțional)</label>
				<RichTextEditor
					value={lesson.content || ''}
					onChange={(content) => onUpdate({ content })}
					placeholder="Sau scrie manual exercițiile aici..."
					style={{ minHeight: '300px' }}
				/>
			</div>
		</div>
	);
};

export default AssignmentLessonEditor;
