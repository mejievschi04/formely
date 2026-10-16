import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Pause, ArrowCounterClockwise, FileText, Check } from '@phosphor-icons/react';
import { recordedAiExample as example, recordedAiFrames as frames } from './recordedAiExample';
import './RecordedAiCourseDemo.css';

export default function RecordedAiCourseDemo({ onBack }) {
	const [frame, setFrame] = useState(0);
	const [playing, setPlaying] = useState(false);
	const complete = frame === frames.length - 1;
	const isPlaying = playing && !complete;

	useEffect(() => {
		if (!isPlaying) return undefined;
		const timer = window.setTimeout(() => setFrame((current) => current + 1), 1800);
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
					<h2 id="ai-recording-title">Dintr-un ghid, un curs pentru echipă</h2>
				</div>
				<span className="ai-recording-credit">0 credite</span>
			</div>
			<p>Urmărește un exemplu pregătit în avans. Reluarea folosește materialul de mai jos și nu salvează un curs nou.</p>
			<div className="ai-recording-workspace">
				<aside className="ai-recording-source" aria-label="Material exemplu">
					<FileText size={24} aria-hidden="true" />
					<h3>{example.filename}</h3>
					<p>{example.source}</p>
				</aside>
				<div className="ai-recording-output" aria-label="Previzualizare curs">
					<p className="ai-recording-label">Previzualizare curs</p>
					<h3>{example.title}</h3>
					{frame < 2 ? (
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
					)}
					{complete && (
						<div className="ai-recording-lesson">
							<p className="ai-recording-label">Exemplu de lecție</p>
							<h4>{example.lesson.title}</h4>
							<p>{example.lesson.body}</p>
							<ul>{example.lesson.checklist.map((item) => <li key={item}><Check size={16} aria-hidden="true" /><span>{item}</span></li>)}</ul>
						</div>
					)}
				</div>
			</div>
			<div className="ai-recording-progress">
				<progress value={frame} max={frames.length - 1} aria-label="Progresul demonstrației" />
				<p role="status">{!isPlaying && frame > 0 && !complete ? 'În pauză · ' : ''}{frames[frame]}</p>
			</div>
			<div className="ai-setup-actions ai-recording-controls">
				<button type="button" className="lms-btn-secondary" onClick={onBack}>Înapoi la material</button>
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
