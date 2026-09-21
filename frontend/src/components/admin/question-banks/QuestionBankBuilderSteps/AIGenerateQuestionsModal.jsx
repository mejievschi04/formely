import React from 'react';
import { createPortal } from 'react-dom';

const AIGenerateQuestionsModal = ({
  open,
  aiGenerating,
  courses,
  coursesLoading,
  selectedCourseId,
  setSelectedCourseId,
  aiOptions,
  setAiOptions,
  aiError,
  aiGeneratedCount,
  aiTargetCount,
  aiGeneratedPreviews,
  onClose,
  onStartReview,
}) => {
  if (!open) return null;

  const hasCourses = Array.isArray(courses) && courses.length > 0;

  const modal = (
    <div className="admin-team-modal-overlay" onClick={() => !aiGenerating && onClose()} style={{ zIndex: 10000 }}>
      <div className="admin-team-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-team-modal-header">
          <div>
            <h2 className="admin-team-modal-title">🤖 Generează întrebări cu AI</h2>
          </div>
          {!aiGenerating && (
            <button type="button" className="admin-team-modal-close" onClick={onClose}>
              ×
            </button>
          )}
        </div>

        <div className="admin-team-modal-body">
          <div className="admin-form-group">
            <label className="admin-form-label">Curs sursă *</label>
            <select
              className="admin-form-input"
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              disabled={aiGenerating || coursesLoading}
            >
              <option value="">{coursesLoading ? 'Se încarcă cursurile...' : 'Alege un curs'}</option>
              {hasCourses
                ? courses.map((course) => (
                    <option key={course.id} value={String(course.id)}>
                      {course.title || `Curs #${course.id}`}
                    </option>
                  ))
                : null}
            </select>
            <p className="admin-form-hint">AI va folosi conținutul cursului selectat ca sursă principală.</p>
            {!coursesLoading && !hasCourses ? (
              <p className="admin-form-hint">Nu există cursuri disponibile pentru selecție.</p>
            ) : null}
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Număr de întrebări</label>
            <input
              type="number"
              className="admin-form-input"
              value={aiOptions.numberOfQuestions}
              min="1"
              max="50"
              disabled={aiGenerating}
              onChange={(e) =>
                setAiOptions((prev) => ({
                  ...prev,
                  numberOfQuestions: parseInt(e.target.value, 10) || 1,
                }))
              }
            />
            <p className="admin-form-hint">Întrebările vor fi generate și salvate automat, fără confirmare manuală.</p>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Dificultate</label>
            <select
              className="admin-form-input"
              value={aiOptions.difficulty}
              disabled={aiGenerating}
              onChange={(e) => setAiOptions((prev) => ({ ...prev, difficulty: e.target.value }))}
            >
              <option value="easy">Ușor</option>
              <option value="medium">Mediu</option>
              <option value="hard">Dificil</option>
            </select>
          </div>

          {aiGenerating ? (
            <div className="qb-ai-review-loading">
              <span className="qb-spinner" aria-hidden />
              AI generează întrebările... {aiGeneratedCount ? `${aiGeneratedCount}/${aiTargetCount || aiOptions.numberOfQuestions}` : ''}
            </div>
          ) : null}

          {Array.isArray(aiGeneratedPreviews) && aiGeneratedPreviews.length > 0 ? (
            <div className="qb-ai-generated-preview">
              <div className="qb-ai-generated-preview-title">Întrebări aprobate până acum</div>
              <ol className="qb-ai-generated-preview-list">
                {aiGeneratedPreviews.map((question) => (
                  <li key={`${question.index}-${question.content.slice(0, 24)}`}>
                    <strong>{question.index}.</strong> {question.content}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {aiError ? <div className="lms-error-message">{aiError}</div> : null}
        </div>

        <div className="admin-team-modal-footer">
          <button type="button" className="lms-btn-secondary" onClick={onClose} disabled={aiGenerating}>
            Anulează
          </button>
          <button
            type="button"
            className="lms-btn-primary"
            onClick={() => onStartReview(selectedCourseId, aiOptions.numberOfQuestions)}
            disabled={aiGenerating || !selectedCourseId || !hasCourses}
          >
            {aiGenerating ? 'Se pregătește...' : 'Generează automat'}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
};

export default AIGenerateQuestionsModal;
