import React, { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowsClockwise, ListNumbers, Target, Timer } from '@phosphor-icons/react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useToast } from '../../contexts/ToastContextShared.js';

import { useAuth } from '../../contexts/AuthContextShared.js';
import InlineTestEditorShell from '../../components/admin/courses/InlineTestEditorShell';
import { useInlineTestEditor } from '../../hooks/useInlineTestEditor';
import { VOLT_TEST_REFRESH_EVENT } from '../../utils/voltCoursePlan';
import './AdminTestBuilderPage.css';
import '../../styles/builder-page.css';

export default function AdminTestBuilderPage() {
  const { testId: testIdParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { canMutateInAdminArea, user } = useAuth();
  // ca în lista de teste: adminul și analistul pot parcurge testul fără ca încercarea să se salveze
  const canTryTest = ['admin', 'analyst'].includes(user?.actualRole ?? user?.role);

  const testId = Number(testIdParam);
  const sectionParam = searchParams.get('section');
  const section = sectionParam === 'settings' ? 'settings' : 'questions';

  const editor = useInlineTestEditor({
    showToast,
    canMutateInAdminArea,
    initialTestId: Number.isFinite(testId) && testId > 0 ? testId : null,
    initialTab: section === 'settings' ? 'settings' : 'questions',
  });

  useEffect(() => {
    const onVoltRefresh = (event) => {
      if (Number(event.detail?.testId) !== Number(testId)) return;
      editor.loadTest(testId, section === 'settings' ? 'settings' : 'questions');
    };
    window.addEventListener(VOLT_TEST_REFRESH_EVENT, onVoltRefresh);
    return () => window.removeEventListener(VOLT_TEST_REFRESH_EVENT, onVoltRefresh);
  }, [editor.loadTest, section, testId]);

  const focusQuestionId = Number(searchParams.get('question'));
  const focusedQuestionRef = useRef(null);

  useEffect(() => {
    if (editor.loadingTest) return;
    if (!Number.isFinite(focusQuestionId) || focusQuestionId <= 0) return;
    if (!editor.inlineQuestions.some((question) => Number(question.id) === focusQuestionId)) return;
    if (focusedQuestionRef.current === focusQuestionId) return;
    focusedQuestionRef.current = focusQuestionId;
    editor.expandQuestion(focusQuestionId);
    window.requestAnimationFrame(() => {
      document.getElementById(`test-question-${focusQuestionId}`)?.scrollIntoView({ block: 'start' });
    });
  }, [editor.expandQuestion, editor.inlineQuestions, editor.loadingTest, focusQuestionId]);

  const handleSectionChange = (nextSection) => {
    const tab = nextSection === 'settings' ? 'settings' : 'questions';
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('section', tab);
      return next;
    });
    editor.setInlineTestTab(tab === 'settings' ? 'settings' : 'questions');
  };

  const handleBack = () => {
    navigate('/admin/content?tab=tests');
  };

  if (!Number.isFinite(testId) || testId <= 0) {
    return (
      <div className="admin-container admin-test-builder-page">
        <p>ID test invalid.</p>
        <button type="button" className="va-btn-back admin-back-btn" onClick={handleBack}>
          Înapoi
        </button>
      </div>
    );
  }

  if (editor.loadingTest) {
    return (
      <div className="admin-container admin-test-builder-page">
        <div className="lms-dashboard-loading">
          <div className="lms-spinner" />
          <p>Se încarcă testul...</p>
        </div>
      </div>
    );
  }

  const test = editor.inlineTest || {};
  const isPublished = String(test.status || 'draft').toLowerCase() === 'published';
  const busy = editor.creatingTest || editor.inlineTestSaving || editor.inlinePublishLoading;
  const stats = [
    ['questions', ListNumbers, 'Întrebări', String(editor.inlineQuestions.length)],
    ['passing', Target, 'Prag de promovare', `${Number(test.passing_score ?? 70)}%`],
    ['time', Timer, 'Timp', test.time_limit_minutes ? `${test.time_limit_minutes} min` : 'Nelimitat'],
    ['attempts', ArrowsClockwise, 'Încercări', test.max_attempts ? String(test.max_attempts) : 'Fără limită'],
  ];

  return (
    <div className="admin-container admin-test-builder-page va-test-builder">
      <header className="va-test-builder__head">
        <button type="button" className="va-test-builder__back" onClick={handleBack}>
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          Teste
        </button>

        <div className="va-test-builder__title-row">
          <div className="va-test-builder__title">
            <h1>{(test.title || '').trim() || 'Test fără titlu'}</h1>
            <span className={`va-test-builder__status ${isPublished ? 'is-published' : 'is-draft'}`}>
              {isPublished ? 'Publicat' : 'Ciornă'}
            </span>
            {editor.inlineTestSaving ? <span className="va-test-builder__saving">Se salvează…</span> : null}
          </div>
          <div className="va-test-builder__actions">
            {canTryTest ? (
              <button type="button" className="lms-btn-secondary" onClick={() => navigate(`/exams/${testId}?preview=1&kind=test`)}>
                Încearcă testul
              </button>
            ) : null}
            {canMutateInAdminArea ? (
              <>
                <button
                  type="button"
                  className={isPublished ? 'va-btn-save lms-btn-primary' : 'lms-btn-secondary'}
                  onClick={editor.handleSaveInlineTestNow}
                  disabled={busy}
                >
                  {editor.inlineTestSaving ? 'Se salvează…' : 'Salvează'}
                </button>
                {!isPublished ? (
                  <button type="button" className="lms-btn-primary" onClick={() => editor.handlePublishInlineTest()} disabled={busy}>
                    {editor.inlinePublishLoading ? 'Se publică…' : 'Publică'}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <dl className="va-test-builder__stats" aria-label="Rezumat test">
          {stats.map(([key, Icon, label, value]) => (
            <div key={key} className={`va-test-builder__stat is-${key}`}>
              <span className="va-test-builder__stat-icon" aria-hidden="true">
                <Icon size={18} weight="bold" />
              </span>
              <div>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            </div>
          ))}
        </dl>

        <div className="va-dialog__tabs va-test-builder__tabs" role="tablist" aria-label="Secțiuni test">
          {[
            ['questions', `Întrebări (${editor.inlineQuestions.length})`],
            ['settings', 'Setări'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={section === id}
              className={`va-dialog__tab${section === id ? ' is-active' : ''}`}
              onClick={() => handleSectionChange(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="va-test-builder__body">
        <InlineTestEditorShell
          editor={{
            ...editor,
            setInlineTestTab: (tab) => handleSectionChange(tab),
          }}
          showOverview={false}
          showSectionTabs={false}
        />
      </main>
    </div>
  );
}
