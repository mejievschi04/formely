import React, { useEffect } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import InlineTestEditorShell from '../../components/admin/courses/InlineTestEditorShell';
import { useInlineTestEditor } from '../../hooks/useInlineTestEditor';
import '../../styles/admin-course-builder.css';
import './AdminTestBuilderPage.css';

export default function AdminTestBuilderPage() {
  const { testId: testIdParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { canMutateInAdminArea } = useAuth();

  const testId = Number(testIdParam);
  const section = searchParams.get('section') === 'settings' ? 'settings' : 'questions';

  const editor = useInlineTestEditor({
    showToast,
    canMutateInAdminArea,
    initialTestId: Number.isFinite(testId) && testId > 0 ? testId : null,
    initialTab: section,
  });

  useEffect(() => {
    document.body.classList.add('admin-course-builder-scroll-lock');
    return () => document.body.classList.remove('admin-course-builder-scroll-lock');
  }, []);

  const handleSectionChange = (nextSection) => {
    const tab = nextSection === 'settings' ? 'settings' : 'questions';
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('section', tab);
      return next;
    });
    editor.setInlineTestTab(tab);
  };

  const handleBack = () => {
    navigate('/admin/content?tab=tests');
  };

  if (!Number.isFinite(testId) || testId <= 0) {
    return (
      <div className="admin-container admin-test-builder-page">
        <p>ID test invalid.</p>
        <button type="button" className="admin-btn admin-btn-secondary" onClick={handleBack}>
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

  return (
    <div
      className={`admin-container admin-test-builder-page admin-course-builder-page ${
        editor.openQuestionTypePickerId ? 'has-right-panel-expanded' : ''
      }`}
    >
      <div className="admin-test-builder-topbar">
        <button type="button" className="admin-test-builder-back" onClick={handleBack}>
          <ArrowLeft size={18} weight="bold" aria-hidden />
          Înapoi la Teste
        </button>
      </div>

      <div className="admin-course-builder-workspace admin-course-builder-workspace-clean admin-test-builder-workspace">
        <div className="admin-course-builder-workspace-content">
          <InlineTestEditorShell
            editor={{
              ...editor,
              setInlineTestTab: (tab) => handleSectionChange(tab),
            }}
            subtitle="Configurezi întrebările și setările testului într-un workspace clar."
            showBuilderSummary
          />
        </div>
      </div>
    </div>
  );
}
