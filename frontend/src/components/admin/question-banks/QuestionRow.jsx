import React from 'react';
import { ChevronRight, Star, Trash2 } from 'lucide-react';

const stripHtml = (value = '') => String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const QUESTION_TYPE_LABELS = {
  single_choice: 'Răspuns unic',
  multiple_choice: 'Răspuns multiplu',
  true_false: 'Adevărat/Fals',
  yes_no: 'Da / Nu',
  matching: 'Potrivire',
  ordering: 'Ordonare',
  fill_in_blank: 'Completare spații',
};

const QuestionRow = ({
  question,
  selected,
  isActive,
  onToggleSelect,
  onToggleStar,
  onOpenDrawer,
  onDelete,
  readOnly = false,
  selectable = false,
  showStar = true,
}) => {
  const questionText = stripHtml(question?.content || question?.text || question?.question || '');
  const questionTypeLabel = QUESTION_TYPE_LABELS[question?.type] || question?.type || 'N/A';
  const showCheckbox = selectable || !readOnly;

  return (
    <div className={`qb-question-row ${question?.is_starred ? 'is-starred' : ''} ${isActive ? 'is-active' : ''} ${selected ? 'is-selected' : ''}`}>
      {showCheckbox ? (
        <label className="qb-question-check">
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(question.id)} />
        </label>
      ) : null}
      {showStar ? (
        !readOnly ? (
          <button
            type="button"
            className={`qb-star-btn ${question?.is_starred ? 'is-starred' : ''}`}
            onClick={() => onToggleStar(question.id)}
            title={question?.is_starred ? 'Scoate steaua' : 'Marchează cu stea'}
          >
            <Star size={18} fill={question?.is_starred ? 'currentColor' : 'none'} aria-hidden />
          </button>
        ) : (
          <span className={`qb-star-btn ${question?.is_starred ? 'is-starred' : ''}`} aria-hidden>
            <Star size={18} fill={question?.is_starred ? 'currentColor' : 'none'} />
          </span>
        )
      ) : null}
      <button type="button" className="qb-question-main" onClick={() => onOpenDrawer(question)}>
        <span className="qb-question-text">{questionText || 'Întrebare fără text'}</span>
      </button>
      <div className="qb-question-right">
        <span className="qb-question-type">{questionTypeLabel}</span>
        {!readOnly && onDelete ? (
          <button
            type="button"
            className="va-btn-delete qb-delete-btn va-btn-delete va-btn-danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(question.id);
            }}
            title="Șterge întrebarea"
            aria-label="Șterge întrebarea"
          >
            <Trash2 size={18} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className="lms-btn-secondary lms-btn-sm qb-open-question-btn"
          onClick={() => onOpenDrawer(question)}
        >
          Deschide
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
};

export default QuestionRow;
