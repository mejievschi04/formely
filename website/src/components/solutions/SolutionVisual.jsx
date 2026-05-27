export default function SolutionVisual({ type }) {
  switch (type) {
    case 'academy':
      return (
        <div className="sol-visual sol-visual--academy">
          <div className="sol-visual__header">
            <span>Cohortă Martie 2026</span>
            <strong>34 studenți</strong>
          </div>
          <div className="sol-visual__rows">
            <div className="sol-visual__row">
              <span>Ana M.</span>
              <div className="sol-visual__bar"><i style={{ width: '100%' }} /></div>
              <span className="is-done">Finalizat</span>
            </div>
            <div className="sol-visual__row">
              <span>Radu P.</span>
              <div className="sol-visual__bar"><i style={{ width: '72%' }} /></div>
              <span>Modul 3</span>
            </div>
            <div className="sol-visual__row">
              <span>Elena V.</span>
              <div className="sol-visual__bar"><i style={{ width: '45%' }} /></div>
              <span>Modul 2</span>
            </div>
          </div>
          <div className="sol-visual__event">
            <span>Eveniment live</span>
            <strong>Q&A Modul 2 · Joi 18:00</strong>
          </div>
        </div>
      );
    case 'corporate':
      return (
        <div className="sol-visual sol-visual--corporate">
          <div className="sol-visual__depts">
            <span className="is-active">HR</span>
            <span>Sales</span>
            <span>IT</span>
            <span>Ops</span>
          </div>
          <div className="sol-visual__compliance">
            <div className="sol-visual__compliance-head">
              <span>Training obligatoriu</span>
              <strong>91% finalizat</strong>
            </div>
            <ul>
              <li className="is-done">Cod de conduită</li>
              <li className="is-done">Securitate date</li>
              <li>Proceduri incidente</li>
            </ul>
          </div>
          <div className="sol-visual__export">
            <span>Export audit</span>
            <span>PDF · CSV</span>
          </div>
        </div>
      );
    case 'instructor':
      return (
        <div className="sol-visual sol-visual--instructor">
          <div className="sol-visual__courses">
            <div className="sol-visual__course is-active">
              <strong>Leadership pentru manageri</strong>
              <span>8 cursanți · 3 module</span>
            </div>
            <div className="sol-visual__course">
              <strong>Excel avansat</strong>
              <span>5 cursanți · draft</span>
            </div>
          </div>
          <div className="sol-visual__inbox">
            <span>Mesaj nou</span>
            <p>„Pot relua testul modulului 1?”</p>
          </div>
          <div className="sol-visual__badge">Bancă întrebări · 48 itemi</div>
        </div>
      );
    default:
      return null;
  }
}
