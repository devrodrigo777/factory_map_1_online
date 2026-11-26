import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/Auth.jsx';
import { api } from '../api.js';
import Icon from '../components/Icons.jsx';
import Modal from '../components/Modal.jsx';
import LanguageSelector from '../components/LanguageSelector.jsx';
import { useTranslation } from '../i18n/I18nContext.jsx';

export default function Login() {
  const { loading, user, config, login, setup } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ name: '', username: '', password: '', again: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [captchaData, setCaptchaData] = useState(null);
  const [captchaInput, setCaptchaInput] = useState('');
  const [aboutOpen, setAboutOpen] = useState(false);

  const firstRun = config.setup_needed;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const fetchCaptcha = async () => {
    try {
      const data = await api.getCaptcha();
      setCaptchaData(data);
      setCaptchaInput('');
    } catch {}
  };

  useEffect(() => {
    if (config.captcha_required) {
      setNeedCaptcha(true);
      fetchCaptcha();
    }
  }, [config.captcha_required]);

  const checkUsernameCaptcha = async () => {
    const u = form.username.trim().toLowerCase();
    if (!u) return;
    try {
      const res = await api.authConfig(u);
      if (res?.captcha_required) {
        setNeedCaptcha(true);
        if (!captchaData) fetchCaptcha();
      }
    } catch {}
  };

  if (loading) return <div className="center-screen"><div className="spinner" /></div>;
  if (user) return <Navigate to={loc.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (firstRun && form.password !== form.again) return setError('As senhas não conferem.');
    setBusy(true);
    try {
      if (firstRun) {
        await setup({ name: form.name, username: form.username, password: form.password });
      } else {
        await login(form.username, form.password, captchaInput, captchaData?.token);
      }
      nav(loc.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
      if (err.captcha_required || /código de verificação|captcha/i.test(err.message)) {
        setNeedCaptcha(true);
        fetchCaptcha();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10 }}>
        <LanguageSelector />
      </div>
      <div className="login-pane">
        <form className="login-card" onSubmit={submit}>
          <div className="login-mark" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z" />
            </svg>
          </div>
          <h1>{firstRun ? 'Primeiro acesso' : t('auth.btn_login', 'Entrar')}</h1>
          <p className="muted">
            {firstRun
              ? 'Crie o administrador do sistema. Ele poderá cadastrar os demais usuários.'
              : 'EasyLOTOTO v2 • Gestão Visual de Bloqueios e Etiquetagens LOTOTO'}
          </p>
          {firstRun && (
            <label className="field">Nome
              <input value={form.name} onChange={set('name')} autoComplete="name" required autoFocus />
            </label>
          )}
          <label className="field">{t('auth.username', 'Usuário')}
            <input value={form.username} onChange={set('username')} onBlur={checkUsernameCaptcha} autoComplete="username" autoCapitalize="none" required autoFocus={!firstRun} />
          </label>
          <label className="field">{t('auth.password', 'Senha')}{firstRun ? ' (mín. 8 caracteres)' : ''}
            <input type="password" value={form.password} onChange={set('password')} autoComplete={firstRun ? 'new-password' : 'current-password'} required />
          </label>
          {firstRun && (
            <label className="field">Repita a senha
              <input type="password" value={form.again} onChange={set('again')} autoComplete="new-password" required />
            </label>
          )}

          {needCaptcha && (
            <div className="captcha-block">
              <label className="field">
                <span style={{ fontSize: 13, fontWeight: 600 }}>Verificação de segurança</span>
                <div className="captcha-row" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
                  {captchaData ? (
                    <img src={captchaData.svg} alt="Código de verificação" style={{ height: 44, borderRadius: 8 }} />
                  ) : (
                    <div style={{ height: 44, width: 170, background: '#1c2836', borderRadius: 8, display: 'grid', placeItems: 'center', fontSize: 13, color: '#94a3b8' }}>Carregando…</div>
                  )}
                  <button type="button" className="btn icon ghost" onClick={fetchCaptcha} title="Gerar outro código" aria-label="Gerar outro código">
                    <Icon name="swap" />
                  </button>
                </div>
                <input
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value.toUpperCase())}
                  placeholder="Digite os 5 caracteres acima"
                  maxLength={5}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 'bold' }}
                  required
                />
              </label>
            </div>
          )}

          {error && <p className="expr-test err" role="alert">{error}</p>}
          <button className="btn primary wide" disabled={busy}>{busy ? 'Aguarde…' : firstRun ? 'Criar administrador' : 'Entrar'}</button>
          {!firstRun && config.public_view && <a className="login-public" href="/">Ver o mapa sem entrar</a>}
        </form>

        <div className="login-sub-links">
          <button
            type="button"
            className="login-sub-link-btn"
            onClick={() => setAboutOpen(true)}
          >
            <Icon name="info" size={15} /> Sobre o EasyLOTOTO for Knauf
          </button>
          <Link
            to="/manual"
            className="login-sub-link-btn"
          >
            <Icon name="file" size={15} /> Manual de Uso
          </Link>
        </div>
      </div>

      {aboutOpen && (
        <Modal title="Sobre o EasyLOTOTO for Knauf" onClose={() => setAboutOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: '#e0f2fe',
                border: '1px solid #bae6fd',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0284c7',
                flexShrink: 0,
                marginTop: 2
              }}>
                <Icon name="info" size={20} />
              </div>
              <div>
                <h4 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: '1rem', fontWeight: 700 }}>Apresentação do Sistema</h4>
                <p style={{ margin: 0, color: '#334155', lineHeight: 1.55, fontSize: '0.92rem' }}>
                  O <strong style={{ color: '#0f172a' }}>EasyLOTOTO for Knauf</strong> é um sistema simples desenvolvido para a gestão visual de bloqueios e etiquetagens de energia perigosa (LOTOTO - Lockout, Tagout, Tryout) na fábrica.
                </p>
                <p style={{ margin: '8px 0 0', color: '#334155', lineHeight: 1.55, fontSize: '0.92rem' }}>
                  O sistema permite visualizar a planta fabril com a demarcação das áreas e equipamentos, sinalizando claramente onde existem intervenções ativas de manutenção e prevenindo acidentes de trabalho com fontes de energia perigosa.
                </p>
              </div>
            </div>

            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 12px', color: '#0284c7', fontSize: '0.95rem', fontWeight: 700 }}>Créditos do Projeto</h4>
              <div style={{ marginBottom: 12 }}>
                <strong style={{ display: 'block', color: '#0f172a', fontSize: '0.92rem' }}>Idealizado por:</strong>
                <span style={{ color: '#1e293b', fontSize: '0.9rem', fontWeight: 500 }}>Hadmilton de Melos Cordeiro</span>
                <small style={{ display: 'block', color: '#64748b', marginTop: 2, fontSize: '0.85rem' }}>Coordenador de Manutenção Elétrica / Supervisor de Estágio</small>
              </div>
              <div>
                <strong style={{ display: 'block', color: '#0f172a', fontSize: '0.92rem' }}>Desenvolvimento e implementação:</strong>
                <span style={{ color: '#1e293b', fontSize: '0.9rem', fontWeight: 500 }}>Rodrigo Lopes Chaves de Aguiar</span>
                <small style={{ display: 'block', color: '#64748b', marginTop: 2, fontSize: '0.85rem' }}>Estagiário de Engenharia de Software</small>
              </div>
            </div>

            <button type="button" className="btn primary" onClick={() => setAboutOpen(false)} style={{ alignSelf: 'flex-end', minWidth: 90 }}>
              Fechar
            </button>
          </div>
        </Modal>
      )}
      <div className="app-watermark" aria-hidden="true">
        Desenvolvido e Implementado por Rodrigo Lopes • Estagiário de Engenharia de Software
      </div>
    </main>
  );
}
