import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Shell from '../components/Shell.jsx';
import Modal from '../components/Modal.jsx';
import Lightbox from '../components/Lightbox.jsx';
import Icon from '../components/Icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../components/Auth.jsx';
import { formatDateTime, formatInt, formatValue, nowInput, parsePhotoUrls, toInputDate } from '../format.js';

export default function Records() {
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can('operator');
  const [fields, setFields] = useState([]);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [lightbox, setLightbox] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState({ key: 'id', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editing, setEditing] = useState(null); // { id|null, values }
  const [history, setHistory] = useState(null); // registro (ou 'recent')
  const size = 25;

  useEffect(() => { api.listFields().then(setFields).catch((e) => toast(e.message, 'error')); }, [toast]);

  const load = useCallback(() => {
    api.listRecords({ q, status, sort: sort.key, dir: sort.dir, page, size })
      .then(setData).catch((e) => toast(e.message, 'error'));
  }, [q, status, sort, page, toast]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [q, status, sort]);

  const cols = fields.filter((f) => f.visible);
  const unlockKey = fields.find((f) => f.role === 'unlocked_at' && !f.computed)?.key;
  const pages = Math.max(1, Math.ceil(data.total / size));

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (data.rows.length === 0) return;
    const allSelected = data.rows.every((r) => selectedIds.has(r.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.rows.map((r) => r.id)));
    }
  };

  const removeSelected = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!window.confirm(`Excluir ${count} ${count === 1 ? 'registro' : 'registros'}? Essa ação não pode ser desfeita.`)) return;
    try {
      await api.deleteRecords([...selectedIds]);
      toast(`${count} ${count === 1 ? 'registro excluído' : 'registros excluídos'}.`);
      setSelectedIds(new Set());
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const unlockNow = async (row) => {
    try {
      const values = { ...row.values, [unlockKey]: nowInput() };
      await api.updateRecord(row.id, values);
      toast('Desbloqueio registrado.');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const remove = async (row) => {
    if (!window.confirm('Excluir este registro? Essa ação não pode ser desfeita.')) return;
    try { await api.deleteRecord(row.id); load(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <Shell title="Registros de bloqueio" actions={<>
      <button className="btn" onClick={() => setHistory('recent')}><Icon name="clock" /> Alterações recentes</button>
      {canEdit && <button className="btn primary" onClick={() => setEditing({ id: null, values: {} })}><Icon name="plus" /> Novo registro</button>}
    </>}>
      <div className="page">
        <div className="filters">
          <input type="search" placeholder="Buscar em todas as colunas…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
          <div className="seg">
            {[['all', 'Todos'], ['active', 'Ativos'], ['closed', 'Encerrados']].map(([v, l]) => (
              <button key={v} className={`btn ${status === v ? 'active' : ''}`} onClick={() => setStatus(v)}>{l}</button>
            ))}
          </div>
          <span className="muted">{formatInt(data.total)} registros</span>
        </div>

        {selectedIds.size > 0 && (
          <div className="row" style={{ alignItems: 'center', background: '#fff5f2', padding: '10px 14px', borderRadius: 8, border: '1px solid #f2cfc7' }}>
            <strong>{selectedIds.size} {selectedIds.size === 1 ? 'registro selecionado' : 'registros selecionados'}</strong>
            <span className="muted">(seleção múltipla: apenas exclusão permitida)</span>
            <div className="spacer" />
            <button className="btn danger" onClick={removeSelected} disabled={!canEdit}>
              <Icon name="trash" /> Excluir {selectedIds.size === 1 ? 'selecionado' : 'selecionados'}
            </button>
            <button className="btn ghost" onClick={() => setSelectedIds(new Set())}>Cancelar seleção</button>
          </div>
        )}

        <div className="table-wrap tall">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: 'center' }}>
                  <input type="checkbox" aria-label="Selecionar todos da página" checked={data.rows.length > 0 && data.rows.every((r) => selectedIds.has(r.id))} onChange={toggleAll} />
                </th>
                <th>Estado</th>
                {cols.map((f) => (
                  <th key={f.key} className={f.type === 'number' ? 'num' : ''}>
                    <button className="th-btn" onClick={() => toggleSort(f.key)}>
                      {f.label}{f.computed ? ' ƒ' : ''}
                      {sort.key === f.key && <span aria-hidden="true">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                    </button>
                  </th>
                ))}
                <th>Lançado por</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" aria-label={`Selecionar registro ${r.id}`} checked={selectedIds.has(r.id)} onChange={() => toggleOne(r.id)} />
                  </td>
                  <td><span className={`badge ${r.active ? 'on' : 'off'}`}>{r.active ? 'Ativo' : 'Encerrado'}</span></td>
                  {cols.map((f) => {
                    const val = r.values[f.key];
                    const isPhoto = f.type === 'photo';
                    const urls = isPhoto ? parsePhotoUrls(val) : [];
                    return (
                      <td key={f.key} className={f.type === 'number' ? 'num' : ''}>
                        {isPhoto ? (
                          urls.length > 0 ? (
                            <button
                              type="button"
                              className="photo-link-btn"
                              onClick={() => setLightbox({ title: f.label, urls })}
                              title={`Ver ${urls.length === 1 ? '1 foto anexada' : `${urls.length} fotos anexadas`}`}
                            >
                              <Icon name="image" size={14} />
                              <span>{urls.length === 1 ? '1 anexo' : `${urls.length} anexos`}</span>
                            </button>
                          ) : (
                            '—'
                          )
                        ) : (
                          formatValue(f.type, val, f.key)
                        )}
                      </td>
                    );
                  })}
                  <td>{r.updated_by || r.created_by || '—'}</td>
                  <td className="row-actions">
                    {selectedIds.size > 1 ? (
                      canEdit && (
                        <button className="btn icon ghost danger" onClick={() => remove(r)} aria-label="Excluir" title="Excluir registro"><Icon name="trash" /></button>
                      )
                    ) : (
                      <>
                        <button className="btn icon ghost" onClick={() => setHistory(r)} aria-label="Histórico de alterações" title="Histórico de alterações"><Icon name="clock" /></button>
                        {canEdit && r.active && unlockKey && (
                          <button className="btn" onClick={() => unlockNow(r)} title="Registrar desbloqueio agora"><Icon name="unlock" /> Desbloquear</button>
                        )}
                        {canEdit && <button className="btn icon ghost" onClick={() => setEditing({ id: r.id, values: r.values })} aria-label="Editar"><Icon name="edit" /></button>}
                        {canEdit && <button className="btn icon ghost danger" onClick={() => remove(r)} aria-label="Excluir"><Icon name="trash" /></button>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={cols.length + 4} className="empty-cell">Nenhum registro. Importe uma planilha ou crie um registro manualmente.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
          <span>Página {page} de {pages}</span>
          <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</button>
        </div>
      </div>

      {history && <HistoryModal target={history} onClose={() => setHistory(null)} />}

      {editing && (
        <RecordForm fields={fields.filter((f) => !f.computed)} initial={editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}

      {lightbox && (
        <Lightbox
          title={lightbox.title}
          urls={lightbox.urls}
          onClose={() => setLightbox(null)}
        />
      )}
    </Shell>
  );
}

function RecordForm({ fields, initial, onClose, onSaved }) {
  const toast = useToast();
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => {
    const v = initial.values[f.key];
    return [f.key, v == null ? '' : f.type === 'date' ? toInputDate(v) : v];
  })));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (initial.id) await api.updateRecord(initial.id, values);
      else await api.createRecord(values);
      toast('Registro salvo.');
      onSaved();
    } catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <Modal title={initial.id ? 'Editar registro' : 'Novo registro'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button></>}>
      <div className="form-grid">
        {fields.map((f) => (
          <label key={f.key} className="field">{f.label}
            <input
              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'datetime-local' : f.type === 'photo' ? 'url' : 'text'}
              placeholder={f.type === 'photo' ? 'https://exemplo.com/foto.jpg' : undefined}
              step={f.type === 'number' ? 'any' : undefined}
              value={values[f.key]}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </Modal>
  );
}

const ACTION = {
  create: ['Criado', 'on'], update: ['Editado', 'warn'], unlock: ['Desbloqueio registrado', 'off'],
  delete: ['Excluído', 'on'], import: ['Importado', 'off'],
};

function ChangeList({ changes }) {
  if (!changes.length) return null;
  return (
    <ul className="changes">
      {changes.map((c, i) => (
        <li key={i}>
          <span className="ch-field">{c.l}</span>
          {'from' in c && c.from != null && c.from !== '' && <del>{String(c.from)}</del>}
          {'to' in c && <ins>{c.to == null || c.to === '' ? '(vazio)' : String(c.to)}</ins>}
        </li>
      ))}
    </ul>
  );
}

// Histórico de alterações de um registro, ou feed das últimas alterações (inclui exclusões).
function HistoryModal({ target, onClose }) {
  const toast = useToast();
  const recent = target === 'recent';
  const [list, setList] = useState(null);
  useEffect(() => {
    (recent ? api.recentHistory() : api.recordHistory(target.id)).then(setList).catch((e) => toast(e.message, 'error'));
  }, [recent, target, toast]);

  return (
    <Modal title={recent ? 'Alterações recentes' : `Histórico do registro #${target.id}`} onClose={onClose}>
      {!list ? <div className="spinner" /> : list.length === 0 ? <p className="muted">Nenhuma alteração registrada.</p> : (
        <ol className="history-list">
          {list.map((h, i) => {
            const [label, tone] = ACTION[h.action] ?? [h.action, 'off'];
            return (
              <li key={`${h.id}-${i}`}>
                <div className="hl-head">
                  <span className={`badge ${tone}`}>{label}</span>
                  <strong>{h.user_name || 'sistema'}</strong>
                  <span className="muted">{formatDateTime(h.at)}</span>
                </div>
                {(recent || h.action === 'import') && h.summary && <p className="hl-summary">{recent ? `#${h.record_id} · ` : ''}{h.summary}</p>}
                {h.action !== 'delete' || !recent ? <ChangeList changes={h.changes} /> : null}
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}
