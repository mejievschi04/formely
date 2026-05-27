import React, { useState } from 'react';
import { openaiService } from '../../../../services/openaiService';
import { adminService } from '../../../../services/api';
import { useToast } from '../../../../contexts/ToastContext';
import { buildVideoLessonPrompt } from '../../../../utils/aiPrompts';
import { runAiAction } from '../../../../utils/aiAvailability';

/**
 * Video Lesson Editor - Conform defacut.md secțiunea 5.1
 * Features:
 * - Upload video
 * - AI auto: transcription, chapters, highlights, summary
 * - Asistent AI context
 * - Quiz base generation
 */
const VideoLessonEditor = ({ lesson, onUpdate, courseId }) => {
	const { showToast } = useToast();
	const [uploading, setUploading] = useState(false);
	const [aiProcessing, setAiProcessing] = useState(false);
	const [aiResults, setAiResults] = useState({
		transcription: null,
		chapters: null,
		highlights: null,
		summary: null,
		tutorContext: null,
		quizBase: null
	});

	// Handle video upload
	const handleVideoUpload = async (file) => {
		if (!file) return;

		setUploading(true);
		try {
			if (!courseId) {
				const localPreviewUrl = URL.createObjectURL(file);
				onUpdate({ video_url: localPreviewUrl, video_file: file });
				showToast('Preview local creat. Salvează cursul pentru încărcare pe server.', 'info');
				return;
			}

			const formData = new FormData();
			formData.append('file', file);
			formData.append('type', 'video');

			const uploaded = await adminService.builderUploadContentFile(courseId, formData);
			const videoUrl = uploaded?.serve_url || uploaded?.url || URL.createObjectURL(file);
			onUpdate({
				video_url: videoUrl,
				video_file: file,
				video_media_asset_id: uploaded?.media_asset_id || null,
				video_path: uploaded?.path || null,
				video_filename: uploaded?.filename || file.name,
				video_mime_type: uploaded?.mime_type || file.type || 'video/mp4',
			});

			showToast('Video-ul a fost încărcat cu succes.', 'success');
			await handleProcessVideoAi(file);
		} catch (error) {
			console.error('Error uploading video:', error);
			showToast('Eroare la încărcarea video-ului', 'error');
		} finally {
			setUploading(false);
		}
	};

	// Process video with AI (transcription, chapters, highlights, summary)
	const handleProcessVideoAI = async (videoFile) => {
		if (!videoFile && !lesson.video_url) {
			showToast('Te rugăm să încarci mai întâi un video', 'info');
			return;
		}

		setAiProcessing(true);
		try {
			// Generate AI processing prompt
			const prompt = buildVideoLessonPrompt({
				title: lesson.title,
				description: lesson.description,
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

			// Parse AI response
			try {
				const jsonMatch = fullResponse.match(/```json\s*([\s\S]*?)\s*```/) || 
				                  fullResponse.match(/```\s*([\s\S]*?)\s*```/);
				const jsonStr = jsonMatch ? jsonMatch[1] : fullResponse;
				const parsed = JSON.parse(jsonStr);
				
				setAiResults(parsed);
				
				// Auto-update lesson with AI results
				onUpdate({
					ai_transcription: parsed.transcription,
					ai_chapters: parsed.chapters,
					ai_highlights: parsed.highlights,
					ai_summary: parsed.summary,
					ai_tutor_context: parsed.tutorContext,
					ai_quiz_base: parsed.quizBase
				});
			} catch (e) {
				console.error('Error parsing AI response:', e);
				showToast('Eroare la procesarea răspunsului AI. Vezi consola pentru detalii.', 'error');
			}
		} catch (error) {
			console.error('Error processing video with AI:', error);
			showToast('Eroare la procesarea video-ului cu AI: ' + (error.message || 'Eroare necunoscută'), 'error');
		} finally {
			setAiProcessing(false);
		}
	};

	return (
		<div className="video-lesson-editor">
			{/* Video Upload */}
			<div className="admin-form-group">
				<label className="admin-form-label">
					Video lecție <span className="admin-form-required">*</span>
				</label>
				<div className="video-upload-container">
					{lesson.video_url ? (
						<div className="video-preview">
							<video controls src={lesson.video_url} style={{ maxWidth: '100%', maxHeight: '400px' }} />
							<button
								type="button"
								className="admin-btn admin-btn-secondary"
								onClick={() => onUpdate({
									video_url: null,
									video_file: null,
									video_media_asset_id: null,
									video_path: null,
									video_filename: null,
									video_mime_type: null,
								})}
							>
								Șterge video
							</button>
						</div>
					) : (
						<label className="video-upload-label">
							<input
								type="file"
								accept="video/*"
								onChange={(e) => handleVideoUpload(e.target.files[0])}
								className="video-upload-input"
								disabled={uploading}
							/>
							<div className="video-upload-placeholder">
								<span className="video-upload-icon" aria-hidden>🎬</span>
								<span className="video-upload-text">
									{uploading ? 'Se încarcă...' : 'Click pentru a încărca video'}
								</span>
								<span className="video-upload-hint">MP4, WebM, MOV (max 500MB)</span>
							</div>
						</label>
					)}
				</div>
			</div>

			{/* AI processing button */}
			{lesson.video_url && (
				<div className="admin-form-group">
					<button
						type="button"
						className="admin-btn admin-btn-primary"
						onClick={() => runAiAction(showToast, () => handleProcessVideoAi())}
						disabled={aiProcessing}
					>
						{aiProcessing ? '⏳ Procesează cu AI...' : '🤖 Procesează video cu AI'}
					</button>
					<p className="admin-form-hint">
						Asistent AI va genera: transcriere, capitole, highlights, rezumat, context pentru Asistent AI și întrebări quiz
					</p>
				</div>
			)}

			{/* AI results display */}
			{aiResults.transcription && (
				<div className="ai-results-panel">
					<div className="ai-results-header">
						<h4>✨ Rezultate AI</h4>
					</div>

					{/* Transcription */}
					{aiResults.transcription && (
						<div className="ai-result-section">
							<h5>📝 Transcriere</h5>
							<textarea
								className="admin-form-textarea"
								value={aiResults.transcription}
								onChange={(e) => {
									setAiResults({ ...aiResults, transcription: e.target.value });
									onUpdate({ ai_transcription: e.target.value });
								}}
								rows={6}
							/>
						</div>
					)}

					{/* Chapters */}
					{aiResults.chapters && (
						<div className="ai-result-section">
							<h5>📑 Capitole</h5>
							<div className="chapters-list">
								{aiResults.chapters.map((chapter, idx) => (
									<div key={idx} className="chapter-item">
										<div className="chapter-timestamp">{chapter.timestamp}</div>
										<div className="chapter-content">
											<strong>{chapter.title}</strong>
											{chapter.description && <p>{chapter.description}</p>}
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Highlights */}
					{aiResults.highlights && (
						<div className="ai-result-section">
							<h5>⭐ Highlights</h5>
							<ul className="highlights-list">
								{aiResults.highlights.map((highlight, idx) => (
									<li key={idx}>
										<span className="highlight-timestamp">{highlight.timestamp}</span>
										<span className="highlight-text">{highlight.text}</span>
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Summary */}
					{aiResults.summary && (
						<div className="ai-result-section">
							<h5>📄 Rezumat</h5>
							<textarea
								className="admin-form-textarea"
								value={aiResults.summary}
								onChange={(e) => {
									setAiResults({ ...aiResults, summary: e.target.value });
									onUpdate({ ai_summary: e.target.value });
								}}
								rows={4}
							/>
						</div>
					)}

					{/* Asistent AI context */}
					{aiResults.tutorContext && (
						<div className="ai-result-section">
							<h5>⚡ Context Asistent AI</h5>
							<textarea
								className="admin-form-textarea"
								value={aiResults.tutorContext}
								onChange={(e) => {
									setAiResults({ ...aiResults, tutorContext: e.target.value });
									onUpdate({ ai_tutor_context: e.target.value });
								}}
								rows={4}
								placeholder="context pentru Asistent AI..."
							/>
						</div>
					)}

					{/* Quiz Base */}
					{aiResults.quizBase && (
						<div className="ai-result-section">
							<h5>❓ Quiz Base</h5>
							<div className="quiz-base-list">
								{aiResults.quizBase.map((question, idx) => (
									<div key={idx} className="quiz-question-item">
										<strong>{question.question}</strong>
										{question.options && (
											<ul>
												{question.options.map((opt, optIdx) => (
													<li key={optIdx}>
														{opt} {optIdx === question.correct ? '✓' : ''}
													</li>
												))}
											</ul>
										)}
									</div>
								))}
							</div>
							<button
								type="button"
								className="admin-btn admin-btn-secondary"
								onClick={() => {
									showToast('Funcționalitatea de creare quiz va fi implementată în curând', 'info');
								}}
							>
								Crează quiz din întrebări
							</button>
						</div>
					)}
				</div>
			)}

			{/* Mobile-ready validation */}
			{lesson.duration_minutes && lesson.duration_minutes > 10 && (
				<div className="admin-form-warning">
					⚠️ Lecția depășește 10 minute ({lesson.duration_minutes} min). Pentru mobile-ready, recomandăm lecții sub 10 minute.
				</div>
			)}
		</div>
	);
};

export default VideoLessonEditor;



