import React, { useCallback, useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  Inbox,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  ScrollText,
  X,
} from 'lucide-react';
import { useAuth } from './auth';
import { platform } from './api';
import { usePoll } from './usePoll';

/** Meniul pe zone: vânzări (cereri + trafic), clienți (conturi + planuri), sistem. */
const GROUPS = [
  { items: [{ to: '/', label: 'Panou', icon: LayoutDashboard, end: true }] },
  {
    title: 'Vânzări',
    items: [
      { to: '/leads', label: 'Cereri', icon: Inbox, badge: 'leads' },
      { to: '/stats', label: 'Statistici site', icon: BarChart3 },
    ],
  },
  {
    title: 'Clienți',
    items: [
      { to: '/clients', label: 'Clienți', icon: Building2, also: ['/pipeline'] },
      { to: '/plans', label: 'Planuri', icon: Layers },
    ],
  },
  { title: 'Sistem', items: [{ to: '/audit', label: 'Jurnal', icon: ScrollText }] },
];

function useNewLeads() {
  const [count, setCount] = useState(0);
  const load = useCallback(async () => {
    try {
      const data = await platform.leads({ status: 'new', per_page: 1 });
      setCount(Number(data?.counts?.new) || 0);
    } catch {
      /* badge-ul e opțional */
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  usePoll(load, 30000);
  return count;
}

export default function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const newLeads = useNewLeads();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const initials = (user?.name || 'A')
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className={`bo-app${open ? ' is-nav-open' : ''}`}>
      <header className="bo-topbar">
        <button type="button" className="bo-icon-btn" aria-label="Meniu" onClick={() => setOpen(true)}>
          <Menu size={20} />
        </button>
        <div className="bo-brand">
          <img src="/logo.png" alt="" />
          <strong>Formely</strong>
        </div>
      </header>

      <aside className="bo-nav" aria-label="Navigare">
        <div className="bo-nav__top">
          <div className="bo-brand">
            <img src="/logo.png" alt="" />
            <div>
              <strong>Formely</strong>
              <span>Backoffice</span>
            </div>
          </div>
          <button type="button" className="bo-icon-btn bo-nav__close" aria-label="Închide meniul" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav>
          {GROUPS.map((group, i) => (
            <div key={group.title || i} className="bo-nav__group">
              {group.title && <p className="bo-nav__title">{group.title}</p>}
              {group.items.map(({ to, label, icon: Icon, end, badge, also }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    isActive || also?.some((path) => pathname.startsWith(path)) ? 'active' : undefined
                  }
                >
                  <Icon size={18} strokeWidth={1.9} aria-hidden />
                  <span>{label}</span>
                  {badge === 'leads' && newLeads > 0 && <em className="bo-nav__badge">{newLeads}</em>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="bo-nav__foot">
          <span className="bo-avatar" aria-hidden>{initials}</span>
          <div className="bo-nav__user">
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
          <button
            type="button"
            className="bo-icon-btn"
            aria-label="Ieși"
            title="Ieși"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <button type="button" className="bo-scrim" aria-label="Închide meniul" tabIndex={-1} onClick={() => setOpen(false)} />

      <main className="bo-main">{children}</main>
    </div>
  );
}
