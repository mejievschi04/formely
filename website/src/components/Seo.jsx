import { Helmet } from 'react-helmet-async';
import { useI18n } from '../i18n/I18nContext';
import { site, siteUrl, LOCALE_META } from '../data/site';

export default function Seo({ title, description, path = '/', noindex = false, type = 'website' }) {
  const { lang, meta } = useI18n();
  const fullTitle = title.includes('Formely') ? title : `${title} | Formely`;
  const base = siteUrl.replace(/\/$/, '');
  const canonical = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const image = `${base}/og-image.png`;

  return (
    <Helmet>
      <html lang={meta.htmlLang} />
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:type" content={type} />
      <meta property="og:locale" content={meta.ogLocale} />
      {Object.entries(LOCALE_META)
        .filter(([code]) => code !== lang)
        .map(([code, m]) => (
          <meta key={code} property="og:locale:alternate" content={m.ogLocale} />
        ))}
      <meta property="og:site_name" content={site.name} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={fullTitle} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </Helmet>
  );
}
