import React from 'react';
import {
	getChoiceTypeLabel,
	isMultiSelectChoiceQuestion,
	isChoiceOptionSelected,
	toggleMultiChoiceIndex,
} from '../../utils/examChoiceQuestions';

export default function ChoiceQuestionOptions({
	question,
	value,
	onChange,
	disabled = false,
}) {
	const multi = isMultiSelectChoiceQuestion(question);
	const inputType = multi ? 'checkbox' : 'radio';

	return (
		<div className="student-exam-choice-block">
			<p className="student-exam-choice-hint">
				<span className="student-exam-choice-type">{getChoiceTypeLabel(question)}</span>
				{multi ? ' — poți selecta mai multe variante' : ' — selectează o singură variantă'}
			</p>
			<div className="student-exam-answer-options" role={multi ? 'group' : 'radiogroup'} aria-label="Variante de răspuns">
				{question.options.map((opt, i) => {
					const isSelected = isChoiceOptionSelected(question, value, i);
					const letter = String.fromCharCode(65 + i);

					return (
						<label
							key={i}
							className={`student-exam-answer-option ${isSelected ? 'selected' : 'default'}`}
						>
							<input
								type={inputType}
								name={multi ? undefined : String(question.id)}
								checked={isSelected}
								disabled={disabled}
								onChange={() => {
									if (disabled) return;
									if (multi) {
										onChange(toggleMultiChoiceIndex(value, i));
									} else {
										onChange(i);
									}
								}}
							/>
							<span className="student-exam-answer-option-letter" aria-hidden>
								{letter}
							</span>
							<span className="student-exam-answer-option-text">{opt}</span>
						</label>
					);
				})}
			</div>
		</div>
	);
}
