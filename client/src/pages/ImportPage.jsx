import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Shell from '../components/Shell.jsx';
import Icon from '../components/Icons.jsx';
import Modal from '../components/Modal.jsx';
import ExprInput from '../components/ExprInput.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';
import { formatInt, formatValue } from '../format.js';

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
  const [dedupMode, setDedupMode] = useState('auto'); // 'auto' | 'custom'
  const [dedupFields, setDedupFields] = useState([]); // [{ key, label }]
  const [dedupDropdownOpen, setDedupDropdownOpen] = useState(false);
  const dedupDropdownRef = useRef(null);
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [filterExpr, setFilterExpr] = useState('');
  const [conflictModal, setConflictModal] = useState(null); // { conflicts, summary }
  const [resolutions, setResolutions] = useState({});
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
  useEffect(() => {
    loadHistory();
    loadProfiles();
    api.listFields().then(setFields).catch(() => {});
    api.getDedupConfig().then((cfg) => {
      if (cfg) {
        setDedupMode(cfg.mode === 'custom' ? 'custom' : 'auto');
        setDedupFields(Array.isArray(cfg.fields) ? cfg.fields : []);
      }
    }).catch(() => {});
  }, [loadHistory, loadProfiles]);

  useEffect(() => {
    if (!dedupDropdownOpen) return;
    const onDown = (e) => {
      if (dedupDropdownRef.current && !dedupDropdownRef.current.contains(e.target)) {
        setDedupDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [dedupDropdownOpen]);

  const baseFields = useMemo(() => fields.filter((f) => !f.computed), [fields]);

  const excelExprFields = useMemo(() => {
    if (!preview) return [];
    return preview.columns.map((c) => ({ key: String(c.index), label: c.name, type: c.type }));
  }, [preview]);

  const activeColumns = useMemo(() => {
    if (!preview) return [];
    const seenKeys = new Set();
    const list = [];
    for (const c of preview.columns) {
      const m = map[c.index];
      if (!m || m.action === 'ignore') continue;
      const key = m.action === 'map' ? m.field : `new:${nrm(m.label || c.name)}`;
      const label = m.action === 'map'
        ? (baseFields.find((f) => f.key === m.field)?.label || c.name)
        : (m.label || c.name);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        list.push({ key, label, index: c.index });
      }
    }
    return list;
  }, [preview, map, baseFields]);

  const selectedActiveDedup = useMemo(() => {
    return dedupFields.filter((df) =>
      activeColumns.some((c) => c.key === df.key || nrm(c.label) === nrm(df.label))
    ).map((df) => {
      const match = activeColumns.find((c) => c.key === df.key || nrm(c.label) === nrm(df.label));
      return match ? { key: match.key, label: match.label } : df;
    });
  }, [dedupFields, activeColumns]);

  const persistDedup = useCallback((nextMode, nextFields) => {
    api.saveDedupConfig({ mode: nextMode, fields: nextFields }).catch((err) => toast(err.message, 'error'));
  }, [toast]);

  const pruneIgnoredFromDedup = useCallback((nextMap, p) => {
    if (!p) return;
    const activeKeys = new Set();
    const activeLabels = new Set();
    for (const c of p.columns) {
      const m = nextMap[c.index];
      if (!m || m.action === 'ignore') continue;
      const key = m.action === 'map' ? m.field : `new:${nrm(m.label || c.name)}`;
      const label = m.action === 'map'
        ? (baseFields.find((f) => f.key === m.field)?.label || c.name)
        : (m.label || c.name);
      activeKeys.add(key);
      activeLabels.add(nrm(label));
    }
    setDedupFields((prev) => {
      const filtered = prev.filter((df) => activeKeys.has(df.key) || activeLabels.has(nrm(df.label)));
      if (filtered.length !== prev.length) {
        persistDedup(dedupMode, filtered);
      }
      return filtered;
    });
  }, [baseFields, dedupMode, persistDedup]);

  const choose_profile = (p, current, chosen, auto) => {
    const r = applyProfile(p, chosen, fields);
    setMap(r.next);
    setPreview(p);
    setFile(current);
    setProfileId(chosen ? String(chosen.id) : '');
    setProfileName(chosen ? chosen.name : '');
    setInfo(chosen ? { name: chosen.name, auto, known: r.known, total: p.columns.length, fresh: r.fresh, missing: r.missing } : null);
    if (chosen) setSkipDup(chosen.options?.skipDuplicates !== false);
    pruneIgnoredFromDedup(r.next, p);
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
    const patch = value === '__ignore'
      ? { action: 'ignore' }
      : value === '__new'
        ? { action: 'new', label: c.name, type: c.type }
        : { action: 'map', field: value };
    const nextMap = { ...map, [i]: { ...map[i], ...patch } };
    setMap(nextMap);
    if (value === '__ignore') {
      pruneIgnoredFromDedup(nextMap, preview);
    }
  };

  const handleDedupModeChange = (mode) => {
    setDedupMode(mode);
    if (mode !== 'custom') setDedupDropdownOpen(false);
    persistDedup(mode, dedupFields);
  };

  const toggleDedupField = (col) => {
    const exists = dedupFields.some((f) => f.key === col.key || nrm(f.label) === nrm(col.label));
    const next = exists
      ? dedupFields.filter((f) => f.key !== col.key && nrm(f.label) !== nrm(col.label))
      : [...dedupFields, { key: col.key, label: col.label }];
    setDedupFields(next);
    persistDedup(dedupMode, next);
  };

  const removeDedupField = (e, item) => {
    e.stopPropagation();
    const next = dedupFields.filter((f) => f.key !== item.key && nrm(f.label) !== nrm(item.label));
    setDedupFields(next);
    persistDedup(dedupMode, next);
  };

  const importable = preview ? Object.values(map).filter((m) => m.action !== 'ignore').length : 0;

  const run = async (resolutionsOverride = null) => {
    setBusy(true);
    try {
      const mapping = preview.columns.map((c) => ({ index: c.index, ...map[c.index] }));
      const r = await api.importConfirm(
        file,
        preview.sheet,
        mapping,
        skipDup,
        dedupMode,
        selectedActiveDedup,
        filterEnabled ? filterExpr : '',
        resolutionsOverride
      );
      if (r.needs_resolution) {
        const initRes = {};
        for (const cf of r.conflicts) initRes[String(cf.rowNumber)] = 'keep_existing';
        setResolutions(initRes);
        setConflictModal({ conflicts: r.conflicts, summary: r.summary });
        return;
      }
      setConflictModal(null);
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
              {result.updated > 0 && <>, <strong>{formatInt(result.updated)}</strong> atualizados</>}
              {result.skipped_duplicates > 0 && <>, {formatInt(result.skipped_duplicates)} repetidos ignorados</>}
              {result.filtered_out > 0 && <>, {formatInt(result.filtered_out)} filtrados fora</>}
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
            <div className="import-filter-section">
              <label className="check">
                <input type="checkbox" checked={filterEnabled} onChange={(e) => setFilterEnabled(e.target.checked)} />
                Filtrar dados da planilha por condição (expressão)
              </label>
              {filterEnabled && (
                <div className="import-filter-box">
                  <ExprInput
                    value={filterExpr}
                    onChange={setFilterExpr}
                    fields={excelExprFields}
                    liveTest={false}
                    placeholder={'Ex.: [status] == "Concluída"'}
                    rows={2}
                  />
                  <small className="muted">
                    Use os nomes das colunas da planilha entre colchetes. Linhas com resultado falso serão descartadas antes da verificação de duplicação.
                  </small>
                </div>
              )}
            </div>
            <div className="dedup-section">
              <label className="check">
                <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
                Ignorar linhas idênticas a registros que já existem (evita duplicar ao reimportar o mesmo arquivo)
              </label>

              {skipDup && (
                <div className="dedup-controls">
                  <div className="seg dedup-toggle" role="group" aria-label="Modo de detecção de duplicação">
                    <button
                      type="button"
                      className={`btn ${dedupMode === 'auto' ? 'active' : ''}`}
                      onClick={() => handleDedupModeChange('auto')}
                    >
                      Detectar duplicação automaticamente
                    </button>
                    <button
                      type="button"
                      className={`btn ${dedupMode === 'custom' ? 'active' : ''}`}
                      onClick={() => handleDedupModeChange('custom')}
                    >
                      Ajustar verificação de duplicação
                    </button>
                  </div>

                  {dedupMode === 'custom' && (
                    <div className="dedup-multi-wrap" ref={dedupDropdownRef}>
                      <div
                        className={`dedup-multi-trigger ${dedupDropdownOpen ? 'is-open' : ''}`}
                        onClick={() => setDedupDropdownOpen((o) => !o)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setDedupDropdownOpen((o) => !o);
                          }
                        }}
                      >
                        <div className="dedup-chips">
                          {selectedActiveDedup.length === 0 ? (
                            <span className="muted">Selecione as colunas que identificam um registro único…</span>
                          ) : (
                            selectedActiveDedup.map((item) => (
                              <span key={item.key} className="dedup-chip">
                                <span>{item.label}</span>
                                <button
                                  type="button"
                                  className="dedup-chip-x"
                                  onClick={(e) => removeDedupField(e, item)}
                                  title={`Remover ${item.label}`}
                                  aria-label={`Remover ${item.label}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))
                          )}
                        </div>
                        <Icon name={dedupDropdownOpen ? 'chevronUp' : 'chevronDown'} size={16} />
                      </div>

                      {dedupDropdownOpen && (
                        <div className="dedup-multi-menu">
                          {activeColumns.length === 0 ? (
                            <div className="dedup-menu-empty muted">Nenhuma coluna ativa (todas estão ignoradas).</div>
                          ) : (
                            activeColumns.map((col) => {
                              const checked = dedupFields.some((f) => f.key === col.key || nrm(f.label) === nrm(col.label));
                              return (
                                <label key={col.key} className={`dedup-menu-item ${checked ? 'is-selected' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleDedupField(col)}
                                  />
                                  <span>{col.label}</span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="row">
              <button className="btn primary" onClick={() => run(null)} disabled={busy || importable === 0}>
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

      {conflictModal && (
        <Modal
          title={`Resolver duplicações com diferenças (${conflictModal.conflicts.length})`}
          onClose={() => !busy && setConflictModal(null)}
        >
          <div className="conflict-modal-body">
            <p className="muted" style={{ margin: 0 }}>
              Foram encontradas <strong>{conflictModal.conflicts.length}</strong> linha(s) que já existem no sistema pelos campos de identificação, mas possuem alterações em outras colunas. Escolha qual versão deseja manter para cada registro:
            </p>
            <div className="conflict-summary-bar">
              <span>Novos: <strong>{formatInt(conflictModal.summary.new_records)}</strong></span>
              <span>Idênticos (ignorados): <strong>{formatInt(conflictModal.summary.exact_duplicates)}</strong></span>
              {conflictModal.summary.filtered_out > 0 && (
                <span>Filtrados fora: <strong>{formatInt(conflictModal.summary.filtered_out)}</strong></span>
              )}
              <div className="spacer" />
              <button
                type="button"
                className="btn small-btn"
                onClick={() => {
                  const next = {};
                  conflictModal.conflicts.forEach((c) => { next[String(c.rowNumber)] = 'keep_existing'; });
                  setResolutions(next);
                }}
              >
                Manter existentes em todos
              </button>
              <button
                type="button"
                className="btn small-btn"
                onClick={() => {
                  const next = {};
                  conflictModal.conflicts.forEach((c) => { next[String(c.rowNumber)] = 'use_new'; });
                  setResolutions(next);
                }}
              >
                Usar novas versões em todos
              </button>
            </div>

            <div className="conflict-list">
              {conflictModal.conflicts.map((cf) => {
                const choice = resolutions[String(cf.rowNumber)] || 'keep_existing';
                return (
                  <div key={cf.rowNumber} className="conflict-card">
                    <div className="conflict-card-head">
                      <div>
                        <span className="badge off">Linha {cf.rowNumber}</span>
                        <strong style={{ marginLeft: 8 }}>{cf.keySummary}</strong>
                      </div>
                      <div className="seg" role="group">
                        <button
                          type="button"
                          className={`btn small-btn ${choice === 'keep_existing' ? 'active' : ''}`}
                          onClick={() => setResolutions((r) => ({ ...r, [String(cf.rowNumber)]: 'keep_existing' }))}
                        >
                          Manter existente
                        </button>
                        <button
                          type="button"
                          className={`btn small-btn ${choice === 'use_new' ? 'active' : ''}`}
                          onClick={() => setResolutions((r) => ({ ...r, [String(cf.rowNumber)]: 'use_new' }))}
                        >
                          Usar nova versão
                        </button>
                      </div>
                    </div>
                    <table className="table conflict-diff-table">
                      <thead>
                        <tr>
                          <th>Campo alterado</th>
                          <th>Existente no sistema</th>
                          <th>Nova (planilha)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cf.diffs.map((d) => (
                          <tr key={d.key}>
                            <td><strong>{d.label}</strong></td>
                            <td className={choice === 'keep_existing' ? 'diff-chosen' : 'diff-old'}>
                              {formatValue(d.type, d.existing, d.key)}
                            </td>
                            <td className={choice === 'use_new' ? 'diff-chosen' : 'diff-new'}>
                              {formatValue(d.type, d.incoming, d.key)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>

            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setConflictModal(null)} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className="btn primary" onClick={() => run(resolutions)} disabled={busy}>
                {busy ? 'Aplicando…' : 'Confirmar e concluir importação'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Shell>
  );
}
