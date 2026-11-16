import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from '../api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
const LEVEL = { viewer: 1, operator: 2, admin: 3, globaladmin: 4 };

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, config: { setup_needed: false, public_view: false }, error: false });

  const refresh = useCallback(async () => {
    try {
      const [config, me] = await Promise.all([api.authConfig(), api.me()]);
      setState({ loading: false, user: me.user, config, error: false });
    } catch {
      setState((s) => ({ ...s, loading: false, error: true }));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // sessão expirada em qualquer chamada: volta para o login
  useEffect(() => {
    const expired = () => setState((s) => (s.user ? { ...s, user: null } : s));
    window.addEventListener('auth:expired', expired);
    return () => window.removeEventListener('auth:expired', expired);
  }, []);

  const value = useMemo(() => ({
    ...state,
    refresh,
    isGlobalAdmin: state.user?.role === 'globaladmin',
    can: (role) => !!state.user && LEVEL[state.user.role] >= LEVEL[role],
    selectCompany: async (id) => {
      await api.selectCompany(id);
      await refresh();
    },
    login: async (username, password, captcha, captcha_token) => {
      const { user } = await api.login(username, password, captcha, captcha_token);
      setState((s) => ({ ...s, user }));
    },
    setup: async (body) => {
      const { user } = await api.setup(body);
      setState((s) => ({ ...s, user, config: { ...s.config, setup_needed: false } }));
    },
    logout: async () => {
      await api.logout().catch(() => {});
      setState((s) => ({ ...s, user: null }));
    },
    expire: () => setState((s) => ({ ...s, user: null })),
  }), [state, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Rota protegida. publicOk: pode abrir sem login quando a "visão pública" está ligada.
export function Protected({ min = 'viewer', publicOk = false, children }) {
  const { loading, error, user, config, can, refresh } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="center-screen"><div className="spinner" role="status" aria-label="Carregando" /></div>;
  if (error) {
    return (
      <div className="center-screen">
        <h1>Servidor indisponível</h1>
        <p>Não foi possível falar com o servidor. Verifique se ele está em execução.</p>
        <button className="btn primary" onClick={refresh}>Tentar novamente</button>
      </div>
    );
  }
  if (!user) {
    if (publicOk && config.public_view && !config.setup_needed) return children;
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  }
  if (!can(min)) {
    return (
      <div className="center-screen">
        <h1>Sem permissão</h1>
        <p>O seu perfil não tem acesso a esta área.</p>
        <a className="btn primary" href="/">Voltar ao mapa</a>
      </div>
    );
  }
  return children;
}
