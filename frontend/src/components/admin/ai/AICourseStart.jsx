import React, { useId, useState } from 'react';
import { Check, FileText, PencilSimple } from '@phosphor-icons/react';
import { COURSE_START_DEFAULTS, inferCourseStartPreferences } from '../../../utils/courseStartPreferences';

const OPTIONS = {
	language: [['ro', 'Română'], ['en', 'Engleză'], ['ru', 'Rusă']],
	level: [['incepator', 'Începător'], ['mediu', 'Mediu'], ['avansat', 'Avansat']],
	style: [['practic', 'Practic'], ['teoretic', 'Teoretic'], ['mixt', 'Mixt']],
	lesson_size: [['scurt', 'Scurte'], ['mediu', 'Medii'], ['detaliat', 'Detaliate']],
};

const STRUCTURES = [
	{ name: 'Esențial', modules: 2, lessons: 2 },
	{ name: 'Echilibrat', modules: 3, lessons: 2 },
	{ name: 'Aprofundat', modules: 4, lessons: 3 },
];

export default function AICourseStart({ request, documents = [], disabled, onSubmit, onCancel }) {
	const id = useId();
	const [description, setDescription] = useState(request || '');
	const [overrides, setOverrides] = useState({});
	const [editing, setEditing] = useState(!String(request || '').trim());
	const values = { ...COURSE_START_DEFAULTS, ...inferCourseStartPreferences(description), ...overrides };
	const update = (key, value) => setOverrides(previous => ({ ...previous, [key]: value }));
	const validStructure = Number.isInteger(Number(values.modules_count)) && Number(values.modules_count) >= 2 && Number(values.modules_count) <= 12
		&& Number.isInteger(Number(values.lessons_per_module)) && Number(values.lessons_per_module) >= 2 && Number(values.lessons_per_module) <= 8;
	const totalLessons = Number(values.modules_count) * Number(values.lessons_per_module);
	const labelFor = key => OPTIONS[key].find(([value]) => value === values[key])?.[1];
	const select = (key, label) => (
		<label className="ai-generation-field">
			{label}
			<select value={values[key]} onChange={event => update(key, event.target.value)}>
				{OPTIONS[key].map(([value, text]) => <option key={value} value={value}>{text}</option>)}
			</select>
		</label>
	);

	return (
		<form className="ai-generation-form ai-course-start" onSubmit={event => {
			event.preventDefault();
			if (!description.trim() || disabled || !validStructure) return;
			onSubmit({
				...values,
				topic: description.trim().slice(0, 2000),
				course_request: description.trim(),
				target_audience: values.target_audience.trim() || 'Persoane interesate de subiectul cursului',
				modules_count: Number(values.modules_count),
				lessons_per_module: Number(values.lessons_per_module),
				course_title: '', description: '', evaluation: 'none',
			});
		}}>
			<header className="ai-generation-header">
				<h3>Pregătim cursul</h3>
				<p>Alege cât de amplu să fie. Poți ajusta detaliile înainte să înceapă generarea.</p>
			</header>
			<fieldset className="ai-course-start-fields" disabled={disabled}>
				<div className="ai-course-start-request">
					<div className="ai-course-start-request-heading"><span>Cererea ta</span>
						<button type="button" className="ai-course-start-edit" aria-expanded={editing} aria-controls={`${id}-request`} onClick={() => { if (!editing || description.trim()) setEditing(value => !value); }}>
							<PencilSimple size={15} aria-hidden="true" />{editing ? 'Gata' : 'Editează'}
						</button>
					</div>
					{editing ? <label className="ai-generation-field" htmlFor={`${id}-description`} id={`${id}-request`}>
					Ce curs vrei să creezi?
					<textarea id={`${id}-description`} autoFocus required maxLength={20000} rows={4}
						placeholder="Ex. Un curs practic de comunicare pentru colegii noi, cu exemple despre feedback și lucrul în echipă."
						value={description} onChange={event => setDescription(event.target.value)} />
				</label> : <p className="ai-course-start-request-text" id={`${id}-request`}>{description}</p>}
					{documents.length > 0 && <p className="ai-course-start-materials"><FileText size={16} aria-hidden="true" />{documents.length === 1 ? '1 material atașat' : `${documents.length} materiale atașate`}</p>}
				</div>
				<div className="ai-course-start-structure-heading"><span>Structura cursului</span><span>{validStructure ? totalLessons : '—'} lecții în total</span></div>
				<div className="ai-course-start-structures" role="group" aria-label="Structura cursului">
					{STRUCTURES.map(structure => {
						const selected = Number(values.modules_count) === structure.modules && Number(values.lessons_per_module) === structure.lessons;
						return <button type="button" key={structure.name} aria-pressed={selected} onClick={() => setOverrides(previous => ({ ...previous, modules_count: structure.modules, lessons_per_module: structure.lessons }))}>
							<span className="ai-course-start-structure-title">{structure.name}{selected && <Check size={16} weight="bold" aria-hidden="true" />}</span>
							<span>{structure.modules} module</span><strong>{structure.modules * structure.lessons} lecții</strong>
						</button>;
					})}
				</div>
				{!validStructure && <p className="ai-course-start-error" role="alert">Alege o structură cu 2–12 module și 2–8 lecții per modul. Poți folosi una dintre variantele de mai sus.</p>}
				<details className="ai-course-start-options">
					<summary>
						<span>Setări curs</span>
						<span className="ai-course-start-summary">
							{labelFor('language')} · {labelFor('level')} · {labelFor('style')} · Lecții {labelFor('lesson_size').toLowerCase()} · {values.modules_count} module × {values.lessons_per_module} lecții
						</span>
					</summary>
					<div className="ai-generation-grid ai-course-start-settings">
						<label className="ai-generation-field ai-generation-wide">
							Pentru cine este cursul? <span className="ai-generation-help">Opțional, dacă nu ai precizat deja în descriere.</span>
							<input maxLength={1000} placeholder="Ex. Colegi noi din echipa de vânzări" value={values.target_audience} onChange={event => update('target_audience', event.target.value)} />
						</label>
						{select('language', 'Limba cursului')}
						{select('level', 'Nivelul cursanților')}
						{select('style', 'Stilul lecțiilor')}
						{select('lesson_size', 'Lungimea lecțiilor')}
						<label className="ai-generation-field">Module<input required type="number" min={2} max={12} value={values.modules_count} onChange={event => update('modules_count', event.target.value)} /></label>
						<label className="ai-generation-field">Lecții per modul<input required type="number" min={2} max={8} value={values.lessons_per_module} onChange={event => update('lessons_per_module', event.target.value)} /></label>
					</div>
				</details>
			</fieldset>
			<footer className="ai-generation-actions">
				<button className="ai-generation-primary" type="submit" disabled={disabled || !description.trim() || !validStructure}>Generează cursul</button>
				<button className="ai-generation-secondary" type="button" disabled={disabled} onClick={onCancel}>Înapoi la chat</button>
			</footer>
		</form>
	);
}
