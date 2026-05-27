import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckSquare,
  Edit3,
  ListChecks,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  Star,
  Tags,
  Trash2,
} from 'lucide-react';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import { useToast } from '../../contexts/ToastContext';
import { adminService } from '../../services/api';
import Drawer from '../../components/admin/question-banks/Drawer';
import QuestionRow from '../../components/admin/question-banks/QuestionRow';
import Tag from '../../components/admin/question-banks/Tag';
import QuestionBuilderEditor from '../../components/admin/question-banks/QuestionBuilderEditor';
import AIGenerateQuestionsModal from '../../components/admin/question-banks/QuestionBankBuilderSteps/AIGenerateQuestionsModal';
import { isAiEnabled, notifyAiComingSoon } from '../../utils/aiAvailability';
import { useAuth } from '../../contexts/AuthContext';
import './AdminQuestionBanksPage.css';

const QUESTION_TYPE_LABELS = {
  single_choice: 'Răspuns unic',
  multiple_choice: 'Răspuns multiplu',
  true_false: 'Adevărat/Fals',
  matching: 'Potrivire',
  ordering: 'Ordonare',
  fill_in_blank: 'Completare spații',
  open: 'Deschis',
};

const stripHtml = (value = '') => String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const normalizeSearch = (value = '') => stripHtml(value).toLowerCase();

