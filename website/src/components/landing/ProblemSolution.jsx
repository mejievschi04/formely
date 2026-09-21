import { useI18n } from '../../i18n/I18nContext';

export default function ProblemSolution() {
  const { t } = useI18n();
  const items = t('problem.items');

  return (
    <section className="section" aria-labelledby="problem-title">
      <div className="container">
        <h2 id="problem-title" className="section-title reveal">
          {t('problem.title')}
        </h2>
        <div className="problem-grid">
          {items.map((item) => (
            <article key={item.title} className="problem-card reveal">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
        <p className="problem-solution reveal">{t('problem.solution')}</p>
      </div>
    </section>
  );
}
