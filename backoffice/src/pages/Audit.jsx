import React, { useCallback, useEffect, useRef, useState } from 'react';
import { platform } from '../api';
import { errMessage, formatDateTime } from '../lib';
import { Pagination } from '../ui';
import { useToast } from '../toast';

const ACTION_LABELS = {
  'platform.company_created': 'Academie creată',
  'platform.company_updated': 'Academie actualizată',
  'platform.company_deleted': 'Academie ștearsă',
  'platform.owner_invited': 'Invitație owner',
  'platform.lead_status': 'Status lead',
  'platform.lead_converted': 'Lead convertit',
};

export default function AuditPage() {
  const { push } = useToast();
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [actions, setActions] = useState([]);
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  // Filtrele în ref: căutarea pornește la Enter / „Caută”, nu la fiecare tastă.
  const queryRef = useRef(query);
  const actionRef = useRef(action);
  const pageRef = useRef(page);
  queryRef.current = query;
  actionRef.current = action;
  pageRef.current = page;

  const load = useCallback(async (opts = {}) => {
    try {
      setLoading(true);
      const res = await platform.activityLogs({
        per_page: 40,
        page: opts.page ?? pageRef.current,
        q: (opts.q ?? queryRef.current) || undefined,
        action: (opts.action ?? actionRef.current) || undefined,
      });
      setLogs(res?.data || []);
      setMeta({
        current_page: res?.current_page || 1,
        last_page: res?.last_page || 1,
        total: res?.total || 0,
      });
      setActions(res?.filters?.actions || []);
    } catch (err) {
      push(errMessage(err, 'Nu am putut încărca jurnalul.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <header className="bo-page-head">
        <div>
          <h1>Jurnal platformă</h1>
          <p>Acțiuni din backoffice: academii, lead-uri, invitații.</p>
        </div>
      </header>

      <div className="bo-toolbar">
        <input
          type="search"
          placeholder="Caută descriere sau operator…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1);
              load({ q: e.currentTarget.value, page: 1 });
            }
          }}
        />
        <select
          aria-label="Filtru acțiune"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
            load({ action: e.target.value, page: 1 });
          }}
        >
          <option value="">Toate acțiunile</option>
          {actions.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
          ))}
        </select>
        <button
          type="button"
          className="bo-btn bo-btn--sm"
          onClick={() => {
            setPage(1);
            load({ page: 1 });
          }}
        >
          Caută
        </button>
      </div>

      <section className="bo-card">
        <div className="bo-card__head">
          <h2>{loading ? '…' : `${meta.total} evenimente`}</h2>
          <Pagination
            page={meta.current_page}
            lastPage={meta.last_page}
            total={meta.total}
            onPage={(p) => {
              setPage(p);
              load({ page: p });
            }}
          />
        </div>
        <div className="bo-table-wrap">
          {loading && logs.length === 0 ? (
            <p className="bo-muted">Se încarcă…</p>
          ) : logs.length === 0 ? (
            <p className="bo-muted">Niciun eveniment încă. Acțiunile din backoffice apar aici.</p>
          ) : (
            <table className="bo-table">
              <thead>
                <tr>
                  <th>Când</th>
                  <th>Acțiune</th>
                  <th>Detaliu</th>
                  <th>Operator</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="bo-muted">{formatDateTime(log.created_at)}</td>
                    <td>
                      <span className="bo-pill">{ACTION_LABELS[log.action] || log.action}</span>
                    </td>
                    <td>
                      {log.description}
                      {log.model_type && log.model_id ? (
                        <div className="bo-muted">{log.model_type} #{log.model_id}</div>
                      ) : null}
                    </td>
                    <td>
                      {log.user?.name || '—'}
                      {log.user?.email ? <div className="bo-muted">{log.user.email}</div> : null}
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
