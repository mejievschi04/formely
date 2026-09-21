import React, { useState, useEffect } from 'react';
import { adminService } from '../../../../services/api';
import { useToast } from '../../../../contexts/ToastContext';
import ConfirmModal from '../../../../components/common/ConfirmModal';
import Modal from '../../../../components/common/Modal';
import QuestionItemCard from './QuestionItemCard';
import AIGenerateQuestionsModal from './AIGenerateQuestionsModal';
import { isAiEnabled, notifyAiComingSoon, canUseAiFeature, notifyAiPlanLocked } from '../../../../utils/aiAvailability';
import { useAuth } from '../../../../contexts/AuthContext';

import {
	QUESTION_TYPE_GLOSSARY,
	QUESTION_TYPE_SELECT_OPTIONS,
} from '../../../../utils/questionTypeLabels';

const getQuestionTypeDefaults = (type) => {
	if (type === 'short_answer') {
		return [];
	}
	if (type === 'true_false') {
		return [
			{ text: 'Adevărat', is_correct: true },
			{ text: 'Fals', is_correct: false },
		];
	}

	if (type === 'matching') {
		return [
			{ left: 'Element A', right: 'Răspuns A', text: 'Element A', answer_text: 'Răspuns A', is_correct: true },
			{ left: 'Element B', right: 'Răspuns B', text: 'Element B', answer_text: 'Răspuns B', is_correct: true },
		];
	}

	if (type === 'ordering') {
		return [
			{ text: 'Pasul 1', is_correct: true, order: 0 },
			{ text: 'Pasul 2', is_correct: true, order: 1 },
		];
	}

	return [
		{ text: 'Răspuns A', is_correct: true },
		{ text: 'Răspuns B', is_correct: false },
	];
};

const normalizeQuestionAnswers = (type, answers) => {
	const list = Array.isArray(answers) ? answers : [];

	if (type === 'matching') {
		return list.map((answer, index) => ({
			left: answer?.left ?? answer?.text ?? '',
			right: answer?.right ?? answer?.answer_text ?? '',
			text: answer?.left ?? answer?.text ?? '',
			answer_text: answer?.right ?? answer?.answer_text ?? '',
			is_correct: true,
			order: typeof answer?.order === 'number' ? answer.order : index,
		}));
	}

	if (type === 'ordering') {
		return list.map((answer, index) => ({
			text: answer?.text ?? answer?.answer_text ?? '',
			is_correct: true,
			order: typeof answer?.order === 'number' ? answer.order : index,
		}));
	}

	if (type === 'true_false') {
		return list.slice(0, 2).map((answer, index) => ({
			text: answer?.text ?? (index === 0 ? 'Adevărat' : 'Fals'),
			is_correct: index === 0 ? !!answer?.is_correct : !!answer?.is_correct,
		}));
	}

	return list.map((answer, index) => ({
		text: answer?.text ?? '',
		is_correct: !!answer?.is_correct,
		order: typeof answer?.order === 'number' ? answer.order : index,
	}));
};

