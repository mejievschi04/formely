import React from 'react';
import {
  INLINE_QUESTION_TYPES,
  normalizeInlineQuestionType,
} from '../../../utils/testQuestionBuilder';

export default function InlineTestEditorShell({
  editor,
  subtitle = 'Configurezi testul în același editor ca în constructorul de curs.',
  showImportButton = true,
  showBuilderSummary = false,
}) {
  const {
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
    questionTypeMenuRef,
    canMutateInAdminArea,
    saveInlineTestPatch,
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
    setOpenQuestionTypePickerId,
  } = editor;

  const status = String(inlineTest.status || 'draft').toLowerCase() === 'published' ? 'published' : 'draft';
  const title = (inlineTest.title || '').trim() || 'Test';
  const timeLabel = inlineTest.time_limit_minutes ? `${inlineTest.time_limit_minutes} min` : 'Nelimitat';
  const attemptsLabel = inlineTest.max_attempts ? String(inlineTest.max_attempts) : 'Fără limită';

  return (
    <div className="admin-course-builder-test-creator admin-course-builder-test-shell">
      <div className="admin-course-builder-test-overview-card">
        <div className="admin-course-builder-test-shell-header">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
            <p className="admin-course-builder-test-status-line">
              <span className={`admin-course-builder-test-status-pill ${status === 'published' ? 'is-published' : 'is-draft'}`}>
                {status === 'published' ? 'Publicat' : 'Ciornă'}
              </span>
            </p>
          </div>
          {canMutateInAdminArea ? (
            <div className="admin-course-builder-test-shell-actions">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={handleSaveInlineTestNow}
                disabled={creatingTest || inlineTestSaving || inlinePublishLoading}
              >
                {inlineTestSaving ? 'Se salvează...' : 'Salvează'}
              </button>
              {status !== 'published' ? (
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={() => handlePublishInlineTest()}
                  disabled={creatingTest || inlineTestSaving || inlinePublishLoading}
                >
                  {inlinePublishLoading ? 'Se publică...' : 'Publică'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {showBuilderSummary ? (
          <div className="admin-course-builder-test-summary-grid" aria-label="Rezumat test">
            <div>
              <span>Întrebări</span>
              <strong>{inlineQuestions.length}</strong>
            </div>
            <div>
              <span>Prag</span>
              <strong>{Number(inlineTest.passing_score ?? 70)}%</strong>
            </div>
            <div>
              <span>Timp</span>
              <strong>{timeLabel}</strong>
            </div>
            <div>
              <span>Încercări</span>
              <strong>{attemptsLabel}</strong>
            </div>
          </div>
        ) : null}

        <div className="admin-course-builder-test-tabs">
          <button
            type="button"
            className={`admin-course-builder-test-tab ${inlineTestTab === 'questions' ? 'is-active' : ''}`}
            onClick={() => setInlineTestTab('questions')}
          >
            Întrebări
          </button>
          <button
            type="button"
            className={`admin-course-builder-test-tab ${inlineTestTab === 'settings' ? 'is-active' : ''}`}
            onClick={() => setInlineTestTab('settings')}
          >
            Setări
          </button>
        </div>
      </div>

      <div className="admin-course-builder-test-layout">
        <div className="admin-course-builder-test-main">
          {inlineTestTab === 'questions' && (
            <div className="admin-course-builder-test-questions admin-course-builder-test-questions-card">
              <div className="admin-course-builder-test-questions-header">
                <span>Întrebări ({inlineQuestions.length})</span>
                <div className="admin-course-builder-test-questions-actions">
                  {inlineTestSaving ? <small>Se salvează...</small> : null}
                </div>
              </div>
              {inlineQuestions.length === 0 ? (
                <p className="admin-course-builder-test-empty">Nu ai încă întrebări. Apasă pe butonul de adăugare de mai jos.</p>
              ) : (
                <ul className="admin-course-builder-test-question-list">
                  {inlineQuestions.map((question, idx) => {
                    const qType = normalizeInlineQuestionType(question.type || 'multiple_choice');
                    const typeLabel = INLINE_QUESTION_TYPES.find((t) => t.id === qType)?.label || 'Întrebare';
                    return (
                      <li
                        key={question.id}
                        className={`admin-course-builder-test-question-item ${expandedQuestionId === question.id ? 'is-expanded' : 'is-collapsed'}`}
                      >
                        <div className="admin-course-builder-test-question-topline">
                          <div className="admin-course-builder-test-question-type-picker">
                            <button
                              type="button"
                              className="admin-course-builder-test-question-badge admin-course-builder-test-question-badge-btn"
                              onClick={() => handleToggleQuestionTypePicker(question.id)}
                            >
                              {`Întrebarea ${idx + 1}: ${typeLabel}`}
                            </button>
                          </div>
                          {canMutateInAdminArea ? (
                            <div className="admin-course-builder-test-question-top-actions">
                              <button
                                type="button"
                                className="admin-btn admin-btn-secondary"
                                onClick={() => setExpandedQuestionId((prev) => (prev === question.id ? null : question.id))}
                              >
                                {expandedQuestionId === question.id ? 'Strânge' : 'Deschide'}
                              </button>
                              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => handleDeleteInlineQuestion(question.id)}>
                                Șterge
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {expandedQuestionId !== question.id && (
                          <p className="admin-course-builder-test-question-collapsed-preview">
                            {(question.content || '').trim() || 'Întrebare fără conținut'}
                          </p>
                        )}
                        {expandedQuestionId === question.id && (
                          <>
                            <textarea
                              className="admin-course-builder-test-question-input"
                              value={question.content || ''}
                              onChange={(e) => patchQuestionField(question.id, 'content', e.target.value)}
                              onBlur={(e) => handleInlineQuestionBlur(question.id, { content: e.target.value })}
                              placeholder="Adaugă întrebare"
                              rows={2}
                              disabled={!canMutateInAdminArea}
                            />
                            <textarea
                              className="admin-course-builder-test-question-desc"
                              value={question.explanation || ''}
                              onChange={(e) => patchQuestionField(question.id, 'explanation', e.target.value)}
                              onBlur={(e) => handleInlineQuestionBlur(question.id, { explanation: e.target.value })}
                              placeholder="Adaugă descriere..."
                              rows={2}
                              disabled={!canMutateInAdminArea}
                            />
                            {(qType === 'multiple_choice' || qType === 'true_false') && (
                              <div className="admin-course-builder-test-question-answers">
                                <p>Răspunsuri:</p>
                                {(Array.isArray(question.answers) ? question.answers : []).map((answer, answerIdx) => (
                                  <div key={`${question.id}-answer-${answerIdx}`} className="admin-course-builder-test-answer-row">
                                    <input
                                      type={qType === 'true_false' ? 'radio' : 'checkbox'}
                                      checked={!!answer.is_correct}
                                      onChange={() => handleInlineAnswerCorrectToggle(question.id, answerIdx, qType === 'true_false')}
                                      disabled={!canMutateInAdminArea}
                                    />
                                    <input
                                      type="text"
                                      value={answer.text ?? answer.answer_text ?? ''}
                                      onChange={(e) => handleInlineAnswerTextChange(question.id, answerIdx, e.target.value)}
                                      placeholder="Introdu răspuns"
                                      disabled={!canMutateInAdminArea}
                                    />
                                    {qType !== 'true_false' && canMutateInAdminArea ? (
                                      <button type="button" className="admin-btn admin-btn-secondary" onClick={() => handleInlineRemoveAnswer(question.id, answerIdx)}>
                                        ×
                                      </button>
                                    ) : null}
                                  </div>
                                ))}
                                {qType !== 'true_false' && canMutateInAdminArea ? (
                                  <button type="button" className="admin-btn admin-btn-secondary" onClick={() => handleInlineAddAnswer(question.id)}>
                                    + Adaugă răspuns
                                  </button>
                                ) : null}
                              </div>
                            )}
                            {qType === 'matching' && (
                              <div className="admin-course-builder-test-question-answers">
                                <p>Perechi:</p>
                                {(Array.isArray(question.answers) ? question.answers : []).map((answer, answerIdx) => (
                                  <div key={`${question.id}-pair-${answerIdx}`} className="admin-course-builder-test-answer-row">
                                    <input
                                      type="text"
                                      value={answer.left ?? answer.text ?? ''}
                                      onChange={(e) => handleInlineMatchingPairChange(question.id, answerIdx, 'left', e.target.value)}
                                      placeholder="Element stânga"
                                      disabled={!canMutateInAdminArea}
                                    />
                                    <input
                                      type="text"
                                      value={answer.right ?? answer.answer_text ?? ''}
                                      onChange={(e) => handleInlineMatchingPairChange(question.id, answerIdx, 'right', e.target.value)}
                                      placeholder="Element dreapta"
                                      disabled={!canMutateInAdminArea}
                                    />
                                    {canMutateInAdminArea ? (
                                      <button type="button" className="admin-btn admin-btn-secondary" onClick={() => handleInlineRemoveAnswer(question.id, answerIdx)}>
                                        ×
                                      </button>
                                    ) : null}
                                  </div>
                                ))}
                                {canMutateInAdminArea ? (
                                  <button type="button" className="admin-btn admin-btn-secondary" onClick={() => handleInlineAddAnswer(question.id)}>
                                    + Adaugă pereche
                                  </button>
                                ) : null}
                              </div>
                            )}
                            {qType === 'ordering' && (
                              <div className="admin-course-builder-test-question-answers">
                                <p>Elemente (ordinea corectă):</p>
                                {(Array.isArray(question.answers) ? question.answers : []).map((answer, answerIdx) => (
                                  <div key={`${question.id}-ord-${answerIdx}`} className="admin-course-builder-test-answer-row admin-course-builder-test-answer-row-ordering">
                                    <span className="admin-course-builder-test-order-index">{answerIdx + 1}</span>
                                    <input
                                      type="text"
                                      value={answer.text ?? answer.answer_text ?? ''}
                                      onChange={(e) => handleInlineAnswerTextChange(question.id, answerIdx, e.target.value)}
                                      placeholder="Element"
                                      disabled={!canMutateInAdminArea}
                                    />
                                    {canMutateInAdminArea ? (
                                      <div className="admin-course-builder-test-order-actions">
                                        <button type="button" className="admin-btn admin-btn-secondary admin-course-builder-test-order-btn is-move" aria-label="Mută elementul în sus" onClick={() => handleInlineOrderingMove(question.id, answerIdx, 'up')} disabled={answerIdx === 0}>
                                          ↑
                                        </button>
                                        <button type="button" className="admin-btn admin-btn-secondary admin-course-builder-test-order-btn is-move" aria-label="Mută elementul în jos" onClick={() => handleInlineOrderingMove(question.id, answerIdx, 'down')} disabled={answerIdx === (question.answers?.length || 0) - 1}>
                                          ↓
                                        </button>
                                        <button type="button" className="admin-btn admin-btn-secondary admin-course-builder-test-order-btn is-delete" aria-label="Șterge elementul" onClick={() => handleInlineRemoveAnswer(question.id, answerIdx)}>
                                          ×
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                                {canMutateInAdminArea ? (
                                  <button type="button" className="admin-btn admin-btn-secondary" onClick={() => handleInlineAddAnswer(question.id)}>
                                    + Adaugă element
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {canMutateInAdminArea ? (
                <div className="admin-course-builder-test-add-bottom">
                  <button type="button" className="admin-btn admin-btn-primary" onClick={handleAddDefaultInlineQuestion} disabled={addingQuestion}>
                    {addingQuestion ? 'Se adaugă...' : 'Adaugă întrebare'}
                  </button>
                  {showImportButton ? (
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      disabled
                      title="Vom reveni ulterior cu importul de întrebări"
                    >
                      Importă întrebări
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          {inlineTestTab === 'settings' && (
            <div className="admin-course-builder-test-settings">
              <div className="admin-course-builder-test-field">
                <label htmlFor="inline-test-title">Titlu test</label>
                <input
                  id="inline-test-title"
                  type="text"
                  value={inlineTest.title || ''}
                  onChange={(e) => saveInlineTestPatch({ title: e.target.value })}
                  placeholder="Ex.: Evaluare modul 1"
                  disabled={!canMutateInAdminArea}
                />
              </div>
              <div className="admin-course-builder-test-field">
                <label htmlFor="inline-test-description">Descriere</label>
                <textarea
                  id="inline-test-description"
                  value={inlineTest.description || ''}
                  onChange={(e) => saveInlineTestPatch({ description: e.target.value })}
                  placeholder="Instrucțiuni pentru test (opțional)"
                  rows={4}
                  disabled={!canMutateInAdminArea}
                />
              </div>
              <div className="admin-course-builder-test-field">
                <label>Timp limită (minute)</label>
                <input
                  type="number"
                  min="1"
                  value={inlineTest.time_limit_minutes ?? ''}
                  onChange={(e) => saveInlineTestPatch({ time_limit_minutes: e.target.value ? Number(e.target.value) : null })}
                  disabled={!canMutateInAdminArea}
                />
              </div>
              <div className="admin-course-builder-test-field">
                <label>Încercări maxime</label>
                <input
                  type="number"
                  min="1"
                  value={inlineTest.max_attempts ?? ''}
                  onChange={(e) => saveInlineTestPatch({ max_attempts: e.target.value ? Number(e.target.value) : null })}
                  disabled={!canMutateInAdminArea}
                />
              </div>
              <div className="admin-course-builder-test-field">
                <label>Prag promovare (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={inlineTest.passing_score ?? 70}
                  onChange={(e) => saveInlineTestPatch({ passing_score: e.target.value === '' ? null : Number(e.target.value) })}
                  disabled={!canMutateInAdminArea}
                />
              </div>
              <div className="admin-course-builder-test-settings-section">
                <h3>Comportament test</h3>
                <div className="admin-course-builder-test-toggle-list">
                  {[
                    ['randomize_questions', 'Amestecă întrebările', 'Ordinea întrebărilor va fi randomizată pentru fiecare parcurgere.'],
                    ['randomize_answers', 'Amestecă răspunsurile', 'Opțiunile grilă se afișează în ordine diferită.'],
                    ['show_results_immediately', 'Arată rezultatul imediat', 'Cursantul vede scorul imediat după trimitere.'],
                    ['show_correct_answers', 'Arată răspunsurile corecte', 'După finalizare se pot vedea răspunsurile corecte.'],
                    ['allow_review', 'Permite revizuirea', 'Cursantul poate reveni să revadă testul după completare.'],
                    ['requires_manual_verification', 'Necesită verificare manuală', 'Rezultatul final rămâne în așteptare până la corectare.'],
                  ].map(([key, label, hint]) => (
                    <label key={key} className="admin-course-builder-test-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(inlineTest[key])}
                        onChange={(e) => saveInlineTestPatch({ [key]: e.target.checked })}
                        disabled={!canMutateInAdminArea}
                      />
                      <span>
                        <strong>{label}</strong>
                        <small>{hint}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className={`admin-course-builder-test-sidepanel ${openQuestionTypePickerId ? 'is-open' : ''}`} ref={questionTypeMenuRef}>
          <div className="admin-course-builder-test-sidepanel-head">
            <h3>Tipuri întrebări</h3>
            <button type="button" onClick={() => setOpenQuestionTypePickerId(null)} aria-label="Închide panou">
              ×
            </button>
          </div>
          <div className="admin-course-builder-test-type-grid">
            {INLINE_QUESTION_TYPES.map((typeOpt) => (
              <button
                key={typeOpt.id}
                type="button"
                className="admin-course-builder-test-type-card"
                onClick={() => openQuestionTypePickerId && handleInlineQuestionTypeChange(openQuestionTypePickerId, typeOpt.id)}
                disabled={addingQuestion || !openQuestionTypePickerId || !canMutateInAdminArea}
              >
                <span className="admin-course-builder-test-type-short">{typeOpt.short}</span>
                <span className="admin-course-builder-test-type-label">{typeOpt.label}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
