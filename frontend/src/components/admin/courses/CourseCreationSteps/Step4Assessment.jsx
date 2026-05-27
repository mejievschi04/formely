import React, { useState } from 'react';
import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './Step4Assessment.css';
import { DragGripIcon } from '../../../common/DragGripIcon';

/**
 * Step 4 — Quiz Builder (instructiuni.md)
 * Quiz settings: passing score, time limit, attempts.
 * Question editor: inline creation, drag reorder, answer options. Types: single_choice, multiple_choice, true_false, matching, ordering.
 * Scoring: auto grading for structured question types.
 * Google Forms style, live preview.
 */

const QUESTION_TYPES = [
	{ id: 'single_choice', label: 'Răspuns unic', icon: '○', autoGrade: true },
	{ id: 'multiple_choice', label: 'Răspuns multiplu', icon: '☑', autoGrade: true },
	{ id: 'true_false', label: 'Adevărat / Fals', icon: '✓✗', autoGrade: true },
	{ id: 'matching', label: 'Potrivire perechi', icon: '↔', autoGrade: true },
	{ id: 'ordering', label: 'Ordonare', icon: '🔢', autoGrade: true },
];

const assessmentTypes = [
	{ id: 'quiz', label: 'Quiz', icon: '❓' },
	{ id: 'assignment', label: 'Temă', icon: '📝' },
	{ id: 'task', label: 'Sarcină practică', icon: '🛠️' },
	{ id: 'self-assessment', label: 'Auto-evaluare', icon: '✅' },
	{ id: 'feedback', label: 'Feedback deschis', icon: '💬' },
];

