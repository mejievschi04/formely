import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { platform } from '../api';
import { LEAD_STATUS, PLAN_LABELS, REASON_LABELS, STATUS_LABELS, errMessage, seats } from '../lib';
import { SeatMeter } from '../ui';
import { useToast } from '../toast';
import { usePoll } from '../usePoll';

const ATTENTION_LIMIT = 6;

export default function OverviewPage() {
  const { push } = useToast();
  const [data, setData] = useState(null);

  const load = useCallback(async (showError = false) => {
    try {
      setData(await platform.overview());
    } catch (err) {
      if (showError) push(errMessage(err, 'Nu am putut încărca panoul.'), 'error');
    }
  }, [push]);

  useEffect(() => {
    load(true);
  }, [load]);

  usePoll(() => load(false), 12000);

  if (!data) return <p className="bo-muted">Se încarcă panoul…</p>;

  const kpis = data.kpis || {};
  const companies = data.companies || [];
  const funnel = data.leads_by_status || {};
  const funnelTotal = Math.max(
    1,
    Object.values(funnel).reduce((sum, n) => sum + (Number(n) || 0), 0),
  );
  const planTotal = Math.max(
    1,
    (data.by_plan?.instructor || 0) + (data.by_plan?.academie || 0) + (data.by_plan?.business || 0),
  );
  const uniqueAttention = [];
  const seen = new Set();
  (data.attention || []).forEach((item) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    uniqueAttention.push(item);
  });

  return (
    <>
      <header className="bo-page-head">
        <div>
          <h1>Panou platformă</h1>
          <p>Academii, abonamente și locuri. Cursurile rămân în LMS-ul fiecărui client.</p>
        </div>
        <Link to="/clients?new=1" className="bo-btn bo-btn--primary">
          Client nou
        </Link>
      </header>

      <section className="bo-kpis">
        <article>
          <span>Clienți</span>
          <strong>{kpis.companies ?? companies.length}</strong>
          <small>
            {data.by_status?.active || 0} active · {data.by_status?.trial || 0} trial · {data.by_status?.suspended || 0} suspendate
          </small>
        </article>
        <article>
          <span>Utilizatori</span>
          <strong>{kpis.users ?? 0}</strong>
          <small>Conturi în toate academiile</small>
        </article>
        <article>
          <span>Cursanți</span>
          <strong>{seats(kpis.learners?.used, kpis.learners?.max)}</strong>
          <small>Folosite / incluse în planuri</small>
        </article>
        <article>
          <span>Staff</span>
          <strong>{seats(kpis.staff?.used, kpis.staff?.max)}</strong>
          <small>Admini, instructori, analiști</small>
        </article>
        <article className={(kpis.needs_attention || 0) > 0 ? 'is-alert' : ''}>
          <span>De rezolvat</span>
          <strong>{kpis.needs_attention ?? 0}</strong>
          <small>{kpis.leads_new ?? 0} cereri noi</small>
        </article>
      </section>

      <section className="bo-card">
        <div className="bo-card__head">
          <h2>Funnel cereri</h2>
          <Link to="/leads">Deschide cererile</Link>
        </div>
        <div className="bo-funnel">
          {Object.entries(LEAD_STATUS).map(([id, label]) => {
            const count = funnel[id] || 0;
            const pct = Math.round((count / funnelTotal) * 100);
            return (
              <Link key={id} to="/leads" className="bo-funnel__step">
                <strong>{count}</strong>
                <span>{label}</span>
                <div className="bo-funnel__bar" aria-hidden>
                  <span style={{ width: `${pct}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="bo-split">
        <section className="bo-card">
          <div className="bo-card__head">
            <h2>Coadă</h2>
            {uniqueAttention.length > 0 && <Link to="/clients">Vezi clienții</Link>}
          </div>
          {uniqueAttention.length === 0 ? (
            <p className="bo-muted">Nimic urgent. Toate academiile sunt în parametrii planului.</p>
          ) : (
            <ul className="bo-attention">
              {uniqueAttention.slice(0, ATTENTION_LIMIT).map((item) => (
                <li key={item.id} data-severity={item.health?.severity || 'watch'}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {(item.health?.reasons || [item.reason]).map((r) => REASON_LABELS[r] || r).join(' · ')}
                    </span>
                    <span className="bo-muted">
                      {item.plan_label} · {STATUS_LABELS[item.status] || item.status}
                      {item.health?.trial_days_left != null && item.status === 'trial'
                        ? ` · ${item.health.trial_days_left < 0 ? 'expirat' : `${item.health.trial_days_left} zile rămase`}`
                        : ''}
                    </span>
                  </div>
                  <Link className="bo-btn bo-btn--sm" to={`/clients/${item.id}`}>
                    Deschide
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {uniqueAttention.length > ATTENTION_LIMIT && (
            <Link to="/clients" className="bo-attention__more">
              + încă {(kpis.needs_attention ?? uniqueAttention.length) - ATTENTION_LIMIT} academii de verificat
            </Link>
          )}
        </section>

        <section className="bo-card">
          <h2>Abonamente</h2>
          <div className="bo-plan-mix">
            {['instructor', 'academie', 'business'].map((id) => {
              const count = data.by_plan?.[id] || 0;
              const pct = Math.round((count / planTotal) * 100);
              return (
                <div key={id} className="bo-plan-mix__row">
                  <div className="bo-plan-mix__meta">
                    <strong>{PLAN_LABELS[id]}</strong>
                    <span>{count}</span>
                  </div>
                  <div className="bo-plan-mix__bar">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {(data.leads_recent || []).length > 0 && (
            <div className="bo-leads-mini">
              <h3>Cereri de acces</h3>
              <ul>
                {(data.leads_recent || []).map((lead) => (
                  <li key={lead.id}>
                    <strong>{lead.company_name || lead.name}</strong>
                    <span>{lead.email} · {lead.source_label || 'Site'}</span>
                    <Link className="bo-btn bo-btn--sm" to={`/leads?convert=${lead.id}`}>
                      Convertește
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section className="bo-card">
        <div className="bo-card__head">
          <h2>Clienți</h2>
          <Link to="/clients">Toți</Link>
        </div>
        {companies.length === 0 ? (
          <div className="bo-empty-cta">
            <p>Niciun client. Creezi primul după o cerere de acces sau un contract.</p>
            <Link to="/clients?new=1" className="bo-btn bo-btn--primary">Client nou</Link>
          </div>
        ) : (
          <table className="bo-table">
            <thead>
              <tr>
                <th>Nume</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Cursanți</th>
                <th>Staff</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} data-severity={c.health?.severity || 'ok'}>
                  <td>
                    <Link to={`/clients/${c.id}`}>
                      <strong>{c.name}</strong>
                    </Link>
                    <div className="bo-muted">{c.slug}</div>
                  </td>
                  <td>{c.plan_label || PLAN_LABELS[c.plan] || c.plan}</td>
                  <td>
                    <span className={`bo-pill is-${c.status}`}>{STATUS_LABELS[c.status] || c.status}</span>
                  </td>
                  <td>
                    <SeatMeter used={c.entitlements?.seats?.learners?.used} max={c.entitlements?.seats?.learners?.max} />
                  </td>
                  <td>
                    <SeatMeter used={c.entitlements?.seats?.staff?.used} max={c.entitlements?.seats?.staff?.max} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
