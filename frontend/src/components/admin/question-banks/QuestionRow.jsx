import React from 'react';
import { MoreVertical, Star, Trash2 } from 'lucide-react';
import Tag from './Tag';

const stripHtml = (value = '') => String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const QUESTION_TYPE_LABELS = {
  single_choice: 'Răspuns unic',
  multiple_choice: 'Răspuns multiplu',
  true_false: 'Adevărat/Fals',
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
}) => {
  const tags = question?.tags || question?.metadata?.tags || [];
  const questionText = stripHtml(question?.content || '');
  const questionTypeLabel = QUESTION_TYPE_LABELS[question?.type] || question?.type || 'N/A';

  return (
    <div className={`qb-question-row ${question?.is_starred ? 'is-starred' : ''} ${isActive ? 'is-active' : ''}`}>
      {!readOnly && (
        <label className="qb-question-check">
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(question.id)} />
        </label>
      )}
      {!readOnly ? (
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
      )}
      <button type="button" className="qb-question-main" onClick={() => onOpenDrawer(question)}>
        <span className="qb-question-text">{questionText}</span>
        <span className="qb-question-tags">
          {Array.isArray(tags) &&
            tags.map((tag) => (
              <Tag key={`${question.id}-${tag?.id || tag?.name || tag}`}>{tag?.name || tag}</Tag>
            ))}
        </span>
      </button>
      <div className="qb-question-right">
        <span className="qb-question-type">{questionTypeLabel}</span>
        {!readOnly && onDelete ? (
          <button
            type="button"
            className="qb-delete-btn va-btn-danger"
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
          className="qb-actions-btn"
          onClick={() => onOpenDrawer(question)}
          aria-label="Deschide detalii"
        >
          <MoreVertical size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
};

export default QuestionRow;
