import React, { useMemo, useState } from 'react';
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
} from '@phosphor-icons/react';
import RichTextEditor from '../../RichTextEditor';
import { INLINE_QUESTION_TYPES } from '../../../utils/testQuestionBuilder';
import '../../../styles/admin-course-builder.css';
import '../courses/InlineTestEditorShell.css';
import './QuestionBuilderEditor.css';

const QUESTION_TYPE_ICONS = {
  multiple_choice: ListChecks,
  single_choice: RadioButton,
  true_false: Scales,
  yes_no: ThumbsUp,
  matching: ArrowsLeftRight,
  ordering: ListNumbers,
};

const normalizeType = (type) => {
  return INLINE_QUESTION_TYPES.some((entry) => entry.id === type) ? type : 'multiple_choice';
};

const getDefaultAnswersByType = (type) => {
  if (type === 'true_false') {
    return [
      { text: 'Adevărat', is_correct: true },
      { text: 'Fals', is_correct: false },
    ];
  }

  if (type === 'yes_no') {
    return [
      { text: 'Da', is_correct: true },
      { text: 'Nu', is_correct: false },
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

const keepOnlyOneCorrectAnswer = (answers) => {
  const firstCorrectIndex = answers.findIndex((answer) => answer.is_correct);
  const correctIndex = firstCorrectIndex >= 0 ? firstCorrectIndex : 0;
  return answers.map((answer, index) => ({ ...answer, is_correct: index === correctIndex }));
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

  const normalized = list.map((answer, index) => ({
    text: answer?.text ?? '',
    is_correct: !!answer?.is_correct,
    order: typeof answer?.order === 'number' ? answer.order : index,
  }));

  if (type === 'yes_no') {
    const correct = normalized.find((answer) => answer.is_correct);
    const noIsCorrect = ['nu', 'no', 'fals', 'false'].includes(String(correct?.text || '').trim().toLowerCase());
    return [
      { text: 'Da', is_correct: !noIsCorrect },
      { text: 'Nu', is_correct: noIsCorrect },
    ];
  }

  if (type === 'single_choice' || type === 'true_false') {
    return keepOnlyOneCorrectAnswer(type === 'true_false' ? normalized.slice(0, 2) : normalized);
  }

  return normalized;
};

const QuestionBuilderEditor = ({ question, onChange, questionNumber = 1 }) => {
  // întrebare nouă: alegerea tipului e deschisă; la una existentă tipul se schimbă doar la cerere
  const [typePickerOpen, setTypePickerOpen] = useState(!question?.id);
  const currentType = normalizeType(question?.type);
  const answers = useMemo(
    () => normalizeAnswers(currentType, question?.answers?.length ? question.answers : getDefaultAnswersByType(currentType)),
    [question, currentType]
  );
  const currentTypeLabel = INLINE_QUESTION_TYPES.find((entry) => entry.id === currentType)?.label || 'Întrebare';
  const CurrentTypeIcon = QUESTION_TYPE_ICONS[currentType] || ListChecks;

  const update = (patch) => onChange({ ...question, ...patch });

  const setType = (type) => {
    const nextType = normalizeType(type);
    if (nextType !== currentType) {
      update({
        type: nextType,
        answers: getDefaultAnswersByType(nextType),
      });
    }
    setTypePickerOpen(false);
  };

  const updateAnswer = (idx, field, value) => {
    const next = answers.map((answer, i) => (i === idx ? { ...answer, [field]: value } : answer));
    update({ answers: next });
  };

  const toggleCorrect = (idx) => {
    if (currentType === 'true_false' || currentType === 'yes_no' || currentType === 'single_choice') {
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
    const next = [...answers, { ...nextAnswer, is_correct: false }];
    if (currentType === 'ordering') {
      next[next.length - 1] = { ...next[next.length - 1], order: next.length - 1, is_correct: true };
    }
    update({ answers: next });
  };

  const removeAnswer = (idx) => {
    const next = answers.filter((_, i) => i !== idx);
    update({ answers: currentType === 'single_choice' || currentType === 'true_false' || currentType === 'yes_no' ? keepOnlyOneCorrectAnswer(next) : next });
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

  const isBinaryType = currentType === 'true_false' || currentType === 'yes_no';
  const isChoiceType = currentType === 'multiple_choice' || currentType === 'single_choice' || isBinaryType;
  const isMatchingType = currentType === 'matching';
  const isOrderingType = currentType === 'ordering';
  const radioGroupName = `answer-correct-${question?.id ?? questionNumber}`;

  return (
    <div className="va-qe" data-qtype={currentType}>
      <section className="va-qe__type">
        <div className="va-qe__type-head">
          <span className="admin-course-builder-test-question-field-label">Tipul întrebării</span>
          <button
            type="button"
            className="va-tq-type"
            onClick={() => setTypePickerOpen((prev) => !prev)}
            aria-expanded={typePickerOpen}
            aria-label={`Tipul întrebării: ${currentTypeLabel}. ${typePickerOpen ? 'Ascunde opțiunile' : 'Schimbă tipul'}`}
          >
            <CurrentTypeIcon size={14} weight="bold" aria-hidden="true" />
            {currentTypeLabel}
            <CaretDown size={12} weight="bold" aria-hidden="true" />
          </button>
        </div>
        {typePickerOpen ? (
          <>
            {question?.id ? (
              <p className="va-field__hint va-tq-type-hint">Schimbarea tipului înlocuiește variantele de răspuns ale întrebării.</p>
            ) : null}
            <div className="va-tq-types va-qe__types" role="radiogroup" aria-label="Tipul întrebării">
              {INLINE_QUESTION_TYPES.map((typeOpt) => {
                const isCurrent = currentType === typeOpt.id;
                const TypeIcon = QUESTION_TYPE_ICONS[typeOpt.id] || ListChecks;
                return (
                  <button
                    key={typeOpt.id}
                    type="button"
                    role="radio"
                    aria-checked={isCurrent}
                    className={`va-tq-option${isCurrent ? ' is-current' : ''}`}
                    data-qtype={typeOpt.id}
                    onClick={() => setType(typeOpt.id)}
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
          </>
        ) : null}
      </section>

      <div className="admin-course-builder-test-question-fields">
        <div className="admin-course-builder-test-question-field">
          <span className="admin-course-builder-test-question-field-label">Text întrebare</span>
          <div className="admin-course-builder-test-question-rte">
            <RichTextEditor
              value={question?.content || ''}
              onChange={(html) => update({ content: html })}
              placeholder="Scrie întrebarea..."
              toolbarVariant="none"
              emphasis="strong"
              showSideTools={false}
              style={{ minHeight: '120px' }}
            />
          </div>
        </div>
        <div className="admin-course-builder-test-question-field">
          <span className="admin-course-builder-test-question-field-label">
            Sursă
            <span className="admin-course-builder-test-question-field-hint">opțional</span>
          </span>
          <div className="admin-course-builder-test-question-rte admin-course-builder-test-question-rte-desc">
            <RichTextEditor
              value={question?.explanation || ''}
              onChange={(html) => update({ explanation: html })}
              placeholder="De unde este materialul din curs..."
              toolbarVariant="none"
              emphasis="plain"
              showSideTools={false}
              style={{ minHeight: '88px' }}
            />
          </div>
        </div>
      </div>

      <div className="va-qe__points">
        <label htmlFor={`qe-points-${question?.id ?? questionNumber}`} className="admin-course-builder-test-question-field-label">Puncte</label>
        <input
          id={`qe-points-${question?.id ?? questionNumber}`}
          type="number"
          min="1"
          className="va-qa__input"
          value={question?.points ?? 1}
          onChange={(e) => update({ points: Number(e.target.value) || 1 })}
        />
      </div>

      {isChoiceType && (
        <div className="va-qa">
          <div className="va-qa__head">
            <span className="va-qa__title">Variante de răspuns</span>
            <span className="va-qa__hint">
              {currentType === 'multiple_choice' ? 'Marchează toate variantele corecte.' : 'Marchează varianta corectă.'}
            </span>
          </div>
          <ul className="va-qa__list">
            {answers.map((answer, idx) => (
              <li key={`ans-${idx}`} className={`va-qa__row${answer.is_correct ? ' is-correct' : ''}`}>
                <label className="va-qa__correct">
                  <input
                    type={currentType === 'multiple_choice' ? 'checkbox' : 'radio'}
                    name={currentType !== 'multiple_choice' ? radioGroupName : undefined}
                    checked={!!answer.is_correct}
                    onChange={() => toggleCorrect(idx)}
                    aria-label={`Varianta ${idx + 1} este corectă`}
                  />
                  <span>{answer.is_correct ? 'Corect' : 'Greșit'}</span>
                </label>
                <input
                  type="text"
                  className="va-qa__input"
                  value={answer.text || ''}
                  onChange={(e) => updateAnswer(idx, 'text', e.target.value)}
                  placeholder={`Varianta ${idx + 1}`}
                  aria-label={`Textul variantei ${idx + 1}`}
                  disabled={isBinaryType}
                />
                {!isBinaryType ? (
                  <button
                    type="button"
                    className="va-qa__icon-btn is-danger"
                    onClick={() => removeAnswer(idx)}
                    aria-label={`Șterge varianta ${idx + 1}`}
                    title="Șterge varianta"
                  >
                    <Trash size={16} weight="bold" aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {!isBinaryType ? (
            <button type="button" className="lms-btn-secondary lms-btn-sm va-qa__add" onClick={addAnswer}>
              <Plus size={16} weight="bold" aria-hidden="true" />
              Adaugă variantă
            </button>
          ) : null}
        </div>
      )}

      {isMatchingType && (
        <div className="va-qa">
          <div className="va-qa__head">
            <span className="va-qa__title">Perechi</span>
            <span className="va-qa__hint">Elevul potrivește fiecare element din stânga cu cel din dreapta.</span>
          </div>
          <ul className="va-qa__list">
            {answers.map((answer, idx) => (
              <li key={`pair-${idx}`} className="va-qa__row va-qa__row--pair">
                <input
                  type="text"
                  className="va-qa__input"
                  value={answer.left || ''}
                  onChange={(e) => updateAnswer(idx, 'left', e.target.value)}
                  placeholder="Element"
                  aria-label={`Perechea ${idx + 1}, stânga`}
                />
                <ArrowRight className="va-qa__pair-arrow" size={16} weight="bold" aria-hidden="true" />
                <input
                  type="text"
                  className="va-qa__input"
                  value={answer.right || ''}
                  onChange={(e) => updateAnswer(idx, 'right', e.target.value)}
                  placeholder="Potrivire"
                  aria-label={`Perechea ${idx + 1}, dreapta`}
                />
                <button
                  type="button"
                  className="va-qa__icon-btn is-danger"
                  onClick={() => removeAnswer(idx)}
                  aria-label={`Șterge perechea ${idx + 1}`}
                  title="Șterge perechea"
                >
                  <Trash size={16} weight="bold" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="lms-btn-secondary lms-btn-sm va-qa__add" onClick={addAnswer}>
            <Plus size={16} weight="bold" aria-hidden="true" />
            Adaugă pereche
          </button>
        </div>
      )}

      {isOrderingType && (
        <div className="va-qa">
          <div className="va-qa__head">
            <span className="va-qa__title">Ordinea corectă</span>
            <span className="va-qa__hint">Elevul primește elementele amestecate și le aranjează în această ordine.</span>
          </div>
          <ul className="va-qa__list">
            {answers.map((answer, idx) => (
              <li key={`order-${idx}`} className="va-qa__row va-qa__row--order">
                <span className="va-qa__order-index" aria-hidden="true">{idx + 1}</span>
                <input
                  type="text"
                  className="va-qa__input"
                  value={answer.text || ''}
                  onChange={(e) => updateAnswer(idx, 'text', e.target.value)}
                  placeholder={`Pasul ${idx + 1}`}
                  aria-label={`Elementul ${idx + 1}`}
                />
                <div className="va-qa__order-actions">
                  <button type="button" className="va-qa__icon-btn" aria-label={`Mută elementul ${idx + 1} în sus`} onClick={() => moveAnswer(idx, 'up')} disabled={idx === 0}>
                    <CaretUp size={16} weight="bold" aria-hidden="true" />
                  </button>
                  <button type="button" className="va-qa__icon-btn" aria-label={`Mută elementul ${idx + 1} în jos`} onClick={() => moveAnswer(idx, 'down')} disabled={idx === answers.length - 1}>
                    <CaretDown size={16} weight="bold" aria-hidden="true" />
                  </button>
                  <button type="button" className="va-qa__icon-btn is-danger" aria-label={`Șterge elementul ${idx + 1}`} onClick={() => removeAnswer(idx)}>
                    <Trash size={16} weight="bold" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="lms-btn-secondary lms-btn-sm va-qa__add" onClick={addAnswer}>
            <Plus size={16} weight="bold" aria-hidden="true" />
            Adaugă element
          </button>
        </div>
      )}
    </div>
  );
};

export default QuestionBuilderEditor;
