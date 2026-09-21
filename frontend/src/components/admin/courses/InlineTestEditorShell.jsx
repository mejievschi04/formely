import React from 'react';
import {
  INLINE_QUESTION_TYPES,
  normalizeInlineQuestionType,
  selectAllTextInputHandlers,
} from '../../../utils/testQuestionBuilder';
import RichTextEditor from '../../RichTextEditor';
import RichTextHtml from '../../RichTextHtml';
import { stripRichTextToPlain } from '../../../utils/richTextContent';
import NumberStepper from '../tests/NumberStepper';
import PassingScoreByQuestions from '../tests/PassingScoreByQuestions';
import TestStatisticsPanel from '../../../components/admin/tests/TestStatisticsPanel';

export default function InlineTestEditorShell({
  editor,
  subtitle = '',
  showImportButton = true,
  showBuilderSummary = false,
  showStatisticsTab = false,
  courseId = null,
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
    isQuestionExpanded,
    toggleQuestionExpanded,
    toggleAllQuestionsExpanded,
    allQuestionsExpanded,
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
            {subtitle ? <p>{subtitle}</p> : null}
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
          {showStatisticsTab ? (
            <button
              type="button"
              className={`admin-course-builder-test-tab ${inlineTestTab === 'statistics' ? 'is-active' : ''}`}
              onClick={() => setInlineTestTab('statistics')}
            >
              Statistici
            </button>
          ) : null}
        </div>
      </div>

      <div className="admin-course-builder-test-layout">
        <div className="admin-course-builder-test-main">
          {inlineTestTab === 'statistics' && showStatisticsTab ? (
            <TestStatisticsPanel testId={inlineTest?.id} />
          ) : inlineTestTab === 'questions' && (
            <div className="admin-course-builder-test-questions admin-course-builder-test-questions-card">
              <div className="admin-course-builder-test-questions-header">
                <span>Întrebări ({inlineQuestions.length})</span>
                <div className="admin-course-builder-test-questions-actions">
                  {inlineQuestions.length > 0 && canMutateInAdminArea ? (
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      onClick={toggleAllQuestionsExpanded}
                    >
                      {allQuestionsExpanded ? 'Strânge toate' : 'Deschide toate'}
                    </button>
                  ) : null}
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
                    const questionExpanded = isQuestionExpanded(question.id);
                    return (
                      <li
                        key={question.id}
                        className={`admin-course-builder-test-question-item ${questionExpanded ? 'is-expanded' : 'is-collapsed'}`}
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
                                onClick={() => toggleQuestionExpanded(question.id)}
                              >
                                {questionExpanded ? 'Strânge' : 'Deschide'}
                              </button>
                              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => handleDeleteInlineQuestion(question.id)}>
                                Șterge
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {!questionExpanded && (
                          <div className="admin-course-builder-test-question-collapsed-preview">
                            <p className="admin-course-builder-test-question-collapsed-text">
                              {stripRichTextToPlain(question.content) || 'Întrebare fără conținut'}
                            </p>
                            {stripRichTextToPlain(question.explanation) ? (
                              <p className="admin-course-builder-test-question-collapsed-desc">
                                {stripRichTextToPlain(question.explanation)}
                              </p>
                            ) : null}
                          </div>
                        )}
                        {questionExpanded && (
                          <>
                            <div className="admin-course-builder-test-question-fields">
                              <div className="admin-course-builder-test-question-field">
                                <span className="admin-course-builder-test-question-field-label">Text întrebare</span>
                                {canMutateInAdminArea ? (
                                  <div className="admin-course-builder-test-question-rte">
                                    <RichTextEditor
                                      value={question.content || ''}
                                      onChange={(html) => patchQuestionField(question.id, 'content', html)}
                                      onBlur={() => handleInlineQuestionBlur(question.id, {})}
                                      placeholder="Scrie și formatează întrebarea..."
                                      courseId={courseId}
                                      toolbarVariant="basic"
                                      showSideTools={false}
                                      style={{ minHeight: '120px' }}
                                    />
                                  </div>
                                ) : (
                                  <RichTextHtml
                                    html={question.content}
                                    className="admin-course-builder-test-question-readonly"
                                    fallback={<p className="admin-course-builder-test-empty">Întrebare fără conținut</p>}
                                  />
                                )}
                              </div>
                              <div className="admin-course-builder-test-question-field">
                                <span className="admin-course-builder-test-question-field-label">
                                  Descriere sau indiciu
                                  <span className="admin-course-builder-test-question-field-hint">opțional</span>
                                </span>
                                {canMutateInAdminArea ? (
                                  <div className="admin-course-builder-test-question-rte admin-course-builder-test-question-rte-desc">
                                    <RichTextEditor
                                      value={question.explanation || ''}
                                      onChange={(html) => patchQuestionField(question.id, 'explanation', html)}
                                      onBlur={() => handleInlineQuestionBlur(question.id, {})}
                                      placeholder="Context, indiciu sau explicație..."
                                      courseId={courseId}
                                      toolbarVariant="basic"
                                      showSideTools={false}
                                      style={{ minHeight: '88px' }}
                                    />
                                  </div>
                                ) : (
                                  <RichTextHtml
                                    html={question.explanation}
                                    className="admin-course-builder-test-question-readonly admin-course-builder-test-question-readonly-desc"
                                  />
                                )}
                              </div>
                            </div>
                            {(qType === 'multiple_choice' || qType === 'single_choice' || qType === 'true_false') && (
                              <div className="admin-course-builder-test-question-answers">
                                <p>Răspunsuri:</p>
                                {(Array.isArray(question.answers) ? question.answers : []).map((answer, answerIdx) => (
                                  <div key={`${question.id}-answer-${answerIdx}`} className="admin-course-builder-test-answer-row">
                                    <input
                                      type={qType === 'multiple_choice' ? 'checkbox' : 'radio'}
                                      name={qType !== 'multiple_choice' ? `inline-answer-correct-${question.id}` : undefined}
                                      checked={!!answer.is_correct}
                                      onChange={() => handleInlineAnswerCorrectToggle(question.id, answerIdx, qType !== 'multiple_choice')}
                                      disabled={!canMutateInAdminArea}
                                    />
                                    <input
                                      type="text"
                                      value={answer.text ?? answer.answer_text ?? ''}
                                      onChange={(e) => handleInlineAnswerTextChange(question.id, answerIdx, e.target.value)}
                                      placeholder="Introdu răspuns"
                                      disabled={!canMutateInAdminArea}
                                      {...selectAllTextInputHandlers}
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
                            {qType === 'short_answer' && (
                              <div className="admin-course-builder-test-question-answers">
                                <p className="admin-course-builder-test-short-hint">
                                  Elevul scrie liber. Corectarea este manuală. Opțional: răspunsuri acceptate (referință pentru instructor).
                                </p>
                                {(Array.isArray(question.answers) ? question.answers : []).map((answer, answerIdx) => (
                                  <div key={`${question.id}-ref-${answerIdx}`} className="admin-course-builder-test-answer-row">
                                    <input
                                      type="text"
                                      value={answer.text ?? answer.answer_text ?? ''}
                                      onChange={(e) => handleInlineAnswerTextChange(question.id, answerIdx, e.target.value)}
                                      placeholder="Răspuns acceptat (opțional)"
                                      disabled={!canMutateInAdminArea}
                                      {...selectAllTextInputHandlers}
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
                                    + Răspuns acceptat
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
                                      {...selectAllTextInputHandlers}
                                    />
                                    <input
                                      type="text"
                                      value={answer.right ?? answer.answer_text ?? ''}
                                      onChange={(e) => handleInlineMatchingPairChange(question.id, answerIdx, 'right', e.target.value)}
                                      placeholder="Element dreapta"
                                      disabled={!canMutateInAdminArea}
                                      {...selectAllTextInputHandlers}
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
                                      {...selectAllTextInputHandlers}
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
              <div className="admin-course-builder-test-metrics">
                <div className="admin-course-builder-test-field">
                  <label>Timp limită (minute)</label>
                  <NumberStepper
                    min={1}
                    allowEmpty
                    value={inlineTest.time_limit_minutes ?? ''}
                    onChange={(next) => saveInlineTestPatch({ time_limit_minutes: next })}
                    disabled={!canMutateInAdminArea}
                    ariaLabel="Timp limită în minute"
                  />
                </div>
                <div className="admin-course-builder-test-field">
                  <label>Încercări maxime</label>
                  <NumberStepper
                    min={1}
                    value={inlineTest.max_attempts ?? 1}
                    onChange={(next) => saveInlineTestPatch({ max_attempts: Math.max(1, Number(next) || 1) })}
                    disabled={!canMutateInAdminArea}
                    ariaLabel="Încercări maxime"
                  />
                </div>
                <div className="admin-course-builder-test-field">
                  <PassingScoreByQuestions
                    questionCount={inlineQuestions.length}
                    passingScore={inlineTest.passing_score ?? 70}
                    onPassingScoreChange={(next) => saveInlineTestPatch({ passing_score: next })}
                    disabled={!canMutateInAdminArea}
                  />
                </div>
              </div>
              <div className="admin-course-builder-test-settings-section">
                <h3>Comportament test</h3>
                <div className="admin-course-builder-test-toggle-list">
                  {[
                    ['randomize_questions', 'Amestecă întrebările', 'Ordinea întrebărilor va fi randomizată pentru fiecare parcurgere.'],
                    ['randomize_answers', 'Amestecă răspunsurile', 'Opțiunile grilă se afișează în ordine diferită.'],
                    ['show_results_immediately', 'Arată rezultatul imediat', 'Cursantul vede scorul imediat după trimitere.'],
                    ['show_correct_answers', 'Arată răspunsurile corecte', 'După finalizare se pot vedea răspunsurile corecte.'],
                    ['show_only_submitted_answers', 'Doar răspunsurile oferite', 'La final și în rezultate se afișează doar ce a răspuns cursantul, fără corect/greșit.'],
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
