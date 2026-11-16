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
  const isGlobal = me?.role === 'globaladmin';

  const [users, setUsers] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [audit, setAudit] = useState([]);
  const [editing, setEditing] = useState(null); // novo: {} | existente
  const fail = useCallback((e) => toast(e.message, 'error'), [toast]);

  const load = useCallback(() => {
    api.listUsers().then(setUsers).catch(fail);
    api.audit().then(setAudit).catch(fail);
    if (isGlobal) {
      api.listCompanies().then(setCompanies).catch(() => {});
    }
  }, [fail, isGlobal]);

  useEffect(load, [load]);

  const patch = async (u, body) => {
    try {
      await api.patchUser(u.id, body);
      load();
    } catch (e) {
      fail(e);
      load();
    }
  };

  const remove = async (u) => {
    const ok = await confirm({
      title: 'Excluir usuário',
      message: `Excluir o usuário "${u.name}"? Os registros feitos por ele continuam no histórico.`,
      confirmText: 'Excluir usuário',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteUser(u.id);
      load();
    } catch (e) {
      fail(e);
    }
  };

  const togglePublic = async (enabled) => {
    try {
      await api.setPublicView(enabled);
      refresh();
      toast(enabled ? 'Visão pública ligada.' : 'Visão pública desligada.');
    } catch (e) {
      fail(e);
    }
  };

  const availableRoles = isGlobal
    ? ROLE_NAMES
    : Object.fromEntries(Object.entries(ROLE_NAMES).filter(([k]) => k !== 'globaladmin'));

  const filteredUsers = users?.filter((u) => {
    if (!selectedCompany) return true;
    if (selectedCompany === 'global') return u.role === 'globaladmin';
    return String(u.company_id) === String(selectedCompany);
  });

  return (
    <Shell
      title="Usuários e acesso"
      actions={
        <button className="btn primary" onClick={() => setEditing({})}>
          <Icon name="plus" /> Novo usuário
        </button>
      }
    >
      <div className="page narrow">
        <section className="card">
          <h2>Perfis de acesso</h2>
          <dl className="role-help">
            {Object.keys(availableRoles).map((r) => (
              <div key={r}>
                <dt>{availableRoles[r]}</dt>
                <dd>{ROLE_HELP[r]}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <h2>Usuários cadastrados</h2>
            {isGlobal && companies.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--muted, #94a3b8)' }}>Filtrar por empresa:</span>
                <select
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                  style={{ minWidth: 180 }}
                >
                  <option value="">Todas as empresas ({users?.length ?? 0})</option>
                  <option value="global">👑 Apenas Administradores Globais</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      🏢 {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Login</th>
                  {isGlobal && <th>Empresa</th>}
                  <th>Perfil</th>
                  <th>Ativo</th>
                  <th>Último acesso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredUsers?.map((u) => (
                  <tr key={u.id} className={u.active ? '' : 'dim'}>
                    <td>
                      <strong>{u.name}</strong>
                      {u.id === me.id && <span className="badge off you">você</span>}
                    </td>
                    <td><code>{u.username}</code></td>
                    {isGlobal && (
                      <td>
                        {u.role === 'globaladmin' ? (
                          <span className="badge off" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                            👑 Global Admin
                          </span>
                        ) : (
                          <span className="badge off" style={{ background: 'rgba(255, 255, 255, 0.06)' }}>
                            🏢 {u.company_name || '—'}
                          </span>
                        )}
                      </td>
                    )}
                    <td>
                      <select
                        value={u.role}
                        onChange={(e) => patch(u, { role: e.target.value })}
                        aria-label={`Perfil de ${u.name}`}
                        disabled={!isGlobal && u.role === 'globaladmin'}
                      >
                        {Object.entries(availableRoles).map(([k, l]) => (
                          <option key={k} value={k}>{l}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={u.active}
                        onChange={(e) => patch(u, { active: e.target.checked })}
                        aria-label={`${u.name} ativo`}
                      />
                    </td>
                    <td>{formatDateTime(u.last_login_at)}</td>
                    <td className="row-actions">
                      <button className="btn" onClick={() => setEditing(u)}>Redefinir senha</button>
                      <button
                        className="btn icon ghost danger"
                        onClick={() => remove(u)}
                        aria-label="Excluir usuário"
                        disabled={!isGlobal && u.role === 'globaladmin'}
                      >
                        <Icon name="trash" />
                      </button>
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
            Para TVs e quiosques no chão de fábrica: permite ver o <strong>mapa, os cadeados e os bloqueios por área</strong> da sua empresa sem entrar, somente leitura. Dashboard, registros e todo o restante continuam exigindo login.
          </p>
          <label className="check">
            <input type="checkbox" checked={!!config.public_view} onChange={(e) => togglePublic(e.target.checked)} />
            Permitir visualização do mapa sem login nesta empresa
          </label>
        </section>

        <section className="card">
          <h2>Registro de atividades</h2>
          <p className="muted">Últimas 200 ações da empresa ativa: quem fez, o quê e quando.</p>
          <div className="table-wrap tall">
            <table className="table">
              <thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th></tr></thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDateTime(a.at)}</td>
                    <td>{a.user_name || '—'}</td>
                    <td>{a.action}</td>
                  </tr>
                ))}
                {audit.length === 0 && <tr><td colSpan="3" className="empty-cell">Nada registrado ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {editing && (
        <UserForm
          initial={editing}
          isGlobal={isGlobal}
          companies={companies}
          availableRoles={availableRoles}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </Shell>
  );
}

function UserForm({ initial, isGlobal, companies, availableRoles, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial.id;
  const [f, setF] = useState({
    name: initial.name ?? '',
    username: initial.username ?? '',
    role: initial.role ?? 'viewer',
    company_id: initial.company_id ?? (companies[0]?.id || ''),
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    try {
      if (isNew) {
        await api.createUser(f);
      } else {
        await api.patchUser(initial.id, {
          password: f.password,
          ...(isGlobal ? { role: f.role, company_id: f.company_id } : {}),
        });
      }
      toast(isNew ? 'Usuário criado.' : 'Usuário atualizado.');
      onSaved();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isNew ? 'Novo usuário' : `Editar usuário ${initial.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn primary"
            onClick={save}
            disabled={busy || (isNew && (f.password.length < 8 || !f.name || !f.username))}
          >
            Salvar
          </button>
        </>
      }
    >
      <div className="stack">
        {isNew && (
          <>
            <label className="field">Nome
              <input value={f.name} onChange={set('name')} autoFocus required />
            </label>
            <label className="field">Login (usuário)
              <input value={f.username} onChange={set('username')} autoCapitalize="none" required />
              <small>3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado.</small>
            </label>
          </>
        )}

        <label className="field">Perfil de acesso
          <select value={f.role} onChange={set('role')}>
            {Object.entries(availableRoles).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
          <small>{ROLE_HELP[f.role]}</small>
        </label>

        {isGlobal && f.role !== 'globaladmin' && (
          <label className="field">Empresa vinculada
            <select value={f.company_id} onChange={set('company_id')} required>
              <option value="" disabled>Selecione a empresa...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.slug})
                </option>
              ))}
            </select>
            <small>Os dados deste usuário ficarão estritamente restritos à empresa selecionada.</small>
          </label>
        )}

        <label className="field">{isNew ? 'Senha inicial' : 'Nova senha (deixe vazio para manter atual)'} {isNew ? '(mín. 8 caracteres)' : ''}
          <input
            type="password"
            value={f.password}
            onChange={set('password')}
            autoComplete="new-password"
            placeholder={isNew ? 'Mínimo 8 caracteres' : 'Deixe em branco para não alterar'}
          />
        </label>
        {!isNew && <p className="muted" style={{ fontSize: 13 }}>Ao alterar a senha, a pessoa será desconectada de todos os aparelhos.</p>}
      </div>
    </Modal>
  );
}
