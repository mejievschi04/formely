import React from 'react';
import {
  ArrowRight,
  ArrowsLeftRight,
  CaretDown,
  CaretUp,
  Check,
  ListChecks,
  ListNumbers,
  Plus,
  RadioButton,
  Scales,
  ThumbsUp,
  Trash,
  X,
} from '@phosphor-icons/react';
import {
  INLINE_QUESTION_TYPES,
  isBinaryQuestionType,
  normalizeInlineQuestionType,
  TEST_RESULTS_DISPLAY_OPTIONS,
  getTestResultsDisplayMode,
  patchTestResultsDisplayMode,
} from '../../../utils/testQuestionBuilder';
import RichTextEditor from '../../RichTextEditor';
import RichTextHtml from '../../RichTextHtml';
import { stripRichTextToPlain } from '../../../utils/richTextContent';
import PassingScoreByQuestions from '../tests/PassingScoreByQuestions';
import Modal from '../../common/Modal';
import './InlineTestEditorShell.css';
import '../../../styles/test-settings.css';

const QUESTION_TYPE_ICONS = {
  multiple_choice: ListChecks,
  single_choice: RadioButton,
  true_false: Scales,
  yes_no: ThumbsUp,
  matching: ArrowsLeftRight,
  ordering: ListNumbers,
};

