import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Shell from '../components/Shell.jsx';
import Icon from '../components/Icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';
import { formatInt } from '../format.js';

const TYPE_LABEL = { text: 'Texto', number: 'Número', date: 'Data/hora' };
const nrm = (s) => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const defaultFor = (c) => (c.suggestion ? { action: 'map', field: c.suggestion } : { action: 'new', label: c.name, type: c.type });

// Aplica um perfil salvo às colunas do arquivo atual (casando pelo NOME da coluna).
function applyProfile(preview, profile, fields) {
  const base = fields.filter((f) => !f.computed);
  const next = {};
  const fresh = [];
  let known = 0;
  for (const c of preview.columns) {
    const e = profile?.mapping.find((m) => nrm(m.header) === nrm(c.name));
    if (!e) { next[c.index] = defaultFor(c); if (profile) fresh.push(c.name); continue; }
    known++;
    if (e.action === 'ignore') next[c.index] = { action: 'ignore' };
    else if (e.action === 'map') next[c.index] = base.some((f) => f.key === e.field) ? { action: 'map', field: e.field } : defaultFor(c);
    else {
      const same = base.find((f) => nrm(f.label) === nrm(e.label)); // campo criado numa importação anterior
      next[c.index] = same ? { action: 'map', field: same.key } : { action: 'new', label: e.label, type: e.type };
    }
  }
  const missing = profile ? profile.mapping.filter((m) => m.action !== 'ignore' && !preview.columns.some((c) => nrm(c.name) === nrm(m.header))).map((m) => m.header) : [];
  return { next, known, fresh, missing };
}

const scoreProfile = (preview, profile) => {
  const names = new Set(profile.mapping.map((m) => nrm(m.header)));
  const hit = preview.columns.filter((c) => names.has(nrm(c.name))).length;
  return hit / Math.max(preview.columns.length, profile.mapping.length);
};

