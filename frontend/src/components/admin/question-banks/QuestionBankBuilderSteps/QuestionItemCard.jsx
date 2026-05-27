import React from 'react';

const QUESTION_TYPE_LABELS = {
	multiple_choice: 'Răspuns multiplu',
	true_false: 'Adevărat/Fals',
	matching: 'Potrivire',
	ordering: 'Ordonare',
};

const QuestionItemCard = ({
	question,
	index,
	total,
	isEditing,
	duplicateLoading,
	onMoveUp,
	onMoveDown,
	onPreview,
	onDuplicate,
	onEdit,
	onDelete,
}) => (
	<div className={`admin-question-item ${isEditing ? 'editing' : ''}`}>
		<div className="admin-question-item-content">
			<div className="admin-question-item-header">
				<div className="admin-question-item-title">
					#{index + 1}: {question.content || question.text || 'Fără conținut'}
				</div>
				<div className="admin-question-item-meta">
					{question.points || 1} puncte • {QUESTION_TYPE_LABELS[question.type] || 'Răspuns multiplu'}
				</div>
			</div>
			<div className="admin-question-item-actions">
				<button type="button" className="lms-btn-secondary lms-btn-sm" onClick={onMoveUp} disabled={index === 0} title="Mută sus">↑</button>
				<button type="button" className="lms-btn-secondary lms-btn-sm" onClick={onMoveDown} disabled={index === (total - 1)} title="Mută jos">↓</button>
				<button type="button" className="lms-btn-secondary lms-btn-sm" onClick={onPreview}>👁 Previzualizare</button>
				<button type="button" className="lms-btn-secondary lms-btn-sm" onClick={onDuplicate} disabled={duplicateLoading}>Duplică</button>
				<button type="button" className="lms-btn-secondary lms-btn-sm" onClick={onEdit}>✏️ Editează</button>
				<button type="button" className="lms-btn-secondary lms-btn-sm va-btn-danger" onClick={onDelete}>🗑️ Șterge</button>
			</div>
		</div>
	</div>
);

export default QuestionItemCard;
