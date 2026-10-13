import { useI18n } from '../../i18n/I18nContext';
import SectionTitle from './SectionTitle';

/** Capturi statice din academia demo (2×), vezi public/screens/README.md. */
const SHOT_BY_ID = {
  tests: { src: '/screens/learner-path.webp', width: 2720, height: 960 },
  progress: { src: '/screens/progress-report.webp', width: 2736, height: 1672 },
  courses: { src: '/screens/ai-setup.webp', width: 1800, height: 1070 },
};

export default function ProductShowcase() {
  const { t } = useI18n();
  const items = t('showcase.items');

  return (
    <section className="section" id="produs" data-analytics="showcase" aria-labelledby="showcase-title">
      <div className="container">
        <p className="eyebrow reveal">{t('showcase.eyebrow')}</p>
        <SectionTitle id="showcase-title" lines={t('showcase.lines')} />
        <p className="section-sub reveal">{t('showcase.subtitle')}</p>

        <div className="feature-rows">
          {items.map((item, i) => {
            const shot = SHOT_BY_ID[item.id];
            return (
              <article key={item.id} className={`feature-row reveal${i % 2 ? ' feature-row--flip' : ''}`}>
                <div className="feature-copy">
                  <p className="feature-kicker">{item.kicker}</p>
                  <h3>{item.title}</h3>
                  <p className="feature-pain">{item.pain}</p>
                  <p>{item.text}</p>
                </div>
                {shot && (
                  <figure className="feature-shot">
                    <a href={shot.src} target="_blank" rel="noopener noreferrer" aria-label={t('frames.openScreenshot')}>
                      <img
                        src={shot.src}
                        alt={item.caption}
                        width={shot.width}
                        height={shot.height}
                        loading="lazy"
                        decoding="async"
                      />
                    </a>
                    <figcaption>{item.caption}</figcaption>
                  </figure>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
