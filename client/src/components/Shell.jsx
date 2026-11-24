import { useLayoutEffect, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from './Auth.jsx';
import { useTranslation } from '../i18n/I18nContext.jsx';
import Icon from './Icons.jsx';
import UserMenu from './UserMenu.jsx';
import LanguageSelector from './LanguageSelector.jsx';

const tabs = [
  ['/dashboard', 'nav.dashboard', 'Dashboard', 'viewer'],
  ['/records', 'nav.records', 'Registros', 'viewer'],
  ['/reports', 'nav.reports', 'Relatórios', 'viewer'],
  ['/import', 'nav.import_excel', 'Importar Excel', 'operator'],
  ['/fields', 'nav.fields_kpis', 'Campos e KPIs', 'admin'],
  ['/admin', 'nav.plants_areas', 'Plantas e áreas', 'admin'],
  ['/settings', 'nav.settings', 'Configurações', 'admin'],
  ['/users', 'nav.users', 'Usuários', 'admin'],
  ['/companies', 'nav.companies', 'Empresas & Contas', 'globaladmin'],
  ['/backup', 'nav.backup', 'Backup', 'admin'],
];

// Moldura das telas de gestão: barra superior + abas (só as que o perfil pode abrir).
export default function Shell({ title, actions, children }) {
  const { user, can } = useAuth();
  const { t } = useTranslation();
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
        <Link className="btn icon" to="/" aria-label={t('nav.back_to_map', 'Voltar ao mapa')} title={t('nav.back_to_map', 'Voltar ao mapa')}><Icon name="back" /></Link>
        <h1>{title}</h1>
        <div className="spacer" />
        {user?.role === 'globaladmin' ? (
          <div className="hide-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Link to="/companies" className="badge off" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 13, background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 20, textDecoration: 'none' }}>
              👑 Global Admin
            </Link>
            <Link to="/companies" className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 13, background: 'rgba(245, 158, 11, 0.16)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: 20, textDecoration: 'none', fontWeight: 600 }} title="Ambiente ativo - Clique para alternar de empresa">
              🏢 Ambiente: {user.active_company_name || user.company_name || 'Geral'}
            </Link>
          </div>
        ) : user?.company_name ? (
          <span className="badge off hide-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 13, background: 'rgba(255,255,255,0.06)', borderRadius: 20 }}>
            🏢 {user.company_name}
          </span>
        ) : null}
        {actions && <div className="topbar-actions">{actions}</div>}
        <Link className="btn hide-sm" to="/">{t('nav.map', 'Ver mapa')}</Link>
        <LanguageSelector />
        <UserMenu />
      </header>
      <nav className="tabs" aria-label="Seções" ref={navRef} onScroll={handleNavScroll}>
        {tabs.filter(([, , , min]) => can(min)).map(([to, key, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>{t(key, label)}</NavLink>
        ))}
      </nav>
      <div className="shell-body">{children}</div>
    </div>
  );
}
