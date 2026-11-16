import { useLayoutEffect, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from './Auth.jsx';
import Icon from './Icons.jsx';
import UserMenu from './UserMenu.jsx';

const tabs = [
  ['/dashboard', 'Dashboard', 'viewer'],
  ['/records', 'Registros', 'viewer'],
  ['/reports', 'Relatórios', 'viewer'],
  ['/import', 'Importar Excel', 'operator'],
  ['/fields', 'Campos e KPIs', 'admin'],
  ['/admin', 'Plantas e áreas', 'admin'],
  ['/settings', 'Configurações', 'admin'],
  ['/users', 'Usuários', 'admin'],
  ['/companies', 'Empresas & Contas', 'globaladmin'],
  ['/backup', 'Backup', 'admin'],
];

// Moldura das telas de gestão: barra superior + abas (só as que o perfil pode abrir).
export default function Shell({ title, actions, children }) {
  const { user, can } = useAuth();
  const location = useLocation();
  const navRef = useRef(null);

  // Preserva e sincroniza o scroll horizontal das abas no menu em dispositivos touchable / mobile
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const saved = sessionStorage.getItem('shell_tabs_scroll_left');
    if (saved !== null) {
      nav.scrollLeft = Number(saved);
    }

    // Se a aba ativa estiver fora da área visível, ajusta suavemente mantendo-a visível
    const activeTab = nav.querySelector('.tab.active');
    if (activeTab) {
      const tabRect = activeTab.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      if (tabRect.left < navRect.left || tabRect.right > navRect.right) {
        activeTab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
        sessionStorage.setItem('shell_tabs_scroll_left', String(nav.scrollLeft));
      }
    }
  }, [location.pathname]);

  const handleNavScroll = (e) => {
    sessionStorage.setItem('shell_tabs_scroll_left', String(e.currentTarget.scrollLeft));
  };

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="btn icon" to="/" aria-label="Voltar ao mapa"><Icon name="back" /></Link>
        <h1>{title}</h1>
        <div className="spacer" />
        {user?.company_name ? (
          <span className="badge off hide-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 13, background: 'rgba(255,255,255,0.06)', borderRadius: 20 }}>
            🏢 {user.company_name}
          </span>
        ) : user?.role === 'globaladmin' ? (
          <Link to="/companies" className="badge off hide-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 13, background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', borderRadius: 20, textDecoration: 'none' }}>
            👑 Global Admin
          </Link>
        ) : null}
        {actions && <div className="topbar-actions">{actions}</div>}
        <Link className="btn hide-sm" to="/">Ver mapa</Link>
        <UserMenu />
      </header>
      <nav className="tabs" aria-label="Seções" ref={navRef} onScroll={handleNavScroll}>
        {tabs.filter(([, , min]) => can(min)).map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>{label}</NavLink>
        ))}
      </nav>
      <div className="shell-body">{children}</div>
    </div>
  );
}
