import React, { useMemo, useState } from 'react';
import '../../../styles/admin-course-builder.css';

const INLINE_QUESTION_TYPES = [
  { id: 'multiple_choice', label: 'Răspuns multiplu', short: 'A/B' },
  { id: 'true_false', label: 'Adevărat / Fals', short: 'T/F' },
  { id: 'matching', label: 'Potrivire', short: '↔' },
  { id: 'ordering', label: 'Ordonare', short: '1-4' },
];

const normalizeType = (type) => {
  if (type === 'single_choice') return 'multiple_choice';
  return INLINE_QUESTION_TYPES.some((entry) => entry.id === type) ? type : 'multiple_choice';
};

const getDefaultAnswersByType = (type) => {
  if (type === 'true_false') {
    return [
      { text: 'Adevărat', is_correct: true },
      { text: 'Fals', is_correct: false },
    ];
  }

  if (type === 'matching') {
    return [
      { left: 'Element A', right: 'Răspuns A', text: 'Element A', answer_text: 'Răspuns A', is_correct: true },
      { left: 'Element B', right: 'Răspuns B', text: 'Element B', answer_text: 'Răspuns B', is_correct: true },
    ];
  }

  if (type === 'ordering') {
    return [
      { text: 'Pasul 1', is_correct: true, order: 0 },
      { text: 'Pasul 2', is_correct: true, order: 1 },
    ];
  }

  return [
    { text: 'Răspuns A', is_correct: true },
    { text: 'Răspuns B', is_correct: false },
  ];
};

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
  const currentTypeLabel = INLINE_QUESTION_TYPES.find((entry) => entry.id === currentType)?.label || 'Întrebare';

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
    if (currentType === 'true_false') {
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

  const removeAnswer = (idx) => update({ answers: answers.filter((_, i) => i !== idx) });

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

  const isChoiceType = currentType === 'multiple_choice' || currentType === 'true_false';
  const isMatchingType = currentType === 'matching';
  const isOrderingType = currentType === 'ordering';

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

              <textarea
                className="admin-course-builder-test-question-input"
                value={question?.content || ''}
                onChange={(e) => update({ content: e.target.value })}
                placeholder="Adaugă întrebare"
                rows={2}
              />

              <textarea
                className="admin-course-builder-test-question-desc"
                value={question?.explanation || ''}
                onChange={(e) => update({ explanation: e.target.value })}
                placeholder="Adaugă descriere..."
                rows={2}
              />

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
                        type={currentType === 'true_false' ? 'radio' : 'checkbox'}
                        name={currentType === 'true_false' ? 'answer-correct' : undefined}
                        checked={!!answer.is_correct}
                        onChange={() => toggleCorrect(idx)}
                      />
                      <input
                        type="text"
                        value={answer.text || ''}
                        onChange={(e) => updateAnswer(idx, 'text', e.target.value)}
                        placeholder="Introduce răspuns"
                        disabled={currentType === 'true_false'}
                      />
                      {currentType !== 'true_false' && (
                        <button type="button" className="admin-btn admin-btn-secondary" onClick={() => removeAnswer(idx)}>
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {currentType !== 'true_false' && (
                    <button type="button" className="admin-btn admin-btn-secondary" onClick={addAnswer}>
                      + Adaugă răspuns
                    </button>
                  )}
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
                      />
                      <input
                        type="text"
                        value={answer.right || ''}
                        onChange={(e) => updateAnswer(idx, 'right', e.target.value)}
                        placeholder="Element dreapta"
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
