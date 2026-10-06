import React from 'react';

const getQuestionTypeLabel = (type) => {
	const labels = {
		multiple_choice: 'Răspuns multiplu',
		single_choice: 'Răspuns unic',
		true_false: 'Adevărat/Fals',
		yes_no: 'Da / Nu',
		matching: 'Potrivire',
		ordering: 'Ordonare',
	};
	return labels[type] || type || 'Răspuns multiplu';
};

const QuestionBankBuilderStep3 = ({ data, errors }) => {
	if (!data) {
		return (
			<div className="admin-course-builder-step-content">
				<h2>Revizuire & Publicare</h2>
				<p className="admin-course-builder-step-description">
					Se incarca datele bancii de intrebari...
				</p>
			</div>
		);
	}

	const safeErrors = errors || {};
	const questionsCount = data?.questions?.length || 0;
	const totalPoints = data?.questions?.reduce((sum, q) => sum + (q.points || 1), 0) || 0;

	return (
		<div className="admin-course-builder-step-content">
			<h2>Revizuire & Publicare</h2>
			<p className="admin-course-builder-step-description">
				Verifica detaliile bancii de intrebari inainte de publicare
			</p>

			<div className="admin-course-builder-form">
				{safeErrors.title && (
					<div className="lms-error-message">
						{safeErrors.title}
					</div>
				)}

				{safeErrors.questions && (
					<div className="lms-error-message">
						{safeErrors.questions}
					</div>
				)}

				<div className="admin-form-section">
					<h3 className="admin-form-section-title">Rezumatul băncii de întrebări</h3>

					<div className="admin-question-bank-summary-grid">
						<div className="admin-question-bank-summary-card">
							<div className="admin-question-bank-summary-label">Titlu</div>
							<div className="admin-question-bank-summary-value">
								{data?.title || 'Fără titlu'}
							</div>
						</div>

						{data?.category && (
							<div className="admin-question-bank-summary-card">
								<div className="admin-question-bank-summary-label">Categorie</div>
								<div className="admin-question-bank-summary-value">
									{data.category}
								</div>
							</div>
						)}

						<div className="admin-question-bank-summary-card">
							<div className="admin-question-bank-summary-label">Întrebări</div>
							<div className="admin-question-bank-summary-value">
								{questionsCount}
							</div>
						</div>

						<div className="admin-question-bank-summary-card">
							<div className="admin-question-bank-summary-label">Total puncte</div>
							<div className="admin-question-bank-summary-value">
								{totalPoints}
							</div>
						</div>
					</div>
				</div>

				{data?.questions && data.questions.length > 0 && (
					<div className="admin-form-section">
						<h3 className="admin-form-section-title">Previzualizare întrebări</h3>
						<div className="admin-question-list">
							{data.questions.slice(0, 5).map((question, index) => (
								<div
									key={question.id || index}
									className="admin-question-item"
								>
									<div className="admin-question-item-title">
										#{index + 1}: {question.content || question.text || 'Fără conținut'}
									</div>
									<div className="admin-question-item-meta">
										{question.points || 1} puncte - {getQuestionTypeLabel(question.type)}
									</div>
								</div>
							))}
							{data.questions.length > 5 && (
								<div className="admin-question-more">
									... si inca {data.questions.length - 5} intrebari
								</div>
							)}
						</div>
					</div>
				)}

				<div className="admin-info-box" style={{ marginTop: 'var(--space-6)' }}>
					<h4 style={{ marginBottom: 'var(--space-2)' }}>Informatii</h4>
					<ul style={{ margin: 0, paddingLeft: 'var(--space-6)' }}>
						<li>După publicare, banca de întrebări poate fi folosită în teste</li>
						<li>Poți adăuga mai multe întrebări după publicare</li>
						<li>Întrebările pot fi editate sau șterse ulterior</li>
					</ul>
				</div>
			</div>
		</div>
	);
};

export default QuestionBankBuilderStep3;
