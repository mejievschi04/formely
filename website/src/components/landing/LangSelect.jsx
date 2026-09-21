import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { LOCALE_META } from '../../data/site';

export default function LangSelect() {
  const { t, lang, setLang, supported } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`lang-select${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="lang-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={t('nav.lang')}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{LOCALE_META[lang].label}</span>
        <svg className="lang-select-caret" width="10" height="6" viewBox="0 0 10 6" aria-hidden>
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <ul className="lang-select-menu" id={listId} role="listbox" aria-label={t('footer.languages')}>
          {supported.map((code) => (
            <li key={code} role="option" aria-selected={code === lang}>
              <button
                type="button"
                className={code === lang ? 'is-active' : undefined}
                onClick={() => {
                  setLang(code);
                  setOpen(false);
                }}
              >
                {LOCALE_META[code].label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
