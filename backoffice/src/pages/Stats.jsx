import React, { useCallback, useEffect, useState } from 'react';
import { platform } from '../api';
import { errMessage } from '../lib';
import { useToast } from '../toast';
import { usePoll } from '../usePoll';

const RANGES = [
  { days: 1, label: 'Azi' },
  { days: 7, label: '7 zile' },
  { days: 30, label: '30 zile' },
  { days: 90, label: '90 zile' },
];

const DEVICE_LABELS = { mobile: 'Mobil', desktop: 'Desktop', tablet: 'Tabletă' };

const SECTION_LABELS = {
  hero: 'Prima ecran',
  problem: 'Problema',
  'cum-functioneaza': 'Cum funcționează',
  proof: 'Dovezi',
  trust: 'Încredere',
  preturi: 'Prețuri',
  faq: 'Întrebări',
  contact: 'Contact',
  final: 'Apel final',
  produs: 'Produs',
  demo: 'Turul demo',
  onboarding: 'Onboarding',
  'onboarding-probleme': 'Onboarding · probleme',
  'onboarding-pasi': 'Onboarding · pași',
  'onboarding-rezultate': 'Onboarding · rezultate',
};

const nf = new Intl.NumberFormat('ro-RO');

function dayLabel(iso, long = false) {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString('ro-RO', long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });
}

