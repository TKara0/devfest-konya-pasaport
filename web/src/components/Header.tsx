import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import type { Me } from '../types';

export type View = 'pasaport' | 'oturumlar' | 'siralama' | 'gorevli' | 'yonetim';

const TABS: { id: View; label: string; icon: string; role?: 'staff' | 'admin' }[] = [
  { id: 'pasaport', label: 'Pasaport', icon: 'passport' },
  { id: 'oturumlar', label: 'Oturumlar', icon: 'hall' },
  { id: 'siralama', label: 'Sıralama', icon: 'trophy' },
  { id: 'gorevli', label: 'Görevli', icon: 'key', role: 'staff' },
  { id: 'yonetim', label: 'Yönetim', icon: 'chart', role: 'admin' },
];

export function allowedViews(me: Me | null): View[] {
  return TABS.filter((t) => !t.role || me?.role === 'admin' || (t.role === 'staff' && me?.role === 'staff')).map((t) => t.id);
}

interface Props {
  me: Me | null;
  view?: View;
  onNav?: (v: View) => void;
  onLogout?: () => void;
  /** Giriş yapmamış ziyaretçi için üstteki Giriş yap / Kayıt ol düğmeleri */
  onAuth?: (tab: 'giris' | 'kayit') => void;
  /** Google ile girmiş ama henüz kaydı olmayan kullanıcı */
  pendingEmail?: string | null;
}

export function Header({ me, view, onNav, onLogout, onAuth, pendingEmail }: Props) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const allowed = allowedViews(me);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);

  const initials = me ? `${me.firstName[0] ?? ''}${me.lastName[0] ?? ''}`.toLocaleUpperCase('tr-TR') : '';

  return (
    <header className="top">
      <div className="top-in">
        <div className="mark">
          Devfest<span>Konya</span>
          <em>’26</em>
          <small>Pasaport{import.meta.env.VITE_DEMO === 'true' && <span className="demo-badge">Demo</span>}</small>
        </div>

        {me && onNav && (
          <nav className="nav" aria-label="Bölümler">
            {TABS.filter((t) => allowed.includes(t.id)).map((t) => (
              <button key={t.id} type="button" aria-current={view === t.id ? 'page' : undefined} onClick={() => onNav(t.id)}>
                <Icon name={t.icon} />
                {t.label}
              </button>
            ))}
          </nav>
        )}

        {me && (
          <div className="me" ref={menuRef}>
            <div className="ticket-pill" title="Çekiliş hakkın">
              <Icon name="ticket" />
              <span>{me.tickets}</span>
            </div>
            <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              {initials}
            </button>
            {menu && (
              <div className="menu" role="menu">
                <div className="menu-who">
                  <b>
                    {me.firstName} {me.lastName}
                  </b>
                  <span>{me.email}</span>
                </div>
                <button type="button" role="menuitem" onClick={onLogout}>
                  <Icon name="logout" />
                  Çıkış yap
                </button>
              </div>
            )}
            <button type="button" className="logout-btn" onClick={onLogout} title="Çıkış yap">
              <Icon name="logout" />
              <span>Çıkış yap</span>
            </button>
          </div>
        )}

        {!me && pendingEmail && (
          <div className="me">
            <span className="pending-mail">{pendingEmail}</span>
            <button type="button" className="logout-btn" onClick={onLogout} title="Çıkış yap">
              <Icon name="logout" />
              <span>Çıkış yap</span>
            </button>
          </div>
        )}

        {!me && !pendingEmail && onAuth && (
          <div className="me auth-links">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAuth('giris')}>
              Giriş yap
            </button>
            <button type="button" className="btn btn-red btn-sm" onClick={() => onAuth('kayit')}>
              Kayıt ol
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
