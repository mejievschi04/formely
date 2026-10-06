import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { ArrowLeft, BarChart3, ChevronRight, Eye, ListChecks, Save, Settings, Users } from 'lucide-react';
import { adminService } from '../../services/api';

import { useToast } from '../../contexts/ToastContextShared.js';

import { useAuth } from '../../contexts/AuthContextShared.js';

import AdminContentItemCard from '../../components/admin/content/AdminContentItemCard';
import { PublishSwitch } from '../../components/ui/PublishSwitch';
import TestResultsPanel from '../../components/admin/tests/TestResultsPanel';
import ExamContentPicker from '../../components/admin/exams/ExamContentPicker';
import PassingScoreByQuestions from '../../components/admin/tests/PassingScoreByQuestions';
import Modal from '../../components/common/Modal';
import '../../styles/admin-content-list.css';
import './AdminTestsPage.css';
import './AdminExamsPage.css';
import '../../styles/test-settings.css';
import {
  TEST_RESULTS_DISPLAY_OPTIONS,
  getExamResultsDisplayMode,
  patchExamResultsDisplayMode,
} from '../../utils/testQuestionBuilder';

/** Id-uri stabile pentru logică; etichete cu diacritice în UI. */
const EXAM_BUILDER_SECTIONS = [
  { id: 'settings', label: 'Setări', hint: 'Reguli și notare' },
  { id: 'questions', label: 'Întrebări', hint: 'Alege conținutul' },
  { id: 'access', label: 'Acces', hint: 'Cine poate intra' },
  { id: 'statistics', label: 'Statistici', hint: 'Rezultate' },
];
const DEFAULT_EXAM_SECTION = EXAM_BUILDER_SECTIONS[0].id;

const FILTERS = [
  { value: 'all', label: 'Toate' },
  { value: 'draft', label: 'Ciornă' },
  { value: 'published', label: 'Publicat' },
  { value: 'archived', label: 'Arhivat' },
];
const DEFAULT_SETTINGS = {
  title: '',
  description: '',
  instructions: '',
  shuffleQuestions: false,
  manualReview: false,
  showFeedbackInstant: false,
  showCorrectAnswers: false,
  showOnlySubmittedAnswers: true,
  timeLimitMinutes: '',
  attempts: '',
  deadlineFlexible: false,
  passingScore: 0,
  navigationMode: 'sequential',
  deadlineType: 'none',
  deadlineAt: '',
  deadlineDays: 7,
  contentBankId: null,
  selectedFolderIds: [],
  selectedQuestionIds: [],
  selectionMode: 'questions',
  includeStarred: true,
  questionCount: 10,
};

const localDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};
const typeLabel = (type) => ({
  multiple_choice: 'Grilă',
  single_choice: 'Alegere unică',
  true_false: 'Adevărat / fals',
  yes_no: 'Da / Nu',
  matching: 'Asocieri',
  ordering: 'Ordonare',
}[type] || type);

function examStatusLabelRo(status) {
  const s = String(status || 'draft').toLowerCase();
  if (s === 'published') return 'Publicat';
  if (s === 'archived') return 'Arhivat';
  return 'Ciornă';
}

