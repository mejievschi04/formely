import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { platform } from '../api';
import { PLAN_LABELS, STATUS_LABELS, errMessage } from '../lib';
import { SeatMeter } from '../ui';
import { useToast } from '../toast';

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
          <h1>Facturi</h1>
          <p>Facturarea se leagă de clienți, nu de LMS. Modulul de documente urmează.</p>
        </div>
      </header>

      <section className="bo-card">
        <div className="bo-card__head">
          <h2>De facturat</h2>
          <span className="bo-muted">{billable.length} academii active sau în trial</span>
        </div>
        <p className="bo-muted" style={{ marginTop: 0 }}>
          Încă nu există facturi generate. Până atunci vezi planul și locurile fiecărui client — baza pentru oferte.
        </p>
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
                  <td>
                    <SeatMeter
                      used={c.entitlements?.seats?.learners?.used}
                      max={c.entitlements?.seats?.learners?.max}
                    />
                  </td>
                  <td className="bo-row-actions">
                    <Link className="bo-btn bo-btn--sm" to={`/clients?q=${encodeURIComponent(c.slug || c.name)}`}>
                      Deschide
                    </Link>
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