export default function InlineTestEditorShell({
  editor,
  subtitle = 'Configurezi testul în același editor ca în constructorul de curs.',
  showBuilderSummary = false,
  showSectionTabs = true,
  // pagina builder-ului de test își desenează propriul antet (titlu, stare, acțiuni, file)
  showOverview = true,
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
      {showOverview ? (
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
                  className="admin-btn lms-btn-primary"
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

        {showSectionTabs ? (
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
        ) : null}
      </div>
      ) : null}

      <div className="admin-course-builder-test-layout">
        <div className="admin-course-builder-test-main">
          {inlineTestTab === 'questions' && (
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
                        id={`test-question-${question.id}`}
                        className={`admin-course-builder-test-question-item ${questionExpanded ? 'is-expanded' : 'is-collapsed'}`}
                        data-qtype={qType}
                      >
                        <div className="va-tq-row">
                          <span className="va-tq-num" aria-hidden="true">{idx + 1}</span>
                          <div className="va-tq-main">
                            <button
                              type="button"
                              className="va-tq-type"
                              onClick={() => handleToggleQuestionTypePicker(question.id)}
                              disabled={!canMutateInAdminArea}
                              aria-label={`Întrebarea ${idx + 1}: ${typeLabel}. Schimbă tipul`}
                            >
                              {typeLabel}
                              {canMutateInAdminArea ? <CaretDown size={12} weight="bold" aria-hidden="true" /> : null}
                            </button>
                            {!questionExpanded ? (
                              <>
                                <p className="va-tq-preview">
                                  {stripRichTextToPlain(question.content) || 'Întrebare fără conținut'}
                                </p>
                                {stripRichTextToPlain(question.explanation) ? (
                                  <p className="va-tq-preview-desc">{stripRichTextToPlain(question.explanation)}</p>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                          <div className="va-tq-actions">
                            <button
                              type="button"
                              className="lms-btn-secondary lms-btn-sm"
                              onClick={() => toggleQuestionExpanded(question.id)}
                              aria-expanded={questionExpanded}
                            >
                              {questionExpanded ? 'Strânge' : canMutateInAdminArea ? 'Editează' : 'Vezi'}
                            </button>
                            {canMutateInAdminArea ? (
                              <button
                                type="button"
                                className="va-tq-delete"
                                onClick={() => handleDeleteInlineQuestion(question.id)}
                                aria-label={`Șterge întrebarea ${idx + 1}`}
                                title="Șterge întrebarea"
                              >
                                <Trash size={16} weight="bold" aria-hidden="true" />
                              </button>
                            ) : null}
                          </div>
                        </div>
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
                                      placeholder="Scrie întrebarea..."
                                      courseId={courseId}
                                      toolbarVariant="none"
                                      emphasis="strong"
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
                                  Sursă
                                  <span className="admin-course-builder-test-question-field-hint">opțional</span>
                                </span>
                                {canMutateInAdminArea ? (
                                  <div className="admin-course-builder-test-question-rte admin-course-builder-test-question-rte-desc">
                                    <RichTextEditor
                                      value={question.explanation || ''}
                                      onChange={(html) => patchQuestionField(question.id, 'explanation', html)}
                                      onBlur={() => handleInlineQuestionBlur(question.id, {})}
                                      placeholder="De unde este materialul din curs..."
                                      courseId={courseId}
                                      toolbarVariant="none"
                                      emphasis="plain"
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
                            {(qType === 'multiple_choice' || qType === 'single_choice' || isBinaryQuestionType(qType)) && (
                              <div className="va-qa">
                                <div className="va-qa__head">
                                  <span className="va-qa__title">Variante de răspuns</span>
                                  <span className="va-qa__hint">
                                    {qType === 'multiple_choice' ? 'Marchează toate variantele corecte.' : 'Marchează varianta corectă.'}
                                  </span>
                                </div>
                                <ul className="va-qa__list">
                                  {(Array.isArray(question.answers) ? question.answers : []).map((answer, answerIdx) => (
                                    <li key={`${question.id}-answer-${answerIdx}`} className={`va-qa__row${answer.is_correct ? ' is-correct' : ''}`}>
                                      <label className="va-qa__correct">
                                        <input
                                          type={qType === 'multiple_choice' ? 'checkbox' : 'radio'}
                                          name={qType !== 'multiple_choice' ? `inline-answer-correct-${question.id}` : undefined}
                                          checked={!!answer.is_correct}
                                          onChange={() => handleInlineAnswerCorrectToggle(question.id, answerIdx, qType !== 'multiple_choice')}
                                          disabled={!canMutateInAdminArea}
                                          aria-label={`Varianta ${answerIdx + 1} este corectă`}
                                        />
                                        <span>{answer.is_correct ? 'Corect' : 'Greșit'}</span>
                                      </label>
                                      <input
                                        type="text"
                                        className="va-qa__input"
                                        value={answer.text ?? answer.answer_text ?? ''}
                                        onChange={(e) => handleInlineAnswerTextChange(question.id, answerIdx, e.target.value)}
                                        placeholder={`Varianta ${answerIdx + 1}`}
                                        aria-label={`Textul variantei ${answerIdx + 1}`}
                                        disabled={!canMutateInAdminArea || isBinaryQuestionType(qType)}
                                      />
                                      {!isBinaryQuestionType(qType) && canMutateInAdminArea ? (
                                        <button
                                          type="button"
                                          className="va-qa__icon-btn is-danger"
                                          onClick={() => handleInlineRemoveAnswer(question.id, answerIdx)}
                                          aria-label={`Șterge varianta ${answerIdx + 1}`}
                                          title="Șterge varianta"
                                        >
                                          <Trash size={16} weight="bold" aria-hidden="true" />
                                        </button>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                                {!isBinaryQuestionType(qType) && canMutateInAdminArea ? (
                                  <button type="button" className="lms-btn-secondary lms-btn-sm va-qa__add" onClick={() => handleInlineAddAnswer(question.id)}>
                                    <Plus size={16} weight="bold" aria-hidden="true" />
                                    Adaugă variantă
                                  </button>
                                ) : null}
                              </div>
                            )}
                            {qType === 'matching' && (
                              <div className="va-qa">
                                <div className="va-qa__head">
                                  <span className="va-qa__title">Perechi</span>
                                  <span className="va-qa__hint">Cursantul potrivește fiecare element din stânga cu cel din dreapta.</span>
                                </div>
                                <ul className="va-qa__list">
                                  {(Array.isArray(question.answers) ? question.answers : []).map((answer, answerIdx) => (
                                    <li key={`${question.id}-pair-${answerIdx}`} className="va-qa__row va-qa__row--pair">
                                      <input
                                        type="text"
                                        className="va-qa__input"
                                        value={answer.left ?? answer.text ?? ''}
                                        onChange={(e) => handleInlineMatchingPairChange(question.id, answerIdx, 'left', e.target.value)}
                                        placeholder="Element"
                                        aria-label={`Perechea ${answerIdx + 1}, stânga`}
                                        disabled={!canMutateInAdminArea}
                                      />
                                      <ArrowRight className="va-qa__pair-arrow" size={16} weight="bold" aria-hidden="true" />
                                      <input
                                        type="text"
                                        className="va-qa__input"
                                        value={answer.right ?? answer.answer_text ?? ''}
                                        onChange={(e) => handleInlineMatchingPairChange(question.id, answerIdx, 'right', e.target.value)}
                                        placeholder="Potrivire"
                                        aria-label={`Perechea ${answerIdx + 1}, dreapta`}
                                        disabled={!canMutateInAdminArea}
                                      />
                                      {canMutateInAdminArea ? (
                                        <button
                                          type="button"
                                          className="va-qa__icon-btn is-danger"
                                          onClick={() => handleInlineRemoveAnswer(question.id, answerIdx)}
                                          aria-label={`Șterge perechea ${answerIdx + 1}`}
                                          title="Șterge perechea"
                                        >
                                          <Trash size={16} weight="bold" aria-hidden="true" />
                                        </button>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                                {canMutateInAdminArea ? (
                                  <button type="button" className="lms-btn-secondary lms-btn-sm va-qa__add" onClick={() => handleInlineAddAnswer(question.id)}>
                                    <Plus size={16} weight="bold" aria-hidden="true" />
                                    Adaugă pereche
                                  </button>
                                ) : null}
                              </div>
                            )}
                            {qType === 'ordering' && (
                              <div className="va-qa">
                                <div className="va-qa__head">
                                  <span className="va-qa__title">Ordinea corectă</span>
                                  <span className="va-qa__hint">Cursantul primește elementele amestecate și le aranjează în această ordine.</span>
                                </div>
                                <ul className="va-qa__list">
                                  {(Array.isArray(question.answers) ? question.answers : []).map((answer, answerIdx) => (
                                    <li key={`${question.id}-ord-${answerIdx}`} className="va-qa__row va-qa__row--order">
                                      <span className="va-qa__order-index" aria-hidden="true">{answerIdx + 1}</span>
                                      <input
                                        type="text"
                                        className="va-qa__input"
                                        value={answer.text ?? answer.answer_text ?? ''}
                                        onChange={(e) => handleInlineAnswerTextChange(question.id, answerIdx, e.target.value)}
                                        placeholder={`Pasul ${answerIdx + 1}`}
                                        aria-label={`Elementul ${answerIdx + 1}`}
                                        disabled={!canMutateInAdminArea}
                                      />
                                      {canMutateInAdminArea ? (
                                        <div className="va-qa__order-actions">
                                          <button type="button" className="va-qa__icon-btn" aria-label={`Mută elementul ${answerIdx + 1} în sus`} onClick={() => handleInlineOrderingMove(question.id, answerIdx, 'up')} disabled={answerIdx === 0}>
                                            <CaretUp size={16} weight="bold" aria-hidden="true" />
                                          </button>
                                          <button type="button" className="va-qa__icon-btn" aria-label={`Mută elementul ${answerIdx + 1} în jos`} onClick={() => handleInlineOrderingMove(question.id, answerIdx, 'down')} disabled={answerIdx === (question.answers?.length || 0) - 1}>
                                            <CaretDown size={16} weight="bold" aria-hidden="true" />
                                          </button>
                                          <button type="button" className="va-qa__icon-btn is-danger" aria-label={`Șterge elementul ${answerIdx + 1}`} onClick={() => handleInlineRemoveAnswer(question.id, answerIdx)}>
                                            <Trash size={16} weight="bold" aria-hidden="true" />
                                          </button>
                                        </div>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                                {canMutateInAdminArea ? (
                                  <button type="button" className="lms-btn-secondary lms-btn-sm va-qa__add" onClick={() => handleInlineAddAnswer(question.id)}>
                                    <Plus size={16} weight="bold" aria-hidden="true" />
                                    Adaugă element
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
                  <button type="button" className="admin-btn lms-btn-primary" onClick={handleAddDefaultInlineQuestion} disabled={addingQuestion}>
                    {addingQuestion ? 'Se adaugă...' : 'Adaugă întrebare'}
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {inlineTestTab === 'settings' && (
            <div className="admin-course-builder-test-settings va-ts">
              <section className="va-ts__section" aria-labelledby="va-ts-info">
                <h3 id="va-ts-info" className="va-ts__title">Informații</h3>
                <div className="va-ts__grid">
                  <div className="va-ts__field va-ts__field--full">
                    <label htmlFor="inline-test-title">Titlu test</label>
                    <input
                      id="inline-test-title"
                      type="text"
                      className="va-ts__input"
                      value={inlineTest.title || ''}
                      onChange={(e) => saveInlineTestPatch({ title: e.target.value })}
                      placeholder="Ex.: Evaluare modul 1"
                      disabled={!canMutateInAdminArea}
                    />
                  </div>
                  <div className="va-ts__field va-ts__field--full">
                    <label htmlFor="inline-test-description">
                      Descriere <span className="va-ts__optional">(instrucțiuni pentru cursant, opțional)</span>
                    </label>
                    <textarea
                      id="inline-test-description"
                      className="va-ts__input va-ts__textarea"
                      value={inlineTest.description || ''}
                      onChange={(e) => saveInlineTestPatch({ description: e.target.value })}
                      placeholder="Ce trebuie să știe cursantul înainte să înceapă"
                      rows={3}
                      disabled={!canMutateInAdminArea}
                    />
                  </div>
                </div>
              </section>

              <section className="va-ts__section" aria-labelledby="va-ts-run">
                <h3 id="va-ts-run" className="va-ts__title">Desfășurare</h3>
                <div className="va-ts__grid va-ts__grid--three">
                  <div className="va-ts__field">
                    <label htmlFor="inline-test-time">Timp limită</label>
                    <div className="va-ts__suffix-input">
                      <input
                        id="inline-test-time"
                        type="number"
                        min="1"
                        className="va-ts__input"
                        value={inlineTest.time_limit_minutes ?? ''}
                        onChange={(e) => saveInlineTestPatch({ time_limit_minutes: e.target.value ? Number(e.target.value) : null })}
                        placeholder="Fără limită"
                        disabled={!canMutateInAdminArea}
                      />
                      <span aria-hidden="true">min</span>
                    </div>
                    <p className="va-ts__hint">Lasă gol pentru timp nelimitat.</p>
                  </div>
                  <div className="va-ts__field">
                    <label htmlFor="inline-test-attempts">Încercări</label>
                    <div className="va-ts__inline">
                      <input
                        id="inline-test-attempts"
                        type="number"
                        min="1"
                        className="va-ts__input"
                        value={inlineTest.max_attempts ?? ''}
                        onChange={(e) => saveInlineTestPatch({ max_attempts: Math.max(1, Number(e.target.value) || 1) })}
                        placeholder="∞"
                        disabled={!canMutateInAdminArea || inlineTest.max_attempts == null}
                      />
                      <label className="va-ts__switch">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={inlineTest.max_attempts == null}
                          onChange={(e) => saveInlineTestPatch({ max_attempts: e.target.checked ? null : 1 })}
                          disabled={!canMutateInAdminArea}
                        />
                        <span className="va-ts__switch-track" aria-hidden="true" />
                        <span>Nelimitate</span>
                      </label>
                    </div>
                  </div>
                  <div className="va-ts__field">
                    <PassingScoreByQuestions
                      questionCount={inlineQuestions.length}
                      passingScore={inlineTest.passing_score ?? 70}
                      onPassingScoreChange={(next) => saveInlineTestPatch({ passing_score: next })}
                      disabled={!canMutateInAdminArea}
                    />
                  </div>
                </div>
              </section>

              <section className="va-ts__section" aria-labelledby="va-ts-behaviour">
                <h3 id="va-ts-behaviour" className="va-ts__title">Comportament</h3>
                <div className="va-ts__toggles">
                  {[
                    ['randomize_questions', 'Amestecă întrebările', 'Ordinea întrebărilor diferă la fiecare parcurgere.'],
                    ['randomize_answers', 'Amestecă răspunsurile', 'Variantele apar în altă ordine pentru fiecare cursant.'],
                    ['show_results_immediately', 'Arată rezultatul imediat', 'Cursantul vede scorul imediat după trimitere.'],
                    ['allow_review', 'Permite revizuirea', 'Cursantul poate revedea testul după ce l-a terminat.'],
                    ['requires_manual_verification', 'Necesită verificare manuală', 'Rezultatul rămâne în așteptare până la corectare.'],
                  ].map(([key, label, hint]) => (
                    <label key={key} className={`va-ts__toggle${inlineTest[key] ? ' is-on' : ''}`}>
                      <span className="va-ts__toggle-text">
                        <strong>{label}</strong>
                        <small>{hint}</small>
                      </span>
                      <span className="va-ts__switch">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={Boolean(inlineTest[key])}
                          onChange={(e) => saveInlineTestPatch({ [key]: e.target.checked })}
                          disabled={!canMutateInAdminArea}
                        />
                        <span className="va-ts__switch-track" aria-hidden="true" />
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="va-ts__section" aria-labelledby="va-ts-results">
                <h3 id="va-ts-results" className="va-ts__title">Afișarea răspunsurilor după test</h3>
                <p className="va-ts__hint">O singură opțiune: răspunsurile corecte și cele date de cursant nu se afișează împreună.</p>
                <div className="va-ts__choices" role="radiogroup" aria-labelledby="va-ts-results">
                  {TEST_RESULTS_DISPLAY_OPTIONS.map((option) => {
                    const active = getTestResultsDisplayMode(inlineTest) === option.id;
                    return (
                      <label key={option.id} className={`va-ts__choice${active ? ' is-active' : ''}`}>
                        <input
                          type="radio"
                          name="inline-test-results-display"
                          value={option.id}
                          checked={active}
                          onChange={() => saveInlineTestPatch(patchTestResultsDisplayMode(option.id))}
                          disabled={!canMutateInAdminArea}
                        />
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.hint}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Tipul întrebării: fereastră deschisă doar la schimbarea tipului (înainte un panou mereu vizibil) */}
        <Modal
          isOpen={Boolean(openQuestionTypePickerId)}
          onClose={() => setOpenQuestionTypePickerId(null)}
          closeOnBackdropClick
          closeOnEscape
          ariaLabelledby="va-tq-type-title"
          className="va-dialog-overlay"
          unstyledContent
        >
          <div className="va-dialog va-tq-type-dialog" ref={questionTypeMenuRef}>
            <header className="va-dialog__header">
              <h2 id="va-tq-type-title" className="va-dialog__title">Tipul întrebării</h2>
              <button type="button" className="va-close-btn" onClick={() => setOpenQuestionTypePickerId(null)} aria-label="Închide">
                <X size={18} weight="bold" aria-hidden="true" />
              </button>
            </header>
            <div className="va-dialog__body">
              <p className="va-field__hint va-tq-type-hint">Schimbarea tipului înlocuiește variantele de răspuns ale întrebării.</p>
              <div className="va-tq-types" role="radiogroup" aria-label="Tipul întrebării">
                {INLINE_QUESTION_TYPES.map((typeOpt) => {
                  const current = inlineQuestions.find((q) => Number(q.id) === Number(openQuestionTypePickerId));
                  const isCurrent = Boolean(current) && normalizeInlineQuestionType(current.type || 'multiple_choice') === typeOpt.id;
                  const TypeIcon = QUESTION_TYPE_ICONS[typeOpt.id] || ListChecks;
                  return (
                    <button
                      key={typeOpt.id}
                      type="button"
                      role="radio"
                      aria-checked={isCurrent}
                      className={`va-tq-option${isCurrent ? ' is-current' : ''}`}
                      data-qtype={typeOpt.id}
                      onClick={() => openQuestionTypePickerId && handleInlineQuestionTypeChange(openQuestionTypePickerId, typeOpt.id)}
                      disabled={addingQuestion || !openQuestionTypePickerId || !canMutateInAdminArea}
                    >
                      <span className="va-tq-option__icon" aria-hidden="true">
                        <TypeIcon size={22} weight="bold" />
                      </span>
                      <span className="va-tq-option__text">
                        <span className="va-tq-option__label">{typeOpt.label}</span>
                        <span className="va-tq-option__hint">{typeOpt.hint}</span>
                      </span>
                      {isCurrent ? (
                        <span className="va-tq-option__current">
                          <Check size={14} weight="bold" aria-hidden="true" />
                          Tipul curent
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
