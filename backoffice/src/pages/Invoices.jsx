import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { platform } from '../api';
import { PLAN_LABELS, STATUS_LABELS, errMessage, formatDate } from '../lib';
import { Pagination, SeatMeter, ClientTabs } from '../ui';
import { useToast } from '../toast';

/** Pipeline comercial — nu există încă modul de facturi PDF. */
export default function InvoicesPage() {
  const { push } = useToast();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });

  // Filtrul active / trial se face pe server, cu paginare (nu doar primele 100 de academii).
  const load = useCallback((page = 1) => {
    setLoading(true);
    platform
      .companies({ per_page: 50, page, status: 'active,trial' })
      .then((res) => {
        setCompanies(res?.data || []);
        setMeta({ current_page: res?.current_page || 1, last_page: res?.last_page || 1, total: res?.total || 0 });
      })
      .catch((err) => push(errMessage(err, 'Nu am putut încărca clienții.'), 'error'))
      .finally(() => setLoading(false));
  }, [push]);

  useEffect(() => {
    load(1);
  }, [load]);

  const billable = companies;

  return (
    <>
      <header className="bo-page-head">
        <div>
          <h1>Clienți</h1>
          <p>Academiile active și în trial, cu datele de contract pentru facturare.</p>
        </div>
      </header>

      <ClientTabs />

      <section className="bo-card">
        <div className="bo-card__head">
          <h2>De facturat</h2>
          <span className="bo-muted">{meta.total} academii</span>
          <Pagination page={meta.current_page} lastPage={meta.last_page} onPage={load} />
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
