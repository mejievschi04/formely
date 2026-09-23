import { useI18n } from '../../i18n/I18nContext';

const VARIANTS = ['create', 'assign', 'track'];

function CreateScheme({ s }) {
  const modules = [
    { name: `${s.module} 1`, lessons: [s.lesson, s.lesson] },
    { name: `${s.module} 2`, lessons: [s.lesson] },
  ];

  return (
    <div className="how-scheme how-scheme-create">
      <p className="scheme-course">{s.course}</p>
      {modules.map((mod) => (
        <div key={mod.name} className="scheme-module">
          <strong>{mod.name}</strong>
          {mod.lessons.map((lesson, index) => (
            <span key={`${mod.name}-${index}`} className="scheme-lesson">
              {lesson}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function AssignScheme({ s }) {
  return (
    <div className="how-scheme how-scheme-assign">
      <p className="scheme-kicker">{s.learners}</p>
      {s.people.map((name) => (
        <div key={name} className="scheme-assign-row">
          <span className="scheme-chip">{name}</span>
          <span className="scheme-arrow" aria-hidden>
            →
          </span>
          <span className="scheme-chip scheme-access">
            {s.course}
            <em>{s.access}</em>
          </span>
        </div>
      ))}
    </div>
  );
}

function TrackScheme({ s }) {
  const rows = [
    { name: s.people[0], value: 80 },
    { name: s.people[1], value: 45 },
    { name: s.people[2], value: 100 },
  ];

  return (
    <div className="how-scheme how-scheme-track">
      <p className="scheme-kicker">{s.progress}</p>
      {rows.map((row) => (
        <div key={row.name} className="scheme-track-row">
          <span className="scheme-track-name">{row.name}</span>
          <span className="scheme-track-bar" aria-hidden>
            <i style={{ width: `${row.value}%` }} />
          </span>
          <span className="scheme-track-value">{row.value}%</span>
        </div>
      ))}
    </div>
  );
}

const SCHEMES = {
  create: CreateScheme,
  assign: AssignScheme,
  track: TrackScheme,
};

export default function HowScheme({ step = 0 }) {
  const { t } = useI18n();
  const scheme = t('how.scheme');
  const variant = VARIANTS[step] || 'create';
  const View = SCHEMES[variant];

  if (!scheme || typeof scheme !== 'object') return null;

  return (
    <div className="how-scheme-wrap" aria-hidden>
      <View s={scheme} />
    </div>
  );
}
