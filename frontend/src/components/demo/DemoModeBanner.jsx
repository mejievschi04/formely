import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContextShared.js';
import { isDemoSession } from '../../utils/demoMode';

const BANNER_DISMISSED_KEY = 'formely_demo_banner_dismissed';

function openDemoGuide() {
	try {
		sessionStorage.setItem('formely_demo_guide_open', '1');
	} catch {
		/* ignore */
	}
	window.dispatchEvent(new CustomEvent('formely:open-demo-guide'));
}

function readBannerDismissed() {
	try {
		return sessionStorage.getItem(BANNER_DISMISSED_KEY) === '1';
	} catch {
		return false;
	}
}

export default function DemoModeBanner() {
	const { user } = useAuth();
	const [dismissed, setDismissed] = useState(readBannerDismissed);

	if (!isDemoSession(user) || dismissed) return null;

	const dismiss = () => {
		try {
			sessionStorage.setItem(BANNER_DISMISSED_KEY, '1');
		} catch {
			/* ignore */
		}
		setDismissed(true);
	};

	return (
		<div className="demo-mode-banner" role="status">
			<span>
				<strong>Modul demo</strong> — poți explora totul; modificările nu se salvează.
			</span>
			<button type="button" className="demo-mode-banner-btn" onClick={openDemoGuide}>
				Deschide ghidul
			</button>
			<button
				type="button"
				className="demo-mode-banner-dismiss"
				onClick={dismiss}
				aria-label="Închide bannerul demo"
			>
				×
			</button>
		</div>
	);
}
