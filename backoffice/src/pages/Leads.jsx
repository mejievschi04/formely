import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { platform } from '../api';
import { LEAD_STATUS, PLAN_LABELS, errMessage, leadReason, leadSource } from '../lib';
import { useToast } from '../toast';
import { usePoll } from '../usePoll';

export default function LeadsPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const statusRef = useRef(status);
  const queryRef = useRef(query);
  statusRef.current = status;
  queryRef.current = query;

  const load = useCallback(async (filters = {}, opts = {}) => {
    const silent = opts.silent === true;
    try {
      if (!silent) setLoading(true);
      const res = await platform.leads({
        per_page: 100,
        status: (filters.status ?? statusRef.current) || undefined,
        q: (filters.q ?? queryRef.current) || undefined,
      });
      setLeads(res?.data || []);
    } catch (err) {
      if (!silent) push(errMessage(err, 'Nu am putut încărca cererile.'), 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  usePoll(() => load({}, { silent: true }), 8000);

  const counts = useMemo(() => {
    const all = { all: leads.length };
    Object.keys(LEAD_STATUS).forEach((key) => {
      all[key] = leads.filter((l) => l.status === key).length;
    });
    return all;
  }, [leads]);

  const setLeadStatus = async (lead, next) => {
    try {
      await platform.updateLead(lead.id, { status: next });
      push('Status actualizat.', 'success');
      await load();
    } catch (err) {
      push(errMessage(err, 'Actualizarea a eșuat.'), 'error');
    }
  };

  const convert = (lead) => {
    navigate(`/clients?new=1&lead=${lead.id}`);
  };

  return (
    <>
      <header className="bo-page-head">
        <div>
          <h1>Cereri de acces</h1>
          <p>Formularul de pe site (Cere acces) ajunge aici. Califici, apoi convertești într-un client.</p>
        </div>
      </header>

      <div className="bo-toolbar">
        <input
          type="search"
          placeholder="Caută nume, email, organizație…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') load({ q: e.currentTarget.value });
          }}
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            load({ status: e.target.value });
          }}
        >
          <option value="">Toate</option>
          {Object.entries(LEAD_STATUS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button type="button" className="bo-btn bo-btn--sm" onClick={() => load()}>
          Caută
        </button>
      </div>

      <section className="bo-card">
        <div className="bo-card__head">
          <h2>{loading ? '…' : `${leads.length} cereri`}</h2>
          {!status && (
            <span className="bo-muted">
              {counts.new || 0} noi · {counts.contacted || 0} contactate · {counts.qualified || 0} calificate
            </span>
          )}
        </div>
        {loading && leads.length === 0 ? (
          <p className="bo-muted">Se încarcă…</p>
        ) : leads.length === 0 ? (
          <p className="bo-muted">Nicio cerere pe filtrul curent. Trimite una de pe site — http://localhost:4321</p>
        ) : (
          <table className="bo-table">
            <thead>
              <tr>
                <th>Organizație</th>
                <th>Contact</th>
                <th>Plan</th>
                <th>Sursă</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <strong>{lead.company_name || lead.name}</strong>
                    <div className="bo-muted">{lead.message || leadReason(lead) || '—'}</div>
                  </td>
                  <td>
                    {lead.name}
                    <div className="bo-muted">{lead.email}</div>
                  </td>
                  <td>{PLAN_LABELS[lead.plan_interest] || lead.plan_interest || '—'}</td>
                  <td>
                    <span className="bo-pill">{leadSource(lead)}</span>
                  </td>
                  <td>
                    <select value={lead.status} onChange={(e) => setLeadStatus(lead, e.target.value)}>
                      {Object.entries(LEAD_STATUS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="bo-row-actions">
                    {lead.status !== 'won' && lead.status !== 'lost' && (
                      <button type="button" className="bo-btn bo-btn--sm" onClick={() => convert(lead)}>
                        Convertește
                      </button>
                    )}
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
