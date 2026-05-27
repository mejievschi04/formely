import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';
import ConfirmModal from '../../../components/common/ConfirmModal';
import Step0Context from './CourseCreationSteps/Step0Context';
import Step1Blueprint from './CourseCreationSteps/Step1Blueprint';
import Step3Content from './CourseCreationSteps/Step3Content';
import Step4Assessment from './CourseCreationSteps/Step4Assessment';
import Step5CompletionRules from './CourseCreationSteps/Step5CompletionRules';
import Step6Review from './CourseCreationSteps/Step6Review';
import './CourseCreationWizard.css';
import { toImageUrl } from '../../../utils/imageUrl';

/** Pași wizard: titlu scurt pentru indicator, descriere pentru claritate */
const STEPS = [
	{ id: 0, title: 'Setare curs', shortTitle: 'Setare', desc: 'Titlu, descriere, nivel și vizibilitate' },
	{ id: 1, title: 'Curriculum', shortTitle: 'Structură', desc: 'Module și lecții' },
	{ id: 2, title: 'Conținut lecții', shortTitle: 'Conținut', desc: 'Blocuri de conținut per lecție' },
	{ id: 3, title: 'Quiz / Evaluare', shortTitle: 'Quiz', desc: 'Întrebări și punctaj minim' },
	{ id: 4, title: 'Reguli finalizare', shortTitle: 'Reguli', desc: 'Deblocare secvențială și certificat' },
	{ id: 5, title: 'Publicare', shortTitle: 'Final', desc: 'Verificare și creare curs' },
];

