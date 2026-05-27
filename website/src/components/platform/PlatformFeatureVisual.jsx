/** Mini-ilustrații CSS per modul — doar decorative */
export default function PlatformFeatureVisual({ type }) {
  switch (type) {
    case 'builder':
      return (
        <div className="plat-visual plat-visual--builder">
          <div className="plat-visual__panel plat-visual__panel--side">
            <span className="is-active">Modul 1</span>
            <span>Modul 2</span>
            <span>Modul 3</span>
          </div>
          <div className="plat-visual__panel plat-visual__panel--main">
            <span className="plat-visual__label">Lecție 3 · Conținut</span>
            <div className="plat-visual__block plat-visual__block--video">Video</div>
            <div className="plat-visual__block">Text explicativ</div>
            <div className="plat-visual__block plat-visual__block--file">PDF atașat</div>
          </div>
        </div>
      );
    case 'quiz':
      return (
        <div className="plat-visual plat-visual--quiz">
          <span className="plat-visual__label">Întrebare 4 / 10</span>
          <p className="plat-visual__q">Care acțiune urmează după raportare?</p>
          <div className="plat-visual__opt is-selected">Notificare manager</div>
          <div className="plat-visual__opt">Ignorare</div>
          <div className="plat-visual__opt">Amânare 7 zile</div>
          <span className="plat-visual__badge">Răspunsul tău — corect</span>
        </div>
      );
    case 'progress':
      return (
        <div className="plat-visual plat-visual--progress">
          <div className="plat-visual__map">
            <div className="plat-visual__node is-done">1</div>
            <div className="plat-visual__line is-done" />
            <div className="plat-visual__node is-done">2</div>
            <div className="plat-visual__line is-active" />
            <div className="plat-visual__node is-active">3</div>
            <div className="plat-visual__line" />
            <div className="plat-visual__node">4</div>
          </div>
          <div className="plat-visual__stat">
            <span>Progres curs</span>
            <strong>72%</strong>
          </div>
          <span className="plat-visual__cert">Certificat · la finalizare</span>
        </div>
      );
    case 'teams':
      return (
        <div className="plat-visual plat-visual--teams">
          <div className="plat-visual__team">
            <span className="plat-visual__avatars">MK AN EL +5</span>
            <span>Echipa Sales · 12 cursanți</span>
          </div>
          <div className="plat-visual__event">
            <span className="plat-visual__label">Eveniment</span>
            <strong>Sesiune Q&A · 14 iun</strong>
            <span>8 confirmați</span>
          </div>
          <div className="plat-visual__msg">
            <span>Instructor</span>
            <p>Reminder: testul modulului 2 până vineri.</p>
          </div>
        </div>
      );
    case 'library':
      return (
        <div className="plat-visual plat-visual--library">
          <div className="plat-visual__doc">
            <span className="plat-visual__doc-icon">PDF</span>
            <div>
              <strong>Proceduri HR 2026</strong>
              <span>12 pagini · acces curs</span>
            </div>
          </div>
          <div className="plat-visual__doc">
            <span className="plat-visual__doc-icon">PDF</span>
            <div>
              <strong>Ghid onboarding</strong>
              <span>8 pagini · acces curs</span>
            </div>
          </div>
          <div className="plat-visual__reader">Cititor integrat</div>
        </div>
      );
    case 'ai':
      return (
        <div className="plat-visual plat-visual--ai">
          <div className="plat-visual__chat plat-visual__chat--user">
            <p>Unde găsesc pașii pentru raportare incident?</p>
          </div>
          <div className="plat-visual__chat plat-visual__chat--ai">
            <p>
              Conform Modulului 2, Lecția 4: notificarea managerului în aceeași zi lucrătoare.
            </p>
            <span>Sursă: curs publicat</span>
          </div>
        </div>
      );
    default:
      return null;
  }
}
