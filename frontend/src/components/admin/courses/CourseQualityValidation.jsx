import React, { useState, useEffect } from 'react';
import { openaiService } from '../../../services/openaiService';
import { useToast } from '../../../contexts/ToastContext';
import { buildCourseQualityValidationPrompt } from '../../../utils/aiPrompts';
import { isAiEnabled, runAiAction } from '../../../utils/aiAvailability';

/**
 * Course Quality Validation - Conform defacut.md secțiunea 8
 * AI checks:
 * - Lesson length
 * - Content gaps
 * - Difficulty spikes
 * - Engagement risk
 * Output:
 * - Readiness score
 * - Fix suggestions
 */
const CourseQualityValidation = ({ courseData, onValidationComplete }) => {
	const { showToast } = useToast();
	const [validating, setValidating] = useState(false);
	const [validationResults, setValidationResults] = useState(null);
	const [readinessScore, setReadinessScore] = useState(null);

	// Run validation
	const handleValidate = async () => {
		if (!courseData || !courseData.modules || courseData.modules.length === 0) {
			showToast('Cursul trebuie să aibă cel puțin un modul pentru validare', 'info');
			return;
		}

		setValidating(true);
		try {
			// Prepare course data for analysis
			const courseInfo = {
				title: courseData.title,
				description: courseData.description,
				level: courseData.level,
				modules: courseData.modules.map(module => ({
					title: module.title,
					objective: module.objective,
					lessons: (module.lessons || []).map(lesson => ({
						title: lesson.title,
						type: lesson.type || lesson.content_type,
						duration_minutes: lesson.duration_minutes,
						content_length: lesson.content ? lesson.content.replace(/<[^>]*>/g, '').length : 0
					}))
				}))
			};

			const prompt = buildCourseQualityValidationPrompt(courseInfo);

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
				
				setValidationResults(parsed);
				setReadinessScore(parsed.readiness_score);
				
				// Update course data with readiness score
				if (onValidationComplete) {
					onValidationComplete(parsed);
				}
			} catch (e) {
				console.error('Error parsing validation response:', e);
				showToast('Eroare la parsarea răspunsului AI. Vezi consola pentru detalii.', 'error');
			}
		} catch (error) {
			console.error('Error validating course:', error);
			showToast('Eroare la validarea cursului: ' + (error.message || 'Eroare necunoscută'), 'error');
		} finally {
			setValidating(false);
		}
	};

	// Get status color
	const getStatusColor = (status) => {
		switch (status) {
			case 'ok': return '#10b981';
			case 'warning': return '#0e7490';
			case 'error': return '#ef4444';
			default: return '#6b7280';
		}
	};

	// Get status label
	const getStatusLabel = (status) => {
		switch (status) {
			case 'ok': return '✓ OK';
			case 'warning': return '⚠️ Warning';
			case 'error': return '❌ Error';
			default: return '?';
		}
	};

	return (
		<div className="course-quality-validation">
			{isAiEnabled() ? (
			<div className="validation-header">
				<h3>🔍 Validare Calitate Curs</h3>
				<button
					type="button"
					className="admin-btn admin-btn-primary"
					onClick={() => runAiAction(showToast, handleValidate)}
					disabled={validating}
				>
					{validating ? '⏳ Validează...' : '🤖 Rulează validare AI'}
				</button>
			</div>
			) : (
			<div className="validation-header">
				<h3>🔍 Validare Calitate Curs</h3>
			</div>
			)}

			{/* Readiness Score */}
			{readinessScore !== null && (
				<div className="readiness-score-panel">
					<div className="readiness-score-header">
						<h4>Grad de pregătire</h4>
						<div className={`readiness-score-value ${readinessScore >= 80 ? 'excellent' : readinessScore >= 60 ? 'good' : 'needs-work'}`}>
							{readinessScore}/100
						</div>
					</div>
					<div className="readiness-score-bar">
						<div 
							className="readiness-score-fill"
							style={{ 
								width: `${readinessScore}%`,
								background: readinessScore >= 80 ? '#10b981' : readinessScore >= 60 ? '#0e7490' : '#ef4444'
							}}
						/>
					</div>
					{readinessScore < 80 && (
						<p className="readiness-score-message">
							{readinessScore >= 60 
								? 'Cursul este aproape gata, dar necesită câteva îmbunătățiri.'
								: 'Cursul necesită lucru suplimentar înainte de publicare.'}
						</p>
					)}
				</div>
			)}

			{/* Validation Results */}
			{validationResults && (
				<div className="validation-results">
					{/* Lesson Length Check */}
					{validationResults.checks?.lesson_length && (
						<div className="validation-check">
							<div className="validation-check-header">
								<h5>📏 Lungime Lecții</h5>
								<span 
									className="validation-status"
									style={{ color: getStatusColor(validationResults.checks.lesson_length.status) }}
								>
									{getStatusLabel(validationResults.checks.lesson_length.status)}
								</span>
							</div>
							{validationResults.checks.lesson_length.issues?.length > 0 && (
								<ul className="validation-issues">
									{validationResults.checks.lesson_length.issues.map((issue, idx) => (
										<li key={idx}>
											<strong>{issue.lesson}:</strong> {issue.issue}
										</li>
									))}
								</ul>
							)}
						</div>
					)}

					{/* Content Gaps Check */}
					{validationResults.checks?.content_gaps && (
						<div className="validation-check">
							<div className="validation-check-header">
								<h5>📚 Goluri în Conținut</h5>
								<span 
									className="validation-status"
									style={{ color: getStatusColor(validationResults.checks.content_gaps.status) }}
								>
									{getStatusLabel(validationResults.checks.content_gaps.status)}
								</span>
							</div>
							{validationResults.checks.content_gaps.issues?.length > 0 && (
								<ul className="validation-issues">
									{validationResults.checks.content_gaps.issues.map((issue, idx) => (
										<li key={idx}>
											<strong>{issue.module}:</strong> {issue.description}
										</li>
									))}
								</ul>
							)}
						</div>
					)}

					{/* Difficulty Spikes Check */}
					{validationResults.checks?.difficulty_spikes && (
						<div className="validation-check">
							<div className="validation-check-header">
								<h5>📈 Salturi de Dificultate</h5>
								<span 
									className="validation-status"
									style={{ color: getStatusColor(validationResults.checks.difficulty_spikes.status) }}
								>
									{getStatusLabel(validationResults.checks.difficulty_spikes.status)}
								</span>
							</div>
							{validationResults.checks.difficulty_spikes.issues?.length > 0 && (
								<ul className="validation-issues">
									{validationResults.checks.difficulty_spikes.issues.map((issue, idx) => (
										<li key={idx}>
											<strong>{issue.from} → {issue.to}:</strong> {issue.spike}
										</li>
									))}
								</ul>
							)}
						</div>
					)}

					{/* Engagement Risk Check */}
					{validationResults.checks?.engagement_risk && (
						<div className="validation-check">
							<div className="validation-check-header">
								<h5>🎯 Riscul de Pierdere a Atenției</h5>
								<span 
									className="validation-status"
									style={{ color: getStatusColor(validationResults.checks.engagement_risk.status) }}
								>
									{getStatusLabel(validationResults.checks.engagement_risk.status)}
								</span>
							</div>
							{validationResults.checks.engagement_risk.issues?.length > 0 && (
								<ul className="validation-issues">
									{validationResults.checks.engagement_risk.issues.map((issue, idx) => (
										<li key={idx}>{issue}</li>
									))}
								</ul>
							)}
						</div>
					)}

					{/* Fix Suggestions */}
					{validationResults.fix_suggestions && validationResults.fix_suggestions.length > 0 && (
						<div className="fix-suggestions-panel">
							<h5>💡 Sugestii de Îmbunătățire</h5>
							<ul className="fix-suggestions-list">
								{validationResults.fix_suggestions.map((suggestion, idx) => (
									<li key={idx}>{suggestion}</li>
								))}
							</ul>
						</div>
					)}

					{/* Summary */}
					{validationResults.summary && (
						<div className="validation-summary">
							<h5>📋 Rezumat</h5>
							<p>{validationResults.summary}</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default CourseQualityValidation;
