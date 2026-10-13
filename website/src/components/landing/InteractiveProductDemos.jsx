import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';

/**
 * Marketing demo 1:1 with frontend AdminAiOnboardingPage markup/CSS hierarchy.
 * Light product surface inside a browser chrome (matches real LMS UI).
 */

function DemoChrome({ url, children }) {
  return (
    <div className="prod-demo prod-demo--lms">
      <div className="prod-demo-chrome" aria-hidden>
        <span className="prod-demo-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="prod-demo-url">{url}</span>
      </div>
      <div className="prod-demo-lms-shell">{children}</div>
    </div>
  );
}

/** Interactive guided AI setup — same steps/structure as AdminAiOnboardingPage */
export function FrameAiSetup({ resetKey = 0 }) {
  const { t } = useI18n();
  const d = t('frames.demo');
  const steps = d?.setupSteps || [];
  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState(d?.sampleTopic || '');
  const [audience, setAudience] = useState(d?.sampleAudience || '');
  const [docs, setDocs] = useState(() => d?.sampleDocs || []);
  const [pastedText, setPastedText] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [testTitle, setTestTitle] = useState('');

  useEffect(() => {
    setStep(0);
    setTopic(d?.sampleTopic || '');
    setAudience(d?.sampleAudience || '');
    setDocs(d?.sampleDocs || []);
    setPastedText('');
    setBusy(false);
    setStatus('');
    setCourseTitle('');
    setTestTitle('');
  }, [resetKey, d?.sampleTopic, d?.sampleAudience]);

  const runBusy = (next, message, after) => {
    setBusy(true);
    setStatus(message || d?.generating || '');
    window.setTimeout(() => {
      setBusy(false);
      setStatus('');
      if (after) after();
      setStep(next);
    }, 750);
  };

  const removeDoc = (name) => setDocs((prev) => prev.filter((n) => n !== name));

  const addSampleDoc = () => {
    const choices = d?.docChoices || [];
    const next = choices.find((name) => !docs.includes(name));
    if (next) setDocs((prev) => [...prev, next]);
  };

  return (
    <DemoChrome url="academy.formely.org/admin/ai-setup">
      <div className="ai-setup-page ai-setup-page--demo">
        <header className="ai-setup-header">
          <div>
            <p className="ai-setup-eyebrow">{d?.eyebrow} · {d?.setupBadge}</p>
            <h1>{d?.setupTitle}</h1>
            <p className="ai-setup-sub">{d?.setupSub}</p>
            <p className="ai-setup-quota">{d?.quotaHint}</p>
          </div>
          <span className="lms-btn-secondary ai-setup-demo-panel-btn">{d?.panelLabel}</span>
        </header>

        <ol className="ai-setup-steps">
          {steps.map((label, i) => (
            <li
              key={label}
              className={i === step ? 'is-active' : i < step ? 'is-done' : undefined}
            >
              <span>{String(i + 1).padStart(2, '0')}</span>
              {label}
            </li>
          ))}
        </ol>

        {status ? (
          <p className="ai-setup-status" role="status">
            {status}
          </p>
        ) : null}

        {step === 0 && (
          <section className="ai-setup-card">
            <h2>{d?.materialsTitle}</h2>
            <p>{d?.materialsText}</p>
            <label className="ai-setup-field">
              <span>{d?.topicLabel}</span>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} />
            </label>
            <label className="ai-setup-field">
              <span>{d?.audienceLabel}</span>
              <input value={audience} onChange={(e) => setAudience(e.target.value)} />
            </label>
            <label className="ai-setup-field">
              <span>{d?.docsLabel}</span>
              <button type="button" className="lms-btn-secondary ai-setup-file-btn" onClick={addSampleDoc}>
                {d?.addDoc}
              </button>
            </label>
            {docs.length > 0 && (
              <ul className="ai-setup-docs">
                {docs.map((name) => (
                  <li key={name}>
                    <strong>{name}</strong>
                    <span className="ai-setup-doc-meta">
                      {d?.docChars}
                      <button type="button" className="ai-setup-doc-remove" onClick={() => removeDoc(name)}>
                        {d?.removeDoc}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <label className="ai-setup-field">
              <span>{d?.pasteLabel}</span>
              <textarea
                rows={4}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={d?.pastePlaceholder}
              />
            </label>
            <button
              type="button"
              className="lms-btn-primary"
              disabled={busy || !topic.trim() || (docs.length === 0 && !pastedText.trim())}
              onClick={() => runBusy(1, d?.generatingCourse)}
            >
              {d?.continueCourse}
            </button>
          </section>
        )}

        {step === 1 && (
          <section className="ai-setup-card">
            <h2>{d?.courseTitle}</h2>
            <p>
              {docs.length} {d?.docsUsed}
              {pastedText.trim() ? ` ${d?.plusPaste}` : ''} · {topic}
            </p>
            <div className="ai-setup-actions">
              <button type="button" className="lms-btn-secondary" disabled={busy} onClick={() => setStep(0)}>
                {d?.back}
              </button>
              <button
                type="button"
                className="lms-btn-primary"
                disabled={busy}
                onClick={() =>
                  runBusy(2, d?.generatingCourse, () => setCourseTitle(topic || d?.sampleTopic))
                }
              >
                {busy ? d?.generating : d?.generateCourse}
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="ai-setup-card">
            <h2>{d?.testTitle}</h2>
            <p>
              {d?.testTextPrefix} <strong>{courseTitle || topic}</strong>. {d?.testText}
            </p>
            <div className="ai-setup-actions">
              <button type="button" className="lms-btn-secondary" disabled={busy} onClick={() => setStep(1)}>
                {d?.back}
              </button>
              <button type="button" className="lms-btn-secondary" disabled={busy} onClick={() => setStep(3)}>
                {d?.skipTest}
              </button>
              <button
                type="button"
                className="lms-btn-primary"
                disabled={busy}
                onClick={() =>
                  runBusy(3, d?.generatingTest, () => setTestTitle(d?.sampleTestTitle || 'Test onboarding'))
                }
              >
                {busy ? d?.generating : d?.generateTest}
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="ai-setup-card">
            <h2>{d?.inviteTitle}</h2>
            <p>
              {d?.inviteReady}
              {courseTitle ? ` „${courseTitle}”` : ''}
              {testTitle ? ` + ${d?.testWord} „${testTitle}”` : ` ${d?.inviteNoTest}`}. {d?.inviteText}
            </p>
            <div className="ai-setup-actions">
              <button type="button" className="lms-btn-secondary" onClick={() => setStep(0)}>
                {d?.restart}
              </button>
              <a className="lms-btn-primary" href="/#contact">
                {d?.ctaActivate}
              </a>
            </div>
          </section>
        )}
      </div>
    </DemoChrome>
  );
}

/** Fallback interactive frames — keep for ProductUiFrame map if used elsewhere */
export function FrameCourseInteractive({ resetKey = 0 }) {
  return <FrameAiSetup resetKey={resetKey} />;
}

export function FrameTestInteractive({ resetKey = 0 }) {
  return <FrameAiSetup resetKey={resetKey} />;
}

export function FrameInviteInteractive({ resetKey = 0 }) {
  return <FrameAiSetup resetKey={resetKey} />;
}

export function FrameProgressInteractive({ resetKey = 0 }) {
  return <FrameAiSetup resetKey={resetKey} />;
}
