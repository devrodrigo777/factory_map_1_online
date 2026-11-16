import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../components/Auth.jsx';
import Shell from '../components/Shell.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';
import { formatDateTime } from '../format.js';

export default function Companies() {
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();
  const { user, selectCompany } = useAuth();
  const [companies, setCompanies] = useState(null);
  const [editing, setEditing] = useState(null); // {} para novo | objeto para editar
  const [busy, setBusy] = useState(false);
  const [resetModal, setResetModal] = useState(false);
  const [resetKeyword, setResetKeyword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const fail = useCallback((e) => toast(e.message, 'error'), [toast]);

  const load = useCallback(() => {
    api.listCompanies().then(setCompanies).catch(fail);
  }, [fail]);

  useEffect(load, [load]);

  const handleResetAll = async () => {
    if (resetKeyword.trim() !== 'DELETE.ALL') return;
    setResetBusy(true);
    try {
      await api.resetSystemAll(resetKeyword.trim());
      toast('Sistema completamente formatado.');
      setResetModal(false);
      setTimeout(() => { window.location.href = '/'; }, 1000);
    } catch (err) {
      fail(err);
    } finally {
      setResetBusy(false);
    }
  };

  const saveCompany = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing.id) {
        await api.patchCompany(editing.id, { name: editing.name, active: editing.active });
        toast('Empresa atualizada com sucesso.');
      } else {
        await api.createCompany({ name: editing.name, slug: editing.slug });
        toast('Empresa cadastrada e ambiente isolado criado.');
      }
      setEditing(null);
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSelect = async (c) => {
    try {
      await selectCompany(c.id);
      toast(`Ambiente ativo alternado para "${c.name}".`);
      nav('/admin');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const toggleActive = async (c) => {
    try {
      await api.patchCompany(c.id, { active: !c.active });
      toast(`Empresa "${c.name}" ${c.active ? 'desativada' : 'ativada'}.`);
      load();
    } catch (err) {
      fail(err);
    }
  };

  const removeCompany = async (c) => {
    const ok = await confirm({
      title: 'Excluir Empresa',
      message: `Tem certeza que deseja excluir a empresa "${c.name}"? Todos os usuários e dados associados a este ambiente serão excluídos permanentemente.`,
      confirmText: 'Excluir Empresa',
      danger: true,
    });
    if (!ok) return;

    try {
      await api.deleteCompany(c.id);
      toast('Empresa excluída.');
      load();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <Shell
      title="Gestão de Empresas & Contas"
      actions={
        <button className="btn primary" onClick={() => setEditing({ name: '', slug: '', active: true })}>
          <Icon name="plus" /> Nova Empresa
        </button>
      }
    >
      <div className="page narrow">
        <section className="card">
          <h2>Empresas e Ambientes Multi-Tenant</h2>
          <p className="muted" style={{ marginBottom: 16 }}>
            Cada empresa possui um banco de dados e arquivos de imagens completamente isolados. Usuários de uma empresa nunca têm acesso aos dados, mapas ou bloqueios de outra.
          </p>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome da Empresa</th>
                  <th>Identificador (Slug)</th>
                  <th>Usuários</th>
                  <th>Status</th>
                  <th>Criada em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {companies?.map((c) => {
                  const isCurrent = user?.active_company_id === c.id;
                  return (
                    <tr key={c.id} className={c.active ? '' : 'dim'}>
                      <td>
                        <strong>{c.name}</strong>
                        {isCurrent && (
                          <span className="badge off you" style={{ marginLeft: 8 }}>
                            ambiente atual
                          </span>
                        )}
                      </td>
                      <td><code>{c.slug}</code></td>
                      <td>
                        <span className="badge" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          {c.user_count ?? 0} {c.user_count === 1 ? 'usuário' : 'usuários'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`btn small ${c.active ? 'ghost' : 'danger ghost'}`}
                          onClick={() => toggleActive(c)}
                          title="Clique para alternar o status da empresa"
                        >
                          {c.active ? '🟢 Ativa' : '🔴 Desativada'}
                        </button>
                      </td>
                      <td>{formatDateTime(c.created_at)}</td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="btn primary small"
                          onClick={() => handleSelect(c)}
                          title="Entrar neste ambiente para ver/editar mapas e dados desta empresa"
                        >
                          Acessar Ambiente
                        </button>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => setEditing(c)}
                          title="Editar nome ou configurações da empresa"
                        >
                          Editar
                        </button>
                        {companies.length > 1 && (
                          <button
                            type="button"
                            className="btn icon ghost danger small"
                            onClick={() => removeCompany(c)}
                            title="Excluir empresa"
                            aria-label={`Excluir empresa ${c.name}`}
                          >
                            <Icon name="trash" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="danger-zone-card" style={{ marginTop: 24 }}>
          <div className="danger-zone-header">
            <Icon name="alert" size={24} />
            <h2>Área de Risco: Formatar Sistema</h2>
          </div>
          <p className="danger-zone-desc">
            Exclui permanentemente todo o banco de dados, todas as empresas, todos os usuários e arquivos enviados. O sistema retornará ao estado de primeiro acesso (instalação zerada). A recuperação só é possível via backups externos.
          </p>
          <div className="danger-item-row">
            <div className="danger-item-info">
              <strong style={{ color: '#ef4444' }}>👑 Formatar sistema completamente</strong>
              <p>Zera completamente a instalação do servidor VPS. Exige confirmação por palavra-chave ("DELETE.ALL").</p>
            </div>
            <button
              type="button"
              className="btn danger-solid"
              onClick={() => {
                setResetKeyword('');
                setResetModal(true);
              }}
            >
              Formatar sistema…
            </button>
          </div>
        </section>

        {resetModal && (
          <Modal
            title="Formatar Sistema Completamente"
            onClose={() => !resetBusy && setResetModal(false)}
            footer={
              <>
                <button type="button" className="btn" onClick={() => setResetModal(false)} disabled={resetBusy}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn danger-solid"
                  onClick={handleResetAll}
                  disabled={resetBusy || resetKeyword.trim() !== 'DELETE.ALL'}
                >
                  {resetBusy ? 'Formatando…' : 'Confirmar e Formatar Tudo'}
                </button>
              </>
            }
          >
            <div className="danger-modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#b91c1c' }}>
                <Icon name="alert" size={24} />
                <strong style={{ fontSize: 15 }}>ATENÇÃO EXTREMA: Ação irreversível!</strong>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--ink, #1f2937)', lineHeight: 1.5 }}>
                Todas as empresas cadastradas, usuários, senhas, sessões ativas, logs de auditoria, dados de bloqueio e imagens enviadas serão completamente apagados do servidor. O sistema voltará ao assistente de primeiro acesso.
              </p>
              <div style={{ background: '#f8fafc', border: '1px solid var(--line, #e2e8f0)', borderRadius: 10, padding: 14 }}>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--steel, #64748b)' }}>
                  Para confirmar a formatação total, digite exatamente a palavra-chave abaixo:
                </p>
                <div style={{ textAlign: 'center', margin: '6px 0 12px' }}>
                  <span className="danger-keyword-badge">DELETE.ALL</span>
                </div>
                <input
                  type="text"
                  className="field-input"
                  style={{ width: '100%', boxSizing: 'border-box', textAlign: 'center', fontWeight: 'bold', letterSpacing: '0.05em', background: '#fff', border: '1px solid var(--line, #cbd5e1)', borderRadius: 8, padding: '10px 12px', fontSize: 15 }}
                  placeholder="Digite DELETE.ALL"
                  value={resetKeyword}
                  onChange={(e) => setResetKeyword(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && resetKeyword.trim() === 'DELETE.ALL' && !resetBusy) {
                      handleResetAll();
                    }
                  }}
                />
              </div>
            </div>
          </Modal>
        )}

        {editing && (
          <Modal
            title={editing.id ? 'Editar Empresa' : 'Cadastrar Nova Empresa'}
            onClose={() => setEditing(null)}
          >
            <form onSubmit={saveCompany} className="modal-form">
              <label className="field">
                Nome da Empresa
                <input
                  value={editing.name ?? ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Ex.: Indústria Metalúrgica ABC"
                  required
                  autoFocus
                />
              </label>

              {!editing.id && (
                <label className="field">
                  Identificador / Slug (único)
                  <input
                    value={editing.slug ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
                      })
                    }
                    placeholder="Ex.: industria-abc"
                    required
                  />
                  <span className="field-hint" style={{ fontSize: 12, color: 'var(--muted, #94a3b8)' }}>
                    Utilizado internamente para pastas e referências seguras. Apenas letras minúsculas, números e traço.
                  </span>
                </label>
              )}

              {editing.id && (
                <label className="field-check" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                  <input
                    type="checkbox"
                    checked={!!editing.active}
                    onChange={(e) => setEditing({ ...editing, active: e.target.checked ? 1 : 0 })}
                  />
                  <span>Empresa ativa no sistema (quando desativada, os usuários da empresa não conseguem fazer login)</span>
                </label>
              )}

              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? 'Salvando…' : editing.id ? 'Salvar alterações' : 'Criar empresa'}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </Shell>
  );
}
