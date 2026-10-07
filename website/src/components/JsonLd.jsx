import { Helmet } from 'react-helmet-async';
import { useI18n } from '../i18n/I18nContext';
import { site, siteUrl } from '../data/site';
import { launchPrice, planOrder, saasPlanCatalog } from '../data/plans';

export function OrganizationJsonLd() {
  const { t } = useI18n();
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    url: siteUrl,
    description: t('seo.description'),
    email: site.email,
    telephone: site.phone,
  };
  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(data)}</script>
    </Helmet>
  );
}

export function SoftwareJsonLd() {
  const { t } = useI18n();
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: site.name,
    applicationCategory: 'EducationalApplication',
    applicationSubCategory: 'Learning Management System',
    operatingSystem: 'Web',
    description: t('seo.description'),
    url: siteUrl,
    image: `${siteUrl.replace(/\/$/, '')}/og-image.png`,
    offers: planOrder.map((id) => ({
      '@type': 'Offer',
      name: t(`pricing.plans.${id}.name`),
      price: launchPrice(saasPlanCatalog[id].price),
      priceCurrency: 'EUR',
      url: `${siteUrl.replace(/\/$/, '')}/#preturi`,
    })),
  };
  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(data)}</script>
    </Helmet>
  );
}

export function FaqJsonLd({ items }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(data)}</script>
    </Helmet>
  );
}
