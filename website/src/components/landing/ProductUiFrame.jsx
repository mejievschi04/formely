import { useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { PRODUCT_SCREENS } from '../../data/productScreens';

function Chrome({ label }) {
  return (
    <div className="ui-frame-chrome">
      <div className="ui-dots" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="ui-url">{label}</div>
    </div>
  );
}

function Side({ active }) {
  const { t } = useI18n();
  const items = [
    ['admin', t('frames.navAdmin')],
    ['courses', t('frames.navCourses')],
    ['tests', t('frames.navTests')],
    ['stats', t('frames.navStats')],
    ['users', t('frames.navUsers')],
  ];
  return (
    <aside className="ui-side" aria-hidden>
      {items.map(([id, label]) => (
        <span key={id} className={id === active ? 'is-on' : undefined}>
          {label}
        </span>
      ))}
    </aside>
  );
}

function Shell({ active, children }) {
  const { t } = useI18n();
  return (
    <div className="ui-frame">
      <Chrome label={t('frames.browser')} />
      <div className="ui-body">
        <Side active={active} />
        <div className="ui-main">{children}</div>
      </div>
    </div>
  );
}

export function FrameDashboard() {
  const { t } = useI18n();
  return (
    <Shell active="admin">
      <div className="ui-title">{t('frames.dashboardTitle')}</div>
      <div className="ui-hint">{t('frames.dashboardHint')}</div>
      <div className="ui-metrics">
        <div className="ui-metric">
          <span>{t('frames.navCourses')}</span>
          <strong>—</strong>
        </div>
        <div className="ui-metric">
          <span>{t('frames.progress')}</span>
          <strong>—</strong>
        </div>
        <div className="ui-metric">
          <span>{t('frames.metricCompletion')}</span>
          <strong>—</strong>
        </div>
        <div className="ui-metric">
          <span>{t('frames.metricTests')}</span>
          <strong>—</strong>
        </div>
      </div>
    </Shell>
  );
}

export function FrameCourses() {
  const { t } = useI18n();
  return (
    <Shell active="courses">
      <div className="ui-title">{t('frames.courseBuilder')}</div>
      <div className="ui-stack">
        <div className="ui-row">
          {t('frames.module')} 1<span className="tag">{t('frames.publish')}</span>
        </div>
        <div className="ui-row">
          {t('frames.lesson')} A<span className="tag is-muted">{t('frames.block')}</span>
        </div>
        <div className="ui-row">
          {t('frames.lesson')} B<span className="tag is-muted">{t('frames.block')}</span>
        </div>
      </div>
    </Shell>
  );
}

export function FrameTests() {
  const { t } = useI18n();
  return (
    <Shell active="tests">
      <div className="ui-title">{t('frames.test')}</div>
      <div className="ui-stack">
        <div className="ui-row">
          {t('frames.questionBank')}
          <span className="tag">{t('frames.attempts')}</span>
        </div>
        <div className="ui-row">
          {t('frames.test')}
          <span className="tag is-muted">{t('frames.navTests')}</span>
        </div>
      </div>
    </Shell>
  );
}

export function FrameProgress() {
  const { t } = useI18n();
  return (
    <Shell active="courses">
      <div className="ui-title">{t('frames.progress')}</div>
      <div className="ui-stack">
        <div className="ui-row">
          {t('frames.lesson')} 1<span className="tag">{t('frames.unlocked')}</span>
        </div>
        <div className="ui-row">
          {t('frames.lesson')} 2<span className="tag">{t('frames.unlocked')}</span>
        </div>
        <div className="ui-row">
          {t('frames.lesson')} 3<span className="tag is-muted">{t('frames.locked')}</span>
        </div>
      </div>
      <div className="ui-bars" aria-hidden>
        <div className="ui-bar">
          <i />
        </div>
        <div className="ui-bar">
          <i />
        </div>
        <div className="ui-bar">
          <i />
        </div>
      </div>
    </Shell>
  );
}

export function FramePeople() {
  const { t } = useI18n();
  return (
    <Shell active="users">
      <div className="ui-title">{t('frames.navUsers')}</div>
      <div className="ui-pill">{t('frames.invite')}</div>
      <div className="ui-stack">
        <div className="ui-row">
          {t('frames.team')}
          <span className="tag">{t('frames.assign')}</span>
        </div>
        <div className="ui-row">
          {t('frames.department')}
          <span className="tag">{t('frames.assign')}</span>
        </div>
      </div>
    </Shell>
  );
}

export function FrameLibrary() {
  const { t } = useI18n();
  return (
    <Shell active="admin">
      <div className="ui-title">
        {t('frames.library')} · {t('frames.events')}
      </div>
      <div className="ui-stack">
        <div className="ui-row">
          {t('frames.library')}
          <span className="tag">PDF</span>
        </div>
        <div className="ui-row">
          {t('frames.events')}
          <span className="tag is-muted">Calendar</span>
        </div>
      </div>
    </Shell>
  );
}

export function FrameAnalytics() {
  const { t } = useI18n();
  return (
    <Shell active="stats">
      <div className="ui-title">{t('frames.navStats')}</div>
      <div className="ui-metrics">
        <div className="ui-metric">
          <span>{t('frames.metricProgress')}</span>
          <strong>—</strong>
        </div>
        <div className="ui-metric">
          <span>{t('frames.metricCompletion')}</span>
          <strong>—</strong>
        </div>
        <div className="ui-metric">
          <span>{t('frames.metricTests')}</span>
          <strong>—</strong>
        </div>
        <div className="ui-metric">
          <span>{t('frames.metricExport')}</span>
          <strong>CSV / XLSX</strong>
        </div>
      </div>
      <div className="ui-bars" aria-hidden>
        <div className="ui-bar">
          <i />
        </div>
        <div className="ui-bar">
          <i />
        </div>
        <div className="ui-bar">
          <i />
        </div>
      </div>
    </Shell>
  );
}

const FRAME_MAP = {
  dashboard: FrameDashboard,
  courses: FrameCourses,
  tests: FrameTests,
  progress: FrameProgress,
  people: FramePeople,
  library: FrameLibrary,
  analytics: FrameAnalytics,
};

function ProductShot({ screen, Fallback }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  if (failed) return <Fallback />;
  return (
    <div className="ui-frame ui-frame--shot">
      <Chrome label={screen.url || t('frames.browser')} />
      <div className="ui-frame-shot-wrap">
        <img
          className="ui-frame-shot"
          src={screen.src}
          alt={t(screen.altKey) || 'Formely'}
          width={1440}
          height={900}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </div>
    </div>
  );
}

export default function ProductUiFrame({ variant = 'dashboard' }) {
  const screen = PRODUCT_SCREENS[variant];
  const Fallback = FRAME_MAP[variant] || FrameDashboard;
  if (screen?.src) {
    return <ProductShot screen={screen} Fallback={Fallback} />;
  }
  return <Fallback />;
}
