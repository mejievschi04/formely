import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminService } from '../../services/api';
import { openaiService } from '../../services/openaiService';
import { useToast } from '../../contexts/ToastContextShared.js';
import {
	AI_QUOTA_EXCEEDED_MESSAGE,
	getAiCreditCost,
	getAiCredits,
	hasAiQuota,
	isAiQuotaError,
	isVoltEnabled,
	notifyAiQuotaExceeded,
	notifyVoltComingSoon,
	quotaErrorMessage,
} from '../../utils/voltAvailability';
import { buildCourseCreationPromptFromBrief } from '../../utils/voltAiPrompts';
import { isAiSetupDone, markAiSetupDone } from '../../utils/aiSetupStorage';
import { telemetryService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContextShared.js';
import { isDemoSession } from '../../utils/demoMode';
import './AdminAiOnboardingPage.css';

const STEPS = [
	{ id: 'materials', label: 'Materiale' },
	{ id: 'course', label: 'Curs AI' },
	{ id: 'test', label: 'Test AI' },
	{ id: 'invite', label: 'Invită' },
];

function stripHtmlToText(html) {
	return String(html || '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function extractJsonFromText(text) {
	const raw = String(text || '').trim();
	if (!raw) return null;
	const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = (fenced?.[1] || raw).trim();
	const start = candidate.indexOf('{');
	const end = candidate.lastIndexOf('}');
	if (start < 0 || end <= start) return null;
	try {
		return JSON.parse(candidate.slice(start, end + 1));
	} catch {
		return null;
	}
}

function mapVoltTestQuestions(rawQuestions) {
	if (!Array.isArray(rawQuestions)) return [];
	return rawQuestions
		.map((q, index) => {
			const options = Array.isArray(q.options) ? q.options : (Array.isArray(q.answers) ? q.answers : []);
			const correctIndex = Number.isFinite(Number(q.correct_answer))
				? Number(q.correct_answer)
				: options.findIndex((opt) => opt && typeof opt === 'object' && opt.is_correct);
			const answers = options.map((opt, optIndex) => {
				if (opt && typeof opt === 'object') {
					return {
						text: String(opt.text || opt.label || ''),
						is_correct: Boolean(opt.is_correct) || optIndex === correctIndex,
					};
				}
				return { text: String(opt), is_correct: optIndex === correctIndex };
			});
			return {
				type: q.type || 'multiple_choice',
				content: String(q.question || q.content || ''),
				answers,
				points: Number(q.points) || 1,
				order: index,
				explanation: q.explanation || '',
			};
		})
		.filter((q) => q.content && q.answers.length >= 2);
}

export default function AdminAiOnboardingPage() {
	const navigate = useNavigate();
	const { showToast } = useToast();
	const { user } = useAuth();
	const demoReadonly = isDemoSession(user);
	const [step, setStep] = useState(0);
	const [topic, setTopic] = useState('Onboarding angajați noi');
	const [audience, setAudience] = useState('Angajați noi');
	const [pastedText, setPastedText] = useState('');
	const [documents, setDocuments] = useState([]);
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState('');
	const [courseId, setCourseId] = useState(null);
	const [courseTitle, setCourseTitle] = useState('');
	const [testId, setTestId] = useState(null);
	const [testTitle, setTestTitle] = useState('');

	const aiReady = isVoltEnabled('ai_creator') && isVoltEnabled('ai_test_generation');
	const credits = getAiCredits();

	useEffect(() => {
		if (aiReady && !isAiSetupDone()) {
			telemetryService.track('guided_ai_setup_viewed', { step: 'materials' });
		}
	}, [aiReady]);

	const materialChars = useMemo(() => {
		const docs = documents.reduce((sum, doc) => sum + String(doc.text || '').length, 0);
		return docs + pastedText.trim().length;
	}, [documents, pastedText]);

	const formatCredits = (row) => {
		if (!row) return null;
		if (row.unlimited) return 'nelimitat';
		if (row.limit == null) return null;
		return `${row.remaining ?? 0} / ${row.limit} credite luna asta`;
	};

	const removeDocument = (name) => {
		setDocuments((prev) => prev.filter((doc) => doc.name !== name));
	};

	const goToCourseStep = () => {
		if (!topic.trim()) {
			showToast('Adaugă un subiect sau titlu de curs.', 'warning');
			return;
		}
		if (materialChars < 40) {
			showToast('Adaugă un PDF/TXT sau lipește puțin text (minim ~40 caractere).', 'warning');
			return;
		}
		setStep(1);
		telemetryService.track('guided_ai_setup_step', { step: 'course' });
	};

	const handleFiles = async (event) => {
		const files = Array.from(event.target.files || []);
		if (!files.length) return;
		setBusy(true);
		setStatus('Citesc documentele…');
		try {
			const next = [];
			for (const file of files) {
				const lower = (file.name || '').toLowerCase();
				const mime = (file.type || '').toLowerCase();
				let text = '';
				let type = 'file';
				if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
					type = 'pdf';
					const { extractPdfTextAsHtml } = await import('../../utils/pdfTextExtractor');
					text = stripHtmlToText(await extractPdfTextAsHtml(file));
				} else if (mime === 'text/plain' || lower.endsWith('.txt')) {
					type = 'txt';
					text = await file.text();
				} else if (isVoltEnabled('ai_creator')) {
					const extracted = await openaiService.extractDocumentContext(file);
					type = extracted?.type || type;
					text = extracted?.text || extracted?.preview || '';
				} else {
					showToast('Pentru acest tip de fișier ai nevoie de Formely AI (creator).', 'warning');
					continue;
				}
				const normalized = String(text || '').replace(/\s+/g, ' ').trim();
				if (!normalized) {
					showToast(`Nu am putut extrage text din ${file.name}.`, 'warning');
					continue;
				}
				next.push({
					name: file.name,
					type,
					mime_type: file.type || null,
					size: file.size,
					text: normalized.slice(0, 12000),
					preview: normalized.slice(0, 800),
				});
			}
			setDocuments((prev) => [...prev, ...next]);
			if (next.length) showToast(`${next.length} document(e) pregătite.`, 'success');
		} catch (err) {
			console.error(err);
			if (isAiQuotaError(err)) notifyAiQuotaExceeded(showToast, quotaErrorMessage(err));
			else showToast(err?.message || 'Nu am putut citi fișierele.', 'error');
		} finally {
			setBusy(false);
			setStatus('');
			event.target.value = '';
		}
	};

	const generateCourse = async () => {
		if (!aiReady) {
			notifyVoltComingSoon(showToast);
			return;
		}
		if (!hasAiQuota('course_generation')) {
			notifyAiQuotaExceeded(showToast);
			return;
		}
		if (materialChars < 80 && !topic.trim()) {
			showToast('Adaugă un PDF/text sau măcar un subiect clar.', 'warning');
			return;
		}

		setBusy(true);
		setStatus('Formely AI generează cursul…');
		try {
			const brief = {
				topic: topic.trim() || 'Onboarding',
				course_title: topic.trim() || 'Onboarding angajați',
				description: 'Curs de onboarding generat din materialele firmei.',
				target_audience: audience.trim() || 'Angajați noi',
				level: 'incepator',
				style: 'practic',
				lesson_size: 'mediu',
				modules_count: 2,
				lessons_per_module: 2,
				language: 'ro',
				evaluation: 'none',
			};
			const prompt = buildCourseCreationPromptFromBrief(
				brief,
				materialChars
					? 'Folosește ca sursă principală documentele/textul atașat. Nu inventa proceduri care nu apar în materiale.'
					: 'Creează un onboarding practic, scurt, gata de editat.',
			);

			let createdId = null;
			let streamed = '';
			await openaiService.streamCourseGeneration(
				prompt,
				[],
				null,
				(chunk) => {
					if (!chunk) return;
					streamed += chunk;
					if (streamed.length % 400 < 20) {
						setStatus(`Formely AI generează cursul… (${Math.min(99, Math.round(streamed.length / 40))}%)`);
					}
				},
				(data) => {
					if (data?.course_id) createdId = data.course_id;
				},
				{
					mode: 'guided_creation:full',
					attachments: documents,
					guided_brief: brief,
					source_text: pastedText.trim().slice(0, 12000) || undefined,
				},
			);

			if (!createdId) {
				const parsed = extractJsonFromText(streamed);
				if (parsed?.course_id) createdId = parsed.course_id;
				if (parsed?.title) setCourseTitle(String(parsed.title));
			}

			if (!createdId) {
				throw new Error('Formely AI nu a returnat un curs creat. Încearcă din nou sau deschide asistentul AI.');
			}

			try {
				const course = await adminService.getCourse(createdId);
				setCourseTitle(course?.title || course?.course?.title || topic);
			} catch {
				setCourseTitle(topic || 'Curs generat');
			}

			setCourseId(createdId);
			setStep(2);
			telemetryService.track('guided_ai_setup_course_created', { course_id: createdId });
			showToast('Cursul a fost creat. Urmează testul.', 'success');
		} catch (err) {
			console.error(err);
			if (isAiQuotaError(err)) notifyAiQuotaExceeded(showToast, quotaErrorMessage(err));
			else showToast(err?.message || AI_QUOTA_EXCEEDED_MESSAGE, 'error');
		} finally {
			setBusy(false);
			setStatus('');
		}
	};

	const generateTest = async () => {
		if (!courseId) {
			showToast('Generează mai întâi cursul.', 'warning');
			return;
		}
		if (!hasAiQuota('test_generation')) {
			notifyAiQuotaExceeded(showToast);
			return;
		}

		setBusy(true);
		setStatus('Formely AI generează testul…');
		try {
			let streamed = '';
			await openaiService.streamTestGeneration(
				`Creează un test cu 8 întrebări pentru cursul „${courseTitle || topic}” (ID ${courseId}). Răspunde JSON cu title, description și questions.`,
				[],
				courseId,
				(chunk) => {
					if (!chunk) return;
					streamed += chunk;
				},
				null,
				{ test_brief: { topic: courseTitle || topic || 'Test final', language: 'ro', question_count: 8, difficulty: 'easy', question_type: 'multiple_choice', source: 'course' } },
			);

			const parsed = extractJsonFromText(streamed);
			const questions = mapVoltTestQuestions(parsed?.questions);
			if (!parsed?.title || questions.length === 0) {
				throw new Error('Nu am putut pregăti un test valid. Regenerați sau adăugați întrebări manual.');
			}

			const created = await adminService.createTest({
				title: parsed.title,
				description: parsed.description || `Test pentru ${courseTitle || topic}`,
				questions,
			});
			const test = created?.test || created;
			const id = test?.id;
			if (!id) throw new Error('Testul nu a putut fi salvat.');

			try {
				await adminService.linkTestToCourse(id, courseId);
			} catch (linkErr) {
				console.warn('Test created but not linked', linkErr);
			}

			setTestId(id);
			setTestTitle(test.title || parsed.title);
			setStep(3);
			telemetryService.track('guided_ai_setup_test_created', { course_id: courseId, test_id: id });
			showToast('Test creat și legat de curs.', 'success');
		} catch (err) {
			console.error(err);
			if (isAiQuotaError(err)) notifyAiQuotaExceeded(showToast, quotaErrorMessage(err));
			else showToast(err?.message || 'Eroare la generarea testului.', 'error');
		} finally {
			setBusy(false);
			setStatus('');
		}
	};

	const finish = () => {
		markAiSetupDone();
		telemetryService.track('guided_ai_setup_completed', {
			course_id: courseId,
			test_id: testId,
		});
		navigate('/admin/users');
	};

	if (!aiReady) {
		return (
			<div className="ai-setup-page">
				<div className="ai-setup-card">
					<h1>Formely AI</h1>
					<p>Planul sau configurarea AI nu permite încă acest flux. Contactează-ne pentru activare sau verifică providerul AI.</p>
					<Link className="lms-btn-secondary" to="/admin">Înapoi la panou</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="ai-setup-page">
			{demoReadonly ? (
				<p className="demo-readonly-note">
					Modul demo: poți vedea pașii Setup AI, dar generarea și salvarea nu persistă. Continuă ghidul spre Conținut / Statistici ca să vezi rezultatele deja populate.
				</p>
			) : null}
			<header className="ai-setup-header">
				<div>
					<p className="ai-setup-eyebrow">Formely AI · Setup rapid</p>
					<h1>Din materiale la echipă instruită</h1>
					<p className="ai-setup-sub">
						Încarci ce ai deja → AI face cursul și testul → inviți primul om.
					</p>
					{formatCredits(credits) ? (
						<p className="ai-setup-quota">
							Formely AI: {formatCredits(credits)}
							{' '}· curs {getAiCreditCost('course_generation')} / test {getAiCreditCost('test_generation')}
						</p>
					) : null}
				</div>
				<Link className="lms-btn-secondary" to="/admin">Panou</Link>
			</header>

			<ol className="ai-setup-steps">
				{STEPS.map((item, index) => (
					<li
						key={item.id}
						className={
							index === step ? 'is-active' : index < step ? 'is-done' : undefined
						}
					>
						<span>{String(index + 1).padStart(2, '0')}</span>
						{item.label}
					</li>
				))}
			</ol>

			{status ? <p className="ai-setup-status" role="status">{status}</p> : null}

			{step === 0 && (
				<section className="ai-setup-card">
					<h2>1. Materialele de onboarding</h2>
					<p>PDF, TXT sau text lipit — proceduri, checklist, prezentare produs.</p>
					<label className="ai-setup-field">
						<span>Subiect / titlu curs</span>
						<input value={topic} onChange={(e) => setTopic(e.target.value)} />
					</label>
					<label className="ai-setup-field">
						<span>Public țintă</span>
						<input value={audience} onChange={(e) => setAudience(e.target.value)} />
					</label>
					<label className="ai-setup-field">
						<span>Încarcă fișiere</span>
						<input type="file" accept=".pdf,.txt,application/pdf,text/plain" multiple onChange={handleFiles} disabled={busy} />
					</label>
					{documents.length > 0 && (
						<ul className="ai-setup-docs">
							{documents.map((doc) => (
								<li key={doc.name}>
									<strong>{doc.name}</strong>
									<span className="ai-setup-doc-meta">
										{doc.text.length} caractere
										<button type="button" className="ai-setup-doc-remove" onClick={() => removeDocument(doc.name)}>
											Elimină
										</button>
									</span>
								</li>
							))}
						</ul>
					)}
					<label className="ai-setup-field">
						<span>Sau lipește text</span>
						<textarea
							rows={6}
							value={pastedText}
							onChange={(e) => setPastedText(e.target.value)}
							placeholder="Proceduri, reguli, pași de lucru…"
						/>
					</label>
					<button
						type="button"
						className="lms-btn-primary"
						disabled={busy}
						onClick={goToCourseStep}
					>
						Continuă la generare curs
					</button>
				</section>
			)}

			{step === 1 && (
				<section className="ai-setup-card">
					<h2>2. Generează cursul cu Formely AI</h2>
					<p>
						Folosim {documents.length} document(e)
						{pastedText.trim() ? ' + text lipit' : ''} · ~{materialChars} caractere sursă.
						Consumă {getAiCreditCost('course_generation')} credite.
					</p>
					<div className="ai-setup-actions">
						<button type="button" className="lms-btn-secondary" disabled={busy} onClick={() => setStep(0)}>
							Înapoi
						</button>
						<button type="button" className="lms-btn-primary" disabled={busy} onClick={generateCourse}>
							{busy ? 'Se generează…' : 'Generează cursul'}
						</button>
					</div>
				</section>
			)}

			{step === 2 && (
				<section className="ai-setup-card">
					<h2>3. Generează testul</h2>
					<p>
						Curs: <strong>{courseTitle || `#${courseId}`}</strong>. Formely AI propune întrebări pe baza cursului.
					</p>
					<div className="ai-setup-actions">
						{courseId ? (
							<Link className="lms-btn-secondary" to={`/admin/courses/${courseId}/builder`}>
								Deschide builder curs
							</Link>
						) : null}
						<button
							type="button"
							className="lms-btn-secondary"
							disabled={busy}
							onClick={() => {
								telemetryService.track('guided_ai_setup_test_skipped', { course_id: courseId });
								setStep(3);
							}}
						>
							Sari peste test
						</button>
						<button type="button" className="lms-btn-primary" disabled={busy} onClick={generateTest}>
							{busy ? 'Se generează…' : 'Generează testul'}
						</button>
					</div>
				</section>
			)}

			{step === 3 && (
				<section className="ai-setup-card">
					<h2>4. Invită primul angajat</h2>
					<p>
						Gata: curs{courseTitle ? ` „${courseTitle}”` : ''}
						{testTitle ? ` + test „${testTitle}”` : testId ? '' : ' (poți adăuga testul mai târziu)'}.
						{' '}Invită pe email pe primul om din echipă ca să vadă progresul.
					</p>
					<div className="ai-setup-actions">
						{courseId ? (
							<Link className="lms-btn-secondary" to={`/admin/courses/${courseId}/builder`}>
								Editează cursul
							</Link>
						) : null}
						{testId ? (
							<Link className="lms-btn-secondary" to={`/admin/tests/${testId}/builder`}>
								Editează testul
							</Link>
						) : null}
						<button type="button" className="lms-btn-primary" onClick={finish}>
							Mergi la invitații
						</button>
					</div>
				</section>
			)}
		</div>
	);
}
