import { toImageUrl } from './imageUrl';

export const DEFAULT_COMPANY_SLUG =
	import.meta.env.VITE_DEFAULT_COMPANY_SLUG || 'default';

export const DEFAULT_BRANDING = {
	name: 'Formely',
	slug: DEFAULT_COMPANY_SLUG,
	logo_url: null,
	primary_color: '#0891b2',
	secondary_color: '#22d3ee',
};

export function resolveCompanyLogoUrl(logoUrl) {
	if (!logoUrl) return null;
	return toImageUrl(logoUrl);
}

/** Culori liquid ether: fundal închis + primary + secondary */
export function brandingLiquidColors(company) {
	const primary = company?.primary_color || DEFAULT_BRANDING.primary_color;
	const secondary = company?.secondary_color || DEFAULT_BRANDING.secondary_color;
	return ['#030712', primary, secondary];
}

export function applyCompanyBranding(company, root = document.documentElement) {
	if (!root || !company) return;

	const primary = company.primary_color || DEFAULT_BRANDING.primary_color;
	const secondary = company.secondary_color || DEFAULT_BRANDING.secondary_color;

	root.style.setProperty('--auth-primary', secondary);
	root.style.setProperty('--auth-accent', primary);
	root.style.setProperty('--auth-btn-bg', primary);
	root.style.setProperty('--auth-btn-hover', secondary);
	root.style.setProperty('--auth-border-focus', secondary);
	root.style.setProperty('--auth-focus-ring', `${secondary}66`);
	root.style.setProperty('--fm-primary', primary);
	root.style.setProperty('--fm-accent', secondary);
}

export function companyWordmark(name) {
	const trimmed = (name || DEFAULT_BRANDING.name).trim();
	if (!trimmed) return DEFAULT_BRANDING.name.toUpperCase().split('');
	return trimmed.toUpperCase().replace(/\s+/g, '').split('');
}

export function brandingSlugFromSearch(search) {
	try {
		const params = new URLSearchParams(search || '');
		const slug = params.get('company')?.trim();
		return slug || DEFAULT_COMPANY_SLUG;
	} catch {
		return DEFAULT_COMPANY_SLUG;
	}
}
