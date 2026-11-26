import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Shell from '../components/Shell.jsx';
import Modal from '../components/Modal.jsx';
import Lightbox from '../components/Lightbox.jsx';
import Icon from '../components/Icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';
import { useAuth } from '../components/Auth.jsx';
import { useTranslation } from '../i18n/I18nContext.jsx';
import { dynamicFieldKey, dynamicRecordKey } from '../i18n/keys.js';
import { formatDateTime, formatInt, formatValue, nowInput, parsePhotoUrls, toInputDate } from '../format.js';

export default function Records() {
  const toast = useToast();
  const confirm = useConfirm();
  const { t, td } = useTranslation();
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
    const ok = await confirm({
      title: t('records.delete_multi_title', 'Excluir registros'),
      message: t('records.delete_multi_msg', { count }) || `Excluir ${count} registros selecionados? Essa ação não pode ser desfeita.`,
      confirmText: t('records.delete_selected', 'Excluir selecionados'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteRecords([...selectedIds]);
      toast(t('records.deleted_multi_success', { count }) || `${count} registros excluídos.`);
      setSelectedIds(new Set());
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const unlockNow = async (row) => {
    try {
      const values = { ...row.values, [unlockKey]: nowInput() };
      await api.updateRecord(row.id, values);
      toast(t('records.unlocked_success', 'Desbloqueio registrado.'));
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const remove = async (row) => {
    const ok = await confirm({
      title: t('records.delete_single_title', 'Excluir registro'),
      message: t('records.delete_single_msg', 'Excluir este registro de bloqueio? Essa ação não pode ser desfeita.'),
      confirmText: t('common.delete', 'Excluir'),
      danger: true,
    });
    if (!ok) return;
    try { await api.deleteRecord(row.id); toast(t('records.deleted_success', 'Registro excluído.')); load(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <Shell title={t('records.title', 'Registros de bloqueio')} actions={<>
      <button className="btn" onClick={() => setHistory('recent')}><Icon name="clock" /> {t('records.recent_changes', 'Alterações recentes')}</button>
      {canEdit && <button className="btn primary" onClick={() => setEditing({ id: null, values: {} })}><Icon name="plus" /> {t('records.new_record', 'Novo registro')}</button>}
    </>}>
      <div className="page">
        <div className="filters">
          <input type="search" placeholder={t('records.search_placeholder', 'Buscar em todas as colunas…')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search', 'Buscar')} />
          <div className="seg">
            {[['all', t('records.filter_all', 'Todos')], ['active', t('records.filter_active', 'Ativos')], ['closed', t('records.filter_closed', 'Encerrados')]].map(([v, l]) => (
              <button key={v} className={`btn ${status === v ? 'active' : ''}`} onClick={() => setStatus(v)}>{l}</button>
            ))}
          </div>
          <span className="muted">{t('records.count_records', { count: formatInt(data.total) })}</span>
        </div>

        {selectedIds.size > 0 && (
          <div className="row" style={{ alignItems: 'center', background: '#fff5f2', padding: '10px 14px', borderRadius: 8, border: '1px solid #f2cfc7' }}>
            <strong>{selectedIds.size === 1 ? t('records.selected_single', '1 registro selecionado') : t('records.selected_plural', { count: selectedIds.size })}</strong>
            <span className="muted">{t('records.multi_select_delete_only', '(seleção múltipla: apenas exclusão permitida)')}</span>
            <div className="spacer" />
            <button className="btn danger" onClick={removeSelected} disabled={!canEdit}>
              <Icon name="trash" /> {t('records.delete_selected', 'Excluir selecionados')}
            </button>
            <button className="btn ghost" onClick={() => setSelectedIds(new Set())}>{t('records.cancel_selection', 'Cancelar seleção')}</button>
          </div>
        )}

        <div className="table-wrap tall">
          <table className="table records-table">
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: 'center' }}>
                  <input type="checkbox" aria-label="Selecionar todos da página" checked={data.rows.length > 0 && data.rows.every((r) => selectedIds.has(r.id))} onChange={toggleAll} />
                </th>
                <th>{t('records.col_status', 'Estado')}</th>
                {cols.map((f) => (
                  <th key={f.key} className={f.type === 'number' ? 'num' : ''}>
                    <button className="th-btn" onClick={() => toggleSort(f.key)}>
                      {td(dynamicFieldKey(f.key, f.label), f.label)}{f.computed ? ' ƒ' : ''}
                      {sort.key === f.key && <span aria-hidden="true">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                    </button>
                  </th>
                ))}
                <th>{t('records.col_logged_by', 'Lançado por')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" aria-label={`Selecionar registro ${r.id}`} checked={selectedIds.has(r.id)} onChange={() => toggleOne(r.id)} />
                  </td>
                  <td><span className={`badge ${r.active ? 'on' : 'off'}`}>{r.active ? t('common.active', 'Ativo') : t('common.closed', 'Encerrado')}</span></td>
                  {cols.map((f) => {
                    const val = r.values[f.key];
                    const isPhoto = f.type === 'photo';
                    const urls = isPhoto ? parsePhotoUrls(val) : [];
                    const rawDisplayVal = formatValue(f.type, val, f.key);
                    const displayVal = f.type === 'text' && val != null
                      ? td(dynamicRecordKey(f.key, val), rawDisplayVal)
                      : rawDisplayVal;
                    const titleText = !isPhoto && displayVal && displayVal !== '—' ? String(displayVal) : undefined;
                    return (
                      <td key={f.key} className={f.type === 'number' ? 'num' : ''} title={titleText}>
                        {isPhoto ? (
                          urls.length > 0 ? (
                            <button
                              type="button"
                              className="photo-link-btn"
                              onClick={() => setLightbox({ title: td(dynamicFieldKey(f.key, f.label), f.label), urls })}
                              title={`Ver ${urls.length === 1 ? '1 foto anexada' : `${urls.length} fotos anexadas`}`}
                            >
                              <Icon name="image" size={14} />
                              <span>{urls.length === 1 ? t('common.photo_single', '1 anexo') : t('common.photo_plural', { count: urls.length })}</span>
                            </button>
                          ) : (
                            '—'
                          )
                        ) : (
                          <span className="cell-truncate">{displayVal}</span>
                        )}
                      </td>
                    );
                  })}
                  <td title={r.updated_by || r.created_by || undefined}>
                    <span className="cell-truncate">{r.updated_by || r.created_by || '—'}</span>
                  </td>
                  <td className="row-actions">
                    {selectedIds.size > 1 ? (
                      canEdit && (
                        <button className="btn icon ghost danger" onClick={() => remove(r)} aria-label={t('common.delete', 'Excluir')} title={t('records.delete_single_title', 'Excluir registro')}><Icon name="trash" /></button>
                      )
                    ) : (
                      <>
                        <button className="btn icon ghost" onClick={() => setHistory(r)} aria-label={t('records.recent_changes', 'Histórico de alterações')} title={t('records.recent_changes', 'Histórico de alterações')}><Icon name="clock" /></button>
                        {canEdit && r.active && unlockKey && (
                          <button className="btn" onClick={() => unlockNow(r)} title={t('records.unlock_tooltip', 'Registrar desbloqueio agora')}><Icon name="unlock" /> {t('records.unlock_now', 'Desbloquear')}</button>
                        )}
                        {canEdit && <button className="btn icon ghost" onClick={() => setEditing({ id: r.id, values: r.values })} aria-label={t('common.edit', 'Editar')}><Icon name="edit" /></button>}
                        {canEdit && <button className="btn icon ghost danger" onClick={() => remove(r)} aria-label={t('common.delete', 'Excluir')}><Icon name="trash" /></button>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={cols.length + 4} className="empty-cell">{t('records.empty_list', 'Nenhum registro. Importe uma planilha ou crie um registro manualmente.')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('common.previous', 'Anterior')}</button>
          <span>{t('common.page_of', { page, pages })}</span>
          <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t('common.next', 'Próxima')}</button>
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
  const { t, td } = useTranslation();
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
      toast(t('records.saved_success', 'Registro salvo.'));
      onSaved();
    } catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <Modal title={initial.id ? t('records.edit_record', 'Editar registro') : t('records.new_record', 'Novo registro')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('common.cancel', 'Cancelar')}</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? t('common.saving', 'Salvando…') : t('common.save', 'Salvar')}</button></>}>
      <div className="form-grid">
        {fields.map((f) => (
          <label key={f.key} className="field">{td(dynamicFieldKey(f.key, f.label), f.label)}
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
  const { td } = useTranslation();
  if (!changes.length) return null;
  return (
    <ul className="changes">
      {changes.map((c, i) => (
        <li key={i}>
          <span className="ch-field">{td(dynamicFieldKey(c.k, c.l), c.l)}</span>
          {'from' in c && c.from != null && c.from !== '' && <del>{td(dynamicRecordKey(c.k, c.from), String(c.from))}</del>}
          {'to' in c && <ins>{c.to == null || c.to === '' ? '(vazio)' : td(dynamicRecordKey(c.k, c.to), String(c.to))}</ins>}
        </li>
      ))}
    </ul>
  );
}

// Histórico de alterações de um registro, ou feed das últimas alterações (inclui exclusões).
function HistoryModal({ target, onClose }) {
  const toast = useToast();
  const { t } = useTranslation();
  const recent = target === 'recent';
  const [list, setList] = useState(null);
  useEffect(() => {
    (recent ? api.recentHistory() : api.recordHistory(target.id)).then(setList).catch((e) => toast(e.message, 'error'));
  }, [recent, target, toast]);

  const actionLabels = {
    create: [t('records.action_created', 'Criado'), 'on'],
    update: [t('records.action_updated', 'Editado'), 'warn'],
    unlock: [t('records.action_unlocked', 'Desbloqueio registrado'), 'off'],
    delete: [t('records.action_deleted', 'Excluído'), 'on'],
    import: [t('records.action_imported', 'Importado'), 'off'],
  };

  return (
    <Modal title={recent ? t('records.recent_changes', 'Alterações recentes') : t('records.history_title', { id: target.id })} onClose={onClose}>
      {!list ? <div className="spinner" /> : list.length === 0 ? <p className="muted">{t('records.history_empty', 'Nenhuma alteração registrada.')}</p> : (
        <ol className="history-list">
          {list.map((h, i) => {
            const [label, tone] = actionLabels[h.action] ?? [h.action, 'off'];
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