function niceMax(value) {
  if (value <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
}

function DailyChart({ daily }) {
  const [hover, setHover] = useState(null);
  const max = niceMax(Math.max(0, ...daily.map((d) => d.visitors)));
  const labelEvery = Math.ceil(daily.length / 8);

  return (
    <div className="bo-chart">
      <div className="bo-chart__axis" aria-hidden>
        <span>{nf.format(max)}</span>
        <span>{nf.format(max / 2)}</span>
        <span>0</span>
      </div>
      <div className="bo-chart__plot" onMouseLeave={() => setHover(null)}>
        <div className="bo-chart__grid" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        {daily.map((d, i) => (
          <button
            key={d.date}
            type="button"
            className={`bo-chart__col${hover === i ? ' is-hover' : ''}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`${dayLabel(d.date, true)}: ${d.visitors} vizitatori, ${d.leads} cereri`}
          >
            <span className="bo-chart__bar" style={{ height: `${(d.visitors / max) * 100}%` }} />
            {d.leads > 0 && <span className="bo-chart__lead" style={{ bottom: `${(d.visitors / max) * 100}%` }} />}
            {i % labelEvery === 0 && <span className="bo-chart__x">{dayLabel(d.date)}</span>}
          </button>
        ))}
        {hover != null && (
          <div
            className="bo-chart__tip"
            style={{ left: `${((hover + 0.5) / daily.length) * 100}%` }}
            role="status"
          >
            <strong>{dayLabel(daily[hover].date, true)}</strong>
            <span>{nf.format(daily[hover].visitors)} vizitatori</span>
            <span>{nf.format(daily[hover].pageviews)} vizite</span>
            <span>{nf.format(daily[hover].leads)} cereri</span>
          </div>
        )}
      </div>
    </div>
  );
}

function HourChart({ hours }) {
  const [hover, setHover] = useState(null);
  const max = niceMax(Math.max(0, ...hours.map((h) => h.visitors)));

  return (
    <div className="bo-chart">
      <div className="bo-chart__axis" aria-hidden>
        <span>{nf.format(max)}</span>
        <span>{nf.format(max / 2)}</span>
        <span>0</span>
      </div>
      <div className="bo-chart__plot" onMouseLeave={() => setHover(null)}>
        <div className="bo-chart__grid" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        {hours.map((h, i) => (
          <button
            key={h.hour}
            type="button"
            className={`bo-chart__col${hover === i ? ' is-hover' : ''}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`${String(h.hour).padStart(2, '0')}:00, ${h.visitors} vizitatori`}
          >
            <span className="bo-chart__bar" style={{ height: `${(h.visitors / max) * 100}%` }} />
            {h.hour % 6 === 0 && <span className="bo-chart__x">{String(h.hour).padStart(2, '0')}</span>}
          </button>
        ))}
        {hover != null && (
          <div
            className="bo-chart__tip"
            style={{ left: `${((hover + 0.5) / hours.length) * 100}%` }}
            role="status"
          >
            <strong>{String(hours[hover].hour).padStart(2, '0')}:00</strong>
            <span>{nf.format(hours[hover].visitors)} vizitatori</span>
          </div>
        )}
      </div>
    </div>
  );
}

function RankList({ title, rows, labels, empty = 'Încă nu sunt date.', hint }) {
  const top = Math.max(1, ...rows.map((r) => r.visitors));
  return (
    <section className="bo-card">
      <div className="bo-card__head">
        <h2>{title}</h2>
        {hint && <span className="bo-muted">{hint}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="bo-muted">{empty}</p>
      ) : (
        <div className="bo-table-wrap">
          <table className="bo-table bo-stat-table">
            <thead>
              <tr>
                <th>Nume</th>
                <th className="is-num">Vizitatori</th>
                <th className="is-num">Evenimente</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td>
                    <div className="bo-stat-label">
                      <span>{labels?.[row.label] || row.label}</span>
                      <i style={{ width: `${(row.visitors / top) * 100}%` }} aria-hidden />
                    </div>
                  </td>
                  <td className="is-num">{nf.format(row.visitors)}</td>
                  <td className="is-num">{nf.format(row.events || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Breakdown({ title, rows, labels, empty = 'Încă nu sunt date.' }) {
  const top = Math.max(1, ...rows.map((r) => r.visitors));
  return (
    <section className="bo-card">
      <div className="bo-card__head">
        <h2>{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="bo-muted">{empty}</p>
      ) : (
        <div className="bo-table-wrap">
          <table className="bo-table bo-stat-table">
            <thead>
              <tr>
                <th>Nume</th>
                <th className="is-num">Vizitatori</th>
                <th className="is-num">Cereri</th>
                <th className="is-num">Conversie</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td>
                    <div className="bo-stat-label">
                      <span>{labels?.[row.label] || row.label}</span>
                      <i style={{ width: `${(row.visitors / top) * 100}%` }} aria-hidden />
                    </div>
                  </td>
                  <td className="is-num">{nf.format(row.visitors)}</td>
                  <td className="is-num">{nf.format(row.leads)}</td>
                  <td className="is-num">{row.visitors ? `${((row.leads / row.visitors) * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function StatsPage() {
  const { push } = useToast();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);

  const load = useCallback(async (showError = false) => {
    try {
      setData(await platform.siteStats(days));
    } catch (err) {
      if (showError) push(errMessage(err, 'Nu am putut încărca statisticile.'), 'error');
    }
  }, [days, push]);

  useEffect(() => {
    load(true);
  }, [load]);

  usePoll(() => load(false), 30000);

  const totals = data?.totals || {};
  const steps = [
    { id: 'visitors', label: 'Au intrat pe site' },
    { id: 'cta_clicks', label: 'Au apăsat un buton spre formular' },
    { id: 'form_starts', label: 'Au început formularul' },
    { id: 'leads', label: 'Au trimis cererea' },
  ];
  const funnelTop = Math.max(1, totals.visitors || 0);

  return (
    <>
      <header className="bo-page-head">
        <div>
          <h1>Statistici site</h1>
          <p>Vizite anonime pe formely.org, fără cookie-uri. Vizitatorii unici se numără pe zi. Secțiunile și butoanele arată unde se opresc și ce apasă.</p>
        </div>
        <div className="bo-range" role="group" aria-label="Perioadă">
          {RANGES.map((r) => (
            <button key={r.days} type="button" aria-pressed={days === r.days} onClick={() => setDays(r.days)}>
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {!data ? (
        <p className="bo-muted">Se încarcă statisticile…</p>
      ) : (
        <>
          <section className="bo-kpis">
            <article>
              <span>Vizitatori</span>
              <strong>{nf.format(totals.visitors || 0)}</strong>
              <small>{nf.format(totals.pageviews || 0)} vizite în total</small>
            </article>
            <article>
              <span>Click spre formular</span>
              <strong>{nf.format(totals.cta_clicks || 0)}</strong>
              <small>Au apăsat un buton de cerere</small>
            </article>
            <article>
              <span>Demo deschis</span>
              <strong>{nf.format(totals.demo_clicks || 0)}</strong>
              <small>Au apăsat un buton de demo</small>
            </article>
            <article>
              <span>Respingere</span>
              <strong>{totals.bounce ?? 0}%</strong>
              <small>O pagină, fără click sau formular</small>
            </article>
            <article>
              <span>Pagini / vizitator</span>
              <strong>{totals.pages_per_visitor ?? 0}</strong>
              <small>Media vizitelor pe persoană</small>
            </article>
            <article>
              <span>Formular început</span>
              <strong>{nf.format(totals.form_starts || 0)}</strong>
              <small>Au completat măcar un câmp</small>
            </article>
            <article>
              <span>Cereri</span>
              <strong>{nf.format(totals.leads || 0)}</strong>
              <small>Formulare trimise</small>
            </article>
            <article>
              <span>Conversie</span>
              <strong>{totals.conversion ?? 0}%</strong>
              <small>Cereri / vizitatori</small>
            </article>
          </section>

          {days > 1 && (
            <section className="bo-card">
              <div className="bo-card__head">
                <h2>Vizitatori pe zi</h2>
                <span className="bo-muted bo-chart__key">
                  <i aria-hidden /> zi cu cel puțin o cerere
                </span>
              </div>
              <DailyChart daily={data.daily || []} />
            </section>
          )}

          <section className="bo-card">
            <div className="bo-card__head">
              <h2>Ora din zi</h2>
              <span className="bo-muted">Vizitatori unici, ora serverului</span>
            </div>
            <HourChart hours={data.hours || []} />
          </section>

          <section className="bo-card">
            <div className="bo-card__head">
              <h2>Unde pierdem vizitatorii</h2>
            </div>
            <div className="bo-stat-funnel">
              {steps.map((step, i) => {
                const value = totals[step.id] || 0;
                const prev = i === 0 ? null : totals[steps[i - 1].id] || 0;
                return (
                  <div key={step.id} className="bo-stat-funnel__row">
                    <span>{step.label}</span>
                    <div className="bo-stat-funnel__track" aria-hidden>
                      <i style={{ width: `${(value / funnelTop) * 100}%` }} />
                    </div>
                    <strong>{nf.format(value)}</strong>
                    <small>{prev == null ? '' : prev ? `${Math.round((value / prev) * 100)}% din pasul anterior` : '—'}</small>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="bo-split">
            <Breakdown title="Surse" rows={data.sources || []} />
            <Breakdown title="Medii" rows={data.mediums || []} empty="Nicio vizită cu utm_medium încă." />
          </div>
          <div className="bo-split">
            <Breakdown title="Campanii" rows={data.campaigns || []} empty="Nicio vizită cu utm_campaign încă." />
            <Breakdown title="Dispozitive" rows={data.devices || []} labels={DEVICE_LABELS} />
          </div>
          <div className="bo-split">
            <Breakdown title="Limbi" rows={data.languages || []} />
            <Breakdown title="Pagini" rows={data.pages || []} />
          </div>
          <div className="bo-split">
            <RankList
              title="Până unde ajung"
              rows={data.sections || []}
              labels={SECTION_LABELS}
              hint="În ordinea paginii"
              empty="Încă nu s-a înregistrat nicio secțiune văzută."
            />
            <RankList
              title="Butoane spre formular"
              rows={data.ctas || []}
              empty="Niciun click spre formular încă."
            />
          </div>
          <RankList
            title="Butoane de demo"
            rows={data.demos || []}
            empty="Niciun click pe demo încă."
          />
        </>
      )}
    </>
  );
}