export default function AdminExamsPage() {
  const { success: toastSuccess, error: toastError } = useToast();
  const { canMutateInAdminArea } = useAuth();
  const [viewMode, setViewMode] = useState('list');
  const [activeSection, setActiveSection] = useState(DEFAULT_EXAM_SECTION);
  const [published, setPublished] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [listStatusFilter, setListStatusFilter] = useState('all');
  const [deleteConfirmExam, setDeleteConfirmExam] = useState(null);
  const [listActionId, setListActionId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creatingExam, setCreatingExam] = useState(false);
  const [duplicatingExamId, setDuplicatingExamId] = useState(null);
  const [createError, setCreateError] = useState('');
  const [activeExamDraft, setActiveExamDraft] = useState({ id: null, title: '', description: '', course_id: null });
  const [saveState, setSaveState] = useState({ loading: false, message: '', type: '' });
  const [publishToggleLoading, setPublishToggleLoading] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [examSettings, setExamSettings] = useState(DEFAULT_SETTINGS);
  const [contentBanks, setContentBanks] = useState([]);
  const [contentBanksLoading, setContentBanksLoading] = useState(false);
  const [contentBanksError, setContentBanksError] = useState('');
  const [contentSearch, setContentSearch] = useState('');
  const [contentSort, setContentSort] = useState('questions_desc');
  const [contentOnlyWithQuestions, setContentOnlyWithQuestions] = useState(false);
  const [contentConfirmLoading, setContentConfirmLoading] = useState(false);
  const [selectedQuestionItems, setSelectedQuestionItems] = useState([]);
  const [examAccess, setExamAccess] = useState({ mode: 'teams', teamIds: [], excludedStudentIds: [], selectedStudents: [] });
  const [accessTeams, setAccessTeams] = useState([]);
  const [accessTeamsLoading, setAccessTeamsLoading] = useState(false);
  const [accessTeamsError, setAccessTeamsError] = useState('');
  const [openTeamId, setOpenTeamId] = useState(null);
  const [manualReviewState, setManualReviewState] = useState({ reviewMode: 'after_complete' });
  const [statisticsQuestionRows, setStatisticsQuestionRows] = useState([]);
  const [statisticsLoading, setStatisticsLoading] = useState(false);
  const [statisticsTab, setStatisticsTab] = useState('students');

  const isQuestionMode = examSettings.selectionMode === 'questions';
  const selectedQuestionCount = Array.isArray(examSettings.selectedQuestionIds) ? examSettings.selectedQuestionIds.length : 0;
  const learnerMembersOf = (team) => (Array.isArray(team?.users) ? team.users : [])
    .filter((user) => user?.role === 'student' && user?.status !== 'suspended')
    .map((user) => ({ id: Number(user.id), name: user.name || 'Utilizator', email: user.email || '' }))
    .filter((user) => Number.isFinite(user.id));
  const accessSummaryLabel = examAccess.mode === 'teams'
    ? (examAccess.teamIds.length ? `${examAccess.teamIds.length} ${examAccess.teamIds.length === 1 ? 'echipă' : 'echipe'}` : 'Nicio echipă')
    : (examAccess.mode === 'selected_students' ? `${examAccess.selectedStudents.length} utilizatori` : 'Toți');
  const listStats = useMemo(() => {
    const counts = { all: items.length, draft: 0, published: 0, archived: 0 };
    items.forEach((item) => {
      const status = String(item?.status || 'draft').toLowerCase();
      if (status in counts) counts[status] += 1;
    });
    return counts;
  }, [items]);
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesStatus = listStatusFilter === 'all' || String(item?.status || 'draft').toLowerCase() === listStatusFilter;
      if (!matchesStatus) return false;
      if (!query) return true;
      return String(item?.title || '').toLowerCase().includes(query) || String(item?.course_title || '').toLowerCase().includes(query);
    });
  }, [items, listStatusFilter, search]);
  const filteredContentBanks = useMemo(() => {
    const query = contentSearch.trim().toLowerCase();
    let rows = Array.isArray(contentBanks) ? [...contentBanks] : [];
    if (query) rows = rows.filter((bank) => String(bank?.title || '').toLowerCase().includes(query) || String(bank?.description || '').toLowerCase().includes(query));
    if (contentOnlyWithQuestions) rows = rows.filter((bank) => Number(bank?.questions_count || 0) > 0);
    rows.sort((a, b) => {
      const countA = Number(a?.questions_count || 0);
      const countB = Number(b?.questions_count || 0);
      const titleCompare = String(a?.title || '').localeCompare(String(b?.title || ''), 'ro', { sensitivity: 'base' });
      if (contentSort === 'title_asc') return titleCompare;
      if (contentSort === 'title_desc') return -titleCompare;
      if (contentSort === 'questions_asc') return countA - countB;
      return countB - countA;
    });
    return rows;
  }, [contentBanks, contentOnlyWithQuestions, contentSearch, contentSort]);
  const builderHeroTitle = examSettings.title?.trim() || activeExamDraft.title || 'Examen nou';
  const builderHeroAccent = published ? 'var(--color-success)' : 'var(--color-warning)';

  const deleteConfirmTitle = deleteConfirmExam?.title || 'Examen';
  const previewQuestionCount = Array.isArray(previewData?.questions) ? previewData.questions.length : 0;
  const activeBuilderSection = EXAM_BUILDER_SECTIONS.find((section) => section.id === activeSection) || EXAM_BUILDER_SECTIONS[0];
  const renderBuilderSectionIcon = (sectionId) => {
    const props = { size: 17, 'aria-hidden': true };
    if (sectionId === 'questions') return <ListChecks {...props} />;
    if (sectionId === 'access') return <Users {...props} />;
    if (sectionId === 'statistics') return <BarChart3 {...props} />;
    return <Settings {...props} />;
  };

  const loadExams = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await adminService.getExams();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load exams:', e);
      setItems([]);
      setError('Nu s-a putut încărca lista de examene.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadExams(); }, [loadExams]);
  useEffect(() => { if (!canMutateInAdminArea && viewMode !== 'list') setViewMode('list'); }, [canMutateInAdminArea, viewMode]);

  const handleRefreshStatistics = useCallback(async (notify = false) => {
    if (viewMode !== 'create' || activeSection !== 'statistics') return;
    if (!activeExamDraft.id) { setStatisticsQuestionRows([]); return; }
    try {
      setStatisticsLoading(true);
      const questionData = await adminService.getExamQuestionAnalytics(activeExamDraft.id);
      setStatisticsQuestionRows(Array.isArray(questionData) ? questionData : []);
      if (notify) toastSuccess('Statisticile au fost actualizate.');
    } catch (e) {
      console.error('Failed to refresh statistics:', e);
      setStatisticsQuestionRows([]);
      if (notify) toastError('Nu s-au putut actualiza statisticile.');
    } finally { setStatisticsLoading(false); }
  }, [activeExamDraft.id, activeSection, viewMode, toastSuccess, toastError]);

  useEffect(() => { handleRefreshStatistics(); }, [handleRefreshStatistics]);

  const handleOpenCreateModal = () => { setCreateTitle(''); setCreateDescription(''); setCreateError(''); setShowCreateModal(true); };
  const handleConfirmCreate = async () => {
    const title = createTitle.trim();
    if (!title) { setCreateError('Titlul este obligatoriu.'); return; }
    setCreateError(''); setCreatingExam(true);
    try {
      const response = await adminService.createExam({
        title,
        description: createDescription.trim(),
        max_score: 100,
        settings: { access_mode: 'teams', team_ids: [], excluded_student_ids: [] },
      });
      const createdExam = response?.exam || response;
      if (createdExam?.id) setItems((prev) => [createdExam, ...prev]);
      setActiveExamDraft({ id: createdExam?.id || null, title, description: createDescription.trim(), course_id: null });
      setExamSettings({ ...DEFAULT_SETTINGS, title, description: createDescription.trim() });
      setExamAccess({ mode: 'teams', teamIds: [], excludedStudentIds: [], selectedStudents: [] });
      setSelectedQuestionItems([]);
      setPublished(false); setShowCreateModal(false); setViewMode('create'); setActiveSection(DEFAULT_EXAM_SECTION);
    } catch (e) {
      console.error('Failed to create exam:', e);
      setCreateError(e?.response?.data?.message || 'Nu s-a putut crea examenul.');
    } finally { setCreatingExam(false); }
  };

  const handleDuplicateExam = async (item) => {
    if (!item?.id) return;
    setDuplicatingExamId(item.id);
    try {
      const data = await adminService.duplicateExam(item.id);
      const exam = data?.exam;
      if (exam?.id) setItems((prev) => [exam, ...prev]);
      toastSuccess(data?.message || 'Examen duplicat.');
    } catch (e) {
      console.error('Failed to duplicate exam:', e);
      toastError(e?.response?.data?.message || 'Nu s-a putut duplica examenul.');
    } finally { setDuplicatingExamId(null); }
  };

  const patchExamListStatus = async (item, status) => {
    if (!item?.id || !canMutateInAdminArea) return;
    setListActionId(item.id);
    try {
      await adminService.patchExamStatus(item.id, status);
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, status } : row)));
      toastSuccess(status === 'published' ? 'Examen publicat.' : status === 'archived' ? 'Examen arhivat.' : 'Examen mutat in draft.');
    } catch (e) {
      console.error('Failed to patch exam status:', e);
      toastError(e?.response?.data?.message || 'Nu s-a putut actualiza statusul.');
    } finally { setListActionId(null); }
  };

  const handleConfirmDeleteExam = async () => {
    if (!deleteConfirmExam?.id || !canMutateInAdminArea) return;
    setListActionId(deleteConfirmExam.id);
    try {
      await adminService.deleteExam(deleteConfirmExam.id);
      setItems((prev) => prev.filter((row) => row.id !== deleteConfirmExam.id));
      toastSuccess('Examen sters.'); setDeleteConfirmExam(null);
    } catch (e) {
      console.error('Failed to delete exam:', e);
      toastError(e?.response?.data?.message || 'Nu s-a putut șterge examenul.');
    } finally { setListActionId(null); }
  };
  const handleOpenExistingExam = (item, options = {}) => {
    setActiveExamDraft({ id: item?.id || null, title: item?.title || '', description: item?.description || '', course_id: item?.course_id || null });
    setExamSettings({
      ...DEFAULT_SETTINGS,
      title: item?.title || '', description: item?.description || '', instructions: item?.settings?.instructions || '',
      attempts: item?.max_attempts == null ? '' : Number(item.max_attempts), passingScore: Number(item?.passing_score ?? 0) || 0,
      timeLimitMinutes: item?.time_limit_minutes ? Number(item.time_limit_minutes) : '',
      shuffleQuestions: Boolean(item?.settings?.shuffle_questions), manualReview: Boolean(item?.settings?.manual_review),
      showFeedbackInstant: Boolean(item?.settings?.show_feedback_instant), showCorrectAnswers: Boolean(item?.settings?.show_correct_answers),
      showOnlySubmittedAnswers: Boolean(item?.settings?.show_only_submitted_answers),
      navigationMode: item?.settings?.navigation_mode || 'sequential',
      deadlineFlexible: Boolean(item?.settings?.deadline_flexible),
      deadlineType: item?.settings?.deadline_type || 'none',
      deadlineAt: localDateTime(item?.settings?.deadline_at), deadlineDays: Number(item?.settings?.deadline_days ?? 7) || 7,
      contentBankId: item?.settings?.question_bank_id || null,
      selectedFolderIds: Array.isArray(item?.settings?.folder_ids) ? item.settings.folder_ids : [],
      selectedQuestionIds: Array.isArray(item?.settings?.question_ids) ? item.settings.question_ids.map((id) => Number(id)).filter(Boolean) : [],
      selectionMode: item?.settings?.selection_mode === 'folders'
        || (item?.settings?.selection_mode !== 'questions'
          && Array.isArray(item?.settings?.folder_ids)
          && item.settings.folder_ids.length
          && !(Array.isArray(item?.settings?.question_ids) && item.settings.question_ids.length))
        ? 'folders'
        : 'questions',
      includeStarred: item?.settings?.include_starred !== false,
      questionCount: Number(item?.settings?.question_count ?? item?.question_selection?.count ?? 10) || 10,
    });
    const settings = item?.settings || {};
    const accessMode = settings.access_mode || 'all_students';
    setExamAccess({
      mode: accessMode === 'teams' ? 'teams' : accessMode,
      teamIds: Array.isArray(settings.team_ids) ? settings.team_ids.map((id) => Number(id)).filter(Boolean) : [],
      excludedStudentIds: Array.isArray(settings.excluded_student_ids) ? settings.excluded_student_ids.map((id) => Number(id)).filter(Boolean) : [],
      selectedStudents: Array.isArray(settings.selected_students) ? settings.selected_students.map((id) => Number(id)).filter(Boolean) : [],
    });
    setSelectedQuestionItems([]);
    setManualReviewState({ reviewMode: item?.settings?.manual_review_mode || 'after_complete' });
    setPublished(String(item?.status || 'draft').toLowerCase() === 'published');
    setSaveState({ loading: false, message: '', type: '' });
    setViewMode('create');
    setActiveSection(
      options.initialSection && EXAM_BUILDER_SECTIONS.some((s) => s.id === options.initialSection)
        ? options.initialSection
        : DEFAULT_EXAM_SECTION,
    );
  };

  const handleToggleExamTeam = (teamId) => {
    setExamAccess((prev) => {
      const selected = prev.teamIds.includes(teamId);
      const teamIds = selected ? prev.teamIds.filter((id) => id !== teamId) : [...prev.teamIds, teamId];
      const stillCovered = new Set();
      accessTeams
        .filter((team) => teamIds.includes(team.id))
        .forEach((team) => {
          learnerMembersOf(team).forEach((member) => stillCovered.add(member.id));
        });
      return {
        ...prev,
        mode: 'teams',
        teamIds,
        excludedStudentIds: prev.excludedStudentIds.filter((id) => stillCovered.has(id)),
      };
    });
  };

  const handleToggleExamMember = (memberId) => {
    setExamAccess((prev) => {
      const excluded = prev.excludedStudentIds.includes(memberId);
      return {
        ...prev,
        mode: 'teams',
        excludedStudentIds: excluded
          ? prev.excludedStudentIds.filter((id) => id !== memberId)
          : [...prev.excludedStudentIds, memberId],
      };
    });
  };

  useEffect(() => {
    if (viewMode !== 'create') return undefined;
    let cancelled = false;
    setAccessTeamsLoading(true);
    setAccessTeamsError('');
    adminService.getTeams()
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : (Array.isArray(rows?.data) ? rows.data : []);
        setAccessTeams(list.map((team) => ({ ...team, id: Number(team.id) })).filter((team) => Number.isFinite(team.id)));
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to load teams for exam access:', error);
        setAccessTeams([]);
        setAccessTeamsError('Nu s-au putut încărca echipele.');
      })
      .finally(() => {
        if (!cancelled) setAccessTeamsLoading(false);
      });
    return () => { cancelled = true; };
  }, [viewMode]);

  const handleSaveExam = async (options = {}) => {
    const forcedPublished = Object.prototype.hasOwnProperty.call(options, 'published') ? Boolean(options.published) : null;
    const effectivePublished = forcedPublished === null ? published : forcedPublished;
    const title = (examSettings.title || activeExamDraft.title || '').trim();
    if (!title) { setSaveState({ loading: false, message: 'Titlul examenului este obligatoriu.', type: 'error' }); return false; }
    setSaveState({ loading: true, message: '', type: '' });
    try {
      const payload = {
        title,
        description: examSettings.description || null,
        max_score: 100,
        max_attempts: examSettings.attempts === '' || examSettings.attempts == null
          ? null
          : Math.max(1, Number(examSettings.attempts) || 1),
        time_limit_minutes: (() => {
          const raw = examSettings.timeLimitMinutes;
          if (raw === '' || raw == null) return null;
          const minutes = Number(raw);
          return Number.isFinite(minutes) && minutes > 0 ? Math.min(300, Math.round(minutes)) : null;
        })(),
        passing_score: Number(examSettings.passingScore || 0),
        is_required: Boolean(effectivePublished),
        status: effectivePublished ? 'published' : 'draft',
        settings: {
          shuffle_questions: Boolean(examSettings.shuffleQuestions), manual_review: Boolean(examSettings.manualReview),
          show_feedback_instant: Boolean(examSettings.showFeedbackInstant), show_correct_answers: Boolean(examSettings.showCorrectAnswers),
          show_only_submitted_answers: Boolean(examSettings.showOnlySubmittedAnswers),
          manual_review_mode: manualReviewState.reviewMode, navigation_mode: examSettings.navigationMode,
          deadline_flexible: Boolean(examSettings.deadlineFlexible),
          deadline_type: examSettings.deadlineType,
          deadline_at: examSettings.deadlineType === 'fixed' && examSettings.deadlineAt ? new Date(examSettings.deadlineAt).toISOString() : null,
          deadline_days: examSettings.deadlineType === 'relative' ? Math.max(1, Number(examSettings.deadlineDays || 1)) : null,
          question_bank_id: examSettings.contentBankId || null,
          instructions: examSettings.instructions || null,
          access_mode: examAccess.mode === 'teams' ? 'teams' : examAccess.mode,
          team_ids: examAccess.mode === 'teams' ? examAccess.teamIds : [],
          excluded_student_ids: examAccess.mode === 'teams' ? examAccess.excludedStudentIds : [],
          selected_students: examAccess.mode === 'selected_students' ? examAccess.selectedStudents : [],
          selection_mode: examSettings.selectionMode === 'questions' ? 'questions' : 'folders',
          folder_ids: examSettings.selectionMode === 'questions' ? [] : examSettings.selectedFolderIds,
          question_ids: examSettings.selectionMode === 'questions' ? examSettings.selectedQuestionIds : [],
          include_starred: examSettings.includeStarred !== false,
          question_count: Number(examSettings.questionCount || 0),
        },
        question_selection: examSettings.selectionMode === 'questions'
          ? { mode: 'random', count: Number(examSettings.questionCount || 0), question_ids: examSettings.selectedQuestionIds, include_starred: examSettings.includeStarred !== false }
          : { mode: 'random', count: Number(examSettings.questionCount || 0), folder_ids: examSettings.selectedFolderIds, include_starred: examSettings.includeStarred !== false },
      };
      if (activeExamDraft.id) {
        const response = await adminService.updateExam(activeExamDraft.id, payload);
        const updatedExam = response?.exam || response;
        const normalizedUpdatedExam = {
          ...updatedExam,
          settings: {
            ...(updatedExam?.settings || {}),
            question_count: payload.settings.question_count,
          },
          question_selection: {
            ...(updatedExam?.question_selection || {}),
            count: payload.question_selection.count,
          },
        };
        setItems((prev) => prev.map((item) => (item.id === normalizedUpdatedExam.id ? { ...item, ...normalizedUpdatedExam } : item)));
      } else {
        const response = await adminService.createExam(payload);
        const createdExam = response?.exam || response;
        const normalizedCreatedExam = {
          ...createdExam,
          settings: {
            ...(createdExam?.settings || {}),
            question_count: payload.settings.question_count,
          },
          question_selection: {
            ...(createdExam?.question_selection || {}),
            count: payload.question_selection.count,
          },
        };
        setItems((prev) => [normalizedCreatedExam, ...prev]);
        setActiveExamDraft((prev) => ({ ...prev, id: createdExam?.id || prev.id, title }));
      }
      setPublished(effectivePublished);
      setSaveState({ loading: false, message: forcedPublished === null ? 'Examen salvat cu succes.' : effectivePublished ? 'Examen publicat cu succes.' : 'Examen retras in draft.', type: 'success' });
      return true;
    } catch (e) {
      console.error('Failed to save exam:', e);
      setSaveState({ loading: false, message: e?.response?.data?.message || 'Nu s-a putut salva examenul.', type: 'error' });
      return false;
    }
  };

  const handleTogglePublishedNow = async () => {
    const nextPublished = !published; setPublished(nextPublished); setPublishToggleLoading(true);
    try { const ok = await handleSaveExam({ published: nextPublished }); if (!ok) setPublished(!nextPublished); } finally { setPublishToggleLoading(false); }
  };
  const handleOpenPreview = async () => {
    if (!activeExamDraft.id) { toastError('Salvează examenul înainte de previzualizare.'); return; }
    setShowPreviewModal(true); setPreviewLoading(true); setPreviewError(''); setPreviewData(null);
    try { setPreviewData(await adminService.previewExam(activeExamDraft.id)); }
    catch (e) { console.error('Failed to preview exam:', e); setPreviewError(e?.response?.data?.message || 'Nu s-a putut încărca previzualizarea examenului.'); }
    finally { setPreviewLoading(false); }
  };

  const loadExamContentSources = useCallback(async () => {
    setContentBanksLoading(true);
    setContentBanksError('');
    try {
      const banks = await adminService.getQuestionBanks();
      setContentBanks(Array.isArray(banks) ? banks : []);
    } catch (e) {
      console.error('Failed to load content sources:', e);
      setContentBanks([]);
      setContentBanksError('Nu s-au putut încărca băncile de întrebări.');
    } finally {
      setContentBanksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode !== 'create' || activeSection !== 'questions') return;
    void loadExamContentSources();
  }, [viewMode, activeSection, loadExamContentSources]);

  useEffect(() => {
    if (viewMode !== 'create' || activeSection !== 'questions') return;
    const ids = Array.isArray(examSettings.selectedQuestionIds) ? examSettings.selectedQuestionIds : [];
    if (!ids.length || selectedQuestionItems.length === ids.length) return;
    let cancelled = false;
    (async () => {
      try {
        const payload = await adminService.listQuestions({ ids: ids.join(','), per_page: Math.max(ids.length, 1) });
        if (cancelled) return;
        const rows = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
        setSelectedQuestionItems(rows.map((question) => ({
          id: Number(question.id),
          content: question.content || '',
          type: question.type,
          origin: question.question_bank?.title || question.test?.title || 'Selectată',
          is_starred: Boolean(question.is_starred),
          testId: Number(question.test_id || question.test?.id || question.usage?.tests?.[0]?.id || 0) || null,
          bankId: Number(question.question_bank_id || question.question_bank?.id || 0) || null,
        })));
      } catch (e) {
        console.error('Failed to load selected questions:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [viewMode, activeSection, examSettings.selectedQuestionIds, selectedQuestionItems.length]);
  const handleToggleQuestion = (question, origin = 'Selectată') => {
    const id = Number(question?.id);
    if (!Number.isFinite(id)) return;
    setExamSettings((prev) => {
      const selectedQuestionIds = Array.isArray(prev.selectedQuestionIds) ? prev.selectedQuestionIds : [];
      const exists = selectedQuestionIds.includes(id);
      const nextIds = exists ? selectedQuestionIds.filter((questionId) => Number(questionId) !== id) : [...selectedQuestionIds, id];
      return {
        ...prev,
        selectionMode: 'questions',
        selectedQuestionIds: nextIds,
      };
    });
    setSelectedQuestionItems((prev) => {
      if (prev.some((item) => Number(item.id) === id)) return prev.filter((item) => Number(item.id) !== id);
      return [...prev, {
        id,
        content: question.content || question.question_text || '',
        type: question.type,
        origin,
        is_starred: Boolean(question.is_starred),
        testId: Number(question.test_id || question.test?.id || 0) || null,
        bankId: Number(question.question_bank_id || question.question_bank?.id || 0) || null,
      }];
    });
  };
  const handleAddQuestions = (questions, origin = 'Selectată') => {
    const incoming = (Array.isArray(questions) ? questions : [])
      .map((question) => ({
        id: Number(question?.id),
        content: question.content || question.question_text || '',
        type: question.type,
        origin,
        is_starred: Boolean(question.is_starred),
        testId: Number(question.test_id || question.test?.id || 0) || null,
        bankId: Number(question.question_bank_id || question.question_bank?.id || 0) || null,
      }))
      .filter((question) => Number.isFinite(question.id));
    if (!incoming.length) return 0;
    setExamSettings((prev) => {
      const have = new Set((prev.selectedQuestionIds || []).map(Number));
      const extraIds = incoming.filter((question) => !have.has(question.id)).map((question) => question.id);
      if (!extraIds.length) return prev;
      const selectedQuestionIds = [...(prev.selectedQuestionIds || []), ...extraIds];
      return {
        ...prev,
        selectionMode: 'questions',
        selectedQuestionIds,
      };
    });
    setSelectedQuestionItems((prev) => {
      const have = new Set(prev.map((item) => Number(item.id)));
      const extra = incoming.filter((question) => !have.has(question.id));
      return extra.length ? [...prev, ...extra] : prev;
    });
    return incoming.length;
  };
  const handleClearQuestions = () => {
    setExamSettings((prev) => ({
      ...prev,
      selectedQuestionIds: [],
    }));
    setSelectedQuestionItems([]);
  };
  const handleConfirmContentSelection = async () => {
    setContentConfirmLoading(true);
    try {
      const ok = await handleSaveExam();
      if (ok) toastSuccess('Selecția de întrebări a fost salvată.');
    } finally {
      setContentConfirmLoading(false);
    }
  };


  const buildExamMetaLine = (item) => {
    const configuredQuestionCount = Number(
      item?.settings?.question_count
        ?? item?.question_selection?.count
        ?? item?.questions_count
        ?? 0,
    );
    const parts = [
      `${configuredQuestionCount} întrebări în examen`,
      `${Number(item.passing_score ?? 0)}% prag`,
      item.max_attempts != null ? `${item.max_attempts} încercări` : 'Nelimitat',
    ].filter(Boolean);
    return parts.join(' · ');
  };

  const listView = (
    <div className="admin-tests-page admin-exams-page admin-content-list-page">
      <header className="admin-content-list-header">
        <div className="admin-content-list-header__copy">
          <p className="admin-content-list-header__kicker">Conținut</p>
          <h1>Examene</h1>
          <p className="admin-content-list-header__lead">
            Examene independente — întrebări, acces și statistici.
          </p>
          <div className="admin-content-list-stats" aria-label="Rezumat">
            <span>Total<strong>{listStats.all}</strong></span>
            <span>Ciornă<strong>{listStats.draft}</strong></span>
            <span>Publicate<strong>{listStats.published}</strong></span>
            <span>Arhivate<strong>{listStats.archived}</strong></span>
          </div>
        </div>
        {canMutateInAdminArea ? (
          <div className="admin-content-list-header__actions">
            <button type="button" className="lms-btn-primary admin-content-list-btn-primary" onClick={handleOpenCreateModal}>
              Creează examen
            </button>
          </div>
        ) : null}
      </header>

      <div className="admin-content-list-toolbar">
        <div className="admin-content-list-search">
          <input
            type="search"
            placeholder="Caută după titlu sau curs…"
            aria-label="Caută examene"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="admin-content-list-filter">
          <label htmlFor="admin-exams-status-filter">Status</label>
          <select
            id="admin-exams-status-filter"
            value={listStatusFilter}
            onChange={(e) => setListStatusFilter(e.target.value)}
          >
            {FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="admin-content-list-skeleton" aria-busy="true" aria-label="Se încarcă examenele">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-content-list-skeleton__card" />
          ))}
        </div>
      ) : error ? (
        <div className="admin-content-list-empty">{error}</div>
      ) : filteredItems.length === 0 ? (
        <div className="admin-content-list-empty">
          {items.length === 0
            ? 'Niciun examen încă. Creează primul examen.'
            : 'Niciun rezultat — schimbă filtrul sau căutarea.'}
        </div>
      ) : (
        <div className="admin-content-list-grid">
          {filteredItems.map((item) => {
            const status = String(item?.status || 'draft').toLowerCase();
            const busy = listActionId === item.id;

            const secondaryActions = canMutateInAdminArea
              ? [
                  {
                    label: 'Rezultate',
                    onClick: () => handleOpenExistingExam(item, { initialSection: 'statistics' }),
                    disabled: busy,
                  },
                  {
                    label: duplicatingExamId === item.id ? 'Se duplică…' : 'Duplică',
                    onClick: () => handleDuplicateExam(item),
                    disabled: busy || duplicatingExamId === item.id,
                  },
                  ...(status !== 'published'
                    ? [{ label: 'Publică', onClick: () => patchExamListStatus(item, 'published'), disabled: busy, emphasis: true }]
                    : [{ label: 'Arhivează', onClick: () => patchExamListStatus(item, 'archived'), disabled: busy }]),
                  ...(status === 'archived'
                    ? [{ label: 'Ciornă', onClick: () => patchExamListStatus(item, 'draft'), disabled: busy }]
                    : []),
                  { label: 'Șterge', onClick: () => setDeleteConfirmExam(item), disabled: busy, danger: true },
                ]
              : [];

            return (
              <AdminContentItemCard
                key={item.id}
                title={item.title || 'Examen fără titlu'}
                badge={item.course_title || 'Examen independent'}
                status={status}
                statusLabel={examStatusLabelRo(item.status)}
                metaLine={buildExamMetaLine(item)}
                primaryAction={{
                  label: 'Deschide builder-ul',
                  onClick: () => handleOpenExistingExam(item),
                  disabled: busy,
                }}
                actions={secondaryActions}
              />
            );
          })}
        </div>
      )}
    </div>
  );

  const patchExamSettings = (patch) => setExamSettings((prev) => ({ ...prev, ...patch }));
  const unlimitedAttempts = examSettings.attempts === '' || examSettings.attempts == null;
  const sectionBody = activeSection === 'settings' ? (
    <div className="admin-exams-modern-section admin-exams-builder-form-root">
      <div className="va-ts admin-exams-settings">
        <section className="va-ts__section" aria-labelledby="exam-ts-info">
          <h3 id="exam-ts-info" className="va-ts__title">Informații</h3>
          <div className="va-ts__grid">
            <div className="va-ts__field va-ts__field--full">
              <label htmlFor="exam-title">Titlu examen</label>
              <input
                id="exam-title"
                type="text"
                className="va-ts__input"
                value={examSettings.title}
                onChange={(e) => patchExamSettings({ title: e.target.value })}
                placeholder="Ex.: Examen final"
              />
            </div>
          </div>
        </section>

        <section className="va-ts__section" aria-labelledby="exam-ts-run">
          <h3 id="exam-ts-run" className="va-ts__title">Desfășurare</h3>
          <div className="va-ts__grid va-ts__grid--three">
            <div className="va-ts__field">
              <label htmlFor="exam-time">Durată</label>
              <div className="va-ts__suffix-input">
                <input
                  id="exam-time"
                  type="number"
                  min={1}
                  max={300}
                  className="va-ts__input"
                  placeholder="Fără limită"
                  value={examSettings.timeLimitMinutes}
                  onChange={(e) => {
                    const next = e.target.value;
                    patchExamSettings({ timeLimitMinutes: next === '' ? '' : Math.max(1, Math.min(300, Number(next) || 1)) });
                  }}
                />
                <span aria-hidden="true">min</span>
              </div>
              <p className="va-ts__hint">Din momentul în care elevul începe. Gol = fără limită.</p>
            </div>
            <div className="va-ts__field">
              <label htmlFor="exam-attempts">Încercări</label>
              <div className="va-ts__inline">
                <input
                  id="exam-attempts"
                  type="number"
                  min={1}
                  max={20}
                  className="va-ts__input"
                  placeholder="∞"
                  value={unlimitedAttempts ? '' : examSettings.attempts}
                  disabled={unlimitedAttempts}
                  onChange={(e) => patchExamSettings({ attempts: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
                />
                <label className="va-ts__switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={unlimitedAttempts}
                    onChange={(e) => patchExamSettings({ attempts: e.target.checked ? '' : 1 })}
                  />
                  <span className="va-ts__switch-track" aria-hidden="true" />
                  <span>Nelimitate</span>
                </label>
              </div>
            </div>
            <div className="va-ts__field">
              <PassingScoreByQuestions
                questionCount={Math.min(
                  Math.max(1, Number(examSettings.questionCount || 1)),
                  Math.max(1, isQuestionMode ? selectedQuestionCount || 1 : Number(examSettings.questionCount || 1)),
                )}
                passingScore={examSettings.passingScore}
                onPassingScoreChange={(next) => patchExamSettings({ passingScore: next })}
              />
            </div>
          </div>
        </section>

        <section className="va-ts__section" aria-labelledby="exam-ts-deadline">
          <h3 id="exam-ts-deadline" className="va-ts__title">Termen limită</h3>
          <p className="va-ts__hint">Până când poate fi deschis examenul. Nu depinde de durată.</p>
          <div className="va-ts__grid">
            <div className="va-ts__field">
              <label htmlFor="exam-deadline-type">Tip termen</label>
              <select
                id="exam-deadline-type"
                className="va-ts__input"
                value={examSettings.deadlineType}
                onChange={(e) => patchExamSettings({ deadlineType: e.target.value })}
              >
                <option value="none">Fără termen</option>
                <option value="fixed">Dată fixă</option>
                <option value="relative">Zile de la începere</option>
              </select>
            </div>
            {examSettings.deadlineType === 'fixed' ? (
              <div className="va-ts__field">
                <label htmlFor="exam-deadline-at">Dată și oră limită</label>
                <input
                  id="exam-deadline-at"
                  type="datetime-local"
                  className="va-ts__input"
                  value={examSettings.deadlineAt}
                  onChange={(e) => patchExamSettings({ deadlineAt: e.target.value })}
                />
              </div>
            ) : null}
            {examSettings.deadlineType === 'relative' ? (
              <div className="va-ts__field">
                <label htmlFor="exam-deadline-days">Zile disponibile</label>
                <div className="va-ts__suffix-input">
                  <input
                    id="exam-deadline-days"
                    type="number"
                    min={1}
                    max={365}
                    className="va-ts__input"
                    value={examSettings.deadlineDays}
                    onChange={(e) => patchExamSettings({ deadlineDays: Math.max(1, Number(e.target.value || 1)) })}
                  />
                  <span aria-hidden="true">zile</span>
                </div>
              </div>
            ) : null}
          </div>
          {examSettings.deadlineType !== 'none' ? (
            <div className="va-ts__toggles">
              <label className={`va-ts__toggle${examSettings.deadlineFlexible ? ' is-on' : ''}`}>
                <span className="va-ts__toggle-text">
                  <strong>Termen flexibil</strong>
                  <small>Elevul poate trece examenul și după expirarea termenului.</small>
                </span>
                <span className="va-ts__switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={Boolean(examSettings.deadlineFlexible)}
                    onChange={(e) => patchExamSettings({ deadlineFlexible: e.target.checked })}
                  />
                  <span className="va-ts__switch-track" aria-hidden="true" />
                </span>
              </label>
            </div>
          ) : null}
        </section>

        <section className="va-ts__section" aria-labelledby="exam-ts-behaviour">
          <h3 id="exam-ts-behaviour" className="va-ts__title">Comportament</h3>
          <div className="va-ts__grid">
            <div className="va-ts__field">
              <label htmlFor="exam-navigation">Navigare între întrebări</label>
              <select
                id="exam-navigation"
                className="va-ts__input"
                value={examSettings.navigationMode}
                onChange={(e) => patchExamSettings({ navigationMode: e.target.value })}
              >
                <option value="sequential">Secvențială</option>
                <option value="free">Liberă</option>
              </select>
            </div>
            <div className="va-ts__field">
              <label htmlFor="exam-review-mode">Revizuire manuală</label>
              <select
                id="exam-review-mode"
                className="va-ts__input"
                value={manualReviewState.reviewMode}
                onChange={(e) => setManualReviewState((prev) => ({ ...prev, reviewMode: e.target.value }))}
              >
                <option value="after_complete">După finalizare</option>
                <option value="partial">Parțial</option>
              </select>
            </div>
          </div>
          <div className="va-ts__toggles">
            {[
              ['shuffleQuestions', 'Amestecă întrebările', 'Ordinea întrebărilor diferă la fiecare încercare.'],
              ['manualReview', 'Necesită verificare manuală', 'Rezultatul rămâne în așteptare până la corectare.'],
              ['showFeedbackInstant', 'Arată rezultatul imediat', 'Elevul vede scorul imediat după trimitere.'],
            ].map(([key, label, hint]) => (
              <label key={key} className={`va-ts__toggle${examSettings[key] ? ' is-on' : ''}`}>
                <span className="va-ts__toggle-text">
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
                <span className="va-ts__switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={Boolean(examSettings[key])}
                    onChange={(e) => patchExamSettings({ [key]: e.target.checked })}
                  />
                  <span className="va-ts__switch-track" aria-hidden="true" />
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="va-ts__section" aria-labelledby="exam-ts-results">
          <h3 id="exam-ts-results" className="va-ts__title">Afișarea răspunsurilor după examen</h3>
          <p className="va-ts__hint">O singură opțiune: răspunsurile corecte și cele date de elev nu se afișează împreună.</p>
          <div className="va-ts__choices" role="radiogroup" aria-labelledby="exam-ts-results">
            {TEST_RESULTS_DISPLAY_OPTIONS.map((option) => {
              const active = getExamResultsDisplayMode(examSettings) === option.id;
              return (
                <label key={option.id} className={`va-ts__choice${active ? ' is-active' : ''}`}>
                  <input
                    type="radio"
                    name="exam-results-display"
                    value={option.id}
                    checked={active}
                    onChange={() => patchExamSettings(patchExamResultsDisplayMode(option.id))}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    {option.hint ? <small>{option.hint}</small> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  ) : activeSection === 'questions' ? (
    <div className="admin-exams-modern-section admin-exams-builder-form-root admin-exams-questions-workspace">
      <ExamContentPicker
        examSettings={examSettings}
        setExamSettings={setExamSettings}
        selectedQuestionItems={selectedQuestionItems}
        onToggleQuestion={handleToggleQuestion}
        onAddQuestions={handleAddQuestions}
        onClearQuestions={handleClearQuestions}
        onPatchSelectedQuestion={(id, patch) => {
          setSelectedQuestionItems((prev) => prev.map((row) => (
            Number(row.id) === Number(id) ? { ...row, ...patch } : row
          )));
        }}
        canMutate={canMutateInAdminArea}
        contentBanks={contentBanks}
        contentBanksLoading={contentBanksLoading}
        contentBanksError={contentBanksError}
        contentSearch={contentSearch}
        setContentSearch={setContentSearch}
        contentSort={contentSort}
        setContentSort={setContentSort}
        contentOnlyWithQuestions={contentOnlyWithQuestions}
        setContentOnlyWithQuestions={setContentOnlyWithQuestions}
        filteredContentBanks={filteredContentBanks}
        onConfirm={handleConfirmContentSelection}
        confirmLoading={contentConfirmLoading}
      />
    </div>
  ) : activeSection === 'access' ? (
    <div className="admin-exams-modern-section admin-exams-builder-form-root">
      <div className="admin-exams-builder-panel">
        <section className="admin-exams-builder-card va-card-shell va-card-shell--uniform">
          <div className="admin-exams-builder-card-head">
            <h3 className="admin-exams-builder-card-title">Acces la examen</h3>
          </div>
          <p className="admin-exams-access-lead">
            Alege una sau mai multe echipe. Toți membrii sunt bifați din start. Deschide echipa ca să scoți pe cineva. Un membru nou intrat în echipă primește examenul automat.
          </p>
          {examAccess.mode === 'all_students' && examAccess.teamIds.length === 0 ? (
            <p className="admin-exams-modern-empty-note">Acum îl văd toți utilizatorii. După ce alegi echipe și salvezi, rămân doar acele echipe.</p>
          ) : null}
          {examAccess.mode === 'selected_students' && examAccess.teamIds.length === 0 ? (
            <p className="admin-exams-modern-empty-note">Acum e limitat la {examAccess.selectedStudents.length} utilizatori aleși manual. După ce salvezi echipe, regula veche se înlocuiește.</p>
          ) : null}
          {examAccess.mode === 'teams' && examAccess.teamIds.length === 0 ? (
            <p className="admin-exams-modern-empty-note">Nicio echipă selectată — elevii nu văd examenul până alegi cel puțin una.</p>
          ) : null}
          {accessTeamsError ? <p className="admin-form-error-inline" role="alert">{accessTeamsError}</p> : null}
          {accessTeamsLoading ? (
            <p className="admin-exams-modern-empty-note">Se încarcă echipele...</p>
          ) : accessTeams.length === 0 && !accessTeamsError ? (
            <p className="admin-exams-modern-empty-note">Nu există echipe. Creează una din Echipe, apoi revino aici.</p>
          ) : (
            <div className="admin-exams-team-access">
              {accessTeams.map((team) => {
                const members = learnerMembersOf(team);
                const selected = examAccess.teamIds.includes(team.id);
                const included = members.filter((member) => !examAccess.excludedStudentIds.includes(member.id)).length;
                return (
                  <div key={team.id} className={`admin-exams-team-access-item${selected ? ' is-selected' : ''}`}>
                    <div className="admin-exams-team-access-head">
                      <label>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => handleToggleExamTeam(team.id)}
                        />
                        <span className="admin-exams-team-access-avatar" aria-hidden>
                          {(team.name || 'E').trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="admin-exams-team-access-copy">
                          <strong>{team.name || `Echipa ${team.id}`}</strong>
                          <small>
                            {selected
                              ? `${included} din ${members.length} ${members.length === 1 ? 'elev' : 'elevi'}`
                              : `${members.length} ${members.length === 1 ? 'elev' : 'elevi'}`}
                          </small>
                        </span>
                      </label>
                      <button
                        type="button"
                        className="admin-exams-team-access-expand"
                        onClick={() => setOpenTeamId(team.id)}
                        aria-haspopup="dialog"
                        aria-label="Arată elevii"
                        title="Arată elevii"
                      >
                        <ChevronRight size={16} aria-hidden />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {(() => {
            const team = accessTeams.find((entry) => entry.id === openTeamId);
            if (!team) return null;
            const members = learnerMembersOf(team);
            const selected = examAccess.teamIds.includes(team.id);
            const included = members.filter((member) => !examAccess.excludedStudentIds.includes(member.id)).length;
            return (
              <Modal
                isOpen
                onClose={() => setOpenTeamId(null)}
                closeOnBackdropClick
                closeOnEscape
                ariaLabelledby="exam-team-members-title"
                contentClassName="admin-exams-team-modal"
              >
                <div className="admin-exams-team-modal-body">
                  <header className="admin-exams-team-modal-head">
                    <span className="admin-exams-team-access-avatar" aria-hidden>
                      {(team.name || 'E').trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="admin-exams-team-access-copy">
                      <strong id="exam-team-members-title">{team.name || `Echipa ${team.id}`}</strong>
                      <small>
                        {selected
                          ? `${included} din ${members.length} elevi primesc examenul`
                          : `${members.length} ${members.length === 1 ? 'elev' : 'elevi'} · echipa nu e bifată`}
                      </small>
                    </div>
                  </header>
                  {!selected ? (
                    <button
                      type="button"
                      className="admin-exams-team-modal-enable"
                      onClick={() => handleToggleExamTeam(team.id)}
                    >
                      Bifează echipa
                    </button>
                  ) : null}
                  <div className="admin-exams-team-access-members">
                    {members.length === 0 ? (
                      <p>Niciun elev în echipă.</p>
                    ) : members.map((member) => (
                      <label key={member.id}>
                        <input
                          type="checkbox"
                          checked={selected && !examAccess.excludedStudentIds.includes(member.id)}
                          disabled={!selected}
                          onChange={() => handleToggleExamMember(member.id)}
                        />
                        <span>{member.name}</span>
                        <small>{member.email}</small>
                      </label>
                    ))}
                  </div>
                  <div className="admin-exams-team-modal-actions">
                    <button type="button" className="admin-exams-team-modal-done" onClick={() => setOpenTeamId(null)}>
                      Gata
                    </button>
                  </div>
                </div>
              </Modal>
            );
          })()}
        </section>
      </div>
    </div>
  ) : activeSection === 'statistics' ? (
    <div className="admin-exams-modern-section admin-exams-builder-form-root">
      <div className="admin-exams-builder-panel">
        <div className="admin-exams-statistics admin-exams-builder-statistics-card">
          <div className="admin-exams-statistics-head">
            <h2>Statistici</h2>
            <button
              type="button"
              className="admin-exams-section-refresh-btn"
              onClick={() => handleRefreshStatistics(true)}
              disabled={statisticsLoading || !activeExamDraft.id}
            >
              {statisticsLoading ? 'Se încarcă…' : 'Actualizează'}
            </button>
          </div>

          {!activeExamDraft.id ? (
            <div className="admin-exams-statistics-empty">Salvează sau deschide un examen pentru a vedea statisticile.</div>
          ) : (
            <>
              <div className="admin-exams-statistics-tabs">
                <button type="button" className={statisticsTab === 'students' ? 'is-active' : ''} onClick={() => setStatisticsTab('students')}>
                  Utilizatori
                </button>
                <button type="button" className={statisticsTab === 'questions' ? 'is-active' : ''} onClick={() => setStatisticsTab('questions')}>
                  Întrebări
                </button>
              </div>

              {statisticsTab === 'students' ? (
                <TestResultsPanel
                  kind="exam"
                  entityId={activeExamDraft.id}
                  entityTitle={examSettings.title?.trim() || activeExamDraft.title || 'Examen'}
                />
              ) : statisticsQuestionRows.length === 0 ? (
                <div className="admin-exams-statistics-empty">Nu există analize pe întrebări.</div>
              ) : (
                <div className="admin-exams-question-analytics-list">
                  {statisticsQuestionRows.map((question, index) => (
                    <article key={question.question_id || index} className="admin-exams-question-analytics-card">
                      <div className="admin-exams-question-analytics-head">
                        <h4>{question.question_text || `Întrebarea ${index + 1}`}</h4>
                        <span>{typeLabel(question.question_type || question.type || 'multiple_choice')}</span>
                      </div>
                      <div className="admin-exams-question-analytics-metrics">
                        <span>Rată corect: {question.correct_rate != null ? `${Math.round(question.correct_rate)}%` : '-'}</span>
                        <span>Încercări: {question.attempts_count ?? 0}</span>
                        <span>Scor mediu: {question.average_score != null ? Number(question.average_score).toFixed(2) : '-'}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const createView = (
    <div className="admin-tests-page admin-exams-modern-page admin-exams-page admin-exams-builder-redesign admin-exams-builder-refined">
      <div className="admin-exams-builder-shell">
        <header
          className="admin-exams-builder-top"
          style={{
            '--admin-exams-builder-accent': builderHeroAccent,
          }}
        >
          <div className="admin-exams-builder-top-left">
            <button
              type="button"
              className="admin-exams-builder-back-btn va-btn-back admin-back-btn"
              onClick={() => setViewMode('list')}
            >
              <ArrowLeft size={18} aria-hidden />
              Înapoi
            </button>
            <div className="admin-exams-builder-title-wrap">
              <p className="admin-exams-builder-kicker">Builder examen</p>
              <h1 className="admin-exams-builder-title">{builderHeroTitle}</h1>
            </div>
          </div>

          <div className="admin-exams-builder-actions">
            <PublishSwitch
              published={published}
              disabled={publishToggleLoading || saveState.loading}
              onToggle={handleTogglePublishedNow}
            />
            <button
              type="button"
              className="admin-exams-builder-ghost-btn"
              onClick={handleOpenPreview}
              disabled={!activeExamDraft.id || previewLoading}
            >
              <Eye size={17} aria-hidden />
              Previzualizare
            </button>
            {canMutateInAdminArea ? (
              <button
                type="button"
                className="va-btn-save admin-exams-builder-save-btn"
                onClick={() => handleSaveExam()}
                disabled={saveState.loading || publishToggleLoading}
              >
                <Save size={17} aria-hidden />
                {saveState.loading ? 'Se salvează...' : 'Salvează'}
              </button>
            ) : null}
          </div>
        </header>

        <nav className="admin-exams-builder-workflow" aria-label="Pași builder examen">
          <div className="admin-exams-builder-rail-block">
            <span className="admin-exams-builder-rail-label">Workflow</span>
            <div className="admin-exams-builder-tabs-rail">
              <div className="admin-exams-builder-tabs" role="tablist">
                {EXAM_BUILDER_SECTIONS.map((section, idx) => (
                  <button
                    key={section.id}
                    type="button"
                    role="tab"
                    aria-selected={activeSection === section.id}
                    className={`admin-exams-builder-tab${activeSection === section.id ? ' is-active' : ''}`}
                    onClick={() => setActiveSection(section.id)}
                  >
                    <span className="admin-exams-builder-tab-num" aria-hidden>
                      {idx + 1}
                    </span>
                    <span className="admin-exams-builder-tab-icon" aria-hidden>
                      {renderBuilderSectionIcon(section.id)}
                    </span>
                    <span className="admin-exams-builder-tab-text">
                      <strong>{section.label}</strong>
                      <small>{section.hint}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </nav>

        <main className="admin-exams-builder-main">
          <div className={`admin-exams-builder-board ${activeSection === 'questions' ? 'is-question-picker' : ''}`}>
            <aside className="admin-exams-builder-rail" aria-label="Rezumat builder examen">
              <section className="admin-exams-builder-summary" aria-label="Rezumat rapid examen">
                <div className="admin-exams-builder-summary-head">
                  <span className="admin-exams-builder-rail-label">Rezumat</span>
                </div>
                <div className="admin-exams-builder-summary-card">
                  <span>Status</span>
                  <strong>{published ? 'Publicat' : 'Ciornă'}</strong>
                </div>
                <div className="admin-exams-builder-summary-card">
                  <span>Întrebări</span>
                  <strong>{Number(examSettings.questionCount || 0)}</strong>
                </div>
                <div className="admin-exams-builder-summary-card">
                  <span>Acces</span>
                  <strong>{accessSummaryLabel}</strong>
                </div>
                <div className="admin-exams-builder-summary-card">
                  <span>Review</span>
                  <strong>{examSettings.manualReview ? 'Manual' : 'Auto'}</strong>
                </div>
              </section>
            </aside>

            <section
              className="admin-exams-builder-workspace"
              aria-label={activeBuilderSection?.label ? `Secțiune ${activeBuilderSection.label}` : 'Conținut builder examen'}
            >
              {saveState.message ? (
                <p className={`admin-exams-save-message is-${saveState.type}`}>{saveState.message}</p>
              ) : null}
              <div className="admin-exams-builder-stage">{sectionBody}</div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
  return (
    <>
      {viewMode === 'list' ? listView : createView}
      {deleteConfirmExam ? (
        <div className="admin-exams-create-modal-overlay">
          <div className="admin-exams-delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-exams-delete-confirm-hero">
              <span className="admin-exams-delete-confirm-icon" aria-hidden="true">!</span>
              <div>
                <span className="admin-exams-delete-confirm-kicker">Acțiune ireversibilă</span>
                <h3>Ștergi examenul?</h3>
              </div>
            </div>
            <p className="admin-exams-delete-confirm-lead">
              <strong>{deleteConfirmTitle}</strong> va fi eliminat definitiv impreuna cu istoricul lui.
            </p>
            <p className="admin-exams-delete-confirm-hint">
              Acțiunea nu poate fi anulată. Dacă vrei doar să îl ascunzi, arhivează-l.
            </p>
            <div className="admin-exams-delete-confirm-note">
              Se vor șterge și datele aferente rezultatelor, dacă există.
            </div>
            <div className="admin-exams-delete-confirm-actions">
              <button type="button" className="admin-exams-list-btn-secondary" disabled={listActionId} onClick={() => setDeleteConfirmExam(null)}>
                Anuleaza
              </button>
              <button type="button" className="va-btn-delete admin-exams-list-btn-danger-solid" disabled={listActionId} onClick={handleConfirmDeleteExam}>
                {listActionId ? 'Se șterge...' : 'Da, șterge'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <Modal
        isOpen={showCreateModal}
        onClose={() => !creatingExam && setShowCreateModal(false)}
        closeOnBackdropClick={!creatingExam}
        closeOnEscape={!creatingExam}
        unstyledContent
        ariaLabelledby="exam-create-title"
        className="admin-exam-create-overlay"
      >
        <form
          className="admin-team-modal admin-exam-create-panel"
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirmCreate();
          }}
        >
          <div className="admin-team-modal-header">
            <h2 id="exam-create-title" className="admin-team-modal-title">Examen nou</h2>
            <button
              type="button"
              className="admin-team-modal-close va-close-btn"
              onClick={() => !creatingExam && setShowCreateModal(false)}
              aria-label="Închide"
            >
              <X size={18} weight="bold" aria-hidden="true" />
            </button>
          </div>
          <div className="admin-team-modal-body">
            <label className="admin-form-label" htmlFor="exam-create-title-input">Titlu</label>
            <input
              id="exam-create-title-input"
              type="text"
              className="admin-form-input"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="Ex: Examen final modul 1"
              data-modal-initial-focus
              required
              disabled={creatingExam}
            />
            <label className="admin-form-label" htmlFor="exam-create-description">Descriere</label>
            <textarea
              id="exam-create-description"
              className="admin-form-input"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              rows={3}
              placeholder="Opțional"
              disabled={creatingExam}
            />
            {createError ? <p className="admin-form-error-inline" role="alert">{createError}</p> : null}
          </div>
          <div className="admin-modal-actions">
            <button type="button" className="lms-btn-secondary" onClick={() => setShowCreateModal(false)} disabled={creatingExam}>
              Anulare
            </button>
            <button type="submit" className="lms-btn-primary" disabled={!createTitle.trim() || creatingExam}>
              {creatingExam ? 'Se creează...' : 'Creează'}
            </button>
          </div>
        </form>
      </Modal>
      {showPreviewModal ? (
        <div className="admin-exams-create-modal-overlay">
          <div className="admin-exams-content-modal admin-exams-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-exams-content-modal-head">
              <div>
                <span className="admin-exams-content-subtitle">Verifici exact cum se vede pentru elev.</span>
                <h3>Previzualizare examen</h3>
              </div>
              {previewData ? (
                <div className="admin-exams-content-mode-option">
                  <span>Întrebări</span>
                  <strong>{previewQuestionCount}</strong>
                </div>
              ) : null}
            </div>
            {previewLoading ? (
              <p>Se încarcă previzualizarea...</p>
            ) : previewError ? (
              <p className="admin-exams-create-modal-error">{previewError}</p>
            ) : previewData ? (
              <div className="admin-exams-preview-body">
                <h4>{previewData.title || 'Examen fără titlu'}</h4>
                {previewData.description ? <p>{previewData.description}</p> : null}
                {previewData.instructions ? (
                  <div className="admin-exams-preview-instructions">
                    <strong>Instructiuni elev:</strong>
                    <p>{previewData.instructions}</p>
                  </div>
                ) : null}
                <div className="admin-exams-preview-meta">
                  <span>Prag: {previewData.passing_score ?? 70}%</span>
                  <span>Timp: {previewData.time_limit_minutes ? `${previewData.time_limit_minutes} min` : 'nelimitat'}</span>
                  <span>Incercari: {previewData.max_attempts ?? 'Nelimitat'}</span>
                </div>
                <div className="admin-exams-preview-questions">
                  {(Array.isArray(previewData.questions) ? previewData.questions : []).map((question, index) => (
                    <article key={question.id || index} className="admin-exams-preview-question">
                      <h5>{index + 1}. {question.text}</h5>
                      {Array.isArray(question.options) && question.options.length > 0 ? (
                        <ul>
                          {question.options.map((option, optionIndex) => <li key={`${question.id || index}-${optionIndex}`}>{option}</li>)}
                        </ul>
                      ) : (
                        <small>Răspuns deschis</small>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <p>Nu există date de previzualizare.</p>
            )}
            <div className="admin-exams-create-modal-actions admin-exams-content-modal-actions">
              <button type="button" className="cancel" onClick={() => setShowPreviewModal(false)}>Închide</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
