import React from 'react';
import { X } from 'lucide-react';
import Tag from './Tag';

const stripHtml = (value = '') => String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const normalizeAnswers = (answers) => {
  if (!Array.isArray(answers)) return [];
  return answers.map((answer, index) => {
    if (typeof answer === 'string') {
      return { text: answer, is_correct: false, order: index };
    }
    if (!answer || typeof answer !== 'object') {
      return { text: '', is_correct: false, order: index };
    }
    return {
      text: answer.text ?? answer.answer_text ?? answer.content ?? '',
      is_correct: Boolean(answer.is_correct),
      order: typeof answer.order === 'number' ? answer.order : index,
    };
  });
};

const normalizeMatchingPairs = (answers) => {
  if (!Array.isArray(answers)) return [];
  return answers
    .map((answer, index) => {
      if (typeof answer === 'string' && answer.includes('|')) {
        const [leftRaw, rightRaw] = answer.split('|');
        return { left: (leftRaw || '').trim(), right: (rightRaw || '').trim(), order: index };
      }
      if (!answer || typeof answer !== 'object') {
        return { left: '', right: '', order: index };
      }
      return {
        left: answer.left ?? answer.text ?? answer.question ?? '',
        right: answer.right ?? answer.answer_text ?? answer.content ?? '',
        order: typeof answer.order === 'number' ? answer.order : index,
      };
    })
    .filter((pair) => pair.left || pair.right);
};

const normalizeOrderingItems = (answers) => {
  if (!Array.isArray(answers)) return [];
  return answers
    .map((answer, index) => {
      if (typeof answer === 'string') {
        return { text: answer, order: index };
      }
      if (!answer || typeof answer !== 'object') {
        return { text: '', order: index };
      }
      return {
        text: answer.text ?? answer.answer_text ?? answer.content ?? answer.label ?? '',
        order: typeof answer.order === 'number' ? answer.order : index,
      };
    })
    .filter((item) => item.text);
};

const Drawer = ({ open, question, onClose, onEdit }) => {
  if (!open || !question) return null;

  const tags = question?.tags || question?.metadata?.tags || [];
  const answers = normalizeAnswers(question?.answers);
  const matchingPairs = normalizeMatchingPairs(question?.answers);
  const orderingItems = normalizeOrderingItems(question?.answers);
  const hasAnswers = answers.length > 0;

  return (
    <div className="qb-drawer-backdrop" onClick={onClose}>
      <aside className="qb-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="qb-drawer-header">
          <h3>Detalii întrebare</h3>
          <button type="button" className="qb-drawer-close" onClick={onClose} aria-label="Închide">
            <X size={18} aria-hidden />
          </button>
        </header>
        <p>{stripHtml(question?.content)}</p>
        {question?.type === 'matching' && matchingPairs.length > 0 ? (
          <div className="qb-drawer-answers">
            <h4>Perechi</h4>
            <ul className="qb-drawer-answer-list">
              {matchingPairs.map((pair, index) => (
                <li key={`${question.id}-pair-${index}`} className="qb-drawer-answer-item">
                  <span className="qb-drawer-answer-marker">{index + 1}</span>
                  <span className="qb-drawer-answer-text">
                    {pair.left || '-'} către {pair.right || '-'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : question?.type === 'ordering' && orderingItems.length > 0 ? (
          <div className="qb-drawer-answers">
            <h4>Ordine corectă</h4>
            <ul className="qb-drawer-answer-list">
              {orderingItems.map((item, index) => (
                <li key={`${question.id}-order-${index}`} className="qb-drawer-answer-item">
                  <span className="qb-drawer-answer-marker">{index + 1}</span>
                  <span className="qb-drawer-answer-text">{item.text || '-'}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : hasAnswers && (
          <div className="qb-drawer-answers">
            <h4>Răspunsuri</h4>
            <ul className="qb-drawer-answer-list">
              {answers.map((answer, index) => (
                <li key={`${question.id}-answer-${index}`} className={`qb-drawer-answer-item ${answer.is_correct ? 'is-correct' : ''}`}>
                  <span className="qb-drawer-answer-marker">{answer.is_correct ? 'OK' : index + 1}</span>
                  <span className="qb-drawer-answer-text">{answer.text || '-'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="qb-drawer-tags">
          {Array.isArray(tags) && tags.map((tag) => <Tag key={`${question.id}-${tag?.id || tag?.name || tag}`}>{tag?.name || tag}</Tag>)}
        </div>
        {typeof onEdit === 'function' && (
          <div className="qb-modal-actions">
            <button type="button" className="lms-btn-primary" onClick={() => onEdit(question)}>
              Editează
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};

export default Drawer;