function SortableQuestionCard({ question, index, onUpdate, onDelete, typeInfo }) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: `q-${question.id}`,
	});
	const style = { transform: CSS.Transform.toString(transform), transition };
	const needsManualGrading = false;

	return (
		<div ref={setNodeRef} style={style} className={`step4-question-card ${isDragging ? 'step4-dragging' : ''}`}>
			<div className="step4-question-card-header">
				<button type="button" className="step4-drag-handle" {...attributes} {...listeners} aria-label="Reordonare întrebare">
					<DragGripIcon size={14} />
				</button>
				<span className="step4-question-number">{index + 1}</span>
				<span className="step4-question-type-badge">{typeInfo?.icon} {typeInfo?.label}</span>
				{needsManualGrading && <span className="step4-manual-badge">Notare manuală</span>}
				<button type="button" className="step4-btn-remove" onClick={onDelete} aria-label="Șterge întrebare">🗑️</button>
			</div>
			<div className="step4-question-card-body">
				<label>Întrebare</label>
				<textarea
					value={question.question_text || ''}
					onChange={(e) => onUpdate({ question_text: e.target.value })}
					placeholder="Scrie întrebarea..."
					rows={2}
					className="step4-textarea"
				/>
				<div className="step4-form-row step4-points-row">
					<div className="step4-form-group">
						<label>Puncte</label>
						<input
							type="number"
							min={1}
							value={question.points ?? 1}
							onChange={(e) => onUpdate({ points: parseInt(e.target.value, 10) || 1 })}
							className="step4-input step4-input-sm"
						/>
					</div>
				</div>

				{question.question_type === 'true_false' && (
					<div className="step4-answers-group">
						<label>Variante (bifează răspunsul corect)</label>
						{['Adevărat', 'Fals'].map((text, i) => {
							const isCorrect = (question.answers || [])[i]?.is_correct ?? (i === 0);
							return (
								<label key={i} className="step4-answer-option">
									<input
										type="radio"
										name={`tf-${question.id}`}
										checked={isCorrect}
										onChange={() => {
											const answers = [
												{ id: (question.answers || [])[0]?.id ?? Date.now(), answer_text: 'Adevărat', is_correct: true, order: 0 },
												{ id: (question.answers || [])[1]?.id ?? Date.now() + 1, answer_text: 'Fals', is_correct: false, order: 1 },
											];
											answers[i].is_correct = true;
											answers[1 - i].is_correct = false;
											onUpdate({ answers });
										}}
									/>
									<span>{text}</span>
								</label>
							);
						})}
					</div>
				)}

				{['single_choice', 'multiple_choice'].includes(question.question_type) && (
					<div className="step4-answers-group">
						<label>Variante de răspuns (bifează corecte)</label>
						{(question.answers || []).map((ans, idx) => (
							<div key={ans.id ?? idx} className="step4-answer-row">
								<input
									type={question.question_type === 'multiple_choice' ? 'checkbox' : 'radio'}
									name={question.question_type === 'single_choice' ? `sc-${question.id}` : undefined}
									checked={!!ans.is_correct}
									onChange={(e) => {
										const answers = [...(question.answers || [])];
										if (question.question_type === 'single_choice') {
											answers.forEach((a, i) => { a.is_correct = i === idx; });
										} else {
											answers[idx] = { ...answers[idx], is_correct: e.target.checked };
										}
										onUpdate({ answers });
									}}
								/>
								<input
									type="text"
									value={ans.answer_text || ''}
									onChange={(e) => {
										const answers = [...(question.answers || [])];
										answers[idx] = { ...answers[idx], answer_text: e.target.value };
										onUpdate({ answers });
									}}
									placeholder="Varianta de răspuns"
									className="step4-input step4-answer-input"
								/>
								<button type="button" className="step4-answer-remove" onClick={() => {
									const answers = (question.answers || []).filter((_, i) => i !== idx);
									onUpdate({ answers });
								}}>✕</button>
							</div>
						))}
						<button
							type="button"
							className="step4-add-answer"
							onClick={() => {
								const answers = [...(question.answers || []), { id: Date.now(), answer_text: '', is_correct: false, order: (question.answers || []).length }];
								onUpdate({ answers });
							}}
						>
							+ Adaugă variantă
						</button>
					</div>
				)}

				{question.question_type === 'matching' && (
					<div className="step4-answers-group">
						<label>Perechi (left | right, câte una per linie)</label>
						<textarea
							value={((question.payload && question.payload.pairs) || []).map((p) => `${p.left || ''}|${p.right || ''}`).join('\n')}
							onChange={(e) => {
								const pairs = e.target.value.split('\n').filter(Boolean).map((line) => {
									const [left, right] = line.split('|').map((s) => s.trim());
									return { left: left || '', right: right || '' };
								});
								onUpdate({ payload: { ...(question.payload || {}), pairs } });
							}}
							placeholder="Item A | Răspuns A\nItem B | Răspuns B"
							rows={4}
							className="step4-textarea"
						/>
					</div>
				)}

				{question.question_type === 'ordering' && (
					<div className="step4-answers-group">
						<label>Itemuri în ordinea corectă (câte unul per linie)</label>
						<textarea
							value={((question.payload && question.payload.items) || []).join('\n')}
							onChange={(e) => {
								const items = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
								onUpdate({ payload: { ...(question.payload || {}), items } });
							}}
							placeholder="Primul item\nAl doilea\nAl treilea"
							rows={4}
							className="step4-textarea"
						/>
					</div>
				)}

			</div>
		</div>
	);
}

function QuizSettings({ assessment, onUpdate }) {
	return (
		<div className="step4-quiz-settings">
			<h4>Setări quiz</h4>
			<div className="step4-settings-grid">
				<div className="step4-form-group">
					<label>Prag trecere (%)</label>
					<input
						type="number"
						min={0}
						max={100}
						value={assessment.passing_threshold ?? 70}
						onChange={(e) => onUpdate({ passing_threshold: parseInt(e.target.value, 10) || 0 })}
						className="step4-input"
					/>
				</div>
				<div className="step4-form-group">
					<label>Timp limită (min)</label>
					<input
						type="number"
						min={0}
						value={assessment.time_limit_minutes ?? ''}
						onChange={(e) => onUpdate({ time_limit_minutes: e.target.value ? parseInt(e.target.value, 10) : null })}
						placeholder="Fără limită"
						className="step4-input"
					/>
				</div>
				<div className="step4-form-group">
					<label>Încercări permise</label>
					<input
						type="number"
						min={1}
						value={assessment.max_attempts ?? 3}
						onChange={(e) => onUpdate({ max_attempts: parseInt(e.target.value, 10) || 1 })}
						className="step4-input"
					/>
				</div>
			</div>
			<div className="step4-form-group step4-checkbox-row">
				<label>
					<input
						type="checkbox"
						checked={assessment.allow_retry !== false}
						onChange={(e) => onUpdate({ allow_retry: e.target.checked })}
					/>
					Permite retry
				</label>
			</div>
			{assessment.type === 'quiz' && (
				<div className="step4-form-group step4-checkbox-row">
					<label>
						<input
							type="checkbox"
							checked={!!assessment.randomize}
							onChange={(e) => onUpdate({ randomize: e.target.checked })}
						/>
						Randomizează întrebările
					</label>
				</div>
			)}
		</div>
	);
}

