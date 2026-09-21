import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api';
import { useAuth } from './AuthContext';
import {
	DEFAULT_BRANDING,
	applyCompanyBranding,
	brandingSlugFromSearch,
} from '../utils/companyBranding';

const CompanyBrandingContext = createContext(null);

export function useCompanyBranding() {
	const ctx = useContext(CompanyBrandingContext);
	if (!ctx) {
		throw new Error('useCompanyBranding must be used within CompanyBrandingProvider');
	}
	return ctx;
}

export function CompanyBrandingProvider({ children }) {
	const { user } = useAuth();
	const { search } = useLocation();
	const [publicBranding, setPublicBranding] = useState(null);
	const [loading, setLoading] = useState(true);

	const slug = useMemo(() => brandingSlugFromSearch(search), [search]);

	const refreshPublic = useCallback(async () => {
		setLoading(true);
		try {
			const res = await api.get(`/branding/${encodeURIComponent(slug)}`);
			setPublicBranding(res.data?.company ?? null);
		} catch {
			setPublicBranding(null);
		} finally {
			setLoading(false);
		}
	}, [slug]);

	useEffect(() => {
		if (user?.company) {
			setLoading(false);
			return;
		}
		refreshPublic();
	}, [user?.company, refreshPublic]);

	const branding = useMemo(() => {
		if (user?.company) {
			return { ...DEFAULT_BRANDING, ...user.company };
		}
		if (publicBranding) {
			return { ...DEFAULT_BRANDING, ...publicBranding };
		}
		return DEFAULT_BRANDING;
	}, [user?.company, publicBranding]);

	useEffect(() => {
		applyCompanyBranding(branding);
	}, [branding]);

	const value = useMemo(
		() => ({
			branding,
			loading: loading && !user?.company,
			refreshPublic,
			setBrandingFromApi: (company) => {
				if (company) setPublicBranding(company);
			},
		}),
		[branding, loading, refreshPublic, user?.company]
	);

	return (
		<CompanyBrandingContext.Provider value={value}>
			{children}
		</CompanyBrandingContext.Provider>
	);
}
