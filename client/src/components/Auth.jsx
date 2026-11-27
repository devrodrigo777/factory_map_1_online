import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useTranslation } from '../i18n/I18nContext.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
const LEVEL = { viewer: 1, operator: 2, admin: 3 };

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
    can: (role) => !!state.user && LEVEL[state.user.role] >= LEVEL[role],
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
  const { t } = useTranslation();
  const loc = useLocation();
  if (loading) return <div className="center-screen"><div className="spinner" role="status" aria-label={t('viewer.loading', 'Carregando')} /></div>;
  if (error) {
    return (
      <div className="center-screen">
        <h1>{t('viewer.server_unavailable', 'Servidor indisponível')}</h1>
        <p>{t('auth.server_unavailable_desc', 'Não foi possível falar com o servidor. Verifique se ele está em execução.')}</p>
        <button className="btn primary" onClick={refresh}>{t('viewer.try_again', 'Tentar novamente')}</button>
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
