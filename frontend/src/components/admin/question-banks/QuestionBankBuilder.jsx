import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminService } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';
import QuestionBankBuilderStep1 from './QuestionBankBuilderSteps/Step1Basics';
import QuestionBankBuilderStep2 from './QuestionBankBuilderSteps/Step2Questions';
import QuestionBankBuilderStep3 from './QuestionBankBuilderSteps/Step3Review';
import BuilderWizardShell, { BuilderWizardFooter } from '../builders/BuilderWizardShell';
import useUnsavedChangesPrompt from '../builders/useUnsavedChangesPrompt';
import '../../../styles/admin-course-builder.css';
import './QuestionBankBuilder.css';

/**
 * QuestionBankBuilder - Creare/editare bănci de întrebări
 * Stil aliniat cu constructorul de cursuri și editorul de teste: sidebar pași, zonă centrală, panou rezumat.
 */
const STEPS = [
	{ id: 0, label: 'Setup', short: 'Setup' },
	{ id: 1, label: 'Content', short: 'Conținut' },
	{ id: 2, label: 'Rules', short: 'Reguli' },
	{ id: 3, label: 'Review & Publish', short: 'Review' },
];

const META_AUTOSAVE_MS = 1000;

function formatSavedClock(d) {
	try {
		return d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
	} catch {
		return '';
	}
}

