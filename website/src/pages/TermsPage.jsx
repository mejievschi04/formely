import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import { useI18n } from '../i18n/I18nContext';
import { site } from '../data/site';

function sectionsOf(value) {
  return Array.isArray(value) ? value : [];
}

export default function TermsPage() {
  const { t } = useI18n();
  const sections = sectionsOf(t('legal.termsSections'));

  return (
    <>
      <Seo title={t('legal.termsTitle')} description={t('legal.termsIntro')} path="/legal/termeni" />
      <section className="section">
        <div className="container prose legal-prose">
          <h1>{t('legal.termsTitle')}</h1>
          <p className="legal-meta">{t('legal.updated', { date: site.privacyUpdated })}</p>
          <p>{t('legal.termsIntro')}</p>
          {sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {(section.paragraphs || []).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
          <p>
            <a href={`mailto:${site.email}`}>{site.email}</a>
            {' · '}
            <Link to="/legal/confidentialitate">{t('legal.privacyTitle')}</Link>
            {' · '}
            <Link to="/">{t('legal.back')}</Link>
          </p>
        </div>
      </section>
    </>
  );
}
