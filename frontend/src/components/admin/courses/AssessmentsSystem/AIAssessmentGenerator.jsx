import React, { useState } from 'react';
import { openaiService } from '../../../../services/openaiService';
import { useToast } from '../../../../contexts/ToastContext';
import { buildAssessmentAnalysisPrompt, buildAssessmentGenerationPrompt } from '../../../../utils/aiPrompts';
import { isAiEnabled, runAiAction } from '../../../../utils/aiAvailability';

/**
 * AI assessment generator - Conform defacut.md secțiunea 6
 * Features:
 * - Question generation
 * - Difficulty balancing
 * - Anti-pattern detection
 */
const AIAssessmentGenerator = ({ courseData, lessonData, moduleData, assessmentType, onQuestionsGenerated }) => {
	const { showToast } = useToast();
	const [generating, setGenerating] = useState(false);
	const [generatedQuestions, setGeneratedQuestions] = useState([]);
	const [difficultyAnalysis, setDifficultyAnalysis] = useState(null);
	const [antiPatterns, setAntiPatterns] = useState([]);

	// Generate questions with AI
	const handleGenerateQuestions = async () => {
		setGenerating(true);
		try {
			const context = {
				course: courseData?.title || '',
				lesson: lessonData?.title || '',
				module: moduleData?.title || '',
				content: lessonData?.content?.substring(0, 1000) || '',
				type: assessmentType // 'lesson_quiz', 'module_test', 'final_exam'
			};

			const prompt = buildAssessmentGenerationPrompt({
				assessmentType,
				course: context.course,
				module: context.module,
				lesson: context.lesson,
				content: context.content,
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
				
				if (parsed.questions) {
					setGeneratedQuestions(parsed.questions);
					setDifficultyAnalysis(parsed.difficulty_distribution);
					setAntiPatterns(parsed.anti_patterns_detected || []);
					
					if (onQuestionsGenerated) {
						onQuestionsGenerated(parsed.questions);
					}
				}
			} catch (e) {
				console.error('Error parsing questions response:', e);
				showToast('Eroare la parsarea răspunsului AI. Vezi consola pentru detalii.', 'error');
			}
		} catch (error) {
			console.error('Error generating questions:', error);
			showToast('Eroare la generarea întrebărilor: ' + (error.message || 'Eroare necunoscută'), 'error');
		} finally {
			setGenerating(false);
		}
	};

	// Analyze difficulty balance
	const handleAnalyzeDifficulty = async (questions) => {
		if (!questions || questions.length === 0) {
			showToast('Nu există întrebări de analizat', 'info');
			return;
		}

		setGenerating(true);
		try {
			const prompt = buildAssessmentAnalysisPrompt(questions);

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
				
				setDifficultyAnalysis(parsed.difficulty_distribution);
				setAntiPatterns(parsed.anti_patterns || []);
			} catch (e) {
				console.error('Error parsing analysis response:', e);
			}
		} catch (error) {
			console.error('Error analyzing difficulty:', error);
		} finally {
			setGenerating(false);
		}
	};

	if (!isAiEnabled()) {
		return null;
	}

	return (
		<div className="ai-assessment-generator">
			<div className="admin-form-group">
				<button
					type="button"
					className="admin-btn admin-btn-primary"
					onClick={() => runAiAction(showToast, handleGenerateQuestions)}
					disabled={generating}
				>
					{generating ? '⏳ Generează întrebări...' : '🤖 Generează întrebări cu AI'}
				</button>
				<p className="admin-form-hint">
					AI va genera întrebări echilibrate pentru {assessmentType === 'lesson_quiz' ? 'quiz-ul de lecție' : assessmentType === 'module_test' ? 'testul de modul' : 'examenul final'}
				</p>
			</div>

			{/* Generated Questions */}
			{generatedQuestions.length > 0 && (
				<div className="generated-questions-panel">
					<div className="generated-questions-header">
						<h4>✨ Întrebări Generate</h4>
						<button
							type="button"
							className="admin-btn admin-btn-sm admin-btn-secondary"
							onClick={() => handleAnalyzeDifficulty(generatedQuestions)}
							disabled={generating}
						>
							📊 Analizează Dificultatea
						</button>
					</div>

					{/* Difficulty Distribution */}
					{difficultyAnalysis && (
						<div className="difficulty-analysis">
							<h5>Distribuție Dificultate:</h5>
							<div className="difficulty-bars">
								<div className="difficulty-bar">
									<span className="difficulty-label">Ușor:</span>
									<div className="difficulty-bar-fill" style={{ width: `${(difficultyAnalysis.easy / generatedQuestions.length) * 100}%`, background: '#10b981' }} />
									<span className="difficulty-value">{difficultyAnalysis.easy}</span>
								</div>
								<div className="difficulty-bar">
									<span className="difficulty-label">Mediu:</span>
									<div className="difficulty-bar-fill" style={{ width: `${(difficultyAnalysis.medium / generatedQuestions.length) * 100}%`, background: '#0e7490' }} />
									<span className="difficulty-value">{difficultyAnalysis.medium}</span>
								</div>
								<div className="difficulty-bar">
									<span className="difficulty-label">Dificil:</span>
									<div className="difficulty-bar-fill" style={{ width: `${(difficultyAnalysis.hard / generatedQuestions.length) * 100}%`, background: '#ef4444' }} />
									<span className="difficulty-value">{difficultyAnalysis.hard}</span>
								</div>
							</div>
						</div>
					)}

					{/* Anti-patterns */}
					{antiPatterns.length > 0 && (
						<div className="anti-patterns-warning">
							<h5>⚠️ Anti-pattern-uri Detectate:</h5>
							<ul>
								{antiPatterns.map((pattern, idx) => (
									<li key={idx}>
										<strong>Întrebare {pattern.question_index + 1}:</strong> {pattern.type} - {pattern.description}
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Questions List */}
					<div className="questions-list">
						{generatedQuestions.map((question, idx) => (
							<div key={idx} className="question-item">
								<div className="question-header">
									<span className="question-number">{idx + 1}.</span>
									<span className="question-type">{question.type}</span>
									<span className="question-difficulty">{question.difficulty}</span>
									<span className="question-points">{question.points} puncte</span>
								</div>
								<div className="question-content">
									<strong>{question.content}</strong>
								</div>
								<div className="question-answers">
									{question.answers?.map((answer, ansIdx) => (
										<div key={ansIdx} className={`answer-item ${answer.is_correct ? 'correct' : ''}`}>
											{answer.is_correct ? '✓' : '○'} {answer.text}
										</div>
									))}
								</div>
								{question.explanation && (
									<div className="question-explanation">
										<strong>Explicație:</strong> {question.explanation}
									</div>
								)}
								<div className="question-actions">
									<button
										type="button"
										className="admin-btn admin-btn-sm admin-btn-secondary"
										onClick={() => {
											// Edit question
											const updated = [...generatedQuestions];
											updated[idx] = { ...question, editing: true };
											setGeneratedQuestions(updated);
										}}
									>
										✏️ Editează
									</button>
									<button
										type="button"
										className="admin-btn admin-btn-sm admin-btn-danger"
										onClick={() => {
											setGeneratedQuestions(generatedQuestions.filter((_, i) => i !== idx));
										}}
									>
										🗑️ Șterge
									</button>
								</div>
							</div>
						))}
					</div>

					<div className="questions-actions">
						<button
							type="button"
							className="admin-btn admin-btn-primary"
							onClick={() => {
								if (onQuestionsGenerated) {
									onQuestionsGenerated(generatedQuestions);
								}
							}}
						>
							💾 Acceptă Toate Întrebările
						</button>
						<button
							type="button"
							className="admin-btn admin-btn-secondary"
							onClick={() => {
								setGeneratedQuestions([]);
								setDifficultyAnalysis(null);
								setAntiPatterns([]);
							}}
						>
							🔄 Regenerare
						</button>
					</div>
				</div>
			)}
		</div>
	);
};

export default AIAssessmentGenerator;