const CourseCreationWizard = ({ onClose, onSuccess }) => {
	const navigate = useNavigate();
	const { success: showSuccess, error: showError } = useToast();
	
	const [currentStep, setCurrentStep] = useState(0);
	const [loading, setLoading] = useState(false);
	const [showCloseConfirm, setShowCloseConfirm] = useState(false);
	const [courseData, setCourseData] = useState({
		title: '',
		description: '',
		category: '',
		level: 'beginner',
		marketing_tags: [],
		estimated_duration_hours: null,
		visibility: 'public',
		structure: { modules: [] },
		content_blocks: {},
		completion_rules: { sequential_unlock: true, min_test_score: 70, has_certificate: false },
		publish_status: 'draft',
		access_type: 'free',
		enrollment_type: 'open',
		status: 'draft',
	});

	const canProceedFromStep = (step) => {
		if (step === 0) return !!(courseData.title?.trim());
		return true;
	};

	const handleNext = () => {
		if (currentStep < STEPS.length - 1 && canProceedFromStep(currentStep)) {
			setCurrentStep(currentStep + 1);
		}
	};

	const handleBack = () => {
		if (currentStep > 0) {
			setCurrentStep(currentStep - 1);
		} else {
			handleCloseAttempt();
		}
	};

	const hasUnsavedData = () => {
		return !!(courseData.title?.trim() || courseData.description?.trim() || (courseData.structure?.modules?.length > 0));
	};

	const handleCloseAttempt = () => {
		if (hasUnsavedData()) {
			setShowCloseConfirm(true);
			return;
		}
		if (onClose) onClose();
	};

	const handleConfirmClose = () => {
		setShowCloseConfirm(false);
		if (onClose) onClose();
	};
	
	// Update course data
	const updateCourseData = (updates) => {
		setCourseData(prev => ({
			...prev,
			...updates
		}));
	};
	
	const handleCreate = async () => {
		setLoading(true);
		try {
			const formData = new FormData();
			formData.append('title', courseData.title?.trim() || 'Curs nou');
			formData.append('description', courseData.description || '');
			formData.append('status', courseData.publish_status === 'published' ? 'published' : 'draft');
			if (courseData.category) formData.append('category', courseData.category);
			formData.append('level', courseData.level || 'beginner');
			if (courseData.estimated_duration_hours != null && courseData.estimated_duration_hours !== '') {
				formData.append('estimated_duration_hours', String(courseData.estimated_duration_hours));
			}
			formData.append('visibility', courseData.visibility || 'public');
			formData.append('enrollment_type', courseData.enrollment_type || 'open');
			formData.append('sequential_unlock', courseData.completion_rules?.sequential_unlock !== false ? '1' : '0');
			formData.append('min_test_score', String(courseData.completion_rules?.min_test_score ?? 70));
			formData.append('has_certificate', courseData.completion_rules?.has_certificate ? '1' : '0');
			if (Array.isArray(courseData.marketing_tags) && courseData.marketing_tags.length > 0) {
				formData.append('marketing_tags', JSON.stringify(courseData.marketing_tags));
			}
			if (courseData.image) {
				formData.append('image', courseData.image);
			}

			const result = await adminService.createCourse(formData);
			const courseId = result.course?.id;

			if (!courseId) {
				throw new Error('Crearea cursului nu a returnat un ID');
			}

			const courseIsPublished = courseData.publish_status === 'published';
			// Testele draft nu apar în API-ul cursului pentru elevi (doar published); aliniem la statusul cursului.
			const quizTestStatus = courseIsPublished ? 'published' : 'draft';

			const mapLessonKey = (id) => (id == null ? null : String(id));

			// Map client-side lesson id -> real lesson id (from API) for content_blocks and assessments
			const lessonIdMap = {};
			const lessonTitleMap = {};

			if (courseData.structure?.modules?.length > 0) {
				for (const moduleData of courseData.structure.modules) {
					const moduleRes = await adminService.createModule({
						course_id: courseId,
						title: moduleData.title,
						description: moduleData.objective || '',
						order: moduleData.order || 0,
					});
					const createdModule = moduleRes?.module ?? moduleRes;
					const moduleId = createdModule?.id;
					if (moduleData.lessons?.length > 0 && moduleId) {
						for (const lessonData of moduleData.lessons) {
							const lessonRes = await adminService.createLesson({
								module_id: moduleId,
								title: lessonData.title,
								content: lessonData.objective || '',
								type: lessonData.type || 'text',
								order: lessonData.order || 0,
							});
							const createdLesson = lessonRes?.lesson ?? lessonRes;
							const realLessonId = createdLesson?.id;
							if (realLessonId != null && lessonData.id != null) {
								const k = mapLessonKey(lessonData.id);
								lessonIdMap[k] = realLessonId;
								lessonTitleMap[k] = lessonData.title || 'Lecție';
							}
						}
					}
				}
			}

			const resolveRealLessonId = (clientLessonId) => {
				const k = mapLessonKey(clientLessonId);
				if (k == null) return undefined;
				return lessonIdMap[k];
			};

			// Persist content blocks from Step 3 (builder API)
			const contentBlocks = courseData.content_blocks || {};
			for (const clientLessonId of Object.keys(contentBlocks)) {
				const realLessonId = resolveRealLessonId(clientLessonId);
				if (!realLessonId) continue;
				const blocks = contentBlocks[clientLessonId];
				if (!Array.isArray(blocks) || blocks.length === 0) continue;
				for (let i = 0; i < blocks.length; i++) {
					const b = blocks[i];
					try {
						await adminService.builderCreateContentBlock(courseId, realLessonId, {
							type: b.type || 'text',
							source: b.source ?? '',
							payload: b.payload ?? null,
							metadata: b.metadata ?? null,
							visible: b.visible !== false,
							order: i,
						});
					} catch (e) {
						console.warn('Content block create failed', b.type, e);
					}
				}
			}

			// Create tests from Step 4 (quiz assessments) and attach to course/lesson
			const assessments = courseData.assessments || {};
			for (const clientLessonId of Object.keys(assessments)) {
				const realLessonId = resolveRealLessonId(clientLessonId);
				const lessonTitle = lessonTitleMap[mapLessonKey(clientLessonId)] || 'Lecție';
				const list = assessments[clientLessonId];
				if (!Array.isArray(list)) continue;
				for (const assessment of list) {
					if (assessment.type !== 'quiz') continue;
					try {
						const testPayload = {
							title: `Quiz: ${lessonTitle}`,
							description: '',
							type: 'graded',
							status: quizTestStatus,
							time_limit_minutes: assessment.time_limit_minutes ?? null,
							max_attempts: assessment.max_attempts ?? 3,
							randomize_questions: !!assessment.randomize,
							randomize_answers: false,
							show_results_immediately: true,
							show_correct_answers: true,
							allow_review: true,
							question_source: 'direct',
						};
						const testRes = await adminService.createTest(testPayload);
						const test = testRes?.test ?? testRes;
						const testId = test?.id;
						if (!testId) continue;

						const questions = assessment.questions || [];
						for (let qIdx = 0; qIdx < questions.length; qIdx++) {
							const q = questions[qIdx];
							const answers = (q.answers || []).map((a) => ({
								text: a.answer_text ?? a.text ?? '',
								is_correct: !!a.is_correct,
								order: a.order ?? 0,
							}));
							try {
								await adminService.createQuestion(testId, {
									type: q.question_type || 'single_choice',
									content: q.question_text ?? q.content ?? '',
									answers: answers.length ? answers : [{ text: '', is_correct: false, order: 0 }],
									points: q.points ?? 1,
									order: qIdx,
									metadata: q.payload ? { payload: q.payload } : null,
								});
							} catch (eq) {
								console.warn('Question create failed', eq);
							}
						}

						if (realLessonId) {
							await adminService.builderAttachTest(courseId, {
								test_id: testId,
								scope: 'lesson',
								scope_id: realLessonId,
								required: true,
								passing_score: assessment.passing_threshold ?? 70,
							});
						}
					} catch (e) {
						console.warn('Test create/attach failed', assessment, e);
					}
				}
			}

			showSuccess('Cursul a fost creat. Conținutul și quiz-urile au fost salvate. Poți edita din builder.');
			if (onSuccess) {
				onSuccess(courseId);
			} else {
				navigate(`/admin/courses/${courseId}/builder`);
			}
			if (onClose) onClose();
		} catch (err) {
			console.error('Error creating course:', err);
			showError(err.response?.data?.message || err.message || 'Eroare la crearea cursului');
		} finally {
			setLoading(false);
		}
	};

	const progress = ((currentStep + 1) / STEPS.length) * 100;
	
	return (
		<div className="course-creation-wizard-page" role="main" aria-label="Creare curs nou">
			<div className="course-creation-wizard" role="application" aria-label="Wizard creare curs">
				{/* Header */}
				<div className="course-creation-wizard-header">
					<div>
						<h2>Creează curs nou</h2>
						<p className="course-creation-wizard-subtitle">
							{STEPS[currentStep].title}
							{STEPS[currentStep].desc && <span className="course-creation-wizard-step-desc-inline"> — {STEPS[currentStep].desc}</span>}
						</p>
					</div>
					{onClose && (
						<button type="button" className="course-creation-wizard-close" onClick={handleCloseAttempt} aria-label="Închide wizard">×</button>
					)}
				</div>

				{/* Progress Bar - indicator vizual conform standardelor */}
				<div className="course-creation-wizard-progress" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label="Progres pași">
					<div className="course-creation-wizard-progress-bar">
						<div className="course-creation-wizard-progress-fill" style={{ width: `${progress}%` }} />
					</div>
					<span className="course-creation-wizard-progress-text">
						Pasul {currentStep + 1} din {STEPS.length}
					</span>
				</div>

				{/* Steps Indicator - permite revenire la pași anteriori (NN/G) */}
				<nav className="course-creation-wizard-steps-indicator" aria-label="Pași creare curs">
					{STEPS.map((step, index) => (
						<button
							key={step.id}
							type="button"
							className={`course-creation-wizard-step-indicator ${
								index === currentStep ? 'active' : index < currentStep ? 'completed' : ''
							}`}
							onClick={() => index <= currentStep && setCurrentStep(index)}
							disabled={index > currentStep}
							aria-current={index === currentStep ? 'step' : undefined}
							aria-label={`Pas ${index + 1}: ${step.title}${index < currentStep ? ', completat' : ''}`}
						>
							<span className="course-creation-wizard-step-indicator-icon">
								{index < currentStep ? '✓' : index + 1}
							</span>
							<span className="course-creation-wizard-step-indicator-label">{step.shortTitle}</span>
						</button>
					))}
				</nav>
				
				{/* Content - Split Layout */}
				<div className="course-creation-wizard-content course-creation-wizard-split">
					<div className="course-creation-wizard-form-panel">
						{currentStep === 0 && <Step0Context data={courseData} onUpdate={updateCourseData} />}
						{currentStep === 1 && <Step1Blueprint data={courseData} onUpdate={updateCourseData} />}
						{currentStep === 2 && <Step3Content data={courseData} onUpdate={updateCourseData} />}
						{currentStep === 3 && <Step4Assessment data={courseData} onUpdate={updateCourseData} />}
						{currentStep === 4 && <Step5CompletionRules data={courseData} onUpdate={updateCourseData} />}
						{currentStep === 5 && (
							<Step6Review
								data={courseData}
								onUpdate={updateCourseData}
								onCreate={handleCreate}
								loading={loading}
							/>
						)}
					</div>
					
					{/* Preview Panel */}
					<div className="course-creation-wizard-preview-panel">
						<div className="course-creation-wizard-preview-header">
							<h3>Preview Live</h3>
							<p>Vizualizează modificările în timp real</p>
						</div>
						<div className="course-creation-wizard-preview-content">
							<div className="course-preview-card">
								{courseData.image && (
									<div className="course-preview-thumbnail">
										<img src={typeof courseData.image === 'string' ? (toImageUrl(courseData.image) || courseData.image) : URL.createObjectURL(courseData.image)} alt={courseData.title} loading="lazy" decoding="async" />
									</div>
								)}
								<div className="course-preview-body">
									<h4 className="course-preview-title">{courseData.title || 'Titlu curs'}</h4>
									<p className="course-preview-description">{courseData.description || 'Descriere curs...'}</p>
									{courseData.structure?.modules?.length > 0 && (
										<div className="course-preview-structure">
											<div className="course-preview-structure-label">Structură:</div>
											{courseData.structure.modules.map((module, idx) => (
												<div key={idx} className="course-preview-module">
													<span className="course-preview-module-icon">📚</span>
													<span className="course-preview-module-title">{module.title || `Modul ${idx + 1}`}</span>
													{module.lessons?.length > 0 && (
														<span className="course-preview-module-lessons">({module.lessons.length} lecții)</span>
													)}
												</div>
											))}
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
				
				{/* Footer */}
				<ConfirmModal
					open={showCloseConfirm}
					onClose={() => setShowCloseConfirm(false)}
					onConfirm={handleConfirmClose}
					title="Date nesalvate"
					message="Ai date nesalvate. Ești sigur că vrei să închizi?"
					confirmLabel="Închide"
					cancelLabel="Rămân"
					variant="primary"
				/>
				<div className="course-creation-wizard-footer">
					<button
						type="button"
						className="course-creation-wizard-btn course-creation-wizard-btn-secondary"
						onClick={handleBack}
					>
						{currentStep === 0 ? 'Anulare' : '← Înapoi'}
					</button>
					{currentStep < STEPS.length - 1 && (
						<button
							type="button"
							className="course-creation-wizard-btn course-creation-wizard-btn-primary"
							onClick={handleNext}
							disabled={!canProceedFromStep(currentStep)}
						>
							Continuă →
						</button>
					)}
					{currentStep === STEPS.length - 1 && (
						<button
							type="button"
							className="course-creation-wizard-btn course-creation-wizard-btn-primary"
							onClick={handleCreate}
							disabled={loading || !courseData.title?.trim()}
						>
							{loading ? 'Se creează...' : 'Creează curs'}
						</button>
					)}
				</div>
			</div>
		</div>
	);
};

export default CourseCreationWizard;