function QuestionsList({ questions, onUpdateQuestion, onDeleteQuestion, onReorder, onAddQuestion }) {
	const [localQuestions, setLocalQuestions] = useState(questions);
	React.useEffect(() => setLocalQuestions(questions), [questions]);
	const ids = localQuestions.map((q) => `q-${q.id}`);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	const handleDragEnd = (event) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = localQuestions.findIndex((q) => `q-${q.id}` === active.id);
		const newIndex = localQuestions.findIndex((q) => `q-${q.id}` === over.id);
		if (oldIndex === -1 || newIndex === -1) return;
		const reordered = arrayMove(localQuestions, oldIndex, newIndex);
		setLocalQuestions(reordered);
		onReorder(reordered.map((q, i) => ({ ...q, order: i })));
	};

	return (
		<div className="step4-questions-list">
			<div className="step4-questions-list-header">
				<h4>Întrebări</h4>
				<div className="step4-add-question-dropdown">
					<select
						value=""
						onChange={(e) => {
							const type = e.target.value;
							if (!type) return;
							e.target.value = '';
							onAddQuestion(type);
						}}
						className="step4-select"
					>
						<option value="">+ Adaugă întrebare</option>
						{QUESTION_TYPES.map((t) => (
							<option key={t.id} value={t.id}>{t.icon} {t.label}</option>
						))}
					</select>
				</div>
			</div>
			<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
				<SortableContext items={ids} strategy={verticalListSortingStrategy}>
					{localQuestions.map((q, idx) => (
						<SortableQuestionCard
							key={q.id}
							question={q}
							index={idx}
							onUpdate={(up) => onUpdateQuestion(q.id, up)}
							onDelete={() => onDeleteQuestion(q.id)}
							typeInfo={QUESTION_TYPES.find((t) => t.id === (q.question_type || 'single_choice'))}
						/>
					))}
				</SortableContext>
			</DndContext>
		</div>
	);
}

