import React, { useEffect, useState, lazy, Suspense } from 'react';
import { LightbulbFilament } from '@phosphor-icons/react';
import logoShort from '../assets/Formely logo.png';
import './SplashScreen.css';

const LiquidEther = lazy(() => import('./backgrounds/LiquidEther'));

const TYPEWRITER_TEXT = 'VOLTA ACADEMY';
const SPLASH_LIQUID_COLORS = ['#7a7000', '#ffee00', '#ffee00'];
const MOBILE_SPLASH_QUERY = '(max-width: 768px)';

const getIsMobileSplash = () =>
	typeof window !== 'undefined' && window.matchMedia(MOBILE_SPLASH_QUERY).matches;

const SplashScreen = ({ onStart, appReady = true }) => {
	const [isMobile, setIsMobile] = useState(getIsMobileSplash);
	const [displayedText, setDisplayedText] = useState('');
	const [showButton, setShowButton] = useState(getIsMobileSplash);
	const [phase, setPhase] = useState(getIsMobileSplash() ? 'static' : 'overlay'); // overlay -> bulb -> bulb-on -> logo -> typewriter

	useEffect(() => {
		const mq = window.matchMedia(MOBILE_SPLASH_QUERY);
		const onChange = () => setIsMobile(mq.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	}, []);

	// Faze desktop: overlay dispare -> bec stins -> bec aprins #FFEE00 -> doar becul dispare, logo rămâne -> typewriter sub logo
	// Pe mobile: ecran static, fără efecte
	useEffect(() => {
		if (isMobile) {
			setPhase('static');
			setShowButton(true);
			setDisplayedText('');
			return undefined;
		}

		setPhase('overlay');
		setShowButton(false);
		setDisplayedText('');
		const t1 = setTimeout(() => setPhase('bulb'), 1200);
		const t2 = setTimeout(() => setPhase('bulb-on'), 2400);
		const t3 = setTimeout(() => setPhase('logo'), 3800);
		const t4 = setTimeout(() => setPhase('typewriter'), 4500);
		return () => {
			clearTimeout(t1);
			clearTimeout(t2);
			clearTimeout(t3);
			clearTimeout(t4);
		};
	}, [isMobile]);

	// Typewriter când phase = typewriter
	useEffect(() => {
		if (phase !== 'typewriter') return;
		let index = 0;
		const intervalMs = 220;
		const typeInterval = setInterval(() => {
			if (index <= TYPEWRITER_TEXT.length) {
				setDisplayedText(TYPEWRITER_TEXT.slice(0, index));
				index++;
			} else {
				clearInterval(typeInterval);
				setTimeout(() => setShowButton(true), 400);
			}
		}, intervalMs);
		return () => clearInterval(typeInterval);
	}, [phase]);

	// Butonul Începe apare doar după ce s-a încărcat totul (auth + prefetch)
	const canShowButtons = showButton && appReady;

	return (
		<div className={`splash-page ${isMobile ? 'splash-page--static' : `splash-phase-${phase}`}`}>
			{!isMobile && (
				<>
					<div className="splash-light-overlay" aria-hidden="true" />

					<div className="splash-login-like-background" aria-hidden="true">
						<Suspense fallback={null}>
							<LiquidEther
								className="splash-login-liquid-ether"
								resolution={0.4}
								autoDemo={true}
								autoSpeed={0.45}
								autoIntensity={1.55}
								colors={SPLASH_LIQUID_COLORS}
							/>
						</Suspense>
						<div className="splash-login-gradient" />
						<div className="splash-login-pattern" />
						<div className="splash-logo-center-mask" />
					</div>
				</>
			)}

			<div className="splash-content">
				<div className="splash-center-area">
					{!isMobile && (phase === 'bulb' || phase === 'bulb-on' || phase === 'logo') && (
						<div className={`splash-bulb-container ${phase}`}>
							<LightbulbFilament className="splash-bulb-icon" size={44} weight="duotone" aria-hidden="true" />
						</div>
					)}

					{(isMobile || phase === 'logo' || phase === 'typewriter') && (
						<div className={`splash-logo-container ${isMobile ? 'static' : phase}`}>
							<img src={logoShort} alt="Formely" className="splash-logo-img" />
						</div>
					)}

					{!isMobile && phase === 'typewriter' && (
						<div className="splash-typewriter">
							<span className="splash-typewriter-text">{displayedText}</span>
							{!showButton && <span className="splash-typewriter-cursor">|</span>}
						</div>
					)}
				</div>
			</div>

			{isMobile && <p className="splash-brand-title">Formely</p>}

			{showButton && (
				<>
					{canShowButtons ? (
						<button className="splash-start-btn" onClick={() => onStart?.()} aria-label="Începe">Începe</button>
					) : (
						<div className="splash-loading-dots" aria-live="polite">Se încarcă...</div>
					)}
				</>
			)}
			{(canShowButtons || isMobile) && <p className="splash-powered-by">Powered by Mejievski</p>}
		</div>
	);
};

export default SplashScreen;
