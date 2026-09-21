import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import AICourseChat from '../../components/admin/ai/AICourseChat';
import { canUseAiFeature, isAiEnabled } from '../../utils/aiAvailability';
import './CourseCreationPage.css';

const CourseCreationPage = () => {
	const navigate = useNavigate();
	const { showToast } = useToast();
	const { canMutateInAdminArea, user } = useAuth();
	const aiCreatorAllowed = isAiEnabled() && canUseAiFeature(user, 'ai_creator');

	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [creationMode, setCreationMode] = useState('manual');
	const [showAiCourseChat, setShowAiCourseChat] = useState(false);

	useEffect(() => {
		if (!canMutateInAdminArea) {
			navigate('/admin/content?tab=courses&view=maps', { replace: true });
		}
	}, [canMutateInAdminArea, navigate]);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError('');
		const t = title?.trim();
		if (!t) {
			setError('Titlul este obligatoriu.');
			return;
		}

		setLoading(true);
		try {
			const cleanDescription = description.trim();
			const payload = {
				title: t,
				description: cleanDescription || '',
				status: 'draft',
				level: 'beginner',
				visibility: 'public',
				sequential_unlock: true,
				min_test_score: 70,
				has_certificate: false,
				access_type: 'free',
				enrollment_type: 'open',
			};
			const result = await adminService.createCourse(payload);
			const courseId = result?.course?.id;
			if (courseId) {
				showToast('Curs creat. Adaugă module și lecții în Builder.', 'success');
				navigate(`/admin/courses/${courseId}/builder`);
			} else {
				setError('Crearea cursului nu a returnat un ID.');
			}
		} catch (err) {
			console.error('Error creating course:', err);
			const msg = err?.response?.data?.message || err?.message || 'Eroare la crearea cursului.';
			setError(msg);
			showToast(msg, 'error');
		} finally {
			setLoading(false);
		}
	};

	const handleAiCourseGenerated = (course) => {
		if (course?.id) {
			setShowAiCourseChat(false);
			showToast('Curs creat asistat de AI.', 'success');
			navigate(`/admin/courses/${course.id}/builder`);
		}
	};

	if (!canMutateInAdminArea) {
		return null;
	}

	return (
		<div className="admin-container course-creation-simple-page">
			{showAiCourseChat && (
				<div className="ai-chat-modal-overlay" onClick={() => setShowAiCourseChat(false)}>
					<div className="ai-chat-modal" onClick={(e) => e.stopPropagation()}>
						<AICourseChat
							onCourseGenerated={handleAiCourseGenerated}
							onClose={() => setShowAiCourseChat(false)}
						/>
					</div>
				</div>
			)}
			<div className="course-creation-simple-card">
				<header className="course-creation-simple-header">
					<button
						type="button"
						className="course-creation-simple-back"
						onClick={() => navigate('/admin/courses')}
						aria-label="Înapoi la cursuri"
					>
						← Cursuri
					</button>
					<h1 className="course-creation-simple-title">Creează curs nou</h1>
					<p className="course-creation-simple-subtitle">
						Pornește un curs Formely, apoi continuă în Builder.
					</p>
				</header>

				<form onSubmit={handleSubmit} className="course-creation-simple-form">
					<div className="course-creation-mode-switch">
						<button
							type="button"
							className={`course-creation-mode-card${creationMode === 'manual' ? ' is-active' : ''}`}
							onClick={() => {
								setCreationMode('manual');
								setShowAiCourseChat(false);
							}}
							disabled={loading}
						>
							<span className="course-creation-mode-card-label">Curs</span>
							<span className="course-creation-mode-card-title">Creează manual</span>
							<span className="course-creation-mode-card-desc">Completezi titlul și descrierea, apoi intri în Builder.</span>
						</button>
						{aiCreatorAllowed ? (
						<button
							type="button"
							className={`course-creation-mode-card${creationMode === 'ai' ? ' is-active' : ''}`}
							onClick={() => {
								setCreationMode('ai');
								setShowAiCourseChat(true);
							}}
							disabled={loading}
						>
							<span className="course-creation-mode-card-label">AI</span>
							<span className="course-creation-mode-card-title">Creează cu AI</span>
							<span className="course-creation-mode-card-desc">AI îți construiește cursul complet cu module și lecții.</span>
						</button>
						) : null}
					</div>

					<div className="course-creation-simple-field">
						<label className="course-creation-simple-label">
							Titlu curs <span className="course-creation-simple-required">*</span>
						</label>
						<input
							type="text"
							placeholder="Titlul cursului"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							className="course-creation-simple-input"
							autoFocus
							disabled={loading}
						/>
						<p className="course-creation-simple-hint">După creare poți adăuga lecții și teste.</p>
					</div>

					<div className="course-creation-simple-field">
						<label className="course-creation-simple-label">Descriere</label>
						<textarea
							placeholder="Scopul și conținutul cursului (opțional)"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							className="course-creation-simple-textarea"
							rows={4}
							disabled={loading}
						/>
					</div>

					{error && <div className="course-creation-simple-error" role="alert">{error}</div>}

					<div className="course-creation-simple-actions">
						<button
							type="button"
							className="course-creation-simple-btn-secondary"
							onClick={() => navigate('/admin/courses')}
							disabled={loading}
						>
							Anulare
						</button>
						<button
							type={creationMode === 'ai' ? 'button' : 'submit'}
							className="course-creation-simple-btn-primary"
							onClick={creationMode === 'ai' ? () => setShowAiCourseChat(true) : undefined}
							disabled={loading}
						>
							{loading ? 'Se creează...' : creationMode === 'ai' ? 'Deschide asistentul AI' : 'Creează curs'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default CourseCreationPage;