export default function ImportPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [fields, setFields] = useState([]);
  const [map, setMap] = useState({}); // índice da coluna -> { action, field, label, type }
  const [skipDup, setSkipDup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [profileId, setProfileId] = useState('');
  const [profileName, setProfileName] = useState('');
  const [info, setInfo] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const loadHistory = useCallback(() => api.listImports().then(setHistory).catch(() => {}), []);
  const loadProfiles = useCallback(() => api.listProfiles().then(setProfiles).catch(() => {}), []);
  useEffect(() => { loadHistory(); loadProfiles(); api.listFields().then(setFields).catch(() => {}); }, [loadHistory, loadProfiles]);

  const choose_profile = (p, current, chosen, auto) => {
    const r = applyProfile(p, chosen, fields);
    setMap(r.next);
    setPreview(p);
    setFile(current);
    setProfileId(chosen ? String(chosen.id) : '');
    setProfileName(chosen ? chosen.name : '');
    setInfo(chosen ? { name: chosen.name, auto, known: r.known, total: p.columns.length, fresh: r.fresh, missing: r.missing } : null);
    if (chosen) setSkipDup(chosen.options?.skipDuplicates !== false);
  };

  // ao abrir um arquivo: usa automaticamente o perfil que mais combina com as colunas
  const initMapping = (p, current, keepId) => {
    let chosen = keepId ? profiles.find((x) => String(x.id) === String(keepId)) : null;
    if (!chosen) {
      const best = profiles.map((x) => ({ x, s: scoreProfile(p, x) })).sort((u, v) => v.s - u.s)[0];
      if (best && best.s >= 0.6) chosen = best.x;
    }
    choose_profile(p, current, chosen, !keepId);
  };

  const changeProfile = (id) => choose_profile(preview, file, profiles.find((x) => String(x.id) === id) ?? null, false);

  const saveProfile = async () => {
    try {
      const mapping = preview.columns.map((c) => ({ header: c.name, ...map[c.index] }));
      const saved = await api.saveProfile({ name: profileName.trim(), mapping, options: { skipDuplicates: skipDup } });
      await loadProfiles();
      setProfileId(String(saved.id));
      setInfo({ name: saved.name, auto: false, known: preview.columns.length, total: preview.columns.length, fresh: [], missing: [], saved: true });
      toast(`Perfil “${saved.name}” salvo. Nos próximos arquivos ele será aplicado sozinho.`);
    } catch (err) { toast(err.message, 'error'); }
  };

  const deleteProfile = async () => {
    const p = profiles.find((x) => String(x.id) === profileId);
    if (!p) return;
    const ok = await confirm({
      title: 'Excluir perfil de importação',
      message: `Excluir o perfil “${p.name}”?`,
      confirmText: 'Excluir perfil',
      danger: true,
    });
    if (!ok) return;
    try { await api.deleteProfile(p.id); await loadProfiles(); choose_profile(preview, file, null, false); } catch (err) { toast(err.message, 'error'); }
  };

  const processFile = async (f) => {
    if (!f) return;
    if (!/\.(xlsx|xlsm)$/i.test(f.name)) {
      toast('Envie um arquivo Excel (.xlsx ou .xlsm).', 'warn');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      initMapping(await api.importPreview(f), f);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    processFile(f);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragOver) setDragOver(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) processFile(f);
  };

  const changeSheet = async (sheet) => {
    setBusy(true);
    try { initMapping(await api.importPreview(file, sheet), file, profileId); } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  const setCol = (i, patch) => setMap((m) => ({ ...m, [i]: { ...m[i], ...patch } }));
  const choose = (i, value) => {
    const c = preview.columns[i];
    if (value === '__ignore') setCol(i, { action: 'ignore' });
    else if (value === '__new') setCol(i, { action: 'new', label: c.name, type: c.type });
    else setCol(i, { action: 'map', field: value });
  };

  const importable = preview ? Object.values(map).filter((m) => m.action !== 'ignore').length : 0;

  const run = async () => {
    setBusy(true);
    try {
      const mapping = preview.columns.map((c) => ({ index: c.index, ...map[c.index] }));
      const r = await api.importConfirm(file, preview.sheet, mapping, skipDup);
      setResult(r);
      setPreview(null);
      setFile(null);
      loadHistory();
      api.listFields().then(setFields);
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  const undo = async (h) => {
    const ok = await confirm({
      title: 'Desfazer importação',
      message: `Desfazer a importação de "${h.filename}"? Os ${h.rows_imported} registros dela serão removidos (os campos criados permanecem).`,
      confirmText: 'Desfazer importação',
      danger: true,
    });
    if (!ok) return;
    try { await api.deleteImport(h.id); toast('Importação desfeita.'); loadHistory(); } catch (e) { toast(e.message, 'error'); }
  };

  const baseFields = fields.filter((f) => !f.computed);

  return (
    <Shell title="Importar Excel">
      <div className="page narrow">
        <section
          className={`card file-dropzone ${dragOver ? 'is-dragover' : ''}`}
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <h2>1. Escolha a planilha</h2>
          <p className="muted">
            A importação <strong>acrescenta</strong> as linhas aos registros existentes (nada é substituído).
            Arquivos <code>.xlsx</code>; a primeira linha deve conter os nomes das colunas.
          </p>
          <input ref={fileRef} type="file" hidden accept=".xlsx,.xlsm" onChange={onFile} />

          <div className="dropzone-area" onClick={() => fileRef.current.click()}>
            <div className="dropzone-icon">
              <Icon name="upload" size={32} />
            </div>
            <div className="dropzone-text">
              <strong>Arraste e solte o arquivo Excel (.xlsx) aqui</strong>
              <span className="muted">ou clique para selecionar do seu computador</span>
            </div>
            {busy && <div className="spinner" />}
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => fileRef.current.click()} disabled={busy}>
              <Icon name="upload" /> {busy ? 'Lendo…' : 'Escolher arquivo .xlsx'}
            </button>
            {file && <span className="muted" style={{ fontWeight: 600, color: '#38bdf8' }}>📄 {file.name}</span>}
          </div>
        </section>

        {result && (
          <section className="card result">
            <h2>Importação concluída</h2>
            <p>
              <strong>{formatInt(result.imported)}</strong> registros adicionados
              {result.skipped_duplicates > 0 && <>, {formatInt(result.skipped_duplicates)} repetidos ignorados</>}
              {result.skipped_empty > 0 && <>, {formatInt(result.skipped_empty)} linhas vazias ignoradas</>}.
            </p>
            {result.created_fields.length > 0 && (
              <p className="muted">Campos criados: {result.created_fields.join(', ')}. Ajuste tipos e papéis em “Campos e KPIs”.</p>
            )}
          </section>
        )}

        {preview && (
          <section className="card">
            <h2>2. Relacione as colunas</h2>
            <p className="muted">{formatInt(preview.row_count)} linhas encontradas. Cada coluna pode ir para um campo existente, virar um campo novo ou ser ignorada.</p>
            <div className="profile-bar">
              <label className="field inline">Perfil de importação
                <select value={profileId} onChange={(e) => changeProfile(e.target.value)}>
                  <option value="">Mapear manualmente</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              {info && (
                <p className={`notice ${info.fresh.length || info.missing.length ? '' : 'ok'}`}>
                  {info.saved ? <>Perfil <strong>{info.name}</strong> salvo.</> : <>Perfil <strong>{info.name}</strong> {info.auto ? 'aplicado automaticamente' : 'aplicado'}: {info.known} de {info.total} colunas reconhecidas.</>}
                  {info.fresh.length > 0 && <> Colunas novas neste arquivo (confira abaixo): {info.fresh.join(', ')}.</>}
                  {info.missing.length > 0 && <> Colunas do perfil que não vieram neste arquivo: {info.missing.join(', ')}.</>}
                </p>
              )}
            </div>
            {preview.sheets.length > 1 && (
              <label className="field inline">Aba
                <select value={preview.sheet} onChange={(e) => changeSheet(e.target.value)}>
                  {preview.sheets.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
            )}
            <details className="map-details" open={!info || info.fresh.length > 0 || info.missing.length > 0 || info.known < info.total}>
              <summary>Relacionamento das colunas</summary>
            <div className="table-wrap">
              <table className="table map-table">
                <thead><tr><th>Coluna do Excel</th><th>Exemplos</th><th>Destino</th></tr></thead>
                <tbody>
                  {preview.columns.map((c) => {
                    const m = map[c.index];
                    const value = m.action === 'map' ? m.field : m.action === 'new' ? '__new' : '__ignore';
                    return (
                      <tr key={c.index} className={m.action === 'ignore' ? 'dim' : ''}>
                        <td><strong>{c.name}</strong><br /><small className="muted">{TYPE_LABEL[c.type]}</small></td>
                        <td className="samples">{c.samples.join(' · ') || '—'}</td>
                        <td>
                          <select value={value} onChange={(e) => choose(c.index, e.target.value)} aria-label={`Destino de ${c.name}`}>
                            <option value="__ignore">Ignorar coluna</option>
                            <option value="__new">+ Criar campo novo</option>
                            {baseFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </select>
                          {m.action === 'new' && (
                            <div className="new-field">
                              <input value={m.label} onChange={(e) => setCol(c.index, { label: e.target.value })} aria-label="Nome do novo campo" />
                              <select value={m.type} onChange={(e) => setCol(c.index, { type: e.target.value })} aria-label="Tipo do novo campo">
                                {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                              </select>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </details>
            <div className="save-profile">
              <input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Nome do perfil (ex.: Bloqueios diários)" aria-label="Nome do perfil" />
              <button className="btn" onClick={saveProfile} disabled={!profileName.trim()}>
                {profiles.some((p) => nrm(p.name) === nrm(profileName)) ? 'Atualizar perfil' : 'Salvar como perfil'}
              </button>
              {profileId && <button className="btn danger" onClick={deleteProfile}>Excluir perfil</button>}
            </div>
            <label className="check">
              <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
              Ignorar linhas idênticas a registros que já existem (evita duplicar ao reimportar o mesmo arquivo)
            </label>
            <div className="row">
              <button className="btn primary" onClick={run} disabled={busy || importable === 0}>
                {busy ? 'Importando…' : `Importar ${formatInt(preview.row_count)} linhas`}
              </button>
              <button className="btn" onClick={() => { setPreview(null); setFile(null); }}>Cancelar</button>
            </div>
          </section>
        )}

        <section className="card">
          <h2>Histórico de importações</h2>
          {history.length === 0 ? <p className="muted">Nenhuma importação ainda.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Quando</th><th>Arquivo</th><th className="num">Adicionados</th><th className="num">Ignorados</th><th /></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>{new Date(h.created_at.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td>{h.filename}{h.sheet ? ` · ${h.sheet}` : ''}</td>
                      <td className="num">{formatInt(h.rows_imported)}</td>
                      <td className="num">{formatInt(h.rows_skipped)}</td>
                      <td className="row-actions"><button className="btn" onClick={() => undo(h)}>Desfazer</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}
