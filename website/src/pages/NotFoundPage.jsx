import { Link } from 'react-router-dom';
import Seo from '../components/Seo';

export default function NotFoundPage() {
  return (
    <>
      <Seo title="Pagină negăsită" path="/404" noindex />
      <section className="section text-center">
        <div className="container">
          <h1>404</h1>
          <p className="lead mx-auto">Pagina nu există.</p>
          <Link to="/" className="btn btn--primary" style={{ marginTop: '1.5rem' }}>
            Acasă
          </Link>
        </div>
      </section>
    </>
  );
}
