import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import Seo from '../components/Seo';
import { ArticleJsonLd } from '../components/JsonLd';
import { getBlogPost, blogPostBodies, blogPosts } from '../data/site';
import '../styles/blog.css';

export default function BlogPostPage() {
  const { slug } = useParams();
  const post = getBlogPost(slug);
  const sections = post ? blogPostBodies[post.slug] : null;
  const otherPosts = blogPosts.filter((p) => p.slug !== slug).slice(0, 2);

  useEffect(() => {
    document.body.classList.add('is-blog-page');
    return () => document.body.classList.remove('is-blog-page');
  }, []);

  if (!post || !sections) {
    return (
      <div className="page-blog">
        <section className="blg-empty">
          <div className="blg-wrap blg-wrap--narrow">
            <h1>Articol negăsit</h1>
            <p className="blg-lead">Link-ul poate fi vechi sau articolul a fost mutat.</p>
            <Link to="/blog" className="blg-back">
              ← Înapoi la resurse
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-blog">
      <Seo
        title={post.title}
        description={post.excerpt}
        path={`/blog/${post.slug}`}
        type="article"
      />
      <ArticleJsonLd post={post} />

      <article className="blg-article">
        <div className="blg-wrap blg-wrap--narrow">
          <header className="blg-article__header">
            <div className="blg-article__meta">
              <span className="blg-card__cat">{post.category}</span>
              <span>{post.readMinutes} min lectură</span>
              <span>{post.date}</span>
            </div>
            <h1>{post.title}</h1>
            <p className="blg-article__deck">{post.excerpt}</p>
          </header>

          <div className="blg-prose">
            {sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((para) => (
                  <p key={para.slice(0, 40)}>{para}</p>
                ))}
              </section>
            ))}
          </div>

          <aside className="blg-cta-inline">
            <h3>Vrei să vezi asta în platformă?</h3>
            <p>
              Programează un demo — îți arătăm module, teste și progres pe scenariul tău.
            </p>
            <Link to="/contact" className="btn btn--primary">
              Programează demo
            </Link>
          </aside>

          <footer className="blg-article__footer">
            <Link to="/blog" className="blg-back">
              ← Toate articolele
            </Link>
            {otherPosts.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                {otherPosts.map((p) => (
                  <Link key={p.slug} to={`/blog/${p.slug}`} className="blg-back">
                    {p.title.slice(0, 42)}…
                  </Link>
                ))}
              </div>
            )}
          </footer>
        </div>
      </article>
    </div>
  );
}
