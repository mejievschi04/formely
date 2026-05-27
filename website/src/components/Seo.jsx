import { Helmet } from 'react-helmet-async';
import { site, siteUrl } from '../data/site';

export default function Seo({
  title,
  description = site.description,
  path = '/',
  noindex = false,
  type = 'website',
}) {
  const fullTitle = title.includes('Formely') ? title : `${title} | Formely`;
  const canonical = `${siteUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const image = `${siteUrl.replace(/\/$/, '')}/favicon.svg`;

  return (
    <Helmet>
      <html lang="ro" />
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:type" content={type} />
      <meta property="og:locale" content="ro_RO" />
      <meta property="og:site_name" content={site.name} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={image} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </Helmet>
  );
}
