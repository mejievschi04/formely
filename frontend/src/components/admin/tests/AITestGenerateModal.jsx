import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  FileArrowUp,
  FileText,
  Lightning,
  Sparkle,
  Sliders,
  Brain,
  Stack,
  Target,
  Trash,
  CheckCircle,
  X,
  CloudArrowUp,
} from '@phosphor-icons/react';
import { adminService } from '../../../services/api';
import { openaiService } from '../../../services/openaiService';
import { AI_QUESTION_TYPE_OPTIONS, DEFAULT_AI_QUESTION_TYPES, getAiQuestionTypeLabel } from '../question-banks/QuestionBankBuilderSteps/AIGenerateQuestionsModalShared.js';
import '../../../pages/admin/AdminQuestionBanksPage.css';
import './AITestGenerateModal.css';
import PassingScoreByQuestions from './PassingScoreByQuestions';

const STEPS = {
  SOURCE: 'source',
  FORMAT: 'format',
  CONTENT: 'content',
  DELIVERY: 'delivery',
  REVIEW: 'review',
};

const STEP_FLOW = [
  { id: STEPS.SOURCE, label: 'Sursă', sub: 'Conținut' },
  { id: STEPS.FORMAT, label: 'Format', sub: 'Dificultate' },
  { id: STEPS.CONTENT, label: 'Întrebări', sub: 'Tipuri & Bloom' },
  { id: STEPS.DELIVERY, label: 'Setări', sub: 'Livrare' },
  { id: STEPS.REVIEW, label: 'Review', sub: 'Salvare' },
];

function getStepIndex(stepId) {
  return STEP_FLOW.findIndex((item) => item.id === stepId);
}

const SOURCE_TYPES = {
  COURSE: 'course',
  DOCUMENT: 'document',
};

const TEST_TYPE_OPTIONS = [
  { id: 'practice', label: 'Practică', description: 'Exersare fără miză' },
  { id: 'graded', label: 'Evaluativ', description: 'Notat, contează' },
  { id: 'final', label: 'Final', description: 'Examen de final' },
];

const DIFFICULTY_OPTIONS = [
  { id: 'easy', label: 'Ușor' },
  { id: 'medium', label: 'Mediu' },
  { id: 'hard', label: 'Dificil' },
];

const QUALITY_MODE_OPTIONS = [
  { id: 'fast', label: 'Rapid', description: 'Mai rapid, mai puține retry-uri' },
  { id: 'balanced', label: 'Balanced', description: 'Echilibru viteză/calitate' },
  { id: 'high_stakes', label: 'High-stakes', description: 'Mai strict, calitate maximă' },
];

const ACCEPTED_DOCUMENT_TYPES = '.pdf,.csv,.txt,.doc,.docx,application/pdf,text/csv,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function stripHtmlToText(value) {
  if (!value) return '';
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDocumentText(value) {
  return stripHtmlToText(value).slice(0, 12000);
}

const DEFAULT_OPTIONS = {
  numberOfQuestions: 10,
  difficulty: 'medium',
  qualityMode: 'balanced',
  cognitiveLevels: ['understanding', 'application'],
  questionTypes: DEFAULT_AI_QUESTION_TYPES,
  type: 'practice',
  passing_score: 70,
  time_limit_minutes: '',
  max_attempts: '1',
  status: 'draft',
  attach: false,
  required: true,
  saveToQuestionBank: false,
  questionBankTitle: '',
  scope: 'course',
  scope_id: '',
};

const COGNITIVE_LEVEL_OPTIONS = [
  { id: 'recall', label: 'Memorare', description: 'definiții, termeni, fapte explicite' },
  { id: 'understanding', label: 'Înțelegere', description: 'sens, relații, explicații' },
  { id: 'application', label: 'Aplicare', description: 'cazuri și scenarii concrete' },
  { id: 'analysis', label: 'Analiză', description: 'comparare, cauză-efect, distincții fine' },
];

function buildInitialScopeKey(scope, scopeId) {
  if (scope === 'module' && scopeId) return `module:${scopeId}`;
  if (scope === 'lesson' && scopeId) return `lesson:${scopeId}`;
  return 'course';
}

