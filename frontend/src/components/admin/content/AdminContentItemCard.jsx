import React from 'react';
import './AdminContentItemCard.css';

/**
 * Card minimal unificat pentru liste admin (teste, examene, etc.)
 */
export default function AdminContentItemCard({
  title,
  badge = null,
  status = 'draft',
  statusLabel,
  metaLine = '',
  primaryAction = null,
  actions = [],
  children = null,
}) {
  const resolvedStatusLabel = statusLabel ?? status;

  return (
    <article className="admin-content-card" data-status={status}>
      <div className="admin-content-card__body">
        <div className="admin-content-card__head">
          <h3 className="admin-content-card__title">{title}</h3>
          <span className="admin-content-card__status">{resolvedStatusLabel}</span>
        </div>
        {badge ? <p className="admin-content-card__badge">{badge}</p> : null}
        {metaLine ? <p className="admin-content-card__meta">{metaLine}</p> : null}
        {children}
      </div>

      {(primaryAction || actions.length > 0) && (
        <footer className="admin-content-card__footer">
          {primaryAction ? (
            <button
              type="button"
              className="admin-content-card__primary"
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </button>
          ) : null}
          {actions.length > 0 ? (
            <div className="admin-content-card__actions" role="group">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className={[
                    'admin-content-card__action',
                    action.emphasis ? 'is-emphasis' : '',
                    action.danger ? 'is-danger' : '',
                  ].filter(Boolean).join(' ')}
                  disabled={action.disabled}
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </footer>
      )}
    </article>
  );
}
