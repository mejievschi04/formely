import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(() => {
    // Mesaj lăsat la sesiune expirată / academie inactivă; se șterge în efect (StrictMode rulează inițializatorul de două ori).
    try {
      return sessionStorage.getItem('bo_login_notice') || '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    try {
      sessionStorage.removeItem('bo_login_notice');
    } catch {
      /* ignore */
    }
  }, []);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.errors?.email?.[0] || err.message || 'Autentificare eșuată.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bo-login">
      <form className="bo-login__card" onSubmit={onSubmit}>
        <img src="/logo.png" alt="" />
        <p className="bo-kicker">Formely</p>
        <h1>Backoffice</h1>
        <p>Administrare clienți, oferte și facturi — nu LMS-ul academiilor.</p>
        <label>
          Email
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Parolă
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error ? <p className="bo-err">{error}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Se autentifică…' : 'Intră în backoffice'}
        </button>
      </form>
    </div>
  );
}