function normalizeCourseList(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

function buildScopeOptions(courseData) {
  const options = [{ value: 'course', label: 'Curs complet', scopeId: null }];
  (courseData?.modules || []).forEach((module) => {
    options.push({
      value: `module:${module.id}`,
      label: `Modul: ${module.title || `#${module.id}`}`,
      scope: 'module',
      scopeId: module.id,
    });
    (module.lessons || []).forEach((lesson) => {
      options.push({
        value: `lesson:${lesson.id}`,
        label: `Lecție: ${lesson.title || `#${lesson.id}`}`,
        scope: 'lesson',
        scopeId: lesson.id,
      });
    });
  });
  return options;
}

function getDifficultyLabel(difficulty) {
  if (difficulty === 'easy') return 'Ușor';
  if (difficulty === 'hard') return 'Dificil';
  return 'Mediu';
}

function getQualityModeLabel(qualityMode) {
  if (qualityMode === 'fast') return 'Rapid';
  if (qualityMode === 'high_stakes') return 'High-stakes';
  return 'Balanced';
}

function getTestTypeLabel(type) {
  if (type === 'graded') return 'Evaluativ';
  if (type === 'final') return 'Final';
  return 'Practică';
}

function getCognitiveLevelLabel(level) {
  return COGNITIVE_LEVEL_OPTIONS.find((option) => option.id === level)?.label || level;
}

function renderAnswerSummary(question) {
  const answers = Array.isArray(question?.answers) ? question.answers : [];
  if (answers.length === 0) return null;

  if (question.type === 'matching') {
    return (
      <ul className="ai-test-answer-list">
        {answers.slice(0, 4).map((answer, index) => (
          <li key={`match-${index}`}>
            <span>{answer.left || answer.text || `Element ${index + 1}`}</span>
            <strong>{answer.right || answer.answer_text || 'Răspuns'}</strong>
          </li>
        ))}
      </ul>
    );
  }

  if (question.type === 'ordering') {
    return (
      <ol className="ai-test-answer-list ai-test-answer-list-ordered">
        {answers.slice(0, 5).map((answer, index) => (
          <li key={`order-${index}`}>{answer.text || answer.answer_text || String(answer)}</li>
        ))}
      </ol>
    );
  }

  return (
    <ul className="ai-test-answer-list">
      {answers.slice(0, 5).map((answer, index) => (
        <li key={`answer-${index}`} className={answer.is_correct ? 'is-correct' : ''}>
          <span>{answer.text || answer.answer_text || String(answer)}</span>
          {answer.is_correct ? <strong>corect</strong> : null}
        </li>
      ))}
    </ul>
  );
}

const AITestGenerateModal = ({
  open,
  onClose,
  onSaved,
  presetCourseId = null,
  presetCourseData = null,
  attachByDefault = false,
  initialScope = 'course',
  initialScopeId = null,
}) => {
  const [step, setStep] = useState(STEPS.SOURCE);
  const [sourceType, setSourceType] = useState(SOURCE_TYPES.COURSE);
  const [documentFile, setDocumentFile] = useState(null);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [sourceLabel, setSourceLabel] = useState('Curs complet');
  const documentInputRef = useRef(null);
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState(presetCourseId ? String(presetCourseId) : '');
  const [courseData, setCourseData] = useState(presetCourseData || null);
  const [options, setOptions] = useState({
    ...DEFAULT_OPTIONS,
    attach: attachByDefault,
  });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scopeKey, setScopeKey] = useState(buildInitialScopeKey(initialScope, initialScopeId));
  const [questions, setQuestions] = useState([]);
  const [coverageReport, setCoverageReport] = useState(null);
  const [blueprintSuggestion, setBlueprintSuggestion] = useState(null);
  const [blueprintLoading, setBlueprintLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regeneratingIndex, setRegeneratingIndex] = useState(null);
  const [error, setError] = useState('');

  const scopeOptions = useMemo(() => buildScopeOptions(courseData), [courseData]);
  const selectedTypes = Array.isArray(options.questionTypes) ? options.questionTypes : DEFAULT_AI_QUESTION_TYPES;
  const selectedCognitiveLevels = Array.isArray(options.cognitiveLevels) && options.cognitiveLevels.length > 0
    ? options.cognitiveLevels
    : ['understanding'];
  const currentScopeLabel = scopeOptions.find((item) => item.value === scopeKey)?.label || 'Curs complet';
  const generatedQuestionTypes = useMemo(() => (
    questions.reduce((acc, question) => {
      const type = question?.type || 'multiple_choice';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {})
  ), [questions]);
  const liveCoverageReport = useMemo(() => {
    if (!coverageReport) return null;
    const requestedCount = Number(coverageReport.requested_count || options.numberOfQuestions || 0);
    const generatedCount = questions.length;
    return {
      ...coverageReport,
      generated_count: generatedCount,
      missing_count: Math.max(0, requestedCount - generatedCount),
      target_met: generatedCount >= requestedCount,
      type_distribution: generatedQuestionTypes,
    };
  }, [coverageReport, generatedQuestionTypes, options.numberOfQuestions, questions.length]);

  const resetState = useCallback(() => {
    setStep(STEPS.SOURCE);
    setSourceType(SOURCE_TYPES.COURSE);
    setDocumentFile(null);
    setDocumentUploading(false);
    setSourceLabel('Curs complet');
    setQuestions([]);
    setCoverageReport(null);
    setBlueprintSuggestion(null);
    setBlueprintLoading(false);
    setError('');
    setGenerating(false);
    setSaving(false);
    setRegeneratingIndex(null);
    setTitle('');
    setDescription('');
    setScopeKey(buildInitialScopeKey(initialScope, initialScopeId));
    setOptions({ ...DEFAULT_OPTIONS, attach: attachByDefault });
    setSelectedCourseId(presetCourseId ? String(presetCourseId) : '');
    setCourseData(presetCourseData || null);
  }, [attachByDefault, initialScope, initialScopeId, presetCourseId, presetCourseData]);

  useEffect(() => {
    if (!open) return;
    resetState();
  }, [open, resetState]);

  useEffect(() => {
    if (!open || presetCourseId) return;
    let cancelled = false;
    (async () => {
      setCoursesLoading(true);
      try {
        const data = await adminService.getCourses({ per_page: 500 });
        if (!cancelled) setCourses(normalizeCourseList(data));
      } catch  {
        if (!cancelled) setError('Nu s-au putut încărca cursurile.');
      } finally {
        if (!cancelled) setCoursesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, presetCourseId]);

  useEffect(() => {
    if (!open || !selectedCourseId || presetCourseData) return;
    let cancelled = false;
    (async () => {
      try {
        const course = await adminService.getCourse(Number(selectedCourseId));
        if (!cancelled) setCourseData(course);
      } catch  {
        if (!cancelled) setCourseData(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, selectedCourseId, presetCourseData]);

  const resolveScope = () => {
    const match = scopeOptions.find((item) => item.value === scopeKey);
    if (!match || match.value === 'course') {
      return { scope: 'course', scope_id: null };
    }
    return { scope: match.scope, scope_id: match.scopeId };
  };

  const buildAiPayload = () => {
    const { scope, scope_id } = resolveScope();
    const payload = {
      source_type: sourceType,
      scope,
      scope_id,
      type: options.type,
    };

    if (sourceType === SOURCE_TYPES.DOCUMENT) {
      payload.document = {
        file_name: documentFile?.file_name || documentFile?.name,
        type: documentFile?.type || null,
        text: documentFile?.text || '',
        preview: documentFile?.preview || '',
      };
      if (selectedCourseId) {
        payload.course_id = Number(selectedCourseId);
      }
    } else {
      payload.course_id = Number(selectedCourseId);
    }

    return payload;
  };

  const hasValidSource = sourceType === SOURCE_TYPES.DOCUMENT
    ? Boolean(documentFile?.text && documentFile.text.length >= 80)
    : Boolean(selectedCourseId);

  const handleDocumentPick = () => {
    documentInputRef.current?.click();
  };

  const handleDocumentChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDocumentUploading(true);
    setError('');
    try {
      const lowerName = (file.name || '').toLowerCase();
      const mime = (file.type || '').toLowerCase();
      let text = '';
      let type = 'file';

      if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) {
        type = 'pdf';
        const { extractPdfTextAsHtml } = await import('../../../utils/pdfTextExtractor');
        const html = await extractPdfTextAsHtml(file);
        text = stripHtmlToText(html);
      } else if (mime === 'text/plain' || lowerName.endsWith('.txt') || lowerName.endsWith('.csv') || mime.includes('csv')) {
        type = lowerName.endsWith('.csv') || mime.includes('csv') ? 'csv' : 'txt';
        text = await file.text();
      } else {
        const extracted = await openaiService.extractDocumentContext(file);
        type = extracted?.type || type;
        text = extracted?.text || extracted?.preview || '';
      }

      const normalizedText = normalizeDocumentText(text);
      if (normalizedText.length < 80) {
        setError('Fișierul nu conține suficient text pentru generarea testului.');
        setDocumentFile(null);
        return;
      }

      setDocumentFile({
        file_name: file.name,
        name: file.name,
        type,
        mime_type: file.type || null,
        size: file.size,
        text: normalizedText,
        preview: normalizedText.slice(0, 800),
      });
      setSourceLabel(`Fișier: ${file.name}`);
      setBlueprintSuggestion(null);
    } catch (e) {
      console.error('Document upload failed:', e);
      setError(e?.message || 'Nu s-a putut procesa fișierul.');
      setDocumentFile(null);
    } finally {
      setDocumentUploading(false);
      if (documentInputRef.current) {
        documentInputRef.current.value = '';
      }
    }
  };

  const handleSourceTypeChange = (nextSourceType) => {
    setSourceType(nextSourceType);
    setError('');
    setBlueprintSuggestion(null);
    if (nextSourceType === SOURCE_TYPES.COURSE) {
      setDocumentFile(null);
      setSourceLabel(currentScopeLabel);
    } else {
      setSourceLabel(documentFile?.file_name ? `Fișier: ${documentFile.file_name}` : 'Fișier sursă');
      setOptions((prev) => ({ ...prev, attach: false }));
    }
  };

  const toggleQuestionType = (typeId) => {
    setOptions((prev) => {
      const current = Array.isArray(prev.questionTypes) ? prev.questionTypes : DEFAULT_AI_QUESTION_TYPES;
      const next = current.includes(typeId)
        ? current.filter((id) => id !== typeId)
        : [...current, typeId];
      return { ...prev, questionTypes: next.length > 0 ? next : [typeId] };
    });
  };

  const toggleCognitiveLevel = (levelId) => {
    setOptions((prev) => {
      const current = Array.isArray(prev.cognitiveLevels) ? prev.cognitiveLevels : DEFAULT_OPTIONS.cognitiveLevels;
      const next = current.includes(levelId)
        ? current.filter((id) => id !== levelId)
        : [...current, levelId];
      return { ...prev, cognitiveLevels: next.length > 0 ? next : [levelId] };
    });
  };

  const handleSuggestBlueprint = async () => {
    if (!hasValidSource) {
      setError(sourceType === SOURCE_TYPES.DOCUMENT
        ? 'Încarcă un fișier sursă înainte de blueprint.'
        : 'Selectează un curs sursă înainte de blueprint.');
      return;
    }
    setBlueprintLoading(true);
    setError('');
    try {
      const response = await adminService.suggestTestBlueprintWithAi(buildAiPayload());
      setBlueprintSuggestion(response?.blueprint || null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Nu s-a putut genera blueprint-ul.');
    } finally {
      setBlueprintLoading(false);
    }
  };

  const handleApplyBlueprint = () => {
    if (!blueprintSuggestion) return;
    setOptions((prev) => ({
      ...prev,
      numberOfQuestions: Number(blueprintSuggestion.numberOfQuestions) || prev.numberOfQuestions,
      difficulty: blueprintSuggestion.difficulty || prev.difficulty,
      qualityMode: blueprintSuggestion.qualityMode || prev.qualityMode,
      questionTypes: Array.isArray(blueprintSuggestion.questionTypes) && blueprintSuggestion.questionTypes.length > 0
        ? blueprintSuggestion.questionTypes
        : prev.questionTypes,
      cognitiveLevels: Array.isArray(blueprintSuggestion.cognitiveLevels) && blueprintSuggestion.cognitiveLevels.length > 0
        ? blueprintSuggestion.cognitiveLevels
        : prev.cognitiveLevels,
    }));
  };

  const handleGeneratePreview = async () => {
    if (!hasValidSource) {
      setError(sourceType === SOURCE_TYPES.DOCUMENT
        ? 'Încarcă un fișier PDF, CSV, TXT sau DOCX cu suficient conținut.'
        : 'Selectează un curs sursă.');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const response = await adminService.previewTestWithAi({
        ...buildAiPayload(),
        numberOfQuestions: options.numberOfQuestions,
        difficulty: options.difficulty,
        qualityMode: options.qualityMode,
        cognitiveLevels: selectedCognitiveLevels,
        questionTypes: selectedTypes,
      });
      const generated = Array.isArray(response?.questions) ? response.questions : [];
      if (generated.length === 0) {
        setError('Formely AI nu a generat întrebări utilizabile din sursa selectată.');
        return;
      }
      setQuestions(generated);
      setCoverageReport(response?.coverage_report || null);
      setSourceLabel(response?.coverage_report?.source_label || sourceLabel);
      setTitle(response?.suggested?.title || title || 'Test generat cu Formely AI');
      setDescription(response?.suggested?.description || description || '');
      setStep(STEPS.REVIEW);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Eroare la generarea previzualizării.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRemoveQuestion = (index) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEditQuestionContent = (index, content) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, content } : q)));
  };

  const handleRegenerateQuestion = async (index) => {
    const currentQuestion = questions[index];
    if (!hasValidSource || !currentQuestion) return;

    setRegeneratingIndex(index);
    setError('');
    try {
      const response = await adminService.regenerateTestQuestionWithAi({
        ...buildAiPayload(),
        difficulty: options.difficulty,
        qualityMode: options.qualityMode,
        cognitiveLevels: selectedCognitiveLevels,
        questionType: currentQuestion.type || 'multiple_choice',
        blockedQuestions: questions.map((question) => question?.content || '').filter(Boolean),
        instructions: `Înlocuiește întrebarea: ${currentQuestion.content || ''}`,
      });
      if (!response?.question) {
        setError('Formely AI nu a returnat o întrebare nouă.');
        return;
      }
      setQuestions((prev) => prev.map((question, i) => (i === index ? response.question : question)));
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Nu s-a putut regenera întrebarea.');
    } finally {
      setRegeneratingIndex(null);
    }
  };

  const handleSave = async () => {
    if (questions.length === 0) {
      setError('Adaugă cel puțin o întrebare înainte de salvare.');
      return;
    }
    if (options.attach && !selectedCourseId) {
      setError('Selectează un curs pentru atașare sau debifează opțiunea de atașare.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...buildAiPayload(),
        title: title.trim() || 'Test generat cu Formely AI',
        description: description.trim() || null,
        difficulty: options.difficulty,
        qualityMode: options.qualityMode,
        cognitiveLevels: selectedCognitiveLevels,
        status: options.status,
        passing_score: Number(options.passing_score) || 70,
        time_limit_minutes: options.time_limit_minutes ? Number(options.time_limit_minutes) : null,
        max_attempts: options.max_attempts ? Number(options.max_attempts) : 1,
        questions,
        attach: options.attach,
        required: options.required,
        save_to_question_bank: options.saveToQuestionBank,
        question_bank_title: options.questionBankTitle?.trim() || `Întrebări Formely AI: ${title.trim() || 'Test generat'}`,
      };
      const response = await adminService.createTestWithAi(payload);
      onSaved?.(response?.test || response);
      onClose?.();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Nu s-a putut salva testul.');
    } finally {
      setSaving(false);
    }
  };

  const currentStepIndex = getStepIndex(step);
  const currentStepMeta = STEP_FLOW[currentStepIndex] || STEP_FLOW[0];
  const isReviewStep = step === STEPS.REVIEW;
  const isFirstStep = currentStepIndex === 0;
  const isDeliveryStep = step === STEPS.DELIVERY;

  const canProceedFromStep = () => {
    switch (step) {
      case STEPS.SOURCE:
        return hasValidSource;
      case STEPS.FORMAT:
        return Number(options.numberOfQuestions) >= 1 && Number(options.numberOfQuestions) <= 50;
      case STEPS.CONTENT:
        return selectedTypes.length > 0 && selectedCognitiveLevels.length > 0;
      case STEPS.DELIVERY:
        return true;
      default:
        return false;
    }
  };

  const handleStepBack = () => {
    setError('');
    if (isReviewStep) {
      setStep(STEPS.DELIVERY);
      return;
    }
    if (currentStepIndex > 0) {
      setStep(STEP_FLOW[currentStepIndex - 1].id);
    }
  };

  const handleStepNext = () => {
    setError('');
    if (!canProceedFromStep()) {
      if (step === STEPS.SOURCE) {
        setError(sourceType === SOURCE_TYPES.DOCUMENT
          ? 'Încarcă un fișier sursă cu suficient conținut.'
          : 'Selectează un curs sursă.');
      } else if (step === STEPS.CONTENT) {
        setError('Selectează cel puțin un tip de întrebare și un nivel cognitiv.');
      }
      return;
    }
    if (currentStepIndex < STEP_FLOW.length - 2) {
      setStep(STEP_FLOW[currentStepIndex + 1].id);
    }
  };

  if (!open) return null;

  const hasCourses = presetCourseId || courses.length > 0;
  const busy = generating || saving || regeneratingIndex !== null || blueprintLoading || documentUploading;
  const canAttachToCourse = Boolean(selectedCourseId);

  const modal = (
    <div className="admin-team-modal-overlay ai-test-modal-overlay" style={{ zIndex: 10000 }}>
      <div className="admin-team-modal ai-test-modal ai-test-modal--v2" onClick={(e) => e.stopPropagation()}>
        <div className="ai-test-head">
          <div className="ai-test-head-main">
            <span className="ai-test-head-icon" aria-hidden>
              <Lightning size={22} weight="fill" />
            </span>
            <div>
              <div className="ai-test-modal-eyebrow">Formely AI Test Creator</div>
              <h2 className="ai-test-head-title">Generează test cu Formely AI</h2>
            </div>
          </div>
          {!busy && (
            <button type="button" className="ai-test-head-close" onClick={onClose} aria-label="Închide">
              <X size={18} weight="bold" />
            </button>
          )}
        </div>

        <div className="ai-test-stepper-v2 ai-test-stepper-v2--multi" aria-label="Pași generare test">
          {STEP_FLOW.map((flowStep, index) => {
            const isActive = flowStep.id === step;
            const isDone = index < currentStepIndex;
            return (
              <React.Fragment key={flowStep.id}>
                {index > 0 ? (
                  <div className={`ai-test-step-line ${index <= currentStepIndex ? 'is-done' : ''}`} aria-hidden />
                ) : null}
                <div className={`ai-test-step ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}`}>
                  <span className="ai-test-step-dot">
                    {isDone ? <CheckCircle size={16} weight="fill" /> : index + 1}
                  </span>
                  <div className="ai-test-step-copy">
                    <strong>{flowStep.label}</strong>
                    <small>{flowStep.sub}</small>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <div className="admin-team-modal-body ai-test-body">
          {!isReviewStep ? (
            <div className="ai-test-step-banner">
              <span className="ai-test-step-banner-kicker">Pasul {currentStepIndex + 1} din {STEP_FLOW.length - 1}</span>
              <strong>{currentStepMeta.label}</strong>
              <p>{currentStepMeta.sub}</p>
            </div>
          ) : null}

          {step === STEPS.SOURCE ? (
            <>
              <section className="ai-test-section">
                <header className="ai-test-section-head">
                  <span className="ai-test-section-index"><Stack size={16} weight="bold" /></span>
                  <div>
                    <h3>Sursa conținutului</h3>
                    <p>De unde generează Formely AI întrebările?</p>
                  </div>
                </header>

                <div className="ai-test-source-cards" role="tablist" aria-label="Tip sursă">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sourceType === SOURCE_TYPES.COURSE}
                    className={`ai-test-source-card ${sourceType === SOURCE_TYPES.COURSE ? 'is-active' : ''}`}
                    onClick={() => handleSourceTypeChange(SOURCE_TYPES.COURSE)}
                    disabled={busy}
                  >
                    <span className="ai-test-source-card-icon"><BookOpen size={22} weight="duotone" /></span>
                    <span className="ai-test-source-card-body">
                      <strong>Din curs</strong>
                      <small>Module și lecții existente</small>
                    </span>
                    {sourceType === SOURCE_TYPES.COURSE && (
                      <span className="ai-test-source-card-check"><CheckCircle size={18} weight="fill" /></span>
                    )}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sourceType === SOURCE_TYPES.DOCUMENT}
                    className={`ai-test-source-card ${sourceType === SOURCE_TYPES.DOCUMENT ? 'is-active' : ''}`}
                    onClick={() => handleSourceTypeChange(SOURCE_TYPES.DOCUMENT)}
                    disabled={busy}
                  >
                    <span className="ai-test-source-card-icon"><FileArrowUp size={22} weight="duotone" /></span>
                    <span className="ai-test-source-card-body">
                      <strong>Din fișier</strong>
                      <small>PDF, CSV, TXT, DOC</small>
                    </span>
                    {sourceType === SOURCE_TYPES.DOCUMENT && (
                      <span className="ai-test-source-card-check"><CheckCircle size={18} weight="fill" /></span>
                    )}
                  </button>
                </div>

                {sourceType === SOURCE_TYPES.COURSE ? (
                  <div className="ai-test-source-detail">
                    {!presetCourseId ? (
                      <div className="admin-form-group">
                        <label className="admin-form-label">Curs sursă *</label>
                        <select
                          className="admin-form-input"
                          value={selectedCourseId}
                          onChange={(e) => setSelectedCourseId(e.target.value)}
                          disabled={busy || coursesLoading}
                        >
                          <option value="">{coursesLoading ? 'Se încarcă cursurile...' : 'Alege un curs'}</option>
                          {courses.map((course) => (
                            <option key={course.id} value={String(course.id)}>
                              {course.title || `Curs #${course.id}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="admin-form-group">
                        <label className="admin-form-label">Curs sursă</label>
                        <div className="ai-test-readonly-field">
                          {courseData?.title || presetCourseData?.title || `Curs #${presetCourseId}`}
                        </div>
                      </div>
                    )}

                    <div className="admin-form-group">
                      <label className="admin-form-label">Domeniu conținut</label>
                      <select
                        className="admin-form-input"
                        value={scopeKey}
                        onChange={(e) => {
                          setScopeKey(e.target.value);
                          const nextLabel = scopeOptions.find((option) => option.value === e.target.value)?.label || 'Curs complet';
                          setSourceLabel(nextLabel);
                        }}
                        disabled={busy || !selectedCourseId}
                      >
                        {scopeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="ai-test-source-detail">
                    <input
                      ref={documentInputRef}
                      type="file"
                      accept={ACCEPTED_DOCUMENT_TYPES}
                      className="ai-test-file-input"
                      onChange={handleDocumentChange}
                    />
                    {documentFile ? (
                      <div className="ai-test-file-chip">
                        <span className="ai-test-file-chip-icon"><FileText size={20} weight="duotone" /></span>
                        <span className="ai-test-file-chip-meta">
                          <strong>{documentFile.file_name || documentFile.name}</strong>
                          <span>{Math.round((documentFile.text?.length || 0) / 100) / 10}k caractere extrase</span>
                        </span>
                        <button
                          type="button"
                          className="ai-test-file-remove"
                          onClick={() => {
                            setDocumentFile(null);
                            setSourceLabel('Fișier sursă');
                          }}
                          disabled={busy}
                          aria-label="Elimină fișierul"
                        >
                          <Trash size={16} weight="bold" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="ai-test-dropzone"
                        onClick={handleDocumentPick}
                        disabled={busy}
                      >
                        <span className="ai-test-dropzone-icon"><CloudArrowUp size={30} weight="duotone" /></span>
                        <strong>{documentUploading ? 'Se procesează fișierul...' : 'Încarcă un fișier'}</strong>
                        <small>PDF, CSV, TXT, DOC, DOCX — Formely AI extrage textul automat</small>
                      </button>
                    )}
                    {!presetCourseId ? (
                      <div className="admin-form-group ai-test-optional-course">
                        <label className="admin-form-label">Curs destinație (opțional)</label>
                        <select
                          className="admin-form-input"
                          value={selectedCourseId}
                          onChange={(e) => setSelectedCourseId(e.target.value)}
                          disabled={busy || coursesLoading}
                        >
                          <option value="">Fără curs — test standalone</option>
                          {courses.map((course) => (
                            <option key={course.id} value={String(course.id)}>
                              {course.title || `Curs #${course.id}`}
                            </option>
                          ))}
                        </select>
                        <p className="admin-form-hint">Alege un curs dacă vrei să atașezi testul după salvare.</p>
                      </div>
                    ) : (
                      <div className="admin-form-group ai-test-optional-course">
                        <label className="admin-form-label">Curs destinație</label>
                        <div className="ai-test-readonly-field">
                          {courseData?.title || presetCourseData?.title || `Curs #${presetCourseId}`}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* ——— Blueprint Formely AI ——— */}
              <div className={`ai-test-blueprint-banner ${blueprintSuggestion ? 'has-suggestion' : ''}`}>
                <div className="ai-test-blueprint-banner-main">
                  <span className="ai-test-blueprint-banner-icon"><Sparkle size={18} weight="fill" /></span>
                  <div>
                    <strong>Blueprint inteligent</strong>
                    <p>Lasă Formely AI să propună structura optimă pe baza sursei.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="ai-test-blueprint-btn"
                  onClick={handleSuggestBlueprint}
                  disabled={busy || !hasValidSource}
                >
                  {blueprintLoading ? 'Analizează...' : 'Sugerează blueprint'}
                </button>
              </div>

              {blueprintSuggestion ? (
                <div className="ai-test-blueprint-card">
                  <div>
                    <span className="ai-test-coverage-kicker">Blueprint recomandat</span>
                    <strong>
                      {blueprintSuggestion.numberOfQuestions} întrebări · {getDifficultyLabel(blueprintSuggestion.difficulty)} · {getQualityModeLabel(blueprintSuggestion.qualityMode)}
                    </strong>
                    <p>{blueprintSuggestion.rationale}</p>
                    <p>
                      Tipuri: {(blueprintSuggestion.questionTypes || []).map(getAiQuestionTypeLabel).join(' · ')}
                    </p>
                    <p>
                      Bloom: {(blueprintSuggestion.cognitiveLevels || []).map(getCognitiveLevelLabel).join(' · ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ai-test-blueprint-apply"
                    onClick={handleApplyBlueprint}
                    disabled={busy}
                  >
                    Aplică blueprint
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {step === STEPS.FORMAT ? (
              <section className="ai-test-section">
                <header className="ai-test-section-head">
                  <span className="ai-test-section-index"><Sliders size={16} weight="bold" /></span>
                  <div>
                    <h3>Format și dificultate</h3>
                    <p>Cum vrei să arate testul?</p>
                  </div>
                </header>

                <div className="admin-form-group">
                  <label className="admin-form-label">Tip test</label>
                  <div className="ai-test-segmented">
                    {TEST_TYPE_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`ai-test-segment ${options.type === option.id ? 'is-active' : ''}`}
                        onClick={() => setOptions((prev) => ({ ...prev, type: option.id }))}
                        disabled={busy}
                      >
                        {options.type === option.id && (
                          <span className="ai-test-segment-check"><CheckCircle size={16} weight="fill" /></span>
                        )}
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ai-test-form-grid ai-test-form-grid--2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Dificultate</label>
                    <div className="ai-test-pill-group">
                      {DIFFICULTY_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={`ai-test-pill ${options.difficulty === option.id ? 'is-active' : ''}`}
                          onClick={() => setOptions((prev) => ({ ...prev, difficulty: option.id }))}
                          disabled={busy}
                        >
                          {options.difficulty === option.id && (
                            <CheckCircle size={14} weight="fill" className="ai-test-pill-check" />
                          )}
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Număr întrebări</label>
                    <div className="ai-test-stepper-input">
                      <button
                        type="button"
                        onClick={() => setOptions((prev) => ({ ...prev, numberOfQuestions: Math.max(1, (Number(prev.numberOfQuestions) || 1) - 1) }))}
                        disabled={busy || options.numberOfQuestions <= 1}
                        aria-label="Scade"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={options.numberOfQuestions}
                        disabled={busy}
                        onChange={(e) => setOptions((prev) => ({
                          ...prev,
                          numberOfQuestions: Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)),
                        }))}
                      />
                      <button
                        type="button"
                        onClick={() => setOptions((prev) => ({ ...prev, numberOfQuestions: Math.min(50, (Number(prev.numberOfQuestions) || 1) + 1) }))}
                        disabled={busy || options.numberOfQuestions >= 50}
                        aria-label="Crește"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Mod de calitate</label>
                  <div className="ai-test-segmented ai-test-segmented--3">
                    {QUALITY_MODE_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`ai-test-segment ${options.qualityMode === option.id ? 'is-active' : ''}`}
                        onClick={() => setOptions((prev) => ({ ...prev, qualityMode: option.id }))}
                        disabled={busy}
                      >
                        {options.qualityMode === option.id && (
                          <span className="ai-test-segment-check"><CheckCircle size={16} weight="fill" /></span>
                        )}
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
          ) : null}

          {step === STEPS.CONTENT ? (
              <section className="ai-test-section">
                <header className="ai-test-section-head">
                  <span className="ai-test-section-index"><Brain size={16} weight="bold" /></span>
                  <div>
                    <h3>Tipuri și nivel cognitiv</h3>
                    <p>Formely AI distribuie întrebările pe selecțiile tale.</p>
                  </div>
                </header>

                <div className="admin-form-group">
                  <label className="admin-form-label">
                    Tipuri de întrebări
                    <span className="ai-test-count-badge">{selectedTypes.length} selectate</span>
                  </label>
                  <div className="ai-test-chip-grid">
                    {AI_QUESTION_TYPE_OPTIONS.map((option) => {
                      const active = selectedTypes.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`ai-test-chip ${active ? 'is-active' : ''}`}
                          onClick={() => toggleQuestionType(option.id)}
                          disabled={busy}
                        >
                          {active && <CheckCircle size={15} weight="fill" />}
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Nivel cognitiv (Bloom)</label>
                  <div className="ai-test-cognitive-grid">
                    {COGNITIVE_LEVEL_OPTIONS.map((option) => {
                      const active = selectedCognitiveLevels.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`ai-test-cognitive-option ${active ? 'is-active' : ''}`}
                          onClick={() => toggleCognitiveLevel(option.id)}
                          disabled={busy}
                        >
                          <span className="ai-test-cognitive-check">
                            {active ? <CheckCircle size={16} weight="fill" /> : <span className="ai-test-cognitive-dot" />}
                          </span>
                          <span>
                            <strong>{option.label}</strong>
                            <small>{option.description}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
          ) : null}

          {step === STEPS.DELIVERY ? (
              <section className="ai-test-section">
                <header className="ai-test-section-head">
                  <span className="ai-test-section-index"><Target size={16} weight="bold" /></span>
                  <div>
                    <h3>Setări și livrare</h3>
                    <p>Prag, timp și atașare la curs.</p>
                  </div>
                </header>

                <div className="ai-test-form-grid">
                  <div className="admin-form-group" style={{ gridColumn: '1 / -1' }}>
                    <PassingScoreByQuestions
                      questionCount={options.numberOfQuestions}
                      passingScore={options.passing_score}
                      onPassingScoreChange={(next) => setOptions((prev) => ({ ...prev, passing_score: next }))}
                      disabled={busy}
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Limită timp (min)</label>
                    <input
                      type="number"
                      className="admin-form-input"
                      min="1"
                      placeholder="Opțional"
                      value={options.time_limit_minutes}
                      disabled={busy}
                      onChange={(e) => setOptions((prev) => ({ ...prev, time_limit_minutes: e.target.value }))}
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Încercări maxime</label>
                    <input
                      type="number"
                      className="admin-form-input"
                      min="1"
                      value={options.max_attempts}
                      disabled={busy}
                      onChange={(e) => setOptions((prev) => ({ ...prev, max_attempts: e.target.value }))}
                    />
                  </div>
                </div>

                {canAttachToCourse ? (
                  <div className="ai-test-switch-list">
                    <label className="ai-test-switch">
                      <input
                        type="checkbox"
                        checked={options.attach}
                        disabled={busy}
                        onChange={(e) => setOptions((prev) => ({ ...prev, attach: e.target.checked }))}
                      />
                      <span className="ai-test-switch-track" aria-hidden><span className="ai-test-switch-thumb" /></span>
                      <span className="ai-test-switch-copy">
                        <strong>Atașează testul la curs după salvare</strong>
                        <small>Apare direct în structura cursului.</small>
                      </span>
                    </label>
                    {options.attach ? (
                      <label className="ai-test-switch">
                        <input
                          type="checkbox"
                          checked
                          disabled={busy}
                          readOnly
                        />
                        <span className="ai-test-switch-track" aria-hidden><span className="ai-test-switch-thumb" /></span>
                        <span className="ai-test-switch-copy">
                          <strong>Test obligatoriu</strong>
                          <small>Cursul poate fi finalizat doar după promovarea testului.</small>
                        </span>
                      </label>
                    ) : null}
                  </div>
                ) : (
                  <p className="admin-form-hint">Selectează un curs destinație dacă vrei să atașezi testul după salvare.</p>
                )}
              </section>
          ) : null}

          {step === STEPS.REVIEW ? (
            <>
              <div className="ai-test-review-summary">
                <div>
                  <span>Întrebări generate</span>
                  <strong>{questions.length}</strong>
                </div>
                <div>
                  <span>Sursă</span>
                  <strong>{sourceLabel}</strong>
                </div>
                <div>
                  <span>Distribuție</span>
                  <strong>
                    {Object.entries(generatedQuestionTypes)
                      .map(([type, count]) => `${count} ${getAiQuestionTypeLabel(type)}`)
                      .join(' · ')}
                  </strong>
                </div>
              </div>

              {liveCoverageReport ? (
                <div className={`ai-test-coverage-card${liveCoverageReport.target_met ? ' is-ok' : ' is-warning'}`}>
                  <div>
                    <span className="ai-test-coverage-kicker">Acoperire conținut</span>
                    <strong>{liveCoverageReport.source_label || sourceLabel}</strong>
                    <p>
                      {liveCoverageReport.source_lessons_count || 0} lecții · {liveCoverageReport.source_modules_count || 0} module · {getQualityModeLabel(liveCoverageReport.quality_mode)}
                    </p>
                    {Array.isArray(liveCoverageReport.cognitive_levels) && liveCoverageReport.cognitive_levels.length > 0 ? (
                      <p>
                        Bloom: {liveCoverageReport.cognitive_levels.map(getCognitiveLevelLabel).join(' · ')}
                      </p>
                    ) : null}
                  </div>
                  <div className="ai-test-coverage-meter">
                    <strong>{liveCoverageReport.generated_count}/{liveCoverageReport.requested_count}</strong>
                    <span>{liveCoverageReport.target_met ? 'Țintă atinsă' : `${liveCoverageReport.missing_count} lipsă`}</span>
                  </div>
                  <p className="ai-test-coverage-note">
                    {liveCoverageReport.target_met
                      ? 'Ținta de întrebări a fost atinsă.'
                      : 'Formely AI a returnat sau ai păstrat mai puține întrebări pentru a evita umplutura slabă.'}
                  </p>
                </div>
              ) : null}

              <div className="admin-form-group">
                <label className="admin-form-label">Titlu test *</label>
                <input
                  className="admin-form-input"
                  value={title}
                  disabled={busy}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Descriere</label>
                <textarea
                  className="admin-form-input"
                  rows={2}
                  value={description}
                  disabled={busy}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="ai-test-checkbox-row ai-test-bank-row">
                <label>
                  <input
                    type="checkbox"
                    checked={options.saveToQuestionBank}
                    disabled={busy}
                    onChange={(e) => setOptions((prev) => ({ ...prev, saveToQuestionBank: e.target.checked }))}
                  />
                  Copiază întrebările într-o bancă reutilizabilă
                </label>
              </div>

              {options.saveToQuestionBank ? (
                <div className="admin-form-group">
                  <label className="admin-form-label">Titlu bancă de întrebări</label>
                  <input
                    className="admin-form-input"
                    value={options.questionBankTitle}
                    disabled={busy}
                    placeholder={`Întrebări Formely AI: ${title || 'Test generat'}`}
                    onChange={(e) => setOptions((prev) => ({ ...prev, questionBankTitle: e.target.value }))}
                  />
                  <p className="admin-form-hint">
                    Testul rămâne editabil cu întrebări directe; banca primește o copie pentru reutilizare.
                  </p>
                </div>
              ) : null}

              <div className="ai-test-review-list">
                {questions.map((question, index) => (
                  <div key={`q-${index}-${question.type}`} className="ai-test-review-item">
                    <div className="ai-test-review-item-head">
                      <span className="qb-ai-type-pill">{getAiQuestionTypeLabel(question.type)}</span>
                      <div className="ai-test-review-item-actions">
                        <button
                          type="button"
                          className="ai-test-regenerate-btn"
                          disabled={busy}
                          onClick={() => handleRegenerateQuestion(index)}
                        >
                          {regeneratingIndex === index ? 'Se regenerează...' : 'Regenerază'}
                        </button>
                        <button
                          type="button"
                          className="ai-test-remove-btn"
                          disabled={busy}
                          onClick={() => handleRemoveQuestion(index)}
                        >
                          Elimină
                        </button>
                      </div>
                    </div>
                    <textarea
                      className="admin-form-input ai-test-question-edit"
                      rows={2}
                      value={question.content || ''}
                      disabled={busy}
                      onChange={(e) => handleEditQuestionContent(index, e.target.value)}
                    />
                    {renderAnswerSummary(question)}
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {busy ? (
            <div className="qb-ai-review-loading">
              <span className="qb-spinner" aria-hidden />
              {saving
                ? 'Se salvează testul...'
                : regeneratingIndex !== null
                  ? 'Formely AI regenerează întrebarea selectată...'
                  : 'Formely AI generează întrebările...'}
            </div>
          ) : null}

          {error ? <div className="lms-error-message">{error}</div> : null}
        </div>

        <div className="admin-team-modal-footer ai-test-footer">
          <div className="ai-test-footer-summary">
            {isReviewStep ? (
              <span>{questions.length} întrebări gata de salvat</span>
            ) : (
              <>
                <span className="ai-test-footer-pill" title={sourceLabel}>{sourceLabel}</span>
                <span className="ai-test-footer-dot" aria-hidden>·</span>
                <span>{options.numberOfQuestions} întrebări</span>
                <span className="ai-test-footer-dot" aria-hidden>·</span>
                <span>{getTestTypeLabel(options.type)}</span>
              </>
            )}
          </div>

          <div className="ai-test-footer-actions">
            {isFirstStep && !isReviewStep ? (
              <button type="button" className="lms-btn-secondary" onClick={onClose} disabled={busy}>
                Anulează
              </button>
            ) : (
              <button
                type="button"
                className="lms-btn-secondary"
                onClick={handleStepBack}
                disabled={busy}
              >
                Înapoi
              </button>
            )}

            {isReviewStep ? (
              <button
                type="button"
                className="lms-btn-primary ai-test-cta"
                onClick={handleSave}
                disabled={busy || questions.length === 0 || !title.trim()}
              >
                <CheckCircle size={16} weight="fill" />
                {saving ? 'Se salvează...' : 'Salvează test (draft)'}
              </button>
            ) : isDeliveryStep ? (
              <button
                type="button"
                className="lms-btn-primary ai-test-cta"
                onClick={handleGeneratePreview}
                disabled={busy || !hasValidSource || selectedTypes.length === 0 || (sourceType === SOURCE_TYPES.COURSE && !hasCourses)}
              >
                <Lightning size={16} weight="fill" />
                {generating ? 'Se generează...' : 'Generează cu Formely AI'}
              </button>
            ) : (
              <button
                type="button"
                className="lms-btn-primary ai-test-cta"
                onClick={handleStepNext}
                disabled={busy || !canProceedFromStep()}
              >
                Continuă
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
};

export default AITestGenerateModal;
