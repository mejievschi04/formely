import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import { useI18n } from '../i18n/I18nContext';
import { site } from '../data/site';

function sectionsOf(value) {
  return Array.isArray(value) ? value : [];
}

export default function PrivacyPage() {
  const { t } = useI18n();
  const sections = sectionsOf(t('legal.privacySections'));
  const controllerBits = [site.legalName, site.address].filter(Boolean).join(' · ');

  return (
    <>
      <Seo title={t('legal.privacyTitle')} description={t('legal.privacyIntro')} path="/legal/confidentialitate" />
      <section className="section">
        <div className="container prose legal-prose">
          <h1>{t('legal.privacyTitle')}</h1>
          <p className="legal-meta">{t('legal.updated', { date: site.privacyUpdated })}</p>
          <p>{t('legal.privacyIntro')}</p>
          <p>
            {t('legal.controller')}{' '}
            {controllerBits ? <strong>{controllerBits}. </strong> : null}
            <a href={`mailto:${site.email}`}>{site.email}</a>
          </p>
          {sections.map((section) => (
            <section key={section.id || section.title} id={section.id || undefined}>
              <h2>{section.title}</h2>
              {(section.paragraphs || []).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
          <p>
            <Link to="/legal/termeni">{t('legal.termsTitle')}</Link>
            {' · '}
            <Link to="/">{t('legal.back')}</Link>
          </p>
        </div>
      </section>
    </>
  );
}
