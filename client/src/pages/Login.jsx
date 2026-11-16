import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/Auth.jsx';
import { api } from '../api.js';
import Icon from '../components/Icons.jsx';
import Modal from '../components/Modal.jsx';

export default function Login() {
  const { loading, user, config, login, setup } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ name: '', username: '', password: '', again: '', company_name: '' });
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
        await setup({ name: form.name, username: form.username, password: form.password, company_name: form.company_name || 'Fábrica Matriz' });
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
            : 'EasyLOTOTO v2 • Gestão Visual de Bloqueios e Etiquetagens LOTOTO'}
        </p>
        {firstRun && (
          <>
            <label className="field">Nome completo
              <input value={form.name} onChange={set('name')} autoComplete="name" required autoFocus />
            </label>
            <label className="field">Nome da primeira empresa
              <input value={form.company_name} onChange={set('company_name')} placeholder="Ex.: Fábrica Matriz" />
              <small style={{ color: 'var(--muted, #94a3b8)', fontSize: 12 }}>Você terá perfil de Administrador Global e poderá cadastrar mais empresas a qualquer momento.</small>
            </label>
          </>
        )}
        <label className="field">Usuário
          <input value={form.username} onChange={set('username')} onBlur={checkUsernameCaptcha} autoComplete="username" autoCapitalize="none" required autoFocus={!firstRun} />
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
        {!firstRun && config.public_view && <a className="login-public" href={loc.state?.from || '/'}>Ver o mapa sem entrar</a>}
      </form>

      <div className="login-sub-links" style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: 13, textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <Icon name="info" size={14} /> Sobre o EasyLOTOTO for Knauf
        </button>
        <span style={{ color: '#475569' }}>•</span>
        <Link
          to="/manual"
          style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <Icon name="file" size={14} /> Manual de Uso
        </Link>
      </div>

      {aboutOpen && (
        <Modal title="Sobre o EasyLOTOTO for Knauf" onClose={() => setAboutOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h4 style={{ margin: '0 0 6px', color: '#fff', fontSize: '1rem' }}>Apresentação do Sistema</h4>
              <p style={{ margin: 0, color: 'var(--steel, #94a3b8)', lineHeight: 1.5, fontSize: '0.92rem' }}>
                O <strong>EasyLOTOTO for Knauf</strong> é um sistema simples desenvolvido para a gestão visual de bloqueios e etiquetagens de energia perigosa (LOTOTO - Lockout, Tagout, Tryout) na fábrica.
              </p>
              <p style={{ margin: '8px 0 0', color: 'var(--steel, #94a3b8)', lineHeight: 1.5, fontSize: '0.92rem' }}>
                O sistema permite visualizar a planta fabril com a demarcação das áreas e equipamentos, sinalizando claramente onde existem intervenções ativas de manutenção e prevenindo acidentes de trabalho com fontes de energia perigosa.
              </p>
            </div>

            <div style={{ padding: 14, background: '#1c2836', borderRadius: 8, border: '1px solid #2d3f54' }}>
              <h4 style={{ margin: '0 0 10px', color: '#38bdf8', fontSize: '0.95rem' }}>Créditos do Projeto</h4>
              <div style={{ marginBottom: 12 }}>
                <strong style={{ display: 'block', color: '#fff', fontSize: '0.92rem' }}>Idealizado por:</strong>
                <span style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>Hadmilton de Melos Cordeiro</span>
                <small style={{ display: 'block', color: '#94a3b8', marginTop: 2 }}>Coordenador de Manutenção Mecânica / Supervisor de Estágio</small>
              </div>
              <div>
                <strong style={{ display: 'block', color: '#fff', fontSize: '0.92rem' }}>Desenvolvimento e implementação:</strong>
                <span style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>Rodrigo Lopes Chaves de Aguiar</span>
                <small style={{ display: 'block', color: '#94a3b8', marginTop: 2 }}>Estagiário de Engenharia de Software</small>
              </div>
            </div>

            <button type="button" className="btn primary" onClick={() => setAboutOpen(false)} style={{ alignSelf: 'flex-end' }}>
              Fechar
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
