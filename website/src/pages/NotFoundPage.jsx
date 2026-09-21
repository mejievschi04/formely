import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import { useI18n } from '../i18n/I18nContext';

export default function NotFoundPage() {
  const { t } = useI18n();

  return (
    <>
      <Seo title={t('notFound.title')} description={t('notFound.text')} path="/404" noindex />
      <div className="page-center">
        <h1>{t('notFound.title')}</h1>
        <p>{t('notFound.text')}</p>
        <Link className="btn btn-primary" to="/">
          {t('notFound.cta')}
        </Link>
      </div>
    </>
  );
}
