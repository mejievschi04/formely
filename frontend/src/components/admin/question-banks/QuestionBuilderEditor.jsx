import React, { useMemo, useState } from 'react';
import RichTextEditor from '../../RichTextEditor';
import '../../../styles/admin-course-builder.css';
import {
  INLINE_QUESTION_TYPES,
  normalizeInlineQuestionType,
  getDefaultAnswersByType,
  selectAllTextInputHandlers,
  keepOnlyOneCorrectAnswer,
} from '../../../utils/testQuestionBuilder';
import { getQuestionTypeLabel } from '../../../utils/questionTypeLabels';

const normalizeType = normalizeInlineQuestionType;

const normalizeAnswers = (type, answers) => {
  const list = Array.isArray(answers) ? answers : [];

  if (type === 'matching') {
    return list.map((answer, index) => ({
      left: answer?.left ?? answer?.text ?? answer?.question ?? '',
      right: answer?.right ?? answer?.answer_text ?? answer?.content ?? '',
      text: answer?.left ?? answer?.text ?? answer?.question ?? '',
      answer_text: answer?.right ?? answer?.answer_text ?? answer?.content ?? '',
      is_correct: true,
      order: typeof answer?.order === 'number' ? answer.order : index,
    }));
  }

  if (type === 'ordering') {
    return list.map((answer, index) => ({
      text: answer?.text ?? answer?.answer_text ?? answer?.content ?? answer?.label ?? '',
      is_correct: true,
      order: typeof answer?.order === 'number' ? answer.order : index,
    }));
  }

  if (type === 'true_false') {
    return list.slice(0, 2).map((answer, index) => ({
      text: answer?.text ?? '',
      is_correct: index === 0 ? !!answer?.is_correct : !!answer?.is_correct,
    }));
  }

  if (type === 'short_answer') {
    return list.map((answer, index) => ({
      text: answer?.text ?? '',
      is_correct: true,
      order: typeof answer?.order === 'number' ? answer.order : index,
    }));
  }

  return list.map((answer, index) => ({
    text: answer?.text ?? '',
    is_correct: !!answer?.is_correct,
    order: typeof answer?.order === 'number' ? answer.order : index,
  }));
};