function QuizPreview({ assessment }) {
	const questions = assessment?.questions || [];
	return (
		<div className="step4-preview">
			<h4>Previzualizare quiz</h4>
			<div className="step4-preview-questions">
				{questions.length === 0 && <p className="step4-preview-empty">Niciună întrebare.</p>}
				{questions.map((q, i) => (
					<div key={q.id} className="step4-preview-q">
						<div className="step4-preview-q-text">{i + 1}. {q.question_text || 'Întrebare'}</div>
						{q.question_type === 'true_false' && (
							<div className="step4-preview-options">
								<label><input type="radio" name={`preview-${q.id}`} disabled /> Adevărat</label>
								<label><input type="radio" name={`preview-${q.id}`} disabled /> Fals</label>
							</div>
						)}
						{['single_choice', 'multiple_choice'].includes(q.question_type) && (
							<div className="step4-preview-options">
								{(q.answers || []).map((a, j) => (
									<label key={j}><input type={q.question_type === 'single_choice' ? 'radio' : 'checkbox'} name={`preview-${q.id}`} disabled /> {a.answer_text || '—'}</label>
								))}
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

const Step4Assessment = ({ data, onUpdate }) => {
	const modules = data.structure?.modules || [];
	const [expandedQuiz, setExpandedQuiz] = useState(null); // { lessonId, assessmentId }
	const [previewQuiz, setPreviewQuiz] = useState(null);

	const assessments = data.assessments || {};

	const handleAddAssessment = (lessonId, type) => {
		const lessonAssessments = assessments[lessonId] || [];
		const newAssessment = {
			id: Date.now(),
			type,
			passing_threshold: 70,
			time_limit_minutes: null,
			max_attempts: 3,
			allow_retry: true,
			randomize: false,
			questions: type === 'quiz' ? [] : undefined,
		};
		onUpdate({
			assessments: {
				...assessments,
				[lessonId]: [...lessonAssessments, newAssessment],
			},
		});
		if (type === 'quiz') setExpandedQuiz({ lessonId, assessmentId: newAssessment.id });
	};

	const handleUpdateAssessment = (lessonId, assessmentId, updates) => {
		const lessonAssessments = [...(assessments[lessonId] || [])];
		const idx = lessonAssessments.findIndex((a) => a.id === assessmentId);
		if (idx === -1) return;
		lessonAssessments[idx] = { ...lessonAssessments[idx], ...updates };
		onUpdate({ assessments: { ...assessments, [lessonId]: lessonAssessments } });
	};

	const handleDeleteAssessment = (lessonId, assessmentId) => {
		const lessonAssessments = (assessments[lessonId] || []).filter((a) => a.id !== assessmentId);
		onUpdate({ assessments: { ...assessments, [lessonId]: lessonAssessments } });
		if (expandedQuiz?.lessonId === lessonId && expandedQuiz?.assessmentId === assessmentId) setExpandedQuiz(null);
		if (previewQuiz?.lessonId === lessonId && previewQuiz?.assessmentId === assessmentId) setPreviewQuiz(null);
	};

	const getAssessment = (lessonId, assessmentId) => {
		const list = assessments[lessonId] || [];
		return list.find((a) => a.id === assessmentId);
	};

	const handleUpdateQuestion = (lessonId, assessmentId, questionId, updates) => {
		const a = getAssessment(lessonId, assessmentId);
		if (!a || !a.questions) return;
		const questions = a.questions.map((q) => q.id === questionId ? { ...q, ...updates } : q);
		handleUpdateAssessment(lessonId, assessmentId, { questions });
	};

	const handleDeleteQuestion = (lessonId, assessmentId, questionId) => {
		const a = getAssessment(lessonId, assessmentId);
		if (!a || !a.questions) return;
		const questions = a.questions.filter((q) => q.id !== questionId);
		handleUpdateAssessment(lessonId, assessmentId, { questions });
	};

	const handleReorderQuestions = (lessonId, assessmentId, reordered) => {
		handleUpdateAssessment(lessonId, assessmentId, { questions: reordered });
	};

	const handleAddQuestion = (lessonId, assessmentId, questionType) => {
		const a = getAssessment(lessonId, assessmentId);
		const questions = [...(a?.questions || [])];
		const newQ = {
			id: Date.now(),
			question_text: '',
			question_type: questionType,
			points: 1,
			order: questions.length,
			answers: questionType === 'true_false' ? [
				{ id: Date.now(), answer_text: 'Adevărat', is_correct: true, order: 0 },
				{ id: Date.now() + 1, answer_text: 'Fals', is_correct: false, order: 1 },
			] : [],
			payload: questionType === 'matching' ? { pairs: [] } : questionType === 'ordering' ? { items: [] } : undefined,
		};
		questions.push(newQ);
		handleUpdateAssessment(lessonId, assessmentId, { questions });
	};

	return (
		<div className="step4-assessment">
			<div className="step4-header">
				<h3>Evaluare & Quiz</h3>
				<p className="step4-description">
					Configurează evaluările pentru lecții. Pentru quiz: setări (prag, timp, încercări), întrebări cu reordonare drag-and-drop.
				</p>
			</div>

			{modules.length === 0 ? (
				<div className="step4-empty">
					<div className="step4-empty-icon">✅</div>
					<p>Nu există lecții definite.</p>
				</div>
			) : (
				<div className="step4-content">
					{modules.map((module) => (
						<div key={module.id} className="step4-module-section">
							<h4 className="step4-module-title">{module.title}</h4>
							{module.lessons && module.lessons.length > 0 && (
								<div className="step4-lessons-list">
									{module.lessons.map((lesson) => {
										const lessonAssessments = assessments[lesson.id] || [];
										const isQuizExpanded = expandedQuiz?.lessonId === lesson.id && lessonAssessments.some((a) => a.id === expandedQuiz?.assessmentId);
										const expandedAssessment = isQuizExpanded ? lessonAssessments.find((a) => a.id === expandedQuiz.assessmentId) : null;

										return (
											<div key={lesson.id} className="step4-lesson-card">
												<div className="step4-lesson-header">
													<h5 className="step4-lesson-title">{lesson.title}</h5>
													<div className="step4-add-assessment">
														<span className="step4-add-label">Adaugă:</span>
														{assessmentTypes.map((type) => (
															<button
																key={type.id}
																type="button"
																className="step4-assessment-type-btn"
																onClick={() => handleAddAssessment(lesson.id, type.id)}
															>
																{type.icon} {type.label}
															</button>
														))}
													</div>
												</div>

												{lessonAssessments.length > 0 && (
													<div className="step4-assessments-list">
														{lessonAssessments.map((assessment) => (
															<div key={assessment.id} className="step4-assessment-item">
																<div className="step4-assessment-item-header">
																	<div className="step4-assessment-item-type">
																		{assessmentTypes.find((t) => t.id === assessment.type)?.icon}
																		{assessmentTypes.find((t) => t.id === assessment.type)?.label}
																		{assessment.type === 'quiz' && (assessment.questions?.length > 0) && (
																			<span className="step4-question-count">({assessment.questions.length} întrebări)</span>
																		)}
																	</div>
																	<div className="step4-assessment-item-actions">
																		{assessment.type === 'quiz' && (
																			<button
																				type="button"
																				className={`step4-preview-btn ${previewQuiz?.lessonId === lesson.id && previewQuiz?.assessmentId === assessment.id ? 'active' : ''}`}
																				onClick={() => setPreviewQuiz(previewQuiz?.assessmentId === assessment.id ? null : { lessonId: lesson.id, assessmentId: assessment.id })}
																			>
																				👁 Preview
																			</button>
																		)}
																		<button
																			type="button"
																			className="step4-btn-remove"
																			onClick={() => handleDeleteAssessment(lesson.id, assessment.id)}
																		>
																			🗑️
																		</button>
																	</div>
																</div>

																{assessment.type === 'quiz' ? (
																	<>
																		<QuizSettings
																			assessment={assessment}
																			onUpdate={(up) => handleUpdateAssessment(lesson.id, assessment.id, up)}
																		/>
																		{previewQuiz?.lessonId === lesson.id && previewQuiz?.assessmentId === assessment.id ? (
																			<QuizPreview assessment={assessment} />
																		) : (
																			<QuestionsList
																				questions={assessment.questions || []}
																				onUpdateQuestion={(qId, up) => handleUpdateQuestion(lesson.id, assessment.id, qId, up)}
																				onDeleteQuestion={(qId) => handleDeleteQuestion(lesson.id, assessment.id, qId)}
																				onReorder={(reordered) => handleReorderQuestions(lesson.id, assessment.id, reordered)}
																				onAddQuestion={(type) => handleAddQuestion(lesson.id, assessment.id, type)}
																			/>
																		)}
																	</>
																) : (
																	<div className="step4-assessment-settings">
																		<div className="step4-form-row">
																			<div className="step4-form-group">
																				<label>Prag trecere (%)</label>
																				<input
																					type="number"
																					min={0}
																					max={100}
																					value={assessment.passing_threshold ?? 70}
																					onChange={(e) => handleUpdateAssessment(lesson.id, assessment.id, { passing_threshold: parseInt(e.target.value, 10) })}
																					className="step4-input"
																				/>
																			</div>
																			<div className="step4-form-group">
																				<label>
																					<input
																						type="checkbox"
																						checked={assessment.allow_retry !== false}
																						onChange={(e) => handleUpdateAssessment(lesson.id, assessment.id, { allow_retry: e.target.checked })}
																					/>
																					Permite retry
																				</label>
																			</div>
																		</div>
																	</div>
																)}
															</div>
														))}
													</div>
												)}
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
	);
};

export default Step4Assessment;
