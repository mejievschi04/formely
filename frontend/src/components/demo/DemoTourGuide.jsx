import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContextShared.js';
import { isPublicDemoSession } from '../../utils/demoMode';

const STORAGE_OPEN = 'formely_demo_guide_open';
const STORAGE_STEP = 'formely_demo_guide_step';

const SITE_CONTACT =
	(typeof import.meta !== 'undefined' && import.meta.env?.VITE_SITE_URL
		? String(import.meta.env.VITE_SITE_URL).replace(/\/$/, '')
		: 'https://formely.org') + '/#contact';

const STEPS = [
	{
		id: 'welcome',
		title: 'Bun venit în academia demo',
		body: 'Ești pe un cont de administrator cu date reale de exemplu. Poți deschide orice ecran — salvările sunt blocate, ca fiecare vizitator să vadă aceleași rezultate.',
		path: '/admin',
		adminView: 'admin',
	},
	{
		id: 'ai',
		title: 'Formely AI — din materiale',
		body: 'Deschide Setup AI și continuă la pasul 2. Redă demonstrația înregistrată ca să vezi un ghid transformat în module și lecții, fără consum de credite.',
		path: '/admin/ai-setup',
		adminView: 'admin',
	},
	{
		id: 'content',
		title: 'Conținut — cursuri și mape',
		body: 'Cursuri publicate (onboarding, compliance, sales…). Deschide o mapă sau un curs ca să vezi modulele și lecțiile.',
		path: '/admin/content?tab=courses&view=maps',
		adminView: 'admin',
	},
	{
		id: 'users',
		title: 'Echipa — utilizatori',
		body: 'Cursanți și staff deja populați. În producție inviți oamenii pe email din acest panou.',
		path: '/admin/users',
		adminView: 'admin',
	},
	{
		id: 'stats',
		title: 'Progres și statistici',
		body: 'Note la teste, finalizări și activitate — ce vede un manager după ce echipa învață.',
		path: '/admin/statistics',
		adminView: 'admin',
	},
	{
		id: 'student',
		title: 'Vezi ca angajat',
		body: 'Comutăm la vizualizarea de cursant: cursuri atribuite, lecții și teste — experiența echipei tale.',
		path: '/courses',
		adminView: 'student',
	},
	{
		id: 'activate',
		title: 'Pornește academia ta',
		body: 'Când vrei contul real (nu demo): cerere pe site → contact în 24h → 14 zile gratuit, cu ajutor la primul curs AI.',
		path: '/admin',
		adminView: 'admin',
		ctaExternal: SITE_CONTACT,
		ctaLabel: 'Cere activare',
	},
];

function readOpen() {
	try {
		const v = sessionStorage.getItem(STORAGE_OPEN);
		if (v === null) return true;
		return v === '1';
	} catch {
		return true;
	}
}

function readStep() {
	try {
		const n = Number(sessionStorage.getItem(STORAGE_STEP));
		if (Number.isFinite(n) && n >= 0 && n < STEPS.length) return n;
	} catch {
		/* ignore */
	}
	return 0;
}

export default function DemoTourGuide() {
	const { user, setAdminViewMode } = useAuth();
	const navigate = useNavigate();
	const demo = isPublicDemoSession(user);
	const [open, setOpen] = useState(readOpen);
	const [step, setStep] = useState(readStep);
	const [minimized, setMinimized] = useState(false);
	const [showOutline, setShowOutline] = useState(false);

	useEffect(() => {
		if (!demo) return;
		try {
			sessionStorage.setItem(STORAGE_OPEN, open ? '1' : '0');
			sessionStorage.setItem(STORAGE_STEP, String(step));
		} catch {
			/* ignore */
		}
	}, [demo, open, step]);

	useEffect(() => {
		if (!demo) return undefined;
		const onOpen = () => {
			setOpen(true);
			setMinimized(false);
		};
		window.addEventListener('formely:open-demo-guide', onOpen);
		return () => window.removeEventListener('formely:open-demo-guide', onOpen);
	}, [demo]);

	const current = STEPS[step] || STEPS[0];
	const progress = useMemo(() => Math.round(((step + 1) / STEPS.length) * 100), [step]);

	if (!demo) return null;

	const goStep = (index) => {
		const next = Math.max(0, Math.min(STEPS.length - 1, index));
		const def = STEPS[next];
		setStep(next);
		setMinimized(false);
		setOpen(true);
		setShowOutline(false);
		if (def.adminView && typeof setAdminViewMode === 'function') {
			setAdminViewMode(def.adminView);
		}
		try {
			if (def.adminView === 'student') {
				sessionStorage.setItem('studentPreviewFromAdmin', 'true');
			} else {
				sessionStorage.removeItem('studentPreviewFromAdmin');
			}
		} catch {
			/* ignore */
		}
		if (def.path) {
			navigate(def.path);
		}
	};

	if (!open || minimized) {
		return (
			<button
				type="button"
				className="demo-guide-fab"
				onClick={() => {
					setOpen(true);
					setMinimized(false);
				}}
			>
				{minimized ? `Ghid · ${step + 1}/${STEPS.length}` : 'Ghid demo'}
			</button>
		);
	}

	return (
		<aside className="demo-guide" aria-label="Ghid academia demo">
			<header className="demo-guide-head">
				<div>
					<p className="demo-guide-kicker">
						Pasul {step + 1} din {STEPS.length} · fără salvare
					</p>
					<h2 className="demo-guide-title">{current.title}</h2>
				</div>
				<div className="demo-guide-head-actions">
					<button type="button" className="demo-guide-icon-btn" onClick={() => setMinimized(true)} aria-label="Minimizează">
						–
					</button>
					<button type="button" className="demo-guide-icon-btn" onClick={() => setOpen(false)} aria-label="Închide ghidul">
						×
					</button>
				</div>
			</header>

			<div className="demo-guide-progress" aria-hidden>
				<span style={{ width: `${progress}%` }} />
			</div>

			<div className="demo-guide-dots" role="tablist" aria-label="Pași ghid">
				{STEPS.map((s, i) => (
					<button
						key={s.id}
						type="button"
						role="tab"
						aria-selected={i === step}
						className={`demo-guide-dot${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`}
						onClick={() => goStep(i)}
						title={s.title}
					/>
				))}
			</div>

			<p className="demo-guide-body">{current.body}</p>

			<button type="button" className="demo-guide-outline-toggle" onClick={() => setShowOutline((v) => !v)}>
				{showOutline ? 'Ascunde lista de pași' : 'Vezi toți pașii'}
			</button>

			{showOutline ? (
				<ol className="demo-guide-steps">
					{STEPS.map((s, i) => (
						<li key={s.id}>
							<button
								type="button"
								className={`demo-guide-step${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`}
								onClick={() => goStep(i)}
							>
								<span>{String(i + 1).padStart(2, '0')}</span>
								{s.title}
							</button>
						</li>
					))}
				</ol>
			) : null}

			<footer className="demo-guide-foot">
				<button type="button" className="demo-guide-btn ghost" disabled={step === 0} onClick={() => goStep(step - 1)}>
					Înapoi
				</button>
				{current.ctaExternal ? (
					<a className="demo-guide-btn primary" href={current.ctaExternal} target="_blank" rel="noopener noreferrer">
						{current.ctaLabel || 'Continuă'}
					</a>
				) : (
					<button type="button" className="demo-guide-btn primary" onClick={() => goStep(step + 1)}>
						Următorul pas
					</button>
				)}
			</footer>
		</aside>
	);
}
