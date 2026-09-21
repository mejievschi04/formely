import React, { useState } from 'react';
import RichTextEditor from '../../../RichTextEditor';
import { openaiService } from '../../../../services/openaiService';
import { useToast } from '../../../../contexts/ToastContext';
import { buildTextLessonDifficultyPrompt, buildTextLessonTransformPrompt } from '../../../../utils/aiPrompts';
import { isAiEnabled, runAiAction } from '../../../../utils/aiAvailability';

/**
 * Text Lesson Editor - Conform defacut.md secțiunea 5.2
 * Features:
 * - Notion-like editor
 * - AI rewrite / simplify / expand
 * - Reading time calculation
 * - Difficulty score (AI)
 */
const TextLessonEditor = ({ lesson, onUpdate }) => {
	const { showToast } = useToast();
	const [aiProcessing, setAiProcessing] = useState(false);
	const [readingTime, setReadingTime] = useState(null);
	const [difficultyScore, setDifficultyScore] = useState(null);

	const calculateReadingTime = (content) => {
		if (!content) return null;
		const text = content.replace(/<[^>]*>/g, '');
		const words = text.split(/\s+/).filter(word => word.length > 0);
		const wordsPerMinute = 200;
		const minutes = Math.ceil(words.length / wordsPerMinute);
		setReadingTime(minutes);
		return minutes;
	};

	const handleAiTransform = async (action) => {
		if (!lesson.content || !lesson.content.trim()) {
			showToast('Te rugăm să adaugi mai întâi conținut', 'info');
			return;
		}

		setAiProcessing(true);
		try {
			const prompt = buildTextLessonTransformPrompt({
				action,
				lessonContent: lesson.content.replace(/<[^>]*>/g, '').substring(0, 2000),
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

			const transformedText = fullResponse.replace(/```[\s\S]*?```/g, '').trim();
			onUpdate({ content: transformedText });
			calculateReadingTime(transformedText);
		} catch (error) {
			console.error(`Error ${action} text:`, error);
			showToast(`Eroare la ${action} text: ` + (error.message || 'Eroare necunoscută'), 'error');
		} finally {
			setAiProcessing(false);
		}
	};

	const handleCalculateDifficulty = async () => {
		if (!lesson.content || !lesson.content.trim()) {
			showToast('Te rugăm să adaugi mai întâi conținut', 'info');
			return;
		}

		setAiProcessing(true);
		try {
			const prompt = buildTextLessonDifficultyPrompt(
				lesson.content.replace(/<[^>]*>/g, '').substring(0, 2000)
			);

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

			try {
				const jsonMatch = fullResponse.match(/```json\s*([\s\S]*?)\s*```/) ||
					fullResponse.match(/```\s*([\s\S]*?)\s*```/);
				const jsonStr = jsonMatch ? jsonMatch[1] : fullResponse;
				const parsed = JSON.parse(jsonStr);

				setDifficultyScore(parsed.difficulty_score);
				onUpdate({
					difficulty_score: parsed.difficulty_score,
					difficulty_reasoning: parsed.reasoning,
				});
			} catch (e) {
				console.error('Error parsing difficulty response:', e);
				const scoreMatch = fullResponse.match(/(\d+)/);
				if (scoreMatch) {
					const score = parseInt(scoreMatch[1], 10);
					if (score >= 1 && score <= 10) {
						setDifficultyScore(score);
						onUpdate({ difficulty_score: score });
					}
				}
			}
		} catch (error) {
			console.error('Error calculating difficulty:', error);
			showToast('Eroare la calcularea dificultății: ' + (error.message || 'Eroare necunoscută'), 'error');
		} finally {
			setAiProcessing(false);
		}
	};

	const handleContentChange = (content) => {
		onUpdate({ content });
		calculateReadingTime(content);
	};

	return (
		<div className="text-lesson-editor">
			{isAiEnabled() ? (
			<div className="admin-form-group">
				<div className="ai-actions-toolbar">
					<button
						type="button"
						className="admin-btn admin-btn-sm admin-btn-secondary"
						onClick={() => runAiAction(showToast, () => handleAiTransform('rewrite'))}
						disabled={aiProcessing || !lesson.content}
						title="Reformulează textul cu AI"
					>
						🤖 Reformulează
					</button>
					<button
						type="button"
						className="admin-btn admin-btn-sm admin-btn-secondary"
						onClick={() => runAiAction(showToast, () => handleAiTransform('simplify'))}
						disabled={aiProcessing || !lesson.content}
						title="Simplifică textul cu AI"
					>
						🤖 Simplifică
					</button>
					<button
						type="button"
						className="admin-btn admin-btn-sm admin-btn-secondary"
						onClick={() => runAiAction(showToast, () => handleAiTransform('expand'))}
						disabled={aiProcessing || !lesson.content}
						title="Extinde textul cu AI"
					>
						🤖 Extinde
					</button>
					<button
						type="button"
						className="admin-btn admin-btn-sm admin-btn-secondary"
						onClick={() => runAiAction(showToast, handleCalculateDifficulty)}
						disabled={aiProcessing || !lesson.content}
						title="Calculează dificultatea cu AI"
					>
						📉 Dificultate
					</button>
				</div>
			</div>
			) : null}

			<div className="admin-form-group">
				<label className="admin-form-label">
					Conținut Text <span className="admin-form-required">*</span>
				</label>
				<RichTextEditor
					value={lesson.content || ''}
					onChange={handleContentChange}
					placeholder="Scrie conținutul lecției aici..."
					style={{ minHeight: '400px' }}
				/>
			</div>

			<div className="text-lesson-stats">
				{readingTime && (
					<div className="stat-item">
						<span className="stat-label">⏱️ Reading Time:</span>
						<span className="stat-value">{readingTime} min</span>
					</div>
				)}
				{difficultyScore && (
					<div className="stat-item">
						<span className="stat-label">📉 Difficulty Score:</span>
						<span className="stat-value">{difficultyScore}/10</span>
					</div>
				)}
			</div>

			{readingTime && readingTime > 10 && (
				<div className="admin-form-warning">
					⚠️ Reading time depășește 10 minute ({readingTime} min). Pentru mobile-ready, recomandăm lecții sub 10 minute.
				</div>
			)}
		</div>
	);
};

export default TextLessonEditor;
