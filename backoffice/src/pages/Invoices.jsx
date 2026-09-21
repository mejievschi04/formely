import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { platform } from '../api';
import { PLAN_LABELS, STATUS_LABELS, errMessage, formatDate } from '../lib';
import { SeatMeter } from '../ui';
import { useToast } from '../toast';

/** Pipeline comercial — nu există încă modul de facturi PDF. */
export default function InvoicesPage() {
  const { push } = useToast();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    platform
      .companies({ per_page: 100 })
      .then((res) => setCompanies(res?.data || res || []))
      .catch((err) => push(errMessage(err, 'Nu am putut încărca clienții.'), 'error'))
      .finally(() => setLoading(false));
  }, [push]);

  const billable = useMemo(
    () => companies.filter((c) => c.status === 'active' || c.status === 'trial'),
    [companies],
  );

  return (
    <>
      <header className="bo-page-head">
        <div>
          <h1>De facturat</h1>
          <p>
            Listă operațională pe academii active / trial — baza pentru oferte.
            Documentele PDF de factură urmează într-un modul separat.
          </p>
        </div>
      </header>

      <section className="bo-card">
        <div className="bo-card__head">
          <h2>Pipeline</h2>
          <span className="bo-muted">{billable.length} academii</span>
        </div>
        <div className="bo-table-wrap">
          {loading ? (
            <p className="bo-muted">Se încarcă…</p>
          ) : billable.length === 0 ? (
            <p className="bo-muted">Niciun client activ. Activezi o academie din Clienți după contract.</p>
          ) : (
            <table className="bo-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Contract</th>
                  <th>Cursanți</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {billable.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      <div className="bo-muted">{c.slug}</div>
                    </td>
                    <td>{c.plan_label || PLAN_LABELS[c.plan] || c.plan}</td>
                    <td>
                      <span className={`bo-pill is-${c.status}`}>{STATUS_LABELS[c.status] || c.status}</span>
                    </td>
                    <td className="bo-muted">{formatDate(c.contract_ends_at)}</td>
                    <td>
                      <SeatMeter
                        used={c.entitlements?.seats?.learners?.used}
                        max={c.entitlements?.seats?.learners?.max}
                      />
                    </td>
                    <td className="bo-row-actions">
                      <Link className="bo-btn bo-btn--sm" to={`/clients/${c.id}`}>
                        Deschide
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
