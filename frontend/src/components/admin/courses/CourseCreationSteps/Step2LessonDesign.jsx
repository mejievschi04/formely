import React from 'react';
import './Step2LessonDesign.css';

/**
 * PAS 2: Designul Lecțiilor (Lesson Design)
 * Conform TODO.md
 * - Tip lecție (Teorie, Practică, Recap, Evaluare)
 * - Structură internă (Intro, Conținut, Exemplu, Mini-task)
 * - Nivel dificultate
 * - AI opțional: sugerează flow didactic
 */
const Step2LessonDesign = ({ data, onUpdate }) => {
	const modules = data.structure?.modules || [];
	
	const lessonTypes = [
		{ id: 'theory', label: 'Teorie', icon: '📖' },
		{ id: 'practice', label: 'Practică', icon: '🛠️' },
		{ id: 'recap', label: 'Recapitulare', icon: '🔄' },
		{ id: 'assessment', label: 'Evaluare', icon: '✅' },
	];
	
	const difficultyLevels = [
		{ id: 'easy', label: 'Ușor', color: '#10b981' },
		{ id: 'medium', label: 'Mediu', color: '#f59e0b' },
		{ id: 'hard', label: 'Dificil', color: '#ef4444' },
	];
	
	const lessonStructures = [
		{ id: 'intro', label: 'Intro (de ce contează)' },
		{ id: 'content', label: 'Conținut principal' },
		{ id: 'example', label: 'Exemplu / demo' },
		{ id: 'task', label: 'Mini-task / reflecție' },
	];
	
	const handleUpdateLessonDesign = (lessonId, updates) => {
		const updatedDesigns = {
			...data.lesson_designs,
			[lessonId]: {
				...(data.lesson_designs?.[lessonId] || {}),
				...updates
			}
		};
		
		onUpdate({ lesson_designs: updatedDesigns });
	};
	
	return (
		<div className="step2-lesson-design">
			<div className="step2-header">
				<h3>Designul Lecțiilor</h3>
				<p className="step2-description">
					Configurează designul pedagogic pentru fiecare lecție. Conținutul efectiv se adaugă în pasul următor.
				</p>
			</div>
			
			<div className="step2-content">
				{modules.length === 0 ? (
					<div className="step2-empty">
						<div className="step2-empty-icon">📝</div>
						<p>Nu există lecții definite.</p>
						<p className="step2-empty-hint">Revino la PAS 1 pentru a adăuga module și lecții.</p>
					</div>
				) : (
					<div className="step2-lessons">
						{modules.map((module) => (
							<div key={module.id} className="step2-module-section">
								<h4 className="step2-module-title">{module.title}</h4>
								
								{module.lessons && module.lessons.length > 0 && (
									<div className="step2-lessons-list">
										{module.lessons.map((lesson) => {
											const design = data.lesson_designs?.[lesson.id] || {};
											
											return (
												<div key={lesson.id} className="step2-lesson-card">
													<div className="step2-lesson-header">
														<h5 className="step2-lesson-title">{lesson.title}</h5>
													</div>
													
													<div className="step2-lesson-form">
														<div className="step2-form-group">
															<label>Tip lecție</label>
															<div className="step2-lesson-types">
																{lessonTypes.map(type => (
																	<button
																		key={type.id}
																		type="button"
																		className={`step2-lesson-type-btn ${
																			design.type === type.id ? 'selected' : ''
																		}`}
																		onClick={() => handleUpdateLessonDesign(lesson.id, { type: type.id })}
																	>
																		<span>{type.icon}</span>
																		<span>{type.label}</span>
																	</button>
																))}
															</div>
														</div>
														
														<div className="step2-form-group">
															<label>Nivel dificultate</label>
															<div className="step2-difficulty-levels">
																{difficultyLevels.map(level => (
																	<button
																		key={level.id}
																		type="button"
																		className={`step2-difficulty-btn ${
																			design.difficulty === level.id ? 'selected' : ''
																		}`}
																		onClick={() => handleUpdateLessonDesign(lesson.id, { difficulty: level.id })}
																		style={{
																			borderColor: design.difficulty === level.id ? level.color : 'var(--border-primary)',
																			background: design.difficulty === level.id ? `${level.color}20` : 'transparent'
																		}}
																	>
																		{level.label}
																	</button>
																))}
															</div>
														</div>
														
														<div className="step2-form-group">
															<label>Structură internă (opțional)</label>
															<div className="step2-structure-checklist">
																{lessonStructures.map(structure => (
																	<label key={structure.id} className="step2-structure-item">
																		<input
																			type="checkbox"
																			checked={design.structure?.includes(structure.id) || false}
																			onChange={(e) => {
																				const current = design.structure || [];
																				const updated = e.target.checked
																					? [...current, structure.id]
																					: current.filter(id => id !== structure.id);
																				handleUpdateLessonDesign(lesson.id, { structure: updated });
																			}}
																		/>
																		<span>{structure.label}</span>
																	</label>
																))}
															</div>
														</div>
													</div>
												</div>
											);
										})}
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default Step2LessonDesign;
