/** Mock UI al platformei — doar vizual, fără date reale */
export default function HomeHeroMock() {
  return (
    <div className="home-mock" aria-hidden="true">
      <div className="home-mock__shell">
        <header className="home-mock__bar">
          <div className="home-mock__dots">
            <span /><span /><span />
          </div>
          <span className="home-mock__course">Onboarding HR · Modul 2</span>
          <span className="home-mock__pill">În curs</span>
        </header>

        <div className="home-mock__body">
          <aside className="home-mock__nav">
            <div className="home-mock__nav-item is-done">1 · Bun venit</div>
            <div className="home-mock__nav-item is-active">2 · Proceduri</div>
            <div className="home-mock__nav-item">3 · Test</div>
            <div className="home-mock__nav-item is-locked">4 · Certificat</div>
          </aside>

          <div className="home-mock__content">
            <div className="home-mock__progress">
              <div className="home-mock__progress-label">
                <span>Progres modul</span>
                <strong>68%</strong>
              </div>
              <div className="home-mock__progress-track">
                <div className="home-mock__progress-fill" style={{ width: '68%' }} />
              </div>
            </div>

            <div className="home-mock__lesson">
              <span className="home-mock__tag">Lecție video</span>
              <div className="home-mock__video">
                <span className="home-mock__play" />
              </div>
            </div>

            <div className="home-mock__quiz">
              <div className="home-mock__quiz-head">
                <span>Test rapid</span>
                <span className="home-mock__quiz-score">3/3</span>
              </div>
              <p className="home-mock__question">Care este primul pas la raportarea incidentelor?</p>
              <div className="home-mock__option is-correct">Notificare imediată către manager</div>
              <div className="home-mock__option">Așteptare 48h</div>
              <p className="home-mock__feedback">Răspunsul tău — corect</p>
            </div>
          </div>
        </div>
      </div>

      <div className="home-mock__float home-mock__float--stats">
        <span className="home-mock__float-label">Echipa Marketing</span>
        <strong>24/28</strong>
        <span className="home-mock__float-sub">finalizat</span>
      </div>
    </div>
  );
}
