import { useCallback, useEffect, useRef, useState } from 'react';
import { adminService } from '../services/api';
import {
  TEST_EDITOR_DEFAULT,
  getDefaultAnswersByType,
  normalizeBuilderQuestion,
  normalizeInlineQuestionType,
  serializeAnswersForQuestionApi,
} from '../utils/testQuestionBuilder';

export function useInlineTestEditor({
  showToast,
  canMutateInAdminArea = true,
  courseContext = null,
  initialTestId = null,
  initialTab = 'questions',
} = {}) {
  const [inlineTest, setInlineTest] = useState({ ...TEST_EDITOR_DEFAULT });
  const [inlineQuestions, setInlineQuestions] = useState([]);
  const [inlineTestTab, setInlineTestTab] = useState(initialTab === 'settings' ? 'settings' : 'questions');
  const [inlineTestSaving, setInlineTestSaving] = useState(false);
  const [inlinePublishLoading, setInlinePublishLoading] = useState(false);
  const [creatingTest, setCreatingTest] = useState(false);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [expandedQuestionId, setExpandedQuestionId] = useState(null);
  const [openQuestionTypePickerId, setOpenQuestionTypePickerId] = useState(null);
  const [loadingTest, setLoadingTest] = useState(false);

  const inlineQuestionsByIdRef = useRef(new Map());
  const questionTypeMenuRef = useRef(null);
  const inlinePendingTestRef = useRef({});
  const inlineTestSaveTimeoutRef = useRef(null);
  const inlineQuestionPendingRef = useRef({});
  const inlineQuestionSaveTimersRef = useRef({});
  const loadedInitialTestIdRef = useRef(null);

  useEffect(() => {
    const m = new Map();
    for (const q of inlineQuestions) {
      const id = Number(q?.id);
      if (Number.isFinite(id)) m.set(id, q);
    }
    inlineQuestionsByIdRef.current = m;
  }, [inlineQuestions]);

  useEffect(() => {
    if (!openQuestionTypePickerId) return undefined;
    const handleClickOutside = (event) => {
      if (questionTypeMenuRef.current && !questionTypeMenuRef.current.contains(event.target)) {
        setOpenQuestionTypePickerId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openQuestionTypePickerId]);

  useEffect(() => () => {
    if (inlineTestSaveTimeoutRef.current) clearTimeout(inlineTestSaveTimeoutRef.current);
    Object.values(inlineQuestionSaveTimersRef.current).forEach((t) => clearTimeout(t));
  }, []);

  const flushInlineTestPayloadForId = useCallback(async (testId, options = {}) => {
    const { manageSavingState = true } = options;
    if (!testId) return;
    const payload = { ...inlinePendingTestRef.current };
    inlinePendingTestRef.current = {};
    if (!Object.keys(payload).length) return;
    if (manageSavingState) setInlineTestSaving(true);
    try {
      await adminService.updateTest(testId, payload);
    } catch (err) {
      console.error('Inline test autosave failed:', err);
      showToast(err?.response?.data?.message || 'Eroare la salvarea testului.', 'error');
    } finally {
      if (manageSavingState) setInlineTestSaving(false);
    }
  }, [showToast]);

  const flushInlineTestSave = useCallback(async () => {
    await flushInlineTestPayloadForId(inlineTest.id, { manageSavingState: true });
  }, [flushInlineTestPayloadForId, inlineTest.id]);

  const saveInlineTestPatch = useCallback((patch) => {
    setInlineTest((prev) => ({ ...prev, ...patch }));
    if (!inlineTest.id) return;
    Object.assign(inlinePendingTestRef.current, patch);
    if (inlineTestSaveTimeoutRef.current) clearTimeout(inlineTestSaveTimeoutRef.current);
    inlineTestSaveTimeoutRef.current = setTimeout(() => {
      flushInlineTestSave();
    }, 650);
  }, [flushInlineTestSave, inlineTest.id]);

  const ensureInlineTestCreated = useCallback(async () => {
    if (inlineTest.id) return inlineTest.id;
    const title = (inlineTest.title || '').trim();
    if (!title) {
      showToast('Adaugă titlul testului.', 'error');
      return null;
    }
    if (!courseContext?.courseId) {
      showToast('Testul trebuie creat din constructorul unui curs.', 'error');
      return null;
    }

    const {
      courseId,
      selectedModuleId,
      modules = [],
      courseAttachedTests = [],
      fetchAttachedTests,
      getModuleAttachedTests,
    } = courseContext;

    setCreatingTest(true);
    try {
      const created = await adminService.createTest({
        title,
        description: inlineTest.description?.trim() || null,
        type: 'final',
        status: 'draft',
        passing_score: inlineTest.passing_score ?? TEST_EDITOR_DEFAULT.passing_score,
        time_limit_minutes: inlineTest.time_limit_minutes ?? null,
        max_attempts: inlineTest.max_attempts ?? null,
        randomize_questions: Boolean(inlineTest.randomize_questions),
        randomize_answers: Boolean(inlineTest.randomize_answers),
        show_results_immediately: Boolean(inlineTest.show_results_immediately),
        show_correct_answers: Boolean(inlineTest.show_correct_answers),
        allow_review: Boolean(inlineTest.allow_review),
        requires_manual_verification: Boolean(inlineTest.requires_manual_verification),
      });
      const newTestId = Number(created?.test?.id ?? created?.id);
      if (!newTestId) throw new Error('ID test invalid');

      const targetModuleId = selectedModuleId || modules[0]?.id;
      if (targetModuleId) {
        const moduleTests = (getModuleAttachedTests?.(targetModuleId) ?? courseAttachedTests.filter(
          (row) => row.scope === 'module' && Number(row.scope_id) === Number(targetModuleId)
        ));
        await adminService.builderAttachTest(courseId, {
          test_id: newTestId,
          scope: 'module',
          scope_id: targetModuleId,
          order: moduleTests.length,
        });
      } else {
        await adminService.linkTestToCourse(newTestId, courseId, {
          scope: 'course',
          order: 0,
        });
      }

      setInlineTest((prev) => ({ ...prev, id: newTestId }));
      await fetchAttachedTests?.();
      showToast('Test creat și asociat cursului.', 'success');
      return newTestId;
    } catch (err) {
      console.error('Create inline test failed:', err);
      const msg =
        err?.response?.data?.message
        || err?.response?.data?.error
        || (typeof err?.response?.data === 'string' ? err.response.data : null);
      showToast(msg || 'Eroare la crearea sau atașarea testului.', 'error');
      return null;
    } finally {
      setCreatingTest(false);
    }
  }, [courseContext, inlineTest, showToast]);

  const flushAllInlineQuestionSaves = useCallback(async () => {
    Object.keys(inlineQuestionSaveTimersRef.current).forEach((qid) => {
      clearTimeout(inlineQuestionSaveTimersRef.current[qid]);
      delete inlineQuestionSaveTimersRef.current[qid];
    });
    for (let safety = 0; safety < 24; safety += 1) {
      const pendingIds = Object.keys(inlineQuestionPendingRef.current).filter((questionIdStr) => {
        const p = inlineQuestionPendingRef.current[Number(questionIdStr)];
        return p && Object.keys(p).length > 0;
      });
      if (pendingIds.length === 0) break;
      for (const questionIdStr of pendingIds) {
        const questionId = Number(questionIdStr);
        if (!Number.isFinite(questionId)) continue;
        const pendingPatch = inlineQuestionPendingRef.current[questionId];
        if (!pendingPatch || Object.keys(pendingPatch).length === 0) continue;
        const snapshot = { ...pendingPatch };
        if (Array.isArray(snapshot.answers)) {
          const curType = snapshot.type ?? inlineQuestionsByIdRef.current.get(questionId)?.type ?? 'multiple_choice';
          snapshot.answers = serializeAnswersForQuestionApi(curType, snapshot.answers);
        }
        delete inlineQuestionPendingRef.current[questionId];
        try {
          await adminService.updateQuestion(questionId, snapshot);
        } catch (err) {
          const cur = inlineQuestionPendingRef.current[questionId] || {};
          inlineQuestionPendingRef.current[questionId] = { ...snapshot, ...cur };
          console.error('Inline question flush failed:', err);
          const apiMessage = err?.response?.data?.message
            || err?.response?.data?.error
            || Object.values(err?.response?.data?.errors || {})?.[0]?.[0];
          showToast(apiMessage || 'Eroare la salvarea întrebării.', 'error');
        }
      }
    }
  }, [showToast]);

  const queueInlineQuestionPatchSave = useCallback(async (questionId, patch, immediate = false) => {
    const qid = Number(questionId);
    if (!Number.isFinite(qid)) return;
    const existingPatch = inlineQuestionPendingRef.current[qid] || {};
    inlineQuestionPendingRef.current[qid] = { ...existingPatch, ...patch };
    if (inlineQuestionSaveTimersRef.current[qid]) {
      clearTimeout(inlineQuestionSaveTimersRef.current[qid]);
      delete inlineQuestionSaveTimersRef.current[qid];
    }

    const flush = async () => {
      const pendingPatch = inlineQuestionPendingRef.current[qid];
      if (!pendingPatch || Object.keys(pendingPatch).length === 0) return;
      const snapshot = { ...pendingPatch };
      if (Array.isArray(snapshot.answers)) {
        const curType = snapshot.type ?? inlineQuestionsByIdRef.current.get(qid)?.type ?? 'multiple_choice';
        snapshot.answers = serializeAnswersForQuestionApi(curType, snapshot.answers);
      }
      delete inlineQuestionPendingRef.current[qid];
      try {
        await adminService.updateQuestion(qid, snapshot);
      } catch (err) {
        const cur = inlineQuestionPendingRef.current[qid] || {};
        inlineQuestionPendingRef.current[qid] = { ...snapshot, ...cur };
        console.error('Inline question update failed:', err);
        const apiMessage = err?.response?.data?.message
          || err?.response?.data?.error
          || Object.values(err?.response?.data?.errors || {})?.[0]?.[0];
        showToast(apiMessage || 'Eroare la salvarea întrebării.', 'error');
      }
    };

    if (immediate) {
      await flush();
      return;
    }
    inlineQuestionSaveTimersRef.current[qid] = setTimeout(flush, 350);
  }, [showToast]);

  const handleInlineQuestionBlur = useCallback(async (questionId, patch) => {
    const qid = Number(questionId);
    if (!Number.isFinite(qid)) return;
    const curType = patch?.type ?? inlineQuestionsByIdRef.current.get(qid)?.type ?? 'multiple_choice';
    const payload = patch?.answers
      ? { ...patch, type: curType, answers: serializeAnswersForQuestionApi(curType, patch.answers) }
      : patch;
    await queueInlineQuestionPatchSave(qid, payload, true);
  }, [queueInlineQuestionPatchSave]);

  const loadTest = useCallback(async (testId, tab = 'questions') => {
    if (!testId) return;
    setLoadingTest(true);
    try {
      const testData = await adminService.getTest(testId);
      const questions = await adminService.getQuestions(testId).catch(() => []);
      setInlineTest((prev) => ({
        ...prev,
        ...testData,
        id: testData.id,
      }));
      const list = Array.isArray(questions) ? questions : [];
      setInlineQuestions(list.map(normalizeBuilderQuestion));
      setInlineTestTab(tab === 'settings' ? 'settings' : 'questions');
      setExpandedQuestionId(null);
      setOpenQuestionTypePickerId(null);
    } catch (e) {
      console.error('Failed to load inline test:', e);
      showToast('Nu am putut încărca testul.', 'error');
    } finally {
      setLoadingTest(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (initialTestId) {
      if (loadedInitialTestIdRef.current === initialTestId) return;
      loadedInitialTestIdRef.current = initialTestId;
      loadTest(initialTestId, initialTab);
    } else {
      loadedInitialTestIdRef.current = null;
    }
  }, [initialTestId, initialTab, loadTest]);

  const resetTest = useCallback(() => {
    setInlineTest({ ...TEST_EDITOR_DEFAULT });
    setInlineQuestions([]);
    setInlineTestTab('questions');
    setExpandedQuestionId(null);
    setOpenQuestionTypePickerId(null);
    inlinePendingTestRef.current = {};
    inlineQuestionPendingRef.current = {};
  }, []);

  const handleAddInlineQuestion = useCallback(async (type = 'multiple_choice') => {
    const testId = await ensureInlineTestCreated();
    if (!testId) return;
    setAddingQuestion(true);
    try {
      const created = await adminService.createQuestion(testId, {
        type,
        content: 'Întrebare nouă',
        answers: getDefaultAnswersByType(type),
        points: 1,
      });
      const question = created?.question ?? created;
      if (question) {
        setInlineQuestions((prev) => [...prev, normalizeBuilderQuestion(question)]);
        setExpandedQuestionId(question.id);
      }
    } catch (err) {
      console.error('Add inline question failed:', err);
      const apiMsg = err?.response?.data?.message
        || err?.response?.data?.error
        || err?.response?.data?.errors?.answers?.[0];
      showToast(apiMsg || 'Eroare la adăugarea întrebării.', 'error');
    } finally {
      setAddingQuestion(false);
    }
  }, [ensureInlineTestCreated, showToast]);

  const handleDeleteInlineQuestion = useCallback(async (questionId) => {
    try {
      await adminService.deleteQuestion(questionId);
      setInlineQuestions((prev) => prev.filter((q) => q.id !== questionId));
      showToast('Întrebare ștearsă.', 'success');
    } catch (err) {
      console.error('Delete inline question failed:', err);
      showToast(err?.response?.data?.message || 'Eroare la ștergere.', 'error');
    }
  }, [showToast]);

  const handleAddDefaultInlineQuestion = useCallback(async () => {
    await handleAddInlineQuestion('multiple_choice');
  }, [handleAddInlineQuestion]);

  const handleInlineQuestionTypeChange = useCallback(async (questionId, nextType) => {
    const id = Number(questionId);
    const q = inlineQuestions.find((row) => Number(row.id) === id);
    if (!q) {
      setOpenQuestionTypePickerId(null);
      return;
    }
    const normalizedNextType = normalizeInlineQuestionType(nextType);
    if (normalizeInlineQuestionType(q.type) === normalizedNextType) {
      setOpenQuestionTypePickerId(null);
      return;
    }
    const nextAnswers = getDefaultAnswersByType(normalizedNextType);
    setInlineQuestions((prev) => prev.map((row) => (Number(row.id) === id ? {
      ...row,
      type: normalizedNextType,
      answers: nextAnswers,
    } : row)));
    await queueInlineQuestionPatchSave(id, { type: normalizedNextType, answers: nextAnswers }, true);
    setOpenQuestionTypePickerId(null);
  }, [inlineQuestions, queueInlineQuestionPatchSave]);

  const handleToggleQuestionTypePicker = useCallback((questionId) => {
    setOpenQuestionTypePickerId((prev) => (prev === questionId ? null : questionId));
  }, []);

  const updateInlineAnswers = useCallback((questionId, updater, persistMode = 'debounced') => {
    const qNum = Number(questionId);
    if (!Number.isFinite(qNum)) return;
    setInlineQuestions((prev) =>
      prev.map((q) => {
        if (Number(q.id) !== qNum) return q;
        const currentAnswers = Array.isArray(q.answers) ? q.answers : [];
        const nextAnswers = updater(currentAnswers);
        queueMicrotask(() => {
          if (persistMode === 'immediate') {
            void handleInlineQuestionBlur(qNum, { answers: nextAnswers });
          } else if (persistMode === 'debounced') {
            void queueInlineQuestionPatchSave(qNum, { answers: nextAnswers }, false);
          }
        });
        return { ...q, answers: nextAnswers };
      })
    );
  }, [handleInlineQuestionBlur, queueInlineQuestionPatchSave]);

  const handleInlineAnswerTextChange = useCallback((questionId, answerIndex, text) => {
    updateInlineAnswers(questionId, (answers) => answers.map((ans, idx) => (idx === answerIndex ? { ...ans, text } : ans)), 'debounced');
  }, [updateInlineAnswers]);

  const handleInlineAnswerCorrectToggle = useCallback((questionId, answerIndex, singleChoice = false) => {
    const qid = Number(questionId);
    const qType = normalizeInlineQuestionType(inlineQuestionsByIdRef.current.get(qid)?.type);
    if (qType === 'matching' || qType === 'ordering') return;
    updateInlineAnswers(
      questionId,
      (answers) => answers.map((ans, idx) => ({
        ...ans,
        is_correct: singleChoice ? idx === answerIndex : (idx === answerIndex ? !ans.is_correct : ans.is_correct),
      })),
      'debounced'
    );
  }, [updateInlineAnswers]);

  const handleInlineAddAnswer = useCallback((questionId) => {
    const qid = Number(questionId);
    const qType = normalizeInlineQuestionType(inlineQuestionsByIdRef.current.get(qid)?.type);
    if (qType === 'matching') {
      updateInlineAnswers(questionId, (answers) => {
        const next = Array.isArray(answers) ? [...answers] : [];
        const idx = next.length;
        next.push({
          left: `Element ${idx + 1}`,
          right: `Răspuns ${idx + 1}`,
          text: `Element ${idx + 1}`,
          answer_text: `Răspuns ${idx + 1}`,
          is_correct: true,
          order: idx,
        });
        return next.map((a, i) => ({ ...a, order: i }));
      }, 'immediate');
      return;
    }
    if (qType === 'ordering') {
      updateInlineAnswers(questionId, (answers) => {
        const next = Array.isArray(answers) ? [...answers] : [];
        next.push({ text: `Pasul ${next.length + 1}`, is_correct: true, order: next.length });
        return next.map((a, i) => ({ ...a, order: i, is_correct: true }));
      }, 'immediate');
      return;
    }
    updateInlineAnswers(questionId, (answers) => [...answers, { text: 'Răspuns nou', is_correct: false }], 'immediate');
  }, [updateInlineAnswers]);

  const handleInlineRemoveAnswer = useCallback((questionId, answerIndex) => {
    const qid = Number(questionId);
    const qType = normalizeInlineQuestionType(inlineQuestionsByIdRef.current.get(qid)?.type);
    if (qType === 'matching' || qType === 'ordering') {
      updateInlineAnswers(questionId, (answers) => {
        const next = (Array.isArray(answers) ? answers : []).filter((_, idx) => idx !== answerIndex);
        return next.map((a, i) => ({ ...a, order: i, is_correct: qType === 'ordering' ? true : (a.is_correct ?? true) }));
      }, 'immediate');
      return;
    }
    updateInlineAnswers(questionId, (answers) => answers.filter((_, idx) => idx !== answerIndex), 'immediate');
  }, [updateInlineAnswers]);

  const handleInlineMatchingPairChange = useCallback((questionId, answerIndex, side, value) => {
    updateInlineAnswers(
      questionId,
      (answers) => (answers || []).map((ans, idx) => {
        if (idx !== answerIndex) return ans;
        if (side === 'left') return { ...ans, left: value, text: value };
        return { ...ans, right: value, answer_text: value };
      }),
      'debounced'
    );
  }, [updateInlineAnswers]);

  const handleInlineOrderingMove = useCallback((questionId, answerIndex, direction) => {
    updateInlineAnswers(questionId, (answers) => {
      const list = Array.isArray(answers) ? [...answers] : [];
      const nextIndex = direction === 'up' ? answerIndex - 1 : answerIndex + 1;
      if (nextIndex < 0 || nextIndex >= list.length) return list;
      const tmp = list[answerIndex];
      list[answerIndex] = list[nextIndex];
      list[nextIndex] = tmp;
      return list.map((a, i) => ({ ...a, order: i, is_correct: true }));
    }, 'immediate');
  }, [updateInlineAnswers]);

  const patchQuestionField = useCallback((questionId, field, value) => {
    setInlineQuestions((prev) => prev.map((q) => (q.id === questionId ? { ...q, [field]: value } : q)));
    queueInlineQuestionPatchSave(questionId, { [field]: value }, false);
  }, [queueInlineQuestionPatchSave]);

  const handleSaveInlineTestNow = useCallback(async () => {
    const testId = await ensureInlineTestCreated();
    if (!testId) return;
    if (inlineTestSaveTimeoutRef.current) {
      clearTimeout(inlineTestSaveTimeoutRef.current);
      inlineTestSaveTimeoutRef.current = null;
    }
    setInlineTestSaving(true);
    try {
      await flushInlineTestPayloadForId(testId, { manageSavingState: false });
      await flushAllInlineQuestionSaves();
      showToast('Test salvat.', 'success');
    } catch (err) {
      console.error('Save inline test failed:', err);
      showToast(err?.response?.data?.message || 'Eroare la salvare.', 'error');
    } finally {
      setInlineTestSaving(false);
    }
  }, [ensureInlineTestCreated, flushAllInlineQuestionSaves, flushInlineTestPayloadForId, showToast]);

  const handlePublishInlineTest = useCallback(async (onPublished) => {
    const testId = await ensureInlineTestCreated();
    if (!testId) return;
    if (!inlineQuestions.length && inlineTest.question_source === 'direct') {
      showToast('Adaugă cel puțin o întrebare înainte de publicare.', 'error');
      return;
    }
    if (inlineTestSaveTimeoutRef.current) {
      clearTimeout(inlineTestSaveTimeoutRef.current);
      inlineTestSaveTimeoutRef.current = null;
    }
    setInlinePublishLoading(true);
    try {
      await flushInlineTestPayloadForId(testId, { manageSavingState: false });
      await flushAllInlineQuestionSaves();
      await adminService.publishTest(testId);
      setInlineTest((prev) => ({ ...prev, status: 'published' }));
      showToast('Test publicat.', 'success');
      await onPublished?.();
    } catch (err) {
      console.error('Publish inline test failed:', err);
      showToast(err?.response?.data?.message || 'Eroare la publicare.', 'error');
    } finally {
      setInlinePublishLoading(false);
    }
  }, [ensureInlineTestCreated, flushAllInlineQuestionSaves, flushInlineTestPayloadForId, inlineQuestions.length, inlineTest.question_source, showToast]);

  return {
    inlineTest,
    inlineQuestions,
    inlineTestTab,
    setInlineTestTab,
    inlineTestSaving,
    inlinePublishLoading,
    creatingTest,
    addingQuestion,
    expandedQuestionId,
    setExpandedQuestionId,
    openQuestionTypePickerId,
    setOpenQuestionTypePickerId,
    questionTypeMenuRef,
    loadingTest,
    canMutateInAdminArea,
    saveInlineTestPatch,
    loadTest,
    resetTest,
    flushAllInlineQuestionSaves,
    ensureInlineTestCreated,
    handleSaveInlineTestNow,
    handlePublishInlineTest,
    handleAddDefaultInlineQuestion,
    handleDeleteInlineQuestion,
    handleInlineQuestionTypeChange,
    handleToggleQuestionTypePicker,
    handleInlineQuestionBlur,
    patchQuestionField,
    handleInlineAnswerTextChange,
    handleInlineAnswerCorrectToggle,
    handleInlineAddAnswer,
    handleInlineRemoveAnswer,
    handleInlineMatchingPairChange,
    handleInlineOrderingMove,
  };
}