const QuestionBuilderEditor = ({ question, onChange, questionNumber = 1 }) => {
  const [typePickerOpen, setTypePickerOpen] = useState(true);
  const currentType = normalizeType(question?.type);
  const answers = useMemo(
    () => normalizeAnswers(currentType, question?.answers?.length ? question.answers : getDefaultAnswersByType(currentType)),
    [question?.answers, currentType]
  );
  const currentTypeLabel = getQuestionTypeLabel(currentType, 'Întrebare');

  const update = (patch) => onChange({ ...question, ...patch });

  const setType = (type) => {
    const nextType = normalizeType(type);
    update({
      type: nextType,
      answers: getDefaultAnswersByType(nextType),
    });
    setTypePickerOpen(false);
  };

  const updateAnswer = (idx, field, value) => {
    const next = answers.map((answer, i) => (i === idx ? { ...answer, [field]: value } : answer));
    update({ answers: next });
  };

  const toggleCorrect = (idx) => {
    if (currentType === 'true_false' || currentType === 'single_choice') {
      update({
        answers: answers.map((answer, i) => ({
          ...answer,
          is_correct: i === idx,
        })),
      });
      return;
    }

    update({
      answers: answers.map((answer, i) => ({
        ...answer,
        is_correct: i === idx ? !answer.is_correct : answer.is_correct,
      })),
    });
  };

  const addAnswer = () => {
    const defaults = getDefaultAnswersByType(currentType);
    const nextAnswer = defaults[answers.length] || defaults[0] || { text: '', is_correct: false };
    const next = [...answers, { ...nextAnswer }];
    if (currentType === 'ordering') {
      next[next.length - 1] = { ...next[next.length - 1], order: next.length - 1 };
    }
    update({ answers: next });
  };

  const isChoiceType = ['multiple_choice', 'single_choice', 'true_false'].includes(currentType);
  const isShortAnswerType = currentType === 'short_answer';
  const isMatchingType = currentType === 'matching';
  const isOrderingType = currentType === 'ordering';
  const isSingleSelectChoice = currentType === 'single_choice' || currentType === 'true_false';
  const radioGroupName = `answer-correct-${question?.id ?? questionNumber}`;

  const removeAnswer = (idx) => {
    const next = answers.filter((_, i) => i !== idx);
    update({
      answers: isSingleSelectChoice ? keepOnlyOneCorrectAnswer(next) : next,
    });
  };

  const moveAnswer = (idx, direction) => {
    const nextIndex = direction === 'up' ? idx - 1 : idx + 1;
    if (nextIndex < 0 || nextIndex >= answers.length) return;
    const next = [...answers];
    const tmp = next[idx];
    next[idx] = next[nextIndex];
    next[nextIndex] = tmp;
    update({
      answers: next.map((answer, index) => (currentType === 'ordering' ? { ...answer, order: index } : answer)),
    });
  };

  return (
    <div className="admin-course-builder-test-layout">
      <div className="admin-course-builder-test-main">
        <div className="admin-course-builder-test-questions admin-course-builder-test-questions-card">
          <ul className="admin-course-builder-test-question-list">
            <li className="admin-course-builder-test-question-item is-expanded">
              <div className="admin-course-builder-test-question-topline">
                <div className="admin-course-builder-test-question-type-picker">
                  <button
                    type="button"
                    className="admin-course-builder-test-question-badge admin-course-builder-test-question-badge-btn"
                    onClick={() => setTypePickerOpen((prev) => !prev)}
                  >
                    {`#${questionNumber}: ${currentTypeLabel}`}
                  </button>
                </div>
              </div>

              <div className="admin-course-builder-test-question-fields">
                <div className="admin-course-builder-test-question-field">
                  <span className="admin-course-builder-test-question-field-label">Text întrebare</span>
                  <div className="admin-course-builder-test-question-rte">
                    <RichTextEditor
                      value={question?.content || ''}
                      onChange={(html) => update({ content: html })}
                      placeholder="Scrie și formatează întrebarea..."
                      toolbarVariant="basic"
                      showSideTools={false}
                      style={{ minHeight: '120px' }}
                    />
                  </div>
                </div>
                <div className="admin-course-builder-test-question-field">
                  <span className="admin-course-builder-test-question-field-label">
                    Descriere sau indiciu
                    <span className="admin-course-builder-test-question-field-hint">opțional</span>
                  </span>
                  <div className="admin-course-builder-test-question-rte admin-course-builder-test-question-rte-desc">
                    <RichTextEditor
                      value={question?.explanation || ''}
                      onChange={(html) => update({ explanation: html })}
                      placeholder="Context, indiciu sau explicație..."
                      toolbarVariant="basic"
                      showSideTools={false}
                      style={{ minHeight: '88px' }}
                    />
                  </div>
                </div>
              </div>

              <div className="admin-course-builder-test-field">
                <label>Puncte</label>
                <input
                  type="number"
                  min="1"
                  value={question?.points ?? 1}
                  onChange={(e) => update({ points: Number(e.target.value) || 1 })}
                />
              </div>

              {isChoiceType && (
                <div className="admin-course-builder-test-question-answers">
                  <p>Răspunsuri:</p>
                  {answers.map((answer, idx) => (
                    <div key={`ans-${idx}`} className="admin-course-builder-test-answer-row">
                      <input
                        type={isSingleSelectChoice ? 'radio' : 'checkbox'}
                        name={isSingleSelectChoice ? radioGroupName : undefined}
                        checked={!!answer.is_correct}
                        onChange={() => toggleCorrect(idx)}
                      />
                      <input
                        type="text"
                        value={answer.text || ''}
                        onChange={(e) => updateAnswer(idx, 'text', e.target.value)}
                        placeholder="Introduce răspuns"
                        disabled={currentType === 'true_false'}
                        {...selectAllTextInputHandlers}
                      />
                      {!isSingleSelectChoice && (
                        <button type="button" className="admin-btn admin-btn-secondary" onClick={() => removeAnswer(idx)}>
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {!isSingleSelectChoice && (
                    <button type="button" className="admin-btn admin-btn-secondary" onClick={addAnswer}>
                      + Adaugă răspuns
                    </button>
                  )}
                </div>
              )}

              {isShortAnswerType && (
                <div className="admin-course-builder-test-question-answers">
                  <p className="admin-course-builder-test-short-hint">
                    Răspuns scurt — evaluare manuală. Opțional: răspunsuri acceptate pentru instructor.
                  </p>
                  {answers.map((answer, idx) => (
                    <div key={`ref-${idx}`} className="admin-course-builder-test-answer-row">
                      <input
                        type="text"
                        value={answer.text || ''}
                        onChange={(e) => updateAnswer(idx, 'text', e.target.value)}
                        placeholder="Răspuns acceptat (opțional)"
                        {...selectAllTextInputHandlers}
                      />
                      <button type="button" className="admin-btn admin-btn-secondary" onClick={() => removeAnswer(idx)}>
                        ×
                      </button>
                    </div>
                  ))}
                  <button type="button" className="admin-btn admin-btn-secondary" onClick={addAnswer}>
                    + Răspuns acceptat
                  </button>
                </div>
              )}

              {isMatchingType && (
                <div className="admin-course-builder-test-question-answers">
                  <p>Perechi:</p>
                  {answers.map((answer, idx) => (
                    <div key={`pair-${idx}`} className="admin-course-builder-test-answer-row">
                      <input
                        type="text"
                        value={answer.left || ''}
                        onChange={(e) => updateAnswer(idx, 'left', e.target.value)}
                        placeholder="Element stânga"
                        {...selectAllTextInputHandlers}
                      />
                      <input
                        type="text"
                        value={answer.right || ''}
                        onChange={(e) => updateAnswer(idx, 'right', e.target.value)}
                        placeholder="Element dreapta"
                        {...selectAllTextInputHandlers}
                      />
                      <button type="button" className="admin-btn admin-btn-secondary" onClick={() => removeAnswer(idx)}>
                        ×
                      </button>
                    </div>
                  ))}
                  <button type="button" className="admin-btn admin-btn-secondary" onClick={addAnswer}>
                    + Adaugă pereche
                  </button>
                </div>
              )}

              {isOrderingType && (
                <div className="admin-course-builder-test-question-answers">
                  <p>Elemente în ordinea corectă:</p>
                  {answers.map((answer, idx) => (
                    <div key={`order-${idx}`} className="admin-course-builder-test-answer-row">
                      <span style={{ minWidth: '2rem', fontWeight: 700 }}>{idx + 1}.</span>
                      <input
                        type="text"
                        value={answer.text || ''}
                        onChange={(e) => updateAnswer(idx, 'text', e.target.value)}
                        placeholder="Element"
                        {...selectAllTextInputHandlers}
                      />
                      <button type="button" className="admin-btn admin-btn-secondary" onClick={() => moveAnswer(idx, 'up')} disabled={idx === 0}>
                        ↑
                      </button>
                      <button type="button" className="admin-btn admin-btn-secondary" onClick={() => moveAnswer(idx, 'down')} disabled={idx === answers.length - 1}>
                        ↓
                      </button>
                      <button type="button" className="admin-btn admin-btn-secondary" onClick={() => removeAnswer(idx)}>
                        ×
                      </button>
                    </div>
                  ))}
                  <button type="button" className="admin-btn admin-btn-secondary" onClick={addAnswer}>
                    + Adaugă element
                  </button>
                </div>
              )}
            </li>
          </ul>
        </div>
      </div>

      <aside className={`admin-course-builder-test-sidepanel ${typePickerOpen ? 'is-open' : ''}`}>
        <div className="admin-course-builder-test-sidepanel-head">
          <h3>Tipuri întrebări</h3>
        </div>
        <div className="admin-course-builder-test-type-grid">
          {INLINE_QUESTION_TYPES.map((typeOpt) => (
            <button
              key={typeOpt.id}
              type="button"
              className={`admin-course-builder-test-type-card ${currentType === typeOpt.id ? 'is-active' : ''}`}
              onClick={() => setType(typeOpt.id)}
            >
              <span className="admin-course-builder-test-type-short">{typeOpt.short}</span>
              <span className="admin-course-builder-test-type-label">{typeOpt.label}</span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
};

export default QuestionBuilderEditor;