const AdminQuestionBankFolderDetailsPage = () => {
  const { id } = useParams();
  const { canMutateInAdminArea } = useAuth();
  const readOnly = !canMutateInAdminArea;
  const { success, error } = useToast();
  const [folder, setFolder] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [drawerQuestion, setDrawerQuestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', description: '', tagsText: '' });
  const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
  const [questionEditorSaving, setQuestionEditorSaving] = useState(false);
  const [questionEditorNumber, setQuestionEditorNumber] = useState(1);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiCourses, setAiCourses] = useState([]);
  const [aiCoursesLoading, setAiCoursesLoading] = useState(false);
  const [aiSelectedCourseId, setAiSelectedCourseId] = useState('');
  const [aiGeneratedCount, setAiGeneratedCount] = useState(0);
  const [aiGeneratedPreviews, setAiGeneratedPreviews] = useState([]);
  const [aiOptions, setAiOptions] = useState({
    numberOfQuestions: 10,
    difficulty: 'medium',
    questionTypes: ['multiple_choice'],
  });
  const [deleteConfirmQuestionId, setDeleteConfirmQuestionId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [questionDraft, setQuestionDraft] = useState({
    id: null,
    type: 'single_choice',
    content: '',
    explanation: '',
    points: 1,
    answers: [
      { text: 'Răspuns A', is_correct: true },
      { text: 'Răspuns B', is_correct: false },
    ],
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [folderData, questionData] = await Promise.all([
        adminService.getQuestionBank(id),
        adminService.getQuestionBankQuestions(id),
      ]);
      setFolder(folderData);
      setQuestions(Array.isArray(questionData) ? questionData : []);
      const tags = (folderData?.tags || []).map((t) => t.name).join(', ');
      setEditForm({
        title: folderData?.title || '',
        description: folderData?.description || '',
        tagsText: tags,
      });
    } catch {
      error('Nu am putut încărca folderul.');
    } finally {
      setLoading(false);
    }
  }, [error, id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;

    const loadCourses = async () => {
      setAiCoursesLoading(true);
      try {
        const res = await adminService.getCourses({ per_page: 500, status: 'all' });
        const list = Array.isArray(res) ? res : (res?.data || []);
        if (!cancelled) setAiCourses(list);
      } catch (err) {
        console.error('Error fetching courses for AI generation:', err);
        if (!cancelled) setAiCourses([]);
      } finally {
        if (!cancelled) setAiCoursesLoading(false);
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

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((questionId) => questions.some((q) => q.id === questionId)));
  }, [questions]);

  const aiTargetCount = Math.max(1, Number(aiOptions.numberOfQuestions) || 1);
  const starredCount = questions.filter((q) => q?.is_starred).length;
  const totalPoints = questions.reduce((sum, q) => sum + (Number(q?.points) || 0), 0);
  const uniqueTypes = useMemo(
    () => Array.from(new Set(questions.map((q) => q?.type).filter(Boolean))),
    [questions]
  );

  const filteredQuestions = useMemo(() => {
    const query = normalizeSearch(search);
    return questions.filter((question) => {
      const matchesType = typeFilter === 'all' || question?.type === typeFilter;
      if (!matchesType) return false;
      if (!query) return true;
      const tags = question?.tags || question?.metadata?.tags || [];
      const tagText = Array.isArray(tags) ? tags.map((tag) => tag?.name || tag).join(' ') : '';
      return `${stripHtml(question?.content || '')} ${tagText}`.toLowerCase().includes(query);
    });
  }, [questions, search, typeFilter]);

  const normalizedTags = useMemo(
    () =>
      editForm.tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    [editForm.tagsText]
  );

  const resolveValidCourseId = (candidateId = aiSelectedCourseId) => {
    const parsed = Number.parseInt(String(candidateId), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const trimQuestionText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const normalizeQuestionText = (value) =>
    trimQuestionText(value)
      .toLowerCase()
      .replace(/[^a-z0-9ăâîșşțţ\s]+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

  const toggleSelect = (questionId) => {
    setSelectedIds((prev) => (prev.includes(questionId) ? prev.filter((idv) => idv !== questionId) : [...prev, questionId]));
  };

  const toggleSelectVisible = () => {
    const visibleIds = filteredQuestions.map((question) => question.id);
    if (!visibleIds.length) return;
    const allSelected = visibleIds.every((questionId) => selectedIds.includes(questionId));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((questionId) => !visibleIds.includes(questionId)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const toggleStar = async (questionId) => {
    try {
      const response = await adminService.toggleQuestionStar(questionId);
      const updated = response?.question;
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, is_starred: Boolean(updated?.is_starred) } : q))
      );
      await loadData();
    } catch {
      error('Nu am putut modifica steaua.');
    }
  };

  const runBulkDelete = async () => {
    if (!selectedIds.length) return;
    const confirmed = window.confirm(`Ștergi ${selectedIds.length} întrebări din acest folder?`);
    if (!confirmed) return;

    try {
      await Promise.all(selectedIds.map((qid) => adminService.removeQuestionFromBank(id, qid)));
      success('Întrebările selectate au fost șterse.');
      setSelectedIds([]);
      if (drawerQuestion && selectedIds.includes(drawerQuestion.id)) {
        setDrawerQuestion(null);
      }
      await loadData();
    } catch {
      error('Nu am putut șterge selecția.');
    }
  };

  const requestDeleteQuestion = (questionId) => {
    setDeleteConfirmQuestionId(questionId);
  };

  const confirmDeleteQuestion = async () => {
    if (!deleteConfirmQuestionId) return;
    setDeleteLoading(true);
    try {
      await adminService.removeQuestionFromBank(id, deleteConfirmQuestionId);
      success('Întrebarea a fost ștearsă.');
      setSelectedIds((prev) => prev.filter((qid) => qid !== deleteConfirmQuestionId));
      if (drawerQuestion?.id === deleteConfirmQuestionId) {
        setDrawerQuestion(null);
      }
      setDeleteConfirmQuestionId(null);
      await loadData();
    } catch {
      error('Nu am putut șterge întrebarea.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const saveFolder = async () => {
    try {
      await adminService.updateQuestionBank(id, {
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        tags: normalizedTags,
      });
      success('Folder actualizat.');
      setEditOpen(false);
      await loadData();
    } catch {
      error('Nu am putut salva folderul.');
    }
  };

  const fetchAiDraftQuestion = async (approvedQuestions = [], blockedQuestions = [], courseIdOverride = null) => {
    const validCourseId = resolveValidCourseId(courseIdOverride);
    if (!validCourseId) {
      throw new Error('Alege un curs valid înainte de generare.');
    }

    const result = await adminService.previewQuestionsWithAi(id, {
      course_id: validCourseId,
      numberOfQuestions: Math.max(1, Number(aiOptions.numberOfQuestions) || 1),
      difficulty: aiOptions.difficulty,
      questionTypes: aiOptions.questionTypes,
      instructions: '',
      approvedQuestions: approvedQuestions.map((q) => q.content || q.text || '').filter(Boolean),
      blockedQuestions: blockedQuestions.map((q) => q.content || q.text || '').filter(Boolean),
      autoGenerate: false,
    });

    return Array.isArray(result?.draft) ? result.draft : [];
  };

  const handleOpenAIModal = () => {
    if (!isAiEnabled()) {
      notifyAiComingSoon(showToast);
      return;
    }
    setAiOptions({
      numberOfQuestions: 10,
      difficulty: 'medium',
      questionTypes: ['multiple_choice'],
    });
    setAiError(null);
    setAiGeneratedCount(0);
    setAiGeneratedPreviews([]);
    if (!aiSelectedCourseId && aiCourses.length > 0) {
      setAiSelectedCourseId(String(aiCourses[0].id));
    }
    setShowAIModal(true);
  };

  const startAiAutoGenerate = async (overrideCourseId = null, requestedCount = null) => {
    const effectiveCourseId = resolveValidCourseId(overrideCourseId);
    if (!effectiveCourseId) {
      error('Alege mai întâi un curs sursă.');
      return;
    }

    try {
      setAiGenerating(true);
      setAiError(null);
      const targetCount = Math.max(1, Number(requestedCount) || aiTargetCount);
      setAiGeneratedCount(0);
      setAiGeneratedPreviews([]);
      const generatedQuestions = [];
      const generatedPreviews = [];
      const usedNormalized = new Set();

      for (let index = 0; index < targetCount; index += 1) {
        let candidate = null;
        let content = '';
        const maxAttempts = 5;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const draft = await fetchAiDraftQuestion(generatedQuestions, generatedQuestions, effectiveCourseId);
          candidate = Array.isArray(draft) ? draft[0] : null;
          content = trimQuestionText(candidate?.content || candidate?.question || '');
          const normalized = normalizeQuestionText(content);
          if (!candidate || !content || !normalized || usedNormalized.has(normalized)) {
            candidate = null;
            continue;
          }
          usedNormalized.add(normalized);
          break;
        }

        if (!candidate || !content) {
          throw new Error('AI nu a returnat nicio întrebare.');
        }

        generatedQuestions.push(candidate);
        generatedPreviews.push({
          index: index + 1,
          content,
          type: candidate.type || 'multiple_choice',
        });
        setAiGeneratedCount(index + 1);
        setAiGeneratedPreviews([...generatedPreviews]);
      }

      await adminService.addQuestionsToBankBulk(id, generatedQuestions);
      success(`Au fost generate și salvate ${generatedQuestions.length} întrebări.`);
      setShowAIModal(false);
      setAiGeneratedCount(0);
      setAiGeneratedPreviews([]);
      setAiError(null);
      await loadData();
    } catch (err) {
      console.error('Error generating questions:', err);
      const message = err.response?.data?.error || err.response?.data?.message || err.message || 'Eroare la generarea întrebărilor cu AI';
      setAiError(message);
      error(message);
    } finally {
      setAiGenerating(false);
    }
  };

  const openCreateQuestionEditor = () => {
    setQuestionEditorNumber((questions?.length || 0) + 1);
    setQuestionDraft({
      id: null,
      type: 'single_choice',
      content: '',
      explanation: '',
      points: 1,
      answers: [
        { text: 'Răspuns A', is_correct: true },
        { text: 'Răspuns B', is_correct: false },
      ],
    });
    setQuestionEditorOpen(true);
  };

  const openEditQuestionEditor = (question) => {
    const indexInList = questions.findIndex((q) => q.id === question?.id);
    setQuestionEditorNumber(indexInList >= 0 ? indexInList + 1 : 1);
    const mappedAnswers = Array.isArray(question?.answers)
      ? question.answers.map((a) => ({
          text: typeof a === 'string' ? a : a?.text || '',
          is_correct: Boolean(typeof a === 'object' ? a?.is_correct : false),
        }))
      : [];
    setQuestionDraft({
      id: question?.id || null,
      type: question?.type || 'single_choice',
      content: question?.content || '',
      explanation: question?.explanation || '',
      points: Number(question?.points) > 0 ? Number(question.points) : 1,
      answers: mappedAnswers.length ? mappedAnswers : [
        { text: 'Răspuns A', is_correct: true },
        { text: 'Răspuns B', is_correct: false },
      ],
    });
    setDrawerQuestion(null);
    setQuestionEditorOpen(true);
  };

  const saveQuestionFromEditor = async () => {
    if (!questionDraft.content?.trim()) {
      error('Întrebarea este obligatorie.');
      return;
    }
    setQuestionEditorSaving(true);
    try {
      const payload = {
        type: questionDraft.type,
        content: questionDraft.content,
        explanation: questionDraft.explanation || null,
        answers: questionDraft.answers || [],
        points: Number(questionDraft.points) > 0 ? Number(questionDraft.points) : 1,
      };

      if (questionDraft.id) {
        await adminService.updateQuestionInBank(id, questionDraft.id, payload);
        success('Întrebarea a fost actualizată.');
      } else {
        await adminService.addQuestionToBank(id, payload);
        success('Întrebarea a fost adăugată.');
      }
      setQuestionEditorOpen(false);
      await loadData();
    } catch (e) {
      error(e?.response?.data?.error || 'Nu am putut salva întrebarea.');
    } finally {
      setQuestionEditorSaving(false);
    }
  };

  const allVisibleSelected =
    filteredQuestions.length > 0 && filteredQuestions.every((question) => selectedIds.includes(question.id));

  return (
    <div className="qb-page qb-page-v2 qb-folder-detail-page">
      <div className="qb-shell qb-shell-detail">
        <header className="qb-detail-hero">
          <Link to="/admin/question-banks" className="qb-back-btn qb-detail-back">
            <ArrowLeft size={18} aria-hidden />
            Înapoi
          </Link>

          <div className="qb-detail-title-area">
            <p className="qb-page-eyebrow">Folder întrebări</p>
            <h1>{folder?.title || 'Detalii folder'}</h1>
            {folder?.description ? <p className="qb-detail-description">{folder.description}</p> : null}
            <div className="qb-folder-tags">
              {(folder?.tags || []).map((tag) => (
                <Tag key={tag.id}>{tag.name}</Tag>
              ))}
            </div>
          </div>

          {!readOnly ? (
            <div className="qb-detail-actions">
              <button type="button" className="lms-btn-secondary qb-action-button" onClick={() => setEditOpen(true)}>
                <Edit3 size={17} aria-hidden />
                Editează
              </button>
              <button type="button" className="lms-btn-secondary qb-action-button" onClick={openCreateQuestionEditor}>
                <Plus size={17} aria-hidden />
                Întrebare
              </button>
              <button type="button" className="lms-btn-primary qb-action-button" onClick={handleOpenAIModal}>
                <Sparkles size={17} aria-hidden />
                Generează cu AI
              </button>
            </div>
          ) : null}
        </header>

        <section className="qb-detail-stats" aria-label="Rezumat folder">
          <div className="qb-overview-item">
            <ListChecks size={18} aria-hidden />
            <div>
              <strong>{loading ? '...' : questions.length}</strong>
              <span>întrebări</span>
            </div>
          </div>
          <div className="qb-overview-item">
            <Star size={18} aria-hidden />
            <div>
              <strong>{loading ? '...' : starredCount}</strong>
              <span>marcate cu stea</span>
            </div>
          </div>
          <div className="qb-overview-item">
            <Tags size={18} aria-hidden />
            <div>
              <strong>{loading ? '...' : uniqueTypes.length}</strong>
              <span>tipuri de întrebări</span>
            </div>
          </div>
          <div className="qb-overview-item">
            <CheckSquare size={18} aria-hidden />
            <div>
              <strong>{loading ? '...' : totalPoints}</strong>
              <span>puncte totale</span>
            </div>
          </div>
        </section>

        <main className="qb-workspace qb-detail-workspace">
          <div className="qb-detail-toolbar">
            <div className="qb-search-field">
              <Search size={18} aria-hidden />
              <label className="qb-sr-only" htmlFor="qb-folder-question-search">
                Caută întrebări
              </label>
              <input
                id="qb-folder-question-search"
                className="admin-form-input qb-search-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Caută întrebare sau tag"
              />
            </div>

            <select
              className="admin-form-input qb-type-filter"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              aria-label="Filtru tip întrebare"
            >
              <option value="all">Toate tipurile</option>
              {uniqueTypes.map((type) => (
                <option key={type} value={type}>
                  {QUESTION_TYPE_LABELS[type] || type}
                </option>
              ))}
            </select>

            <button type="button" className="lms-btn-secondary qb-action-button" onClick={loadData}>
              <RefreshCcw size={17} aria-hidden />
              Actualizează
            </button>
          </div>

          {!readOnly ? (
            <div className={`qb-selection-bar ${selectedIds.length ? 'is-active' : ''}`}>
              <div className="qb-selection-main">
                <strong>{selectedIds.length}</strong>
                <span>selectate</span>
              </div>
              <div className="qb-catalog-toolbar-actions">
                <button
                  type="button"
                  className="lms-btn-secondary qb-action-button"
                  disabled={!filteredQuestions.length}
                  onClick={toggleSelectVisible}
                >
                  <CheckSquare size={16} aria-hidden />
                  {allVisibleSelected ? 'Deselectează vizibile' : 'Selectează vizibile'}
                </button>
                <button
                  type="button"
                  className="lms-btn-secondary qb-action-button"
                  disabled={!selectedIds.length}
                  onClick={() => setSelectedIds([])}
                >
                  Golește
                </button>
                <button
                  type="button"
                  className="lms-btn-secondary va-btn-danger qb-action-button"
                  disabled={!selectedIds.length}
                  onClick={runBulkDelete}
                >
                  <Trash2 size={16} aria-hidden />
                  Șterge
                </button>
              </div>
            </div>
          ) : null}

          <section className="qb-rows qb-detail-question-list" aria-label="Întrebări din folder">
            {loading ? (
              <div className="qb-catalog-loading qb-catalog-loading--inline">
                <span className="qb-spinner" aria-hidden />
                Se încarcă întrebările...
              </div>
            ) : filteredQuestions.length ? (
              filteredQuestions.map((question) => (
                <QuestionRow
                  key={question.id}
                  question={question}
                  selected={selectedIds.includes(question.id)}
                  isActive={drawerQuestion?.id === question.id}
                  onToggleSelect={toggleSelect}
                  onToggleStar={toggleStar}
                  onOpenDrawer={setDrawerQuestion}
                  onDelete={readOnly ? undefined : requestDeleteQuestion}
                  readOnly={readOnly}
                />
              ))
            ) : (
              <div className="qb-empty">
                <ListChecks size={30} aria-hidden />
                <p className="qb-empty-title">{questions.length ? 'Nicio întrebare pentru filtrul curent' : 'Folder gol'}</p>
                <p className="qb-empty-hint">
                  {questions.length ? 'Schimbă căutarea sau filtrul de tip.' : 'Adaugă manual o întrebare sau generează cu AI.'}
                </p>
              </div>
            )}
          </section>
        </main>
      </div>

      <Drawer
        open={Boolean(drawerQuestion)}
        question={drawerQuestion}
        onClose={() => setDrawerQuestion(null)}
        onEdit={readOnly ? undefined : openEditQuestionEditor}
      />

      <Modal isOpen={editOpen && !readOnly} onClose={() => setEditOpen(false)}>
        <div className="qb-modal">
          <h3>Editează folder</h3>
          <label htmlFor="qb-edit-folder-title">Nume</label>
          <input
            id="qb-edit-folder-title"
            className="admin-form-input"
            value={editForm.title}
            onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
          />
          <label htmlFor="qb-edit-folder-description">Descriere</label>
          <textarea
            id="qb-edit-folder-description"
            className="admin-form-input"
            rows={3}
            value={editForm.description}
            onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
          />
          <label htmlFor="qb-edit-folder-tags">Tag-uri separate prin virgulă</label>
          <input
            id="qb-edit-folder-tags"
            className="admin-form-input"
            value={editForm.tagsText}
            onChange={(e) => setEditForm((prev) => ({ ...prev, tagsText: e.target.value }))}
          />
          <div className="qb-modal-actions">
            <button type="button" className="lms-btn-secondary" onClick={() => setEditOpen(false)}>
              Anulează
            </button>
            <button type="button" className="lms-btn-primary" onClick={saveFolder}>
              Salvează
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={questionEditorOpen && !readOnly} onClose={() => !questionEditorSaving && setQuestionEditorOpen(false)}>
        <div className="qb-modal qb-modal-question-editor">
          <h3>{questionDraft.id ? 'Editează întrebare' : 'Întrebare nouă'}</h3>
          <QuestionBuilderEditor question={questionDraft} onChange={setQuestionDraft} questionNumber={questionEditorNumber} />
          <div className="qb-modal-actions">
            <button type="button" className="lms-btn-secondary" onClick={() => setQuestionEditorOpen(false)} disabled={questionEditorSaving}>
              Anulează
            </button>
            <button type="button" className="lms-btn-primary" onClick={saveQuestionFromEditor} disabled={questionEditorSaving}>
              {questionEditorSaving ? 'Se salvează...' : 'Salvează'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={deleteConfirmQuestionId != null}
        onClose={() => !deleteLoading && setDeleteConfirmQuestionId(null)}
        onConfirm={confirmDeleteQuestion}
        title="Șterge întrebarea"
        message="Întrebarea va fi eliminată din acest folder. Această acțiune nu poate fi anulată."
        confirmLabel="Șterge"
        cancelLabel="Anulare"
        variant="danger"
        loading={deleteLoading}
      />

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
        aiGeneratedCount={aiGeneratedCount}
        aiTargetCount={aiTargetCount}
        aiGeneratedPreviews={aiGeneratedPreviews}
        onClose={() => setShowAIModal(false)}
        onStartReview={startAiAutoGenerate}
      />
    </div>
  );
};

export default AdminQuestionBankFolderDetailsPage;
