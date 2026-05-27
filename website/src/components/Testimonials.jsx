import { testimonials } from '../data/site';

export default function Testimonials() {
  return (
    <section className="section" aria-labelledby="testimonials-heading">
      <div className="container">
        <header className="section-header section-header--center">
          <p className="eyebrow">Ce spun utilizatorii</p>
          <h2 id="testimonials-heading">Rezultate care se simt în munca de zi cu zi</h2>
        </header>
        <div className="testimonials">
          {testimonials.map((t) => (
            <blockquote key={t.name} className="testimonial-card">
              <p className="testimonial-card__quote">„{t.quote}"</p>
              <footer>
                <strong>{t.name}</strong>
                <span>{t.role}</span>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
