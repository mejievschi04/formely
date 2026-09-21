import React, { useEffect, useState } from 'react';
import LiquidEther from './backgrounds/LiquidEther';
import './SplashScreen.css';

const SPLASH_LIQUID_COLORS = ['#030712', '#0891b2', '#22d3ee'];

const SplashScreen = ({ onStart, appReady = true }) => {
	const [booted, setBooted] = useState(false);
	const [progress, setProgress] = useState(0);

	useEffect(() => {
		const id = requestAnimationFrame(() => setBooted(true));
		return () => cancelAnimationFrame(id);
	}, []);

	useEffect(() => {
		if (appReady) {
			setProgress(100);
			return undefined;
		}
		const id = setInterval(() => {
			setProgress((p) => (p >= 94 ? p : Math.min(94, p + (p < 60 ? 2.5 : 0.8))));
		}, 45);
		return () => clearInterval(id);
	}, [appReady]);

	const canStart = booted && appReady && progress >= 100;

	return (
		<div className={`splash-ultra ${booted ? 'is-booted' : ''} ${canStart ? 'is-ready' : ''}`}>
			<div className="splash-ultra-smoke" aria-hidden="true">
				<LiquidEther
					className="splash-ultra-smoke-canvas"
					resolution={0.46}
					autoDemo
					autoSpeed={0.4}
					autoIntensity={1.75}
					colors={SPLASH_LIQUID_COLORS}
				/>
				<div className="splash-ultra-smoke-depth" />
			</div>

			<div className="splash-ultra-grain" aria-hidden="true" />

			<main className="splash-ultra-stage">
				<div className="splash-ultra-wordmark" aria-label="Formely">
					<img className="splash-ultra-logo" src="/logo.png" alt="Formely" />
					<span className="splash-ultra-wordmark-shine" aria-hidden="true" />
				</div>
			</main>

			{canStart ? (
				<button type="button" className="splash-ultra-start" onClick={() => onStart?.()}>
					Începe
				</button>
			) : (
				<div className="splash-ultra-wait" aria-live="polite" aria-busy="true">
					<span className="splash-ultra-wait-bar" style={{ width: `${progress}%` }} />
				</div>
			)}

			<p className="splash-ultra-credit">Powered by Mejievski</p>
		</div>
	);
};

export default SplashScreen;
