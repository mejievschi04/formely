import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nContext';

const STORAGE_KEY = 'formely-cookie-notice';

export default function CookieNotice() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== '1');
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookie-notice" role="dialog" aria-labelledby="cookie-notice-title">
      <div className="cookie-notice-copy">
        <strong id="cookie-notice-title">{t('legal.cookieTitle')}</strong>
        <p>{t('legal.cookieBody')}</p>
      </div>
      <div className="cookie-notice-actions">
        <Link to="/legal/confidentialitate#cookies" onClick={dismiss}>
          {t('legal.cookieMore')}
        </Link>
        <button type="button" className="btn btn-primary" onClick={dismiss}>
          {t('legal.cookieOk')}
        </button>
      </div>
    </div>
  );
}
