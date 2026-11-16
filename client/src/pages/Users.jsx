import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../components/Auth.jsx';
import Shell from '../components/Shell.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';
import { ROLE_HELP, ROLE_NAMES, formatDateTime } from '../format.js';

export default function Users() {
  const toast = useToast();
  const confirm = useConfirm();
  const { user: me, config, refresh } = useAuth();
  const [users, setUsers] = useState(null);
  const [audit, setAudit] = useState([]);
  const [editing, setEditing] = useState(null); // novo: {} | existente
  const fail = useCallback((e) => toast(e.message, 'error'), [toast]);

  const load = useCallback(() => {
    api.listUsers().then(setUsers).catch(fail);
    api.audit().then(setAudit).catch(fail);
  }, [fail]);
  useEffect(load, [load]);

  const patch = async (u, body) => { try { await api.patchUser(u.id, body); load(); } catch (e) { fail(e); load(); } };
  const remove = async (u) => {
    const ok = await confirm({
      title: 'Excluir usuário',
      message: `Excluir o usuário "${u.name}"? Os registros feitos por ele continuam no histórico.`,
      confirmText: 'Excluir usuário',
      danger: true,
    });
    if (!ok) return;
    try { await api.deleteUser(u.id); load(); } catch (e) { fail(e); }
  };
  const togglePublic = async (enabled) => {
    try { await api.setPublicView(enabled); refresh(); toast(enabled ? 'Visão pública ligada.' : 'Visão pública desligada.'); } catch (e) { fail(e); }
  };

  return (
    <Shell title="Usuários e acesso" actions={<button className="btn primary" onClick={() => setEditing({})}><Icon name="plus" /> Novo usuário</button>}>
      <div className="page narrow">
        <section className="card">
          <h2>Perfis de acesso</h2>
          <dl className="role-help">
            {Object.keys(ROLE_NAMES).map((r) => (<div key={r}><dt>{ROLE_NAMES[r]}</dt><dd>{ROLE_HELP[r]}</dd></div>))}
          </dl>
        </section>

        <section className="card">
          <h2>Usuários</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Ativo</th><th>Último acesso</th><th /></tr></thead>
              <tbody>
                {users?.map((u) => (
                  <tr key={u.id} className={u.active ? '' : 'dim'}>
                    <td><strong>{u.name}</strong>{u.id === me.id && <span className="badge off you">você</span>}</td>
                    <td>{u.username}</td>
                    <td>
                      <select value={u.role} onChange={(e) => patch(u, { role: e.target.value })} aria-label={`Perfil de ${u.name}`}>
                        {Object.entries(ROLE_NAMES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </td>
                    <td><input type="checkbox" checked={u.active} onChange={(e) => patch(u, { active: e.target.checked })} aria-label={`${u.name} ativo`} /></td>
                    <td>{formatDateTime(u.last_login_at)}</td>
                    <td className="row-actions">
                      <button className="btn" onClick={() => setEditing(u)}>Redefinir senha</button>
                      <button className="btn icon ghost danger" onClick={() => remove(u)} aria-label="Excluir usuário"><Icon name="trash" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h2>Tela do mapa sem login</h2>
          <p className="muted">
            Para TVs e quiosques no chão de fábrica: permite ver o <strong>mapa, os cadeados e os bloqueios por área</strong> sem
            entrar, somente leitura. Dashboard, registros e todo o restante continuam exigindo login.
          </p>
          <label className="check">
            <input type="checkbox" checked={!!config.public_view} onChange={(e) => togglePublic(e.target.checked)} />
            Permitir visualização do mapa sem login
          </label>
        </section>

        <section className="card">
          <h2>Registro de atividades</h2>
          <p className="muted">Últimas 200 ações: quem fez, o quê e quando.</p>
          <div className="table-wrap tall">
            <table className="table">
              <thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th></tr></thead>
              <tbody>
                {audit.map((a) => (<tr key={a.id}><td>{formatDateTime(a.at)}</td><td>{a.user_name || '—'}</td><td>{a.action}</td></tr>))}
                {audit.length === 0 && <tr><td colSpan="3" className="empty-cell">Nada registrado ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {editing && <UserForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </Shell>
  );
}

function UserForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial.id;
  const [f, setF] = useState({ name: initial.name ?? '', username: initial.username ?? '', role: initial.role ?? 'viewer', password: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    try {
      if (isNew) await api.createUser(f);
      else await api.patchUser(initial.id, { password: f.password });
      toast(isNew ? 'Usuário criado.' : 'Senha redefinida.');
      onSaved();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal title={isNew ? 'Novo usuário' : `Redefinir senha de ${initial.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save} disabled={busy || f.password.length < 8 || (isNew && (!f.name || !f.username))}>Salvar</button></>}>
      <div className="stack">
        {isNew && (
          <>
            <label className="field">Nome<input value={f.name} onChange={set('name')} autoFocus /></label>
            <label className="field">Login<input value={f.username} onChange={set('username')} autoCapitalize="none" />
              <small>3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado.</small></label>
            <label className="field">Perfil
              <select value={f.role} onChange={set('role')}>{Object.entries(ROLE_NAMES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <small>{ROLE_HELP[f.role]}</small>
            </label>
          </>
        )}
        <label className="field">{isNew ? 'Senha inicial' : 'Nova senha'} (mín. 8 caracteres)
          <input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" autoFocus={!isNew} /></label>
        {!isNew && <p className="muted">A pessoa será desconectada de todos os aparelhos.</p>}
      </div>
    </Modal>
  );
}
