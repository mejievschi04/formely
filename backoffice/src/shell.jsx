import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';

const links = [
  { to: '/', label: 'Panou', end: true },
  { to: '/clients', label: 'Clienți' },
  { to: '/leads', label: 'Cereri' },
  { to: '/plans', label: 'Planuri' },
  { to: '/pipeline', label: 'De facturat' },
];

export default function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="bo-app">
      <aside className="bo-nav">
        <div className="bo-brand">
          <img src="/logo.png" alt="" />
          <div>
            <strong>Formely</strong>
            <span>Backoffice</span>
          </div>
        </div>
        <nav>
          {links.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="bo-nav__foot">
          <span>{user?.name}</span>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Ieși
          </button>
        </div>
      </aside>
      <main className="bo-main">{children}</main>
    </div>
  );
}
