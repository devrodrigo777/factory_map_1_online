import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/Auth.jsx';
import { api } from '../api.js';
import Icon from '../components/Icons.jsx';

export default function Login() {
  const { loading, user, config, login, setup } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ name: '', username: '', password: '', again: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [captchaData, setCaptchaData] = useState(null);
  const [captchaInput, setCaptchaInput] = useState('');

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
      if (err.captcha_required) {
        setNeedCaptcha(true);
        fetchCaptcha();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z" />
          </svg>
        </div>
        <h1>{firstRun ? 'Primeiro acesso' : 'Entrar'}</h1>
        <p className="muted">
          {firstRun
            ? 'Crie o administrador do sistema. Ele poderá cadastrar os demais usuários.'
            : 'Mapa de bloqueios LOTO'}
        </p>
        {firstRun && (
          <label className="field">Nome
            <input value={form.name} onChange={set('name')} autoComplete="name" required autoFocus />
          </label>
        )}
        <label className="field">Usuário
          <input value={form.username} onChange={set('username')} autoComplete="username" autoCapitalize="none" required autoFocus={!firstRun} />
        </label>
        <label className="field">Senha{firstRun ? ' (mín. 8 caracteres)' : ''}
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
    </main>
  );
}