const QuestionBankBuilder = () => {
	const { id } = useParams();
	const navigate = useNavigate();
	const { showToast } = useToast();
	const isEditMode = !!id && id !== 'new';

	const [currentStep, setCurrentStep] = useState(0);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [bankId, setBankId] = useState(id && id !== 'new' ? id : null);
	const [bankData, setBankData] = useState({
		title: '',
		description: '',
		category: '',
		status: 'draft',
		questions: [],
	});
	const [errors, setErrors] = useState({});
	const [metaSaveStatus, setMetaSaveStatus] = useState('idle');
	const [metaLastSavedAt, setMetaLastSavedAt] = useState(null);
	const [qualityRules, setQualityRules] = useState({
		requireDifficultyTag: false,
		minimumQuestions: 10,
	});
	const lastSavedMetaRef = useRef(null);
	const metaSaveTimerRef = useRef(null);
	const metaSavedClearTimerRef = useRef(null);

	useUnsavedChangesPrompt(metaSaveStatus === 'saving' || saving);

	useEffect(() => {
		if (isEditMode && id) {
			fetchBank();
		}
	}, [id, isEditMode]);

	useEffect(() => {
		return () => {
			if (metaSaveTimerRef.current) clearTimeout(metaSaveTimerRef.current);
			if (metaSavedClearTimerRef.current) clearTimeout(metaSavedClearTimerRef.current);
		};
	}, []);

	useEffect(() => {
		if (!bankId || String(bankId).startsWith('temp-')) return;
		if (lastSavedMetaRef.current === null) return;

		const meta = {
			title: (bankData.title || '').trim(),
			description: bankData.description || '',
			category: bankData.category || '',
			status: bankData.status || 'draft',
		};

		const prev = lastSavedMetaRef.current;
		if (
			prev &&
			prev.title === meta.title &&
			prev.description === meta.description &&
			prev.category === meta.category &&
			prev.status === meta.status
		) {
			return;
		}

		if (metaSaveTimerRef.current) clearTimeout(metaSaveTimerRef.current);

		metaSaveTimerRef.current = setTimeout(async () => {
			metaSaveTimerRef.current = null;
			if (!bankData.title?.trim()) {
				setMetaSaveStatus('idle');
				return;
			}
			setMetaSaveStatus('saving');
			try {
				await adminService.updateQuestionBank(bankId, {
					title: bankData.title.trim(),
					description: bankData.description || null,
					category: bankData.category || null,
					status: bankData.status || 'draft',
				});
				lastSavedMetaRef.current = {
					title: bankData.title.trim(),
					description: bankData.description || '',
					category: bankData.category || '',
					status: bankData.status || 'draft',
				};
				const now = new Date();
				setMetaLastSavedAt(now);
				setMetaSaveStatus('saved');
				if (metaSavedClearTimerRef.current) clearTimeout(metaSavedClearTimerRef.current);
				metaSavedClearTimerRef.current = setTimeout(() => {
					metaSavedClearTimerRef.current = null;
					setMetaSaveStatus((s) => (s === 'saved' ? 'idle' : s));
				}, 2800);
			} catch (err) {
				console.error('Autosave question bank meta failed:', err);
				setMetaSaveStatus('error');
			}
		}, META_AUTOSAVE_MS);

		return () => {
			if (metaSaveTimerRef.current) {
				clearTimeout(metaSaveTimerRef.current);
				metaSaveTimerRef.current = null;
			}
		};
	}, [
		bankId,
		bankData.title,
		bankData.description,
		bankData.category,
		bankData.status,
	]);

	const fetchBank = async () => {
		try {
			setLoading(true);
			const bank = await adminService.getQuestionBank(id);
			const data = bank.data || bank;
			setBankData({
				title: data.title || '',
				description: data.description || '',
				category: data.category || '',
				status: data.status || 'draft',
				questions: data.questions || [],
			});
			setBankId(data.id || id);
			lastSavedMetaRef.current = {
				title: (data.title || '').trim(),
				description: data.description || '',
				category: data.category || '',
				status: data.status || 'draft',
			};
		} catch (err) {
			console.error('Error fetching question bank:', err);
			showToast('Eroare la încărcarea băncii de întrebări', 'error');
			navigate('/admin/question-banks');
		} finally {
			setLoading(false);
		}
	};

	const updateBankData = (updates) => {
		setBankData((prev) => ({ ...prev, ...updates }));
		if (Object.keys(errors).length > 0) setErrors({});
	};

	const validateStep = (step) => {
		const newErrors = {};
		if (step === 0 && (!bankData.title || !bankData.title.trim())) {
			newErrors.title = 'Titlul băncii de întrebări este obligatoriu';
		}
		if (step === 1 && (!bankData.questions || bankData.questions.length === 0)) {
			newErrors.questions = 'Adaugă cel puțin o întrebare';
		}
		if (step === 2 && Number(qualityRules.minimumQuestions || 0) > 0 && (bankData.questions?.length || 0) < Number(qualityRules.minimumQuestions)) {
			newErrors.rules = `Setul are sub minimul recomandat (${qualityRules.minimumQuestions}).`;
		}
		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleNext = async () => {
		if (currentStep === 0 && !bankId && bankData.title?.trim()) {
			try {
				setSaving(true);
				const saved = await adminService.createQuestionBank({
					title: bankData.title.trim(),
					description: bankData.description || null,
					category: bankData.category || null,
					status: 'draft',
				});
				const newId = saved?.bank?.id ?? saved?.id;
				if (newId) {
					setBankId(newId);
					lastSavedMetaRef.current = {
						title: bankData.title.trim(),
						description: bankData.description || '',
						category: bankData.category || '',
						status: 'draft',
					};
					window.history.replaceState({}, '', `/admin/question-banks/${newId}/builder`);
					showToast('Banca de întrebări a fost creată', 'success');
				}
			} catch (err) {
				console.error('Error creating bank:', err);
				showToast('Eroare la crearea băncii de întrebări', 'error');
				return;
			} finally {
				setSaving(false);
			}
		}
		if (validateStep(currentStep) && currentStep < 3) {
			setCurrentStep(currentStep + 1);
		}
	};

	const handleBack = () => {
		if (currentStep > 0) {
			setCurrentStep(currentStep - 1);
		} else {
			navigate('/admin/question-banks');
		}
	};

	const handleSave = async () => {
		try {
			setSaving(true);
			setErrors({});
			if (!bankData.title?.trim()) {
				setErrors({ title: 'Titlul băncii de întrebări este obligatoriu' });
				setCurrentStep(0);
				return;
			}
			if (!bankData.questions?.length) {
				setErrors({ questions: 'Adaugă cel puțin o întrebare' });
				setCurrentStep(1);
				return;
			}
			const payload = {
				title: bankData.title.trim(),
				description: bankData.description || null,
				category: bankData.category || null,
				status: 'draft',
			};
			if (bankId) {
				await adminService.updateQuestionBank(bankId, payload);
				showToast('Banca de întrebări a fost actualizată', 'success');
			} else {
				const saved = await adminService.createQuestionBank(payload);
				const newId = saved?.bank?.id ?? saved?.id;
				if (newId) {
					setBankId(newId);
					window.history.replaceState({}, '', `/admin/question-banks/${newId}/builder`);
					showToast('Banca de întrebări a fost creată', 'success');
				}
			}
			navigate('/admin/question-banks');
		} catch (err) {
			console.error('Error saving bank:', err);
			showToast('Eroare la salvarea băncii de întrebări', 'error');
		} finally {
			setSaving(false);
		}
	};

	const handlePublish = async () => {
		try {
			setSaving(true);
			setErrors({});
			if (!bankData.title?.trim()) {
				setErrors({ title: 'Titlul băncii de întrebări este obligatoriu' });
				setCurrentStep(0);
				return;
			}
			if (!bankData.questions?.length) {
				setErrors({ questions: 'Adaugă cel puțin o întrebare' });
				setCurrentStep(1);
				return;
			}
			const payload = {
				title: bankData.title.trim(),
				description: bankData.description || null,
				category: bankData.category || null,
				status: 'published',
			};
			if (bankId) {
				await adminService.updateQuestionBank(bankId, payload);
				showToast('Banca de întrebări a fost publicată', 'success');
			} else {
				const saved = await adminService.createQuestionBank(payload);
				const newId = saved?.bank?.id ?? saved?.id;
				if (newId) {
					setBankId(newId);
					window.history.replaceState({}, '', `/admin/question-banks/${newId}/builder`);
					showToast('Banca de întrebări a fost creată și publicată', 'success');
				}
			}
			navigate('/admin/question-banks');
		} catch (err) {
			console.error('Error publishing bank:', err);
			showToast('Eroare la publicarea băncii de întrebări', 'error');
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<div className="admin-container admin-course-builder-page admin-question-bank-builder-page">
				<div className="lms-dashboard-loading">
					<div className="va-spinner va-spinner-lg" />
					<p>Se încarcă banca de întrebări...</p>
				</div>
			</div>
		);
	}

	const questionCount = bankData.questions?.length ?? 0;
	const totalPoints = (bankData.questions || []).reduce((s, q) => s + (q.points || 1), 0);

	return (
		<div className="admin-container admin-course-builder-page admin-question-bank-builder-page">
			<BuilderWizardShell
				title={isEditMode ? (bankData.title || 'Editează bancă') : (bankData.title || 'Bancă de întrebări nouă')}
				subtitle="Setup → Content → Rules → Review & Publish"
				steps={STEPS}
				currentStep={currentStep}
				onStepChange={setCurrentStep}
				saveStatus={metaSaveStatus === 'idle' ? null : metaSaveStatus}
			>
			<header className="admin-course-builder-header">
				<div className="admin-course-builder-header-left">
					<button
						type="button"
						className="admin-course-builder-back"
						onClick={() => navigate('/admin/question-banks')}
						aria-label="Înapoi la băncile de întrebări"
						title="Înapoi la lista de bănci"
					>
						← Bănci de întrebări
					</button>
					<div>
						<h1 className="admin-course-builder-title">
							{isEditMode ? (bankData.title || 'Editează bancă') : (bankData.title || 'Bancă de întrebări nouă')}
						</h1>
						<p className="admin-course-builder-title-meta">
							<span className="admin-course-builder-status-dot" data-status={bankData.status || 'draft'} />
							{bankData.status === 'published' ? 'Publicată' : 'Ciornă'}
							{questionCount > 0 && ` · ${questionCount} întrebări`}
							{bankId &&
								!String(bankId).startsWith('temp-') &&
								(() => {
									const autosaveLabel =
										metaSaveStatus === 'saving'
											? 'Se salvează…'
											: metaSaveStatus === 'error'
												? 'Nu s-a putut salva automat'
												: metaSaveStatus === 'saved'
													? `Salvat${metaLastSavedAt ? ` la ${formatSavedClock(metaLastSavedAt)}` : ''}`
													: metaLastSavedAt
														? `Ultima salvare: ${formatSavedClock(metaLastSavedAt)}`
														: null;
									if (!autosaveLabel) return null;
									return (
										<>
											{' · '}
											<span
												className="qb-meta-save-status"
												data-state={metaSaveStatus}
												role="status"
												aria-live="polite"
											>
												{autosaveLabel}
											</span>
										</>
									);
								})()}
						</p>
					</div>
				</div>
				<div className="admin-course-builder-actions">
					<button
						type="button"
						className="admin-btn admin-btn-secondary"
						onClick={handleBack}
						disabled={saving}
					>
						{currentStep === 0 ? 'Anulează' : 'Înapoi'}
					</button>
					{currentStep < 3 ? (
						<button
							type="button"
							className="admin-btn admin-btn-primary"
							onClick={handleNext}
							disabled={saving}
						>
							{saving ? 'Se salvează…' : 'Următorul pas'}
						</button>
					) : (
						<>
							<button
								type="button"
								className="admin-btn admin-btn-secondary"
								onClick={handleSave}
								disabled={saving}
							>
								{saving ? 'Se salvează…' : 'Salvează ciornă'}
							</button>
							<button
								type="button"
								className="admin-btn admin-btn-primary"
								onClick={handlePublish}
								disabled={saving}
							>
								{saving ? 'Se publică…' : 'Publică'}
							</button>
						</>
					)}
				</div>
			</header>

			<div className="admin-course-builder-layout">
				<aside className="admin-course-builder-sidebar">
					<div className="admin-course-builder-sidebar-header">
						<h2 className="admin-course-builder-sidebar-title">Pași</h2>
					</div>
					<nav className="admin-course-builder-sidebar-nav" aria-label="Pași creare bancă">
						<ul className="admin-course-builder-sidebar-list">
							{STEPS.map((step) => (
								<li key={step.id}>
									<button
										type="button"
										className={`admin-course-builder-sidebar-lesson ${currentStep === step.id ? 'is-selected' : ''}`}
										onClick={() => setCurrentStep(step.id)}
										aria-current={currentStep === step.id ? 'step' : undefined}
									>
										<span className="admin-course-builder-sidebar-lesson-num">
											{currentStep > step.id ? '✓' : step.id + 1}
										</span>
										<span className="admin-course-builder-sidebar-lesson-title">{step.label}</span>
									</button>
								</li>
							))}
						</ul>
					</nav>
				</aside>

				<div className="admin-course-builder-main">
					<div className="admin-course-builder-lesson-settings qb-step-header">
						<h2 className="admin-course-builder-workflow-title" style={{ margin: 0 }}>
							{STEPS[currentStep]?.label}
						</h2>
						<p className="admin-course-builder-workflow-hint" style={{ margin: 'var(--space-1) 0 0 0' }}>
							{currentStep === 0 && 'Titlu, descriere și categorie. După pasul 1 banca este creată automat.'}
							{currentStep === 1 && 'Adaugă și editează întrebări. Poți reordona prin drag.'}
							{currentStep === 2 && 'Definește reguli de calitate pentru bancă.'}
							{currentStep === 3 && 'Verifică rezumatul și publică banca.'}
						</p>
					</div>
					<div className="admin-course-builder-content-blocks qb-step-content">
						{currentStep === 0 && (
							<QuestionBankBuilderStep1
								data={bankData}
								onUpdate={updateBankData}
								errors={errors}
							/>
						)}
						{currentStep === 1 && (
							<QuestionBankBuilderStep2
								bankId={bankId}
								data={bankData}
								onUpdate={updateBankData}
								errors={errors}
							/>
						)}
						{currentStep === 2 && (
							<div className="admin-card">
								<div className="admin-card-body" style={{ display: 'grid', gap: '0.8rem' }}>
									<h3 style={{ margin: 0 }}>Quality rules</h3>
									<label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
										<input
											type="checkbox"
											checked={!!qualityRules.requireDifficultyTag}
											onChange={(e) => setQualityRules((prev) => ({ ...prev, requireDifficultyTag: e.target.checked }))}
										/>
										Cere dificultate setată pentru toate întrebările
									</label>
									<div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
										<label htmlFor="qb-min-q">Minim întrebări recomandate</label>
										<input
											id="qb-min-q"
											type="number"
											min="1"
											max="200"
											className="form-input"
											style={{ width: 120 }}
											value={qualityRules.minimumQuestions}
											onChange={(e) => setQualityRules((prev) => ({ ...prev, minimumQuestions: Number(e.target.value || 0) }))}
										/>
									</div>
									{errors?.rules ? <p style={{ margin: 0, color: 'var(--color-error)' }}>{errors.rules}</p> : null}
								</div>
							</div>
						)}
						{currentStep === 3 && (
							<QuestionBankBuilderStep3
								data={bankData}
								onUpdate={updateBankData}
								errors={errors}
								bankId={bankId}
								onPublish={handlePublish}
								loading={saving}
							/>
						)}
					</div>
				</div>

				<aside className="admin-creator-preview-panel admin-course-builder-preview-panel">
					<div className="admin-creator-preview-header">
						<h3>Rezumat</h3>
						<p>Banca de întrebări</p>
					</div>
					<div className="admin-creator-preview-content">
						<div className="admin-course-builder-preview-card">
							{bankData.title && (
								<p style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
									{bankData.title}
								</p>
							)}
							<div className="admin-course-builder-preview-tags">
								{bankData.category && (
									<span className="admin-course-builder-status-badge draft">{bankData.category}</span>
								)}
								<span className={`admin-course-builder-status-badge ${bankData.status === 'published' ? 'published' : 'draft'}`}>
									{bankData.status === 'published' ? 'Publicată' : 'Ciornă'}
								</span>
							</div>
							<div className="admin-course-builder-stats-grid">
								<div className="admin-course-builder-stat">
									<span className="admin-course-builder-stat-value">{questionCount}</span>
									<span className="admin-course-builder-stat-label">Întrebări</span>
								</div>
								<div className="admin-course-builder-stat">
									<span className="admin-course-builder-stat-value">{totalPoints}</span>
									<span className="admin-course-builder-stat-label">Puncte</span>
								</div>
							</div>
						</div>
					</div>
				</aside>
			</div>
			<BuilderWizardFooter
				onBack={handleBack}
				onNext={currentStep < 3 ? handleNext : null}
				disableBack={saving}
				disableNext={saving || currentStep >= 3}
				nextLabel={saving ? 'Se salvează…' : 'Urmatorul pas'}
				primaryActions={currentStep === 3 ? (
					<>
						<button type="button" className="admin-btn admin-btn-secondary" onClick={handleSave} disabled={saving}>
							{saving ? 'Se salvează…' : 'Salvează ciornă'}
						</button>
						<button type="button" className="admin-btn admin-btn-primary" onClick={handlePublish} disabled={saving}>
							{saving ? 'Se publică…' : 'Publică'}
						</button>
					</>
				) : null}
			/>
			</BuilderWizardShell>
		</div>
	);
};

export default QuestionBankBuilder;