const QuestionBankBuilderStep2 = ({ bankId, data, onUpdate, errors }) => {
	const { showToast } = useToast();
	const { user } = useAuth();
	const aiTestAllowed = canUseAiFeature(user, 'ai_test_generation');
	const [editingQuestion, setEditingQuestion] = useState(null);
	const [questionFormErrors, setQuestionFormErrors] = useState({ content: '', answers: '', correct: '' });
	const [questionForm, setQuestionForm] = useState({
		type: 'multiple_choice',
		content: '',
		answers: getQuestionTypeDefaults('multiple_choice'),
		points: 1,
		explanation: '',
		metadata: {
			difficulty: '',
			tags: [],
		},
	});

	const [deleteConfirmIndex, setDeleteConfirmIndex] = useState(null);
	const [deleteLoading, setDeleteLoading] = useState(false);
	const [previewQuestion, setPreviewQuestion] = useState(null);
	const [previewShowCorrect, setPreviewShowCorrect] = useState(false);
	const [duplicateLoading, setDuplicateLoading] = useState(false);
	// AI generation state
	const [showAIModal, setShowAIModal] = useState(false);
	const [aiGenerating, setAiGenerating] = useState(false);
	const [aiError, setAiError] = useState(null);
	const [aiCourses, setAiCourses] = useState([]);
	const [aiCoursesLoading, setAiCoursesLoading] = useState(false);
	const [aiSelectedCourseId, setAiSelectedCourseId] = useState('');
	const [aiReviewStarted, setAiReviewStarted] = useState(false);
	const [aiCurrentDraftQuestion, setAiCurrentDraftQuestion] = useState(null);
	const [aiApprovedQuestions, setAiApprovedQuestions] = useState([]);
	const [aiGeneratedCount, setAiGeneratedCount] = useState(0);
	const [aiOptions, setAiOptions] = useState({
		numberOfQuestions: 10,
		difficulty: 'medium',
		questionTypes: ['multiple_choice']
	});

	// Load existing questions if editing
	useEffect(() => {
		if (bankId && !bankId.toString().startsWith('temp-')) {
			fetchQuestions();
		}
	}, [bankId]);

	useEffect(() => {
		let cancelled = false;

		const loadCourses = async () => {
			setAiCoursesLoading(true);
			try {
				const res = await adminService.getCourses({ per_page: 500, status: 'all' });
				const list = Array.isArray(res) ? res : (res?.data || []);
				if (!cancelled) {
					setAiCourses(list);
				}
			} catch (err) {
				console.error('Error fetching courses for AI generation:', err);
				if (!cancelled) {
					setAiCourses([]);
				}
			} finally {
				if (!cancelled) {
					setAiCoursesLoading(false);
				}
			}
		};

		loadCourses();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!showAIModal || aiSelectedCourseId || aiCourses.length === 0) return;
		setAiSelectedCourseId(String(aiCourses[0].id));
	}, [showAIModal, aiSelectedCourseId, aiCourses]);

	const aiTargetCount = Math.max(1, Number(aiOptions.numberOfQuestions) || 1);

	const resolveValidCourseId = (candidateId = aiSelectedCourseId) => {
		const parsed = Number.parseInt(String(candidateId), 10);
		if (!Number.isInteger(parsed) || parsed <= 0) return null;
		return parsed;
	};

	const ensureBankExists = async () => {
		let actualBankId = bankId;
		if (actualBankId && !String(actualBankId).startsWith('temp-')) {
			return actualBankId;
		}

		if (!data.title?.trim()) {
			showToast('Salvează mai întâi banca de întrebări (completează pasul 1)', 'error');
			return null;
		}

		try {
			const saved = await adminService.createQuestionBank({
				title: data.title.trim(),
				description: data.description || null,
				category: data.category || null,
			});
			actualBankId = saved?.bank?.id ?? saved?.id ?? null;
			if (actualBankId) {
				window.history.replaceState({}, '', `/admin/question-banks/${actualBankId}/builder`);
				return actualBankId;
			}
			showToast('Nu am putut crea banca de întrebări.', 'error');
			return null;
		} catch (err) {
			console.error('Error creating bank:', err);
			showToast('Eroare la crearea băncii de întrebări', 'error');
			return null;
		}
	};

	const fetchAiDraftQuestion = async (actualBankId, approvedQuestions = [], courseIdOverride = null) => {
		const validCourseId = resolveValidCourseId(courseIdOverride);
		if (!validCourseId) {
			throw new Error('Alege un curs valid înainte de generare.');
		}

		const result = await adminService.previewQuestionsWithAi(actualBankId, {
			course_id: validCourseId,
			numberOfQuestions: 1,
			difficulty: aiOptions.difficulty,
			questionTypes: aiOptions.questionTypes,
			instructions: '',
			approvedQuestions: approvedQuestions.map((q) => q.content || q.text || '').filter(Boolean),
		});

		const draft = Array.isArray(result?.draft) ? result.draft : [];
		return draft[0] || null;
	};

	const fetchQuestions = async () => {
		try {
			const questions = await adminService.getQuestionBankQuestions(bankId);
			onUpdate({ questions: Array.isArray(questions) ? questions : (questions?.data || []) });
		} catch (err) {
			console.error('Error fetching questions:', err);
		}
	};

	const addAnswer = () => {
		setQuestionFormErrors((prev) => ({ ...prev, answers: '', correct: '' }));
		const currentType = questionForm.type;
		const defaults = getQuestionTypeDefaults(currentType);
		const nextDefault = defaults[questionForm.answers.length] || defaults[0] || { text: '', is_correct: false };
		setQuestionForm(prev => ({
			...prev,
			answers: [...prev.answers, { ...nextDefault, order: prev.answers.length }],
		}));
	};

	const updateAnswer = (index, field, value) => {
		if (field === 'is_correct' && value) setQuestionFormErrors((prev) => ({ ...prev, correct: '' }));
		if (field === 'text' || field === 'left' || field === 'right') {
			setQuestionFormErrors((prev) => ({ ...prev, answers: '' }));
		}
		setQuestionForm(prev => ({
			...prev,
			answers: prev.answers.map((ans, i) => 
				i === index ? { ...ans, [field]: value } : ans
			),
		}));
	};

	const removeAnswer = (index) => {
		setQuestionForm(prev => ({
			...prev,
			answers: prev.answers.filter((_, i) => i !== index),
		}));
	};

	const clearQuestionFormError = (field) => {
		setQuestionFormErrors((prev) => ({ ...prev, [field]: '' }));
	};

	const saveQuestion = async () => {
		setQuestionFormErrors({ content: '', answers: '', correct: '' });

		if (!questionForm.content?.trim()) {
			setQuestionFormErrors((prev) => ({ ...prev, content: 'Conținutul întrebării este obligatoriu' }));
			return;
		}

		if (questionForm.type !== 'short_answer' && questionForm.answers.length < 2) {
			setQuestionFormErrors((prev) => ({ ...prev, answers: 'Adaugă cel puțin 2 răspunsuri' }));
			return;
		}

		if (questionForm.type === 'multiple_choice' && !questionForm.answers.some((a) => a.is_correct)) {
			setQuestionFormErrors((prev) => ({ ...prev, correct: 'Selectează cel puțin un răspuns corect' }));
			return;
		}

		if (questionForm.type === 'matching') {
			const hasEmptyPair = questionForm.answers.some((answer) => !String(answer.left || '').trim() || !String(answer.right || '').trim());
			if (hasEmptyPair) {
				setQuestionFormErrors((prev) => ({ ...prev, answers: 'Completează toate perechile' }));
				return;
			}
		}

		if (questionForm.type === 'ordering') {
			const hasEmptyItem = questionForm.answers.some((answer) => !String(answer.text || '').trim());
			if (hasEmptyItem) {
				setQuestionFormErrors((prev) => ({ ...prev, answers: 'Completează toate elementele de ordonat' }));
				return;
			}
		}

		try {
			const metaDifficulty = questionForm.metadata?.difficulty || '';
			const metaTags = Array.isArray(questionForm.metadata?.tags) ? questionForm.metadata.tags : [];
			const normalizedAnswers = normalizeQuestionAnswers(questionForm.type, questionForm.answers);

			const questionData = {
				type: questionForm.type,
				content: questionForm.content.trim(),
				answers: normalizedAnswers,
				points: questionForm.points || 1,
				explanation: questionForm.explanation || '',
				metadata: {
					difficulty: metaDifficulty || null,
					tags: metaTags,
				},
			};

			if (bankId && !bankId.toString().startsWith('temp-') && editingQuestion !== null && data.questions?.[editingQuestion]?.id && !data.questions[editingQuestion].id.toString().startsWith('temp-')) {
				// Update existing question
				await adminService.updateQuestionInBank(bankId, data.questions[editingQuestion].id, questionData);
				const updated = await adminService.getQuestionBankQuestions(bankId);
				onUpdate({ questions: Array.isArray(updated) ? updated : (updated?.data || []) });
			} else if (bankId && !bankId.toString().startsWith('temp-')) {
				// Add new question to existing bank
				await adminService.addQuestionToBank(bankId, questionData);
				const updated = await adminService.getQuestionBankQuestions(bankId);
				onUpdate({ questions: Array.isArray(updated) ? updated : (updated?.data || []) });
			} else {
				// Temporary question for new bank
				const questions = [...(data.questions || [])];
				if (editingQuestion !== null) {
					questions[editingQuestion] = { ...questionData, id: questions[editingQuestion]?.id || `temp-${Date.now()}` };
				} else {
					questions.push({
						...questionData,
						id: `temp-${Date.now()}`,
						order: questions.length,
					});
				}
				onUpdate({ questions });
			}

			setEditingQuestion(null);
			setQuestionForm({
				type: 'multiple_choice',
				content: '',
				answers: getQuestionTypeDefaults('multiple_choice'),
				points: 1,
				explanation: '',
				metadata: {
					difficulty: '',
					tags: [],
				},
			});
			setQuestionFormErrors({ content: '', answers: '', correct: '' });
			showToast(editingQuestion !== null ? 'Întrebarea a fost actualizată' : 'Întrebarea a fost adăugată', 'success');
		} catch (err) {
			console.error('Error saving question:', err);
			showToast('Eroare la salvarea întrebării: ' + (err.response?.data?.message || err.message), 'error');
		}
	};

	const persistReorder = async (nextQuestions) => {
		// Temporary bank: only reorder locally
		if (!bankId || bankId.toString().startsWith('temp-')) {
			onUpdate({ questions: nextQuestions.map((q, idx) => ({ ...q, order: idx })) });
			return;
		}

		try {
			const ids = nextQuestions.map((q) => q.id).filter(Boolean);
			await adminService.reorderQuestionBankQuestions(bankId, ids);
			const updated = await adminService.getQuestionBankQuestions(bankId);
			onUpdate({ questions: Array.isArray(updated) ? updated : (updated?.data || []) });
		} catch (err) {
			console.error('Error reordering questions:', err);
			showToast('Eroare la reordonarea întrebărilor', 'error');
		}
	};

	const moveQuestion = async (index, direction) => {
		const list = Array.isArray(data.questions) ? [...data.questions] : [];
		const nextIndex = direction === 'up' ? index - 1 : index + 1;
		if (nextIndex < 0 || nextIndex >= list.length) return;

		const tmp = list[index];
		list[index] = list[nextIndex];
		list[nextIndex] = tmp;

		await persistReorder(list);
	};

	const editQuestion = (index) => {
		const question = data.questions?.[index];
		if (question) {
			const meta = question.metadata || {};
			const tags = Array.isArray(meta.tags)
				? meta.tags
				: typeof meta.tags === 'string'
					? meta.tags.split(',').map((t) => t.trim()).filter(Boolean)
					: [];

			setQuestionForm({
				type: question.type || 'multiple_choice',
				content: question.content || question.text || '',
				answers: normalizeQuestionAnswers(question.type || 'multiple_choice', question.answers || []),
				points: question.points || 1,
				explanation: question.explanation || '',
				metadata: {
					difficulty: meta.difficulty || '',
					tags,
				},
			});
			setEditingQuestion(index);
		}
	};

	const duplicateQuestion = async (index) => {
		const question = data.questions?.[index];
		if (!question || duplicateLoading) return;

		const answers = normalizeQuestionAnswers(question.type || 'multiple_choice', question.answers || []);
		const meta = question.metadata || {};
		const tags = Array.isArray(meta.tags)
			? [...meta.tags]
			: typeof meta.tags === 'string'
				? meta.tags.split(',').map((t) => t.trim()).filter(Boolean)
				: [];

		const questionData = {
			type: question.type || 'multiple_choice',
			content: (question.content || question.text || '').trim(),
			answers,
			points: question.points || 1,
			explanation: question.explanation || '',
			metadata: {
				difficulty: meta.difficulty || null,
				tags,
			},
		};

		setDuplicateLoading(true);
		try {
			if (bankId && !bankId.toString().startsWith('temp-')) {
				await adminService.addQuestionToBank(bankId, questionData);
				const updated = await adminService.getQuestionBankQuestions(bankId);
				onUpdate({ questions: Array.isArray(updated) ? updated : (updated?.data || []) });
			} else {
				const questions = [...(data.questions || [])];
				questions.push({
					...questionData,
					id: `temp-${Date.now()}`,
					order: questions.length,
				});
				onUpdate({ questions });
			}
			showToast('Întrebare duplicată', 'success');
		} catch (err) {
			console.error('Error duplicating question:', err);
			showToast('Eroare la duplicare: ' + (err.response?.data?.message || err.message), 'error');
		} finally {
			setDuplicateLoading(false);
		}
	};

	const openStudentPreview = (index) => {
		const q = data.questions?.[index];
		if (!q) return;
		setPreviewShowCorrect(false);
		setPreviewQuestion(q);
	};

	const deleteQuestionClick = (index) => {
		setDeleteConfirmIndex(index);
	};

	const deleteQuestion = async (index) => {
		try {
			const question = data.questions?.[index];
			if (bankId && !bankId.toString().startsWith('temp-') && question?.id && !question.id.toString().startsWith('temp-')) {
				await adminService.removeQuestionFromBank(bankId, question.id);
				const updated = await adminService.getQuestionBankQuestions(bankId);
				onUpdate({ questions: Array.isArray(updated) ? updated : (updated?.data || []) });
			} else {
				const questions = (data.questions || []).filter((_, i) => i !== index);
				onUpdate({ questions });
			}
			showToast('Întrebarea a fost ștearsă', 'success');
		} catch (err) {
			console.error('Error deleting question:', err);
			showToast('Eroare la ștergerea întrebării: ' + (err.response?.data?.message || err.message), 'error');
		}
	};

	const handleConfirmDeleteQuestion = async () => {
		if (deleteConfirmIndex == null) return;
		setDeleteLoading(true);
		try {
			await deleteQuestion(deleteConfirmIndex);
			setDeleteConfirmIndex(null);
		} finally {
			setDeleteLoading(false);
		}
	};

	const handleOpenAIModal = () => {
		if (!aiTestAllowed) {
			if (!isAiEnabled()) notifyAiComingSoon(showToast);
			else notifyAiPlanLocked(showToast);
			return;
		}
		setAiOptions({
			numberOfQuestions: 10,
			difficulty: 'medium',
			questionTypes: ['multiple_choice']
		});
		setAiError(null);
		setAiReviewStarted(false);
		setAiCurrentDraftQuestion(null);
		setAiApprovedQuestions([]);
		setAiGeneratedCount(0);
		if (!aiSelectedCourseId && aiCourses.length > 0) {
			setAiSelectedCourseId(String(aiCourses[0].id));
		}
		setShowAIModal(true);
	};

	const startAiReview = async (overrideCourseId = null) => {
		const effectiveCourseId = resolveValidCourseId(overrideCourseId);
		if (!effectiveCourseId) {
			showToast('Alege mai întâi un curs sursă', 'error');
			return;
		}

		setAiReviewStarted(true);
		setAiCurrentDraftQuestion(null);
		try {
			setAiGenerating(true);
			setAiError(null);

			const actualBankId = await ensureBankExists();
			if (!actualBankId) {
				setAiReviewStarted(false);
				return;
			}

			const draft = await fetchAiDraftQuestion(actualBankId, [], effectiveCourseId);
			if (!draft) {
				throw new Error('AI nu a returnat nicio întrebare.');
			}
			setAiCurrentDraftQuestion(draft);
			setAiGeneratedCount(1);
		} catch (err) {
			console.error('Error generating questions:', err);
			const message = err.response?.data?.error || err.response?.data?.message || err.message || 'Eroare la generarea întrebărilor cu AI';
			setAiError(message);
			setAiReviewStarted(false);
			showToast(message, 'error');
		} finally {
			setAiGenerating(false);
		}
	};

	const advanceAiDraft = async (shouldApprove = false) => {
		if (!aiCurrentDraftQuestion) return;

		const nextApproved = shouldApprove ? [...aiApprovedQuestions, aiCurrentDraftQuestion] : aiApprovedQuestions;
		const nextApprovedCount = nextApproved.length;
		const target = aiTargetCount;

		if (shouldApprove && nextApprovedCount >= target) {
			try {
				setAiGenerating(true);
				const actualBankId = await ensureBankExists();
				if (!actualBankId) return;
				await adminService.addQuestionsToBankBulk(actualBankId, nextApproved);
				showToast(`Au fost salvate ${nextApproved.length} întrebări aprobate.`, 'success');
				setShowAIModal(false);
				setAiReviewStarted(false);
				setAiCurrentDraftQuestion(null);
				setAiApprovedQuestions([]);
				setAiGeneratedCount(0);
				setAiError(null);
				const updated = await adminService.getQuestionBankQuestions(actualBankId);
				onUpdate({ questions: Array.isArray(updated) ? updated : (updated?.data || []) });
			} catch (err) {
				console.error('Error saving approved questions:', err);
				const message = err.response?.data?.message || err.response?.data?.error || err.message || 'Nu am putut salva întrebările aprobate.';
				setAiError(message);
				showToast(message, 'error');
			} finally {
				setAiGenerating(false);
			}
			return;
		}

		try {
			setAiGenerating(true);
			const actualBankId = await ensureBankExists();
			if (!actualBankId) {
				setAiReviewStarted(false);
				return;
			}
			const draft = await fetchAiDraftQuestion(actualBankId, nextApproved, effectiveCourseId);
			if (!draft) {
				throw new Error('AI nu a returnat o întrebare nouă.');
			}
			setAiApprovedQuestions(nextApproved);
			setAiCurrentDraftQuestion(draft);
			setAiGeneratedCount((prev) => prev + 1);
		} catch (err) {
			console.error('Error advancing AI draft:', err);
			const message = err.response?.data?.error || err.response?.data?.message || err.message || 'Eroare la generarea următoarei întrebări.';
			setAiError(message);
			setAiReviewStarted(false);
			showToast(message, 'error');
		} finally {
			setAiGenerating(false);
		}
	};

	const startAiAutoGenerate = async (overrideCourseId = null, requestedCount = null) => {
		const effectiveCourseId = resolveValidCourseId(overrideCourseId);
		if (!effectiveCourseId) {
			showToast('Alege mai întâi un curs sursă', 'error');
			return;
		}

		try {
			setAiGenerating(true);
			setAiError(null);
			setAiReviewStarted(false);
			setAiCurrentDraftQuestion(null);
			setAiApprovedQuestions([]);

			const targetCount = Math.max(1, Number(requestedCount) || aiTargetCount);
			const actualBankId = await ensureBankExists();
			if (!actualBankId) {
				setAiReviewStarted(false);
				return;
			}

			const result = await adminService.previewQuestionsWithAi(actualBankId, {
				course_id: effectiveCourseId,
				numberOfQuestions: targetCount,
				difficulty: aiOptions.difficulty,
				questionTypes: aiOptions.questionTypes,
				autoGenerate: true,
			});

			const generatedQuestions = Array.isArray(result?.draft) ? result.draft : [];
			if (!generatedQuestions.length) {
				throw new Error('AI nu a returnat nicio întrebare.');
			}

			await adminService.addQuestionsToBankBulk(actualBankId, generatedQuestions);
			showToast(`Au fost generate și salvate ${generatedQuestions.length} întrebări.`, 'success');
			setShowAIModal(false);
			setAiCurrentDraftQuestion(null);
			setAiApprovedQuestions([]);
			setAiGeneratedCount(0);
			setAiError(null);
			const updated = await adminService.getQuestionBankQuestions(actualBankId);
			onUpdate({ questions: Array.isArray(updated) ? updated : (updated?.data || []) });
		} catch (err) {
			console.error('Error generating questions:', err);
			const message = err.response?.data?.error || err.response?.data?.message || err.message || 'Eroare la generarea întrebărilor cu AI';
			setAiError(message);
			setAiReviewStarted(false);
			showToast(message, 'error');
		} finally {
			setAiGenerating(false);
		}
	};

	return (
		<div className="admin-course-builder-step-content step2-questions">
			<h2>Întrebări</h2>
			<p className="admin-course-builder-step-description">
				Adaugă întrebările pentru banca de întrebări
			</p>

			{errors?.questions && (
				<div className="lms-error-message">
					{errors.questions}
				</div>
			)}

			{/* Split layout: form left, list right */}
			<div className="step2-split-layout">
				{/* Left: Form (scrollable) */}
				<div className="step2-form-column">
					<div className="admin-course-builder-form">
						{/* AI generation button */}
						<div className="admin-form-section" style={{ marginBottom: '1.5rem' }}>
							<div className="admin-form-section-header">
								<h3 className="admin-form-section-title">Adaugă Întrebări</h3>
								{aiTestAllowed ? (
								<button
									type="button"
									className="lms-btn-primary"
									onClick={handleOpenAIModal}
								>
									🤖 Generează cu AI
								</button>
								) : null}
							</div>
						</div>

						{/* Question Form */}
						<div className="admin-form-section">
					<h3 className="admin-form-section-title">
						{editingQuestion !== null ? 'Editează Întrebare' : 'Adaugă Întrebare Nouă'}
					</h3>

					<div className="admin-form-group">
						<label className="admin-form-label">Tip Întrebare</label>
						<select
							className="admin-form-select"
							value={questionForm.type}
							onChange={(e) => {
								const nextType = e.target.value;
								setQuestionForm({
									...questionForm,
									type: nextType,
									answers: getQuestionTypeDefaults(nextType),
								});
							}}
						>
							{QUESTION_TYPE_SELECT_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>{option.label}</option>
							))}
						</select>
						<p className="admin-form-hint">{QUESTION_TYPE_GLOSSARY} Potrivire = perechi; Ordonare = elemente în ordine.</p>
					</div>

					<div className="admin-form-group">
						<label className="admin-form-label">Conținut Întrebare <span className="admin-form-required">*</span></label>
						<textarea
							className={`admin-form-textarea ${questionFormErrors.content ? 'admin-input-error' : ''}`}
							value={questionForm.content}
							onChange={(e) => {
								setQuestionForm({ ...questionForm, content: e.target.value });
								clearQuestionFormError('content');
							}}
							onBlur={() => {
								if (!questionForm.content?.trim()) {
									setQuestionFormErrors((prev) => ({ ...prev, content: 'Conținutul întrebării este obligatoriu' }));
								} else {
									clearQuestionFormError('content');
								}
							}}
							placeholder="Scrie întrebarea aici..."
							rows={3}
							aria-invalid={!!questionFormErrors.content}
							aria-describedby={questionFormErrors.content ? 'qb-question-content-error' : undefined}
						/>
						{questionFormErrors.content && (
							<p id="qb-question-content-error" className="admin-form-error-inline" role="alert">
								{questionFormErrors.content}
							</p>
						)}
					</div>

					{questionForm.type !== 'short_answer' && (
						<div className="admin-form-group">
							<label className="admin-form-label">
								{questionForm.type === 'matching' ? 'Perechi' : questionForm.type === 'ordering' ? 'Elemente' : 'Răspunsuri'}
							</label>

							{questionForm.type === 'matching' ? (
								<div className="admin-answer-list">
									{questionForm.answers.map((answer, index) => (
										<div key={index} className="admin-answer-item">
											<input
												type="text"
												className="admin-form-input"
												value={answer.left || ''}
												onChange={(e) => updateAnswer(index, 'left', e.target.value)}
												placeholder={`Element stânga ${index + 1}`}
											/>
											<input
												type="text"
												className="admin-form-input"
												value={answer.right || ''}
												onChange={(e) => updateAnswer(index, 'right', e.target.value)}
												placeholder={`Element dreapta ${index + 1}`}
											/>
											<button
												type="button"
												className="lms-btn-secondary lms-btn-sm va-btn-danger"
												onClick={() => removeAnswer(index)}
											>
												🗑️
											</button>
										</div>
									))}
								</div>
							) : questionForm.type === 'ordering' ? (
								<div className="admin-answer-list">
									{questionForm.answers.map((answer, index) => (
										<div key={index} className="admin-answer-item">
											<input
												type="text"
												className="admin-form-input"
												value={answer.text || ''}
												onChange={(e) => updateAnswer(index, 'text', e.target.value)}
												placeholder={`Element ${index + 1}`}
											/>
											<div style={{ display: 'flex', gap: '0.5rem' }}>
												<button
													type="button"
													className="lms-btn-secondary lms-btn-sm"
													onClick={() => {
														const list = [...questionForm.answers];
														if (index === 0) return;
														const tmp = list[index];
														list[index] = list[index - 1];
														list[index - 1] = tmp;
														setQuestionForm({ ...questionForm, answers: list.map((item, idx) => ({ ...item, order: idx })) });
													}}
													disabled={index === 0}
												>
													↑
												</button>
												<button
													type="button"
													className="lms-btn-secondary lms-btn-sm"
													onClick={() => {
														const list = [...questionForm.answers];
														if (index === list.length - 1) return;
														const tmp = list[index];
														list[index] = list[index + 1];
														list[index + 1] = tmp;
														setQuestionForm({ ...questionForm, answers: list.map((item, idx) => ({ ...item, order: idx })) });
													}}
													disabled={index === questionForm.answers.length - 1}
												>
													↓
												</button>
												<button
													type="button"
													className="lms-btn-secondary lms-btn-sm va-btn-danger"
													onClick={() => removeAnswer(index)}
												>
													🗑️
												</button>
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="admin-answer-list">
									{questionForm.answers.map((answer, index) => (
										<div key={index} className="admin-answer-item">
											<input
												type={questionForm.type === 'multiple_choice' ? 'checkbox' : 'radio'}
												className="admin-answer-checkbox"
												checked={answer.is_correct}
												onChange={(e) => {
													if (questionForm.type === 'multiple_choice') {
														updateAnswer(index, 'is_correct', e.target.checked);
													} else {
														questionForm.answers.forEach((_, i) => {
															updateAnswer(i, 'is_correct', i === index);
														});
													}
												}}
											/>
											<input
												type="text"
												className="admin-form-input"
												value={answer.text || ''}
												onChange={(e) => updateAnswer(index, 'text', e.target.value)}
												placeholder={`Răspuns ${index + 1}`}
												disabled={questionForm.type === 'true_false'}
											/>
											{questionForm.type !== 'true_false' && (
												<button
													type="button"
													className="lms-btn-secondary lms-btn-sm va-btn-danger"
													onClick={() => removeAnswer(index)}
												>
													🗑️
												</button>
											)}
										</div>
									))}
								</div>
							)}

							{questionForm.type !== 'true_false' && (
								<button
									type="button"
									className="lms-btn-secondary lms-btn-sm"
									onClick={addAnswer}
								>
									+ Adaugă {questionForm.type === 'matching' ? 'Pereche' : 'Răspuns'}
								</button>
							)}
							{(questionFormErrors.answers || questionFormErrors.correct) && (
								<p className="admin-form-error-inline" role="alert">
									{questionFormErrors.answers || questionFormErrors.correct}
								</p>
							)}
						</div>
					)}

					<div className="admin-form-group">
						<label className="admin-form-label">Puncte</label>
						<input
							type="number"
							className="admin-form-input"
							value={questionForm.points}
							onChange={(e) => setQuestionForm({ ...questionForm, points: parseInt(e.target.value) || 1 })}
							min="1"
						/>
					</div>

					<div className="admin-form-group">
						<label className="admin-form-label">Dificultate</label>
						<select
							className="admin-form-select"
							value={questionForm.metadata?.difficulty || ''}
							onChange={(e) =>
								setQuestionForm({
									...questionForm,
									metadata: {
										...(questionForm.metadata || {}),
										difficulty: e.target.value,
									},
								})
							}
						>
							<option value="">—</option>
							<option value="easy">Ușor</option>
							<option value="medium">Mediu</option>
							<option value="hard">Dificil</option>
						</select>
						<p className="admin-form-hint">Folosit la regulile băncii în editorul de teste (ex. „10 întrebări ușoare”).</p>
					</div>

					<div className="admin-form-group">
						<label className="admin-form-label">Tag-uri</label>
						<input
							type="text"
							className="admin-form-input"
							value={(questionForm.metadata?.tags || []).join(', ')}
							onChange={(e) =>
								setQuestionForm({
									...questionForm,
									metadata: {
										...(questionForm.metadata || {}),
										tags: e.target.value
											.split(',')
											.map((t) => t.trim())
											.filter(Boolean),
									},
								})
							}
							placeholder="Etichete separate prin virgulă"
						/>
					</div>

					<div className="admin-form-group">
						<label className="admin-form-label">Explicație (feedback)</label>
						<textarea
							className="admin-form-textarea"
							value={questionForm.explanation}
							onChange={(e) => setQuestionForm({ ...questionForm, explanation: e.target.value })}
							placeholder="Explicație pentru răspunsul corect..."
							rows={2}
						/>
						<p className="admin-form-hint">Afișat elevului după răspuns; îmbunătățește învățarea.</p>
					</div>

					<div className="step2-form-actions">
						<button
							type="button"
							className="lms-btn-primary"
							onClick={saveQuestion}
						>
							{editingQuestion !== null ? 'Actualizează' : 'Adaugă'} Întrebare
						</button>
						{editingQuestion !== null && (
							<button
								type="button"
								className="lms-btn-secondary"
							onClick={() => {
								setEditingQuestion(null);
								setQuestionForm({
									type: 'multiple_choice',
									content: '',
									answers: getQuestionTypeDefaults('multiple_choice'),
									points: 1,
									explanation: '',
									metadata: {
											difficulty: '',
											tags: [],
										},
									});
								}}
							>
								Anulează
							</button>
						)}
					</div>
				</div>
					</div>
				</div>

				{/* Right: Questions List (sticky) */}
				<div className="step2-list-column">
				<div className="admin-form-section step2-questions-list">
					<h3 className="admin-form-section-title">
						Întrebări ({data?.questions?.length || 0})
					</h3>

					{data?.questions && data.questions.length > 0 ? (
						<div className="admin-question-list">
							{data.questions.map((question, index) => (
								<QuestionItemCard
									key={question.id || index}
									question={question}
									index={index}
									total={data.questions.length}
									isEditing={editingQuestion === index}
									duplicateLoading={duplicateLoading}
									onMoveUp={() => moveQuestion(index, 'up')}
									onMoveDown={() => moveQuestion(index, 'down')}
									onPreview={() => openStudentPreview(index)}
									onDuplicate={() => duplicateQuestion(index)}
									onEdit={() => editQuestion(index)}
									onDelete={() => deleteQuestionClick(index)}
								/>
							))}
						</div>
					) : (
						<div className="lms-empty-state step2-empty-state">
							<div className="lms-empty-icon">📝</div>
							<h3 className="lms-empty-title">Nicio întrebare încă</h3>
							<p className="lms-empty-description">
								Adaugă prima întrebare folosind formularul alăturat sau generează cu AI
							</p>
						</div>
					)}
				</div>
			</div>
			</div>

			<AIGenerateQuestionsModal
				open={showAIModal}
				aiGenerating={aiGenerating}
				courses={aiCourses}
				coursesLoading={aiCoursesLoading}
				selectedCourseId={aiSelectedCourseId}
				setSelectedCourseId={setAiSelectedCourseId}
				aiOptions={aiOptions}
				setAiOptions={setAiOptions}
				aiError={aiError}
				onClose={() => setShowAIModal(false)}
				onStartReview={startAiAutoGenerate}
			/>

			<Modal
				isOpen={!!previewQuestion}
				onClose={() => {
					setPreviewQuestion(null);
					setPreviewShowCorrect(false);
				}}
				ariaLabelledby="qb-preview-title"
				className="qb-student-preview-overlay"
			>
				<div className="qb-student-preview-dialog">
					<div className="qb-student-preview-header">
						<h2 id="qb-preview-title" className="qb-student-preview-title">
							Previzualizare student
						</h2>
						<button
							type="button"
							className="qb-student-preview-close"
							onClick={() => {
								setPreviewQuestion(null);
								setPreviewShowCorrect(false);
							}}
							aria-label="Închide"
						>
							×
						</button>
					</div>
					<label className="qb-student-preview-toggle">
						<input
							type="checkbox"
							checked={previewShowCorrect}
							onChange={(e) => setPreviewShowCorrect(e.target.checked)}
						/>
						<span>Arată răspunsurile corecte (doar pentru instructor)</span>
					</label>
					{previewQuestion && (
						<div className="qb-student-preview-body">
							<p className="qb-student-preview-stem">
								{previewQuestion.content || previewQuestion.text || '—'}
							</p>
							{previewQuestion.type === 'short_answer' ? (
								<div className="qb-student-preview-short">
									<span className="qb-student-preview-short-label">Răspuns scurt (elevul scrie aici)</span>
									<div className="qb-student-preview-short-placeholder" />
								</div>
							) : previewQuestion.type === 'matching' ? (
								<div className="qb-student-preview-matching">
									{(previewQuestion.answers || []).map((ans, i) => (
										<div key={i} className="qb-student-preview-matching-row">
											<span className="qb-student-preview-matching-left">{ans.left || ans.text || '—'}</span>
											<span className="qb-student-preview-matching-arrow">↔</span>
											<span className="qb-student-preview-matching-right">{ans.right || ans.answer_text || '—'}</span>
										</div>
									))}
								</div>
							) : previewQuestion.type === 'ordering' ? (
								<ol className="qb-student-preview-ordering">
									{(previewQuestion.answers || []).map((ans, i) => (
										<li key={i} className="qb-student-preview-ordering-item">
											<span className="qb-student-preview-ordering-index">{i + 1}</span>
											<span>{ans.text || ans.answer_text || '—'}</span>
										</li>
									))}
								</ol>
							) : (
								<ul className="qb-student-preview-options" role="list">
									{(previewQuestion.answers || []).map((ans, i) => (
										<li
											key={i}
											className={
												previewShowCorrect && ans.is_correct
													? 'qb-student-preview-option is-correct'
													: 'qb-student-preview-option'
											}
										>
											<span className="qb-student-preview-bullet" aria-hidden />
											<span>{ans.text || '—'}</span>
											{previewShowCorrect && ans.is_correct && (
												<span className="qb-student-preview-correct-badge">Corect</span>
											)}
										</li>
									))}
								</ul>
							)}
							{(previewQuestion.points || 1) > 0 && (
								<p className="qb-student-preview-meta">
									{previewQuestion.points || 1} punct(e)
								</p>
							)}
						</div>
					)}
					<div className="qb-student-preview-footer">
						<button
							type="button"
							className="lms-btn-primary"
							onClick={() => {
								setPreviewQuestion(null);
								setPreviewShowCorrect(false);
							}}
						>
							Închide
						</button>
					</div>
				</div>
			</Modal>

			<ConfirmModal
				open={deleteConfirmIndex != null}
				onClose={() => setDeleteConfirmIndex(null)}
				onConfirm={handleConfirmDeleteQuestion}
				title="Șterge întrebare"
				message="Sigur dorești să ștergi această întrebare?"
				confirmLabel="Șterge"
				cancelLabel="Anulare"
				variant="danger"
				loading={deleteLoading}
			/>
		</div>
	);
};

export default QuestionBankBuilderStep2;
