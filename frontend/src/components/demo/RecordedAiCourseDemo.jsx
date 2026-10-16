import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Pause, ArrowCounterClockwise, FileText, Check } from '@phosphor-icons/react';
import { recordedAiExample as example, recordedAiFrames as frames } from './recordedAiExample';
import './RecordedAiCourseDemo.css';

export default function RecordedAiCourseDemo() {
	const [frame, setFrame] = useState(0);
	const [playing, setPlaying] = useState(false);
	const complete = frame === frames.length - 1;
	const isPlaying = playing && !complete;
	const phase = frame >= 7 ? 3 : frame >= 5 ? 2 : frame >= 2 ? 1 : 0;

	useEffect(() => {
		if (!isPlaying) return undefined;
		const timer = window.setTimeout(() => setFrame((current) => current + 1), frame === 4 || frame === 6 ? 6000 : 1800);
		return () => window.clearTimeout(timer);
	}, [frame, isPlaying]);

	const replay = () => {
		setFrame(0);
		setPlaying(true);
	};

	return (
		<section className="ai-setup-card ai-recording" aria-labelledby="ai-recording-title">
			<div className="ai-recording-heading">
				<div>
					<p className="ai-recording-label">Demonstrație înregistrată</p>
					<h2 id="ai-recording-title">De la material la curs publicat</h2>
				</div>
				<span className="ai-recording-credit">0 credite</span>
			</div>
			<p>Urmărește crearea cursului, generarea testului și publicarea. Conținutul este pregătit în avans și nu poate fi modificat. Nimic nu se salvează.</p>
			<ol className="ai-recording-stages" aria-label="Etapele demonstrației">
				{['Material', 'Curs AI', 'Test AI', 'Publicare'].map((label, index) => (
					<li key={label} aria-current={index === phase ? 'step' : undefined} className={index === phase ? 'is-active' : index < phase ? 'is-done' : ''}>
						<span>{index < phase || complete ? <Check size={16} aria-hidden="true" /> : index + 1}</span>{label}
					</li>
				))}
			</ol>
			<div className="ai-recording-workspace">
				<aside className="ai-recording-source" aria-label="Material exemplu">
					<FileText size={24} aria-hidden="true" />
					<h3>{example.filename}</h3>
					<p>Ghidul primei zile: echipă, conturi de lucru și siguranța accesului.</p>
					<details><summary>Citește materialul exemplu</summary><p>{example.source}</p></details>
				</aside>
				<div className="ai-recording-output" aria-label="Previzualizare demonstrație">
					<p className="ai-recording-label">{phase < 2 ? 'Crearea cursului' : phase === 2 ? 'Generarea testului' : 'Publicarea cursului'}</p>
					<h3>{phase === 2 ? example.test.title : example.title}</h3>
					{phase < 2 && (frame < 2 ? (
						<p className="ai-recording-placeholder">Modulele și lecțiile vor apărea aici pe parcursul demonstrației.</p>
					) : (
						<ol className="ai-recording-modules">
							{example.modules.map((module) => (
								<li key={module.title}>
									<strong>{module.title}</strong>
									{frame >= 3 && <ul>{module.lessons.map((lesson) => <li key={lesson}>{lesson}</li>)}</ul>}
								</li>
							))}
						</ol>
					))}
					{frame === 4 && (
						<div className="ai-recording-lesson">
							<p className="ai-recording-label">Exemplu de lecție</p>
							<h4>{example.lesson.title}</h4>
							<p>{example.lesson.body}</p>
							<ul>{example.lesson.checklist.map((item) => <li key={item}><Check size={16} aria-hidden="true" /><span>{item}</span></li>)}</ul>
						</div>
					)}
					{frame === 5 && <p className="ai-recording-placeholder">Pregătim întrebări din lecții și variantele de răspuns.</p>}
					{frame === 6 && (
						<ol className="ai-recording-questions">
							{example.test.questions.map((question) => (
								<li key={question.text}>
									<strong>{question.text}</strong>
									<ul>{question.options.map((option, index) => (
										<li key={option} className={index === question.correct ? 'is-correct' : ''}>
											{index === question.correct && <Check size={16} aria-hidden="true" />}<span>{option}{index === question.correct ? ' · Corect' : ''}</span>
										</li>
									))}</ul>
									<p>{question.explanation}</p>
								</li>
							))}
						</ol>
					)}
					{phase === 3 && (
						<div className="ai-recording-publish">
							<span className={`ai-recording-publish-state${complete ? ' is-published' : ''}`}>{complete ? 'Publicat în demonstrație' : 'Verificare înainte de publicare'}</span>
							<ul>
								<li><Check size={18} aria-hidden="true" />2 module și 4 lecții pregătite</li>
								<li><Check size={18} aria-hidden="true" />Test final cu 3 întrebări atașat cursului</li>
								<li><Check size={18} aria-hidden="true" />Conținutul și răspunsurile sunt verificate</li>
								{complete && <li><Check size={18} aria-hidden="true" />Cursul apare ca disponibil pentru echipa exemplu</li>}
							</ul>
							<p>{complete ? 'Așa se încheie fluxul de publicare. Aceasta este o previzualizare; nu am creat sau publicat date în academie.' : 'Înregistrarea arată verificarea cursului și a testului, apoi trecerea la starea publicat.'}</p>
						</div>
					)}
				</div>
			</div>
			<div className="ai-recording-progress">
				<progress value={frame} max={frames.length - 1} aria-label="Progresul demonstrației" />
				<p role="status">{!isPlaying && frame > 0 && !complete ? 'În pauză · ' : ''}{frames[frame]}</p>
			</div>
			<div className="ai-setup-actions ai-recording-controls">
				{!complete && (
					<button type="button" className="lms-btn-primary" onClick={() => setPlaying((current) => !current)}>
						{isPlaying ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
						{isPlaying ? 'Pauză' : frame > 0 ? 'Continuă demonstrația' : 'Redă demonstrația'}
					</button>
				)}
				{frame > 0 && <button type="button" className="lms-btn-secondary" onClick={replay}><ArrowCounterClockwise size={18} aria-hidden="true" />Reia de la început</button>}
				{complete && <Link className="lms-btn-primary" to="/admin/content?tab=courses">Explorează cursurile demo</Link>}
			</div>
		</section>
	);
}
