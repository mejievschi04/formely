import { testimonials } from '../data/site';

export default function EditorialQuote() {
  const featured = testimonials[0];

  return (
    <section className="section quote-block" aria-labelledby="quote-heading">
      <div className="container quote-block__inner">
        <p id="quote-heading" className="label-mono">Din teren</p>
        <blockquote className="quote-block__text">
          <span aria-hidden className="quote-block__mark">"</span>
          {featured.quote}
        </blockquote>
        <footer className="quote-block__footer">
          <strong>{featured.name}</strong>
          <span>{featured.role}</span>
        </footer>
        <div className="quote-block__grid">
          {testimonials.slice(1).map((t) => (
            <figure key={t.name} className="quote-block__mini">
              <p>{t.quote}</p>
              <figcaption>
                {t.name} · <span>{t.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
