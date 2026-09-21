import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PaintBrush, X } from '@phosphor-icons/react';
import { useAuth } from '../../contexts/AuthContext';
import './AdminOnboardingBanner.css';

const DISMISS_KEY = 'formely_onboarding_branding_dismissed';

const AdminOnboardingBanner = () => {
	const { user } = useAuth();
	const [dismissed, setDismissed] = useState(() => {
		try {
			return sessionStorage.getItem(DISMISS_KEY) === '1';
		} catch {
			return false;
		}
	});

	useEffect(() => {
		if (user?.onboarding?.has_logo) {
			try {
				sessionStorage.removeItem(DISMISS_KEY);
			} catch {
				/* ignore */
			}
			setDismissed(false);
		}
	}, [user?.onboarding?.has_logo]);

	const role = user?.actualRole || user?.role;
	const canSee =
		Boolean(user?.onboarding?.needs_branding)
		&& !user?.is_platform_admin
		&& ['company_owner', 'admin'].includes(role);

	if (!canSee || dismissed) {
		return null;
	}

	const dismiss = () => {
		try {
			sessionStorage.setItem(DISMISS_KEY, '1');
		} catch {
			/* ignore */
		}
		setDismissed(true);
	};

	return (
		<div className="admin-onboarding-banner" role="status">
			<div className="admin-onboarding-banner-inner">
				<div className="admin-onboarding-banner-icon" aria-hidden>
					<PaintBrush size={20} weight="duotone" />
				</div>
				<div className="admin-onboarding-banner-copy">
					<p className="admin-onboarding-banner-title">Finalizează branding-ul organizației</p>
					<p className="admin-onboarding-banner-text">
						Adaugă logo-ul ca elevii să vadă brandul tău în platformă.
					</p>
				</div>
				<div className="admin-onboarding-banner-actions">
					<Link to="/admin/settings" className="admin-onboarding-banner-cta">
						Deschide setările
					</Link>
					<button
						type="button"
						className="admin-onboarding-banner-dismiss"
						onClick={dismiss}
						aria-label="Închide"
					>
						<X size={16} weight="bold" />
					</button>
				</div>
			</div>
		</div>
	);
};

export default AdminOnboardingBanner;
