import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import { blogMeta, blogPosts } from '../data/site';
import '../styles/blog.css';

export default function BlogIndexPage() {
  const [featured, ...rest] = blogPosts;

  useEffect(() => {
    document.body.classList.add('is-blog-page');
    return () => document.body.classList.remove('is-blog-page');
  }, []);

  return (
    <div className="page-blog">
      <Seo
        title="Resurse & blog Formely"
        description="Strategii de formare online, structură modulară și bune practici pentru LMS."
        path="/blog"
      />

      <section className="blg-hero">
        <div className="blg-wrap">
          <p className="blg-kicker">Resurse</p>
          <h1>{blogMeta.title}</h1>
          <p className="blg-lead">{blogMeta.lead}</p>
        </div>
      </section>

      <section className="blg-main">
        <div className="blg-wrap">
          <div className="blg-grid">
            {featured && (
              <Link
                to={`/blog/${featured.slug}`}
                className="blg-card blg-card--featured"
              >
                <div className="blg-card__body">
                  <div className="blg-card__meta">
                    <span className="blg-card__cat">{featured.category}</span>
                    <span>{featured.readMinutes} min</span>
                    <span>{featured.date}</span>
                  </div>
                  <h2>{featured.title}</h2>
                  <p className="blg-card__excerpt">{featured.excerpt}</p>
                  <span className="blg-card__link">Citește articolul →</span>
                </div>
              </Link>
            )}

            {rest.map((post) => (
              <Link key={post.slug} to={`/blog/${post.slug}`} className="blg-card">
                <div className="blg-card__meta">
                  <span className="blg-card__cat">{post.category}</span>
                  <span>{post.readMinutes} min</span>
                  <span>{post.date}</span>
                </div>
                <h2>{post.title}</h2>
                <p className="blg-card__excerpt">{post.excerpt}</p>
                <span className="blg-card__link">Citește →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
