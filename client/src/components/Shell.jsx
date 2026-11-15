import { Link, NavLink } from 'react-router-dom';
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
  ['/backup', 'Backup', 'admin'],
];

// Moldura das telas de gestão: barra superior + abas (só as que o perfil pode abrir).
export default function Shell({ title, actions, children }) {
  const { can } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="btn icon" to="/" aria-label="Voltar ao mapa"><Icon name="back" /></Link>
        <h1>{title}</h1>
        <div className="spacer" />
        {actions}
        <Link className="btn hide-sm" to="/">Ver mapa</Link>
        <UserMenu />
      </header>
      <nav className="tabs" aria-label="Seções">
        {tabs.filter(([, , min]) => can(min)).map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>{label}</NavLink>
        ))}
      </nav>
      <div className="shell-body">{children}</div>
    </div>
  );
}
