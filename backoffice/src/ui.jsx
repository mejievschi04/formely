import React, { useEffect, useId, useRef } from 'react';
import { seatPercent, seats } from './lib';

export function SeatMeter({ used, max, pending }) {
  const pct = seatPercent(used, max);
  return (
    <div className="bo-seat">
      <span>
        {seats(used, max)}
        {pending ? ` · ${pending} invit.` : ''}
      </span>
      {pct != null && (
        <div className="bo-seat__bar" aria-hidden>
          <span className={pct >= 100 ? 'is-full' : pct >= 85 ? 'is-high' : ''} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/** Modal overlay: Escape, click outside, basic focus restore. */
export function Overlay({ open, onClose, title, children, wide }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const previousFocus = useRef(null);
  // onClose e de obicei o funcție nouă la fiecare render; în ref, ca efectul de focus
  // să ruleze doar la deschidere / închidere, nu la fiecare tastă sau refresh automat.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable && typeof focusable.focus === 'function') focusable.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      if (previousFocus.current && typeof previousFocus.current.focus === 'function') {
        previousFocus.current.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="bo-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={`bo-panel${wide ? ' bo-panel--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <header>
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="bo-btn bo-btn--sm bo-btn--ghost" onClick={onClose}>
              Închide
            </button>
          </header>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function Pagination({ page, lastPage, total, onPage }) {
  if (!lastPage || lastPage <= 1) {
    return total != null ? <span className="bo-muted">{total} rezultate</span> : null;
  }
  return (
    <div className="bo-pagination">
      <button
        type="button"
        className="bo-btn bo-btn--sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Înapoi
      </button>
      <span className="bo-muted">
        Pagina {page} / {lastPage}
        {total != null ? ` · ${total}` : ''}
      </span>
      <button
        type="button"
        className="bo-btn bo-btn--sm"
        disabled={page >= lastPage}
        onClick={() => onPage(page + 1)}
      >
        Înainte
      </button>
    </div>
  );
}
