import React from 'react';

const QuestionBankBuilderStep1 = ({ data, onUpdate, errors }) => {
	const title = data?.title || '';
	const category = data?.category || '';

	return (
		<div className="admin-course-builder-step-content qb-step1">
			<h2>Informații de Bază</h2>
			<p className="admin-course-builder-step-description">
				Definește titlul, descrierea și categoria băncii de întrebări. Aceste informații vor fi salvate automat la trecerea la pasul următor.
			</p>

			<div className="admin-course-builder-form">
				<div className="admin-form-group">
					<label className="admin-form-label">
						Titlu Bancă de Întrebări <span className="admin-form-required">*</span>
					</label>
					<input
						type="text"
						className={`admin-form-input ${errors.title ? 'error' : ''}`}
						value={title}
						onChange={(e) => onUpdate({ title: e.target.value })}
						placeholder="Titlul băncii de întrebări"
						data-field="title"
						maxLength={200}
						autoFocus
					/>
					<div className="admin-form-meta">
						{errors?.title && (
							<span className="admin-form-error">{errors.title}</span>
						)}
						<span className="admin-form-char-count">{title.length}/200</span>
					</div>
				</div>

				<div className="admin-form-group">
					<label className="admin-form-label">Descriere</label>
					<textarea
						className="admin-form-textarea"
						value={data?.description || ''}
						onChange={(e) => onUpdate({ description: e.target.value })}
						placeholder="Descriere opțională: scop, subiecte, nivel de dificultate…"
						rows={4}
					/>
					<p className="admin-form-hint">
						O descriere clară ajută la identificarea băncii și poate fi folosită de AI pentru generarea întrebărilor
					</p>
				</div>

				<div className="admin-form-group">
					<label className="admin-form-label">Categorie</label>
					<input
						type="text"
						className="admin-form-input"
						value={category}
						onChange={(e) => onUpdate({ category: e.target.value })}
						placeholder="Categorie (opțional)"
					/>
					<p className="admin-form-hint">
						Categoria ajută la organizare și filtrare.
					</p>
				</div>

				<div className="admin-info-box qb-info-box">
					<h4>💡 Ce urmează</h4>
					<ul>
						<li>După ce apeși „Următorul Pas”, banca va fi creată automat</li>
						<li>În pasul 2 vei adăuga întrebări manual sau cu ajutorul AI</li>
						<li>Întrebările pot fi reutilizate în multiple teste și cursuri</li>
					</ul>
				</div>
			</div>
		</div>
	);
};

export default QuestionBankBuilderStep1;
