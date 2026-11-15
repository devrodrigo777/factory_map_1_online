import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../components/Auth.jsx';
import Shell from '../components/Shell.jsx';
import Icon from '../components/Icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatBytes, formatDateTime, formatInt } from '../format.js';
import DynamicSyncCode from '../components/DynamicSyncCode.jsx';
import SyncCameraScanner from '../components/SyncCameraScanner.jsx';

const TYPE_NAME = { data: 'Somente dados', full: 'Dados + configurações' };

export default function Backup() {
  const toast = useToast();
  const { expire } = useAuth();
  const fileRef = useRef(null);

  const [tab, setTab] = useState('backup'); // 'backup' | 'sync'
  const [list, setList] = useState([]);
  const [type, setType] = useState('full');
  const [withUsers, setWithUsers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // { file?, name?, manifest, images }
  const [mode, setMode] = useState('replace');

  // Estado da Sincronização
  const [syncScope, setSyncScope] = useState(() => localStorage.getItem('sync_scope_pref') || 'full');
  const [syncDirection, setSyncDirection] = useState('send'); // 'send' | 'receive'
  const [syncExportData, setSyncExportData] = useState(null);
  const [receiveCode, setReceiveCode] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [receiveMode, setReceiveMode] = useState('replace');
  const [copiedSync, setCopiedSync] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const fail = useCallback((e) => toast(e.message, 'error'), [toast]);
  const load = useCallback(() => api.listBackups().then(setList).catch(fail), [fail]);
  useEffect(() => { load(); }, [load]);

  const handleScopeChange = (newScope) => {
    setSyncScope(newScope);
    localStorage.setItem('sync_scope_pref', newScope);
    setSyncExportData(null);
  };

  const create = async () => {
    setBusy(true);
    try {
      const b = await api.createBackup({ type, include_users: withUsers });
      await load();
      toast('Backup criado. Baixando…');
      window.location.href = `/api/backup/files/${encodeURIComponent(b.name)}`;
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const inspect = async (src) => {
    try {
      const r = await api.inspectBackup(src);
      setPending({ ...src, ...r });
      setMode('replace');
    } catch (e) { fail(e); }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) inspect({ file });
  };

  const restore = async () => {
    const full = pending.manifest.type === 'full';
    const msg = full
      ? 'Restaurar vai SUBSTITUIR as plantas, áreas, campos, KPIs, perfis de importação e todos os registros pelo conteúdo do backup.'
      : mode === 'replace'
        ? 'Restaurar vai SUBSTITUIR todos os registros atuais pelos do backup.'
        : 'Os registros do backup serão ACRESCENTADOS aos atuais (repetidos são ignorados).';
    if (!window.confirm(`${msg}\n\nUm backup de segurança do estado atual é criado antes. Continuar?`)) return;
    setBusy(true);
    try {
      const r = await api.restoreBackup({ file: pending.file, name: pending.name, mode });
      toast('Backup restaurado.');
      setPending(null);
      if (r.relogin) { expire(); return; }
      load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const remove = async (b) => {
    if (!window.confirm(`Excluir o arquivo ${b.name} do servidor?`)) return;
    try { await api.deleteBackup(b.name); load(); } catch (e) { fail(e); }
  };

  // Funções de Sincronização
  const handleGenerateSync = async () => {
    setBusy(true);
    try {
      const res = await api.exportSyncPackage(syncScope);
      setSyncExportData(res);
      toast('Código e QR Code de sincronização gerados!');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const handleCopySyncCode = () => {
    if (!syncExportData?.code) return;
    navigator.clipboard.writeText(syncExportData.code).then(() => {
      setCopiedSync(true);
      setTimeout(() => setCopiedSync(false), 2500);
      toast('Código de sincronização copiado para a área de transferência.');
    }).catch(() => {});
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setReceiveCode(text.trim());
        toast('Código colado com sucesso.');
      }
    } catch {
      toast('Não foi possível ler a área de transferência automaticamente. Use Ctrl+V.', 'warn');
    }
  };

  const handleApplySync = async () => {
    if (!receiveCode.trim()) return toast('Cole o código de sincronização.', 'error');
    if (!adminPassword) return toast('Digite sua senha de administrador para autorizar a sincronização.', 'error');

    if (!window.confirm('Deseja realmente aplicar a sincronização? Um backup de segurança do estado atual será criado automaticamente antes.')) {
      return;
    }

    setBusy(true);
    try {
      const res = await api.applySyncPackage({
        code: receiveCode.trim(),
        password: adminPassword,
        mode: receiveMode,
      });
      toast(`Sincronização aplicada com sucesso! ${res.appliedCounts?.records ?? ''} registros ativos.`);
      setReceiveCode('');
      setAdminPassword('');
      load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Backup e restauração">
      <div className="page narrow">
        <div className="tabs-mini" role="tablist" style={{ marginBottom: 16 }}>
          <button
            role="tab"
            aria-selected={tab === 'backup'}
            className={tab === 'backup' ? 'on' : ''}
            onClick={() => setTab('backup')}
          >
            <Icon name="save" size={15} /> Backups locais
          </button>
          <button
            role="tab"
            aria-selected={tab === 'sync'}
            className={tab === 'sync' ? 'on' : ''}
            onClick={() => setTab('sync')}
          >
            <Icon name="swap" size={15} /> Sincronização (Online ↔ Offline)
          </button>
        </div>

        {tab === 'sync' ? (
          /* =========================================================================
             Aba de Sincronização Online ↔ Offline
             ========================================================================= */
          <div className="sync-section">
            <section className="card">
              <h2>Sincronização entre instâncias (Online ↔ Offline)</h2>
              <p className="muted">
                Transfira dados entre a versão online e a versão local da fábrica com total integridade via código visual dinâmico ou transferência manual por texto.
              </p>

              <div className="choice-list" role="radiogroup">
                <label className={`choice ${syncScope === 'data' ? 'on' : ''}`}>
                  <input
                    type="radio"
                    name="syncScope"
                    checked={syncScope === 'data'}
                    onChange={() => handleScopeChange('data')}
                  />
                  <span>
                    <strong>Somente dados</strong>
                    <small>Sincroniza apenas registros de bloqueio e histórico. Mantém plantas, áreas e campos como estão.</small>
                  </span>
                </label>
                <label className={`choice ${syncScope === 'full' ? 'on' : ''}`}>
                  <input
                    type="radio"
                    name="syncScope"
                    checked={syncScope === 'full'}
                    onChange={() => handleScopeChange('full')}
                  />
                  <span>
                    <strong>Dados + configurações</strong>
                    <small>Sincroniza registros, plantas, imagens, áreas, campos, KPIs, perfis de importação e configurações gerais.</small>
                  </span>
                </label>
              </div>

              <div className="seg" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className={`btn ${syncDirection === 'send' ? 'active' : ''}`}
                  onClick={() => setSyncDirection('send')}
                >
                  <Icon name="upload" size={16} /> Gerar sincronização (Enviar)
                </button>
                <button
                  type="button"
                  className={`btn ${syncDirection === 'receive' ? 'active' : ''}`}
                  onClick={() => setSyncDirection('receive')}
                >
                  <Icon name="swap" size={16} /> Receber sincronização (Aplicar)
                </button>
              </div>

              {syncDirection === 'send' ? (
                <div style={{ marginTop: 18 }}>
                  <div className="row">
                    <button className="btn primary" onClick={handleGenerateSync} disabled={busy}>
                      <Icon name="swap" /> {busy ? 'Gerando pacote…' : 'Gerar código de sincronização'}
                    </button>
                  </div>

                  {syncExportData && (
                    <div style={{ marginTop: 20 }}>
                      <DynamicSyncCode
                        code={syncExportData.code}
                        onCopy={() => toast('Código de sincronização copiado!')}
                      />

                      <dl className="facts" style={{ marginTop: 16, marginBottom: 16 }}>
                        <div><dt>Tipo</dt><dd>{TYPE_NAME[syncExportData.manifest.type]}</dd></div>
                        <div><dt>Registros</dt><dd>{formatInt(syncExportData.manifest.counts.records)}</dd></div>
                        {syncExportData.manifest.type === 'full' && (
                          <div><dt>Plantas / Áreas</dt><dd>{syncExportData.manifest.counts.maps} / {syncExportData.manifest.counts.areas}</dd></div>
                        )}
                        <div><dt>Tamanho comprimido</dt><dd>{formatBytes(syncExportData.compressedBytes)}</dd></div>
                        <div><dt>Gerado em</dt><dd>{formatDateTime(syncExportData.manifest.created_at)}</dd></div>
                      </dl>

                      <label className="field">
                        <span>Código para transferência manual direta (ideal entre notebooks):</span>
                        <textarea
                          readOnly
                          rows={3}
                          value={syncExportData.code}
                          className="sync-code-area"
                          onClick={(e) => e.target.select()}
                        />
                      </label>

                      <div className="row" style={{ marginTop: 8 }}>
                        <button type="button" className={`btn ${copiedSync ? 'primary' : ''}`} onClick={handleCopySyncCode}>
                          <Icon name={copiedSync ? 'check' : 'file'} size={16} />
                          <span>{copiedSync ? 'Código copiado!' : 'Copiar código de sincronização'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Leitor Óptico via Câmera integrado */}
                  <div className="card-callout" style={{ background: '#0e1724', border: '1px solid #1f3044', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <strong style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.95rem' }}>
                          <Icon name="camera" size={18} /> Leitor Óptico via Câmera
                        </strong>
                        <small className="muted" style={{ display: 'block', marginTop: 2 }}>
                          Aponte a câmera para o Código Visual Dinâmico na outra tela para capturar automaticamente.
                        </small>
                      </div>
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => setCameraOpen(true)}
                      >
                        <Icon name="camera" size={16} /> Abrir leitor da câmera
                      </button>
                    </div>
                  </div>

                  <SyncCameraScanner
                    isOpen={cameraOpen}
                    onClose={() => setCameraOpen(false)}
                    onScan={(scannedCode) => {
                      setReceiveCode(scannedCode);
                      toast('Código de sincronização capturado com sucesso!');
                    }}
                  />

                  <label className="field" style={{ marginTop: 4 }}>
                    <span>Ou cole o código de sincronização manualmente (Ctrl+V):</span>
                    <textarea
                      rows={4}
                      value={receiveCode}
                      onChange={(e) => setReceiveCode(e.target.value)}
                      placeholder="Cole aqui o código (FMSYNC1...) caso prefira transferir manualmente"
                      className="sync-code-area"
                    />
                  </label>

                  <div className="row">
                    <button type="button" className="btn" onClick={handlePasteFromClipboard}>
                      <Icon name="file" size={16} /> Colar da área de transferência
                    </button>
                    {receiveCode && (
                      <button type="button" className="btn ghost" onClick={() => setReceiveCode('')}>
                        Limpar
                      </button>
                    )}
                  </div>

                  {syncScope === 'data' && (
                    <div className="choice-list" style={{ marginTop: 8 }}>
                      <label className={`choice ${receiveMode === 'replace' ? 'on' : ''}`}>
                        <input
                          type="radio"
                          name="receiveMode"
                          checked={receiveMode === 'replace'}
                          onChange={() => setReceiveMode('replace')}
                        />
                        <span>
                          <strong>Substituir</strong>
                          <small>Apaga os registros atuais e coloca os da sincronização.</small>
                        </span>
                      </label>
                      <label className={`choice ${receiveMode === 'append' ? 'on' : ''}`}>
                        <input
                          type="radio"
                          name="receiveMode"
                          checked={receiveMode === 'append'}
                          onChange={() => setReceiveMode('append')}
                        />
                        <span>
                          <strong>Acrescentar</strong>
                          <small>Mantém os registros atuais e adiciona os novos sem duplicar.</small>
                        </span>
                      </label>
                    </div>
                  )}

                  <label className="field" style={{ marginTop: 6 }}>
                    <span style={{ fontWeight: 600 }}>Confirmação com senha de administrador:</span>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Digite sua senha para autorizar"
                      autoComplete="current-password"
                      required
                    />
                    <small>Exigido por segurança para validar a gravação e evitar alterações não autorizadas.</small>
                  </label>

                  <div className="row" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={handleApplySync}
                      disabled={busy || !receiveCode.trim() || !adminPassword}
                    >
                      <Icon name="swap" /> {busy ? 'Sincronizando…' : 'Confirmar e sincronizar dados'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : (
          /* =========================================================================
             Aba de Backups em Arquivo (Tradicional)
             ========================================================================= */
          <>
            <section className="card">
              <h2>Criar backup</h2>
              <div className="choice-list" role="radiogroup">
                <label className={`choice ${type === 'data' ? 'on' : ''}`}>
                  <input type="radio" name="type" checked={type === 'data'} onChange={() => setType('data')} />
                  <span><strong>Somente dados</strong><small>Registros de bloqueio e histórico de importações. Plantas, áreas, campos e KPIs não entram.</small></span>
                </label>
                <label className={`choice ${type === 'full' ? 'on' : ''}`}>
                  <input type="radio" name="type" checked={type === 'full'} onChange={() => setType('full')} />
                  <span><strong>Dados + configurações</strong><small>Tudo acima, mais plantas e imagens, áreas e cadeados, campos, KPIs, perfis de importação e ajustes. Serve para recuperar ou clonar o sistema inteiro.</small></span>
                </label>
              </div>
              {type === 'full' && (
                <label className="check">
                  <input type="checkbox" checked={withUsers} onChange={(e) => setWithUsers(e.target.checked)} />
                  Incluir usuários e senhas (guardadas de forma criptografada). Proteja o arquivo.
                </label>
              )}
              <div className="row">
                <button className="btn primary" onClick={create} disabled={busy}><Icon name="save" /> Criar e baixar backup</button>
                <a className="btn" href="/api/export/records.xlsx"><Icon name="upload" /> Exportar registros (Excel)</a>
              </div>
              <p className="muted">O sistema também cria um backup completo automático por dia no servidor (guarda os últimos 14).</p>
            </section>

            <section className="card">
              <h2>Backups guardados no servidor</h2>
              {list.length === 0 ? <p className="muted">Nenhum backup ainda.</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Arquivo</th><th>Tipo</th><th>Criado em</th><th className="num">Tamanho</th><th /></tr></thead>
                    <tbody>
                      {list.map((b) => (
                        <tr key={b.name}>
                          <td>{b.name}{b.auto && <span className="badge off you">automático</span>}</td>
                          <td>{TYPE_NAME[b.type]}</td>
                          <td>{formatDateTime(b.created_at)}</td>
                          <td className="num">{formatBytes(b.size)}</td>
                          <td className="row-actions">
                            <a className="btn" href={`/api/backup/files/${encodeURIComponent(b.name)}`}>Baixar</a>
                            <button className="btn" onClick={() => inspect({ name: b.name })}>Restaurar…</button>
                            <button className="btn icon ghost danger" onClick={() => remove(b)} aria-label="Excluir backup"><Icon name="trash" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <h2>Restaurar de um arquivo</h2>
              <p className="muted">Escolha um backup <code>.zip</code> deste sistema (por exemplo, guardado em outro computador).</p>
              <input ref={fileRef} type="file" accept=".zip" hidden onChange={onFile} />
              <div className="row"><button className="btn" onClick={() => fileRef.current.click()}><Icon name="upload" /> Escolher arquivo de backup</button></div>
            </section>

            {pending && (
              <section className="card restore-card">
                <h2>Restaurar: {pending.file?.name || pending.name}</h2>
                <dl className="facts">
                  <div><dt>Tipo</dt><dd>{TYPE_NAME[pending.manifest.type]}</dd></div>
                  <div><dt>Criado em</dt><dd>{formatDateTime(pending.manifest.created_at)}</dd></div>
                  <div><dt>Registros</dt><dd>{formatInt(pending.manifest.counts.records)}</dd></div>
                  {pending.manifest.type === 'full' && <>
                    <div><dt>Plantas / áreas</dt><dd>{pending.manifest.counts.maps} / {pending.manifest.counts.areas}</dd></div>
                    <div><dt>Campos / KPIs</dt><dd>{pending.manifest.counts.fields} / {pending.manifest.counts.kpis}</dd></div>
                    <div><dt>Usuários</dt><dd>{pending.manifest.includes_users ? `incluídos (${pending.manifest.counts.users})` : 'não incluídos'}</dd></div>
                  </>}
                </dl>
                {pending.manifest.type === 'data' && (
                  <div className="choice-list">
                    <label className={`choice ${mode === 'replace' ? 'on' : ''}`}>
                      <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                      <span><strong>Substituir</strong><small>Apaga os registros atuais e coloca os do backup.</small></span>
                    </label>
                    <label className={`choice ${mode === 'append' ? 'on' : ''}`}>
                      <input type="radio" name="mode" checked={mode === 'append'} onChange={() => setMode('append')} />
                      <span><strong>Acrescentar</strong><small>Mantém os atuais e adiciona só o que não existe ainda.</small></span>
                    </label>
                  </div>
                )}
                {pending.manifest.includes_users && (
                  <p className="notice">Este backup contém usuários: eles substituirão os atuais e você precisará entrar de novo com uma conta do backup.</p>
                )}
                <div className="row">
                  <button className="btn danger-solid" onClick={restore} disabled={busy}>{busy ? 'Restaurando…' : 'Restaurar agora'}</button>
                  <button className="btn" onClick={() => setPending(null)}>Cancelar</button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
