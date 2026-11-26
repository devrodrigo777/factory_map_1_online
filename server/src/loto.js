// Rotas de LOTO: campos, registros, importação de Excel, KPIs, estatísticas e cadeados nas áreas.
import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import crypto from 'node:crypto';
import { db, getSetting, setSetting } from './db.js';
import { buildCtx, coerce, getConfig, hashValues, normDate, validateExpr } from './core.js';
import { activeRecords, getStore, hoursOf, invalidate, isActive, memo, recordOut, removeRecord, sortedAll, ttlFor, upsertRecord, valueOf, valuesFor, computedOf } from './store.js';
import { equipmentAnalysis } from './analytics.js';
import { Readable } from 'node:stream';
import { compile, isEmpty, norm, toTime } from './expr.js';

export const router = Router();

// qualquer alteração em campos ou na definição de "ativo" invalida o cache de registros
router.use(['/fields', '/settings'], (req, res, next) => {
  if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) invalidate(); });
  next();
});
const httpError = (status, message) => Object.assign(new Error(message), { status });
// Express 4 não captura erros de funções async sozinho
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const ROLES = ['locked_by', 'locked_at', 'unlocked_at', 'sector', 'equipment'];
const TYPES = ['text', 'number', 'date', 'photo'];

// ---------- campos ----------
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'campo';
function uniqueKey(label) {
  const base = slug(label);
  const has = db.prepare('SELECT 1 FROM fields WHERE key = ?');
  let key = base, n = 2;
  while (key === 'ativo' || has.get(key)) key = `${base}_${n++}`;
  return key;
}

// Ao renomear um campo, reescreve as expressões que o citam pelo nome antigo.
function rewriteRefs(oldLabel, key, newLabel) {
  const swap = (src) => String(src ?? '').replace(/\[([^\]]+)\]/g, (m, name) =>
    norm(name) === norm(oldLabel) || norm(name) === norm(key) ? `[${newLabel}]` : m);
  db.transaction(() => {
    for (const f of db.prepare("SELECT id, expr FROM fields WHERE expr != ''").all())
      db.prepare('UPDATE fields SET expr = ? WHERE id = ?').run(swap(f.expr), f.id);
    for (const a of db.prepare("SELECT id, lock_filter FROM areas WHERE lock_filter != ''").all())
      db.prepare('UPDATE areas SET lock_filter = ? WHERE id = ?').run(swap(a.lock_filter), a.id);
    for (const k of db.prepare('SELECT id, expr FROM kpis').all())
      db.prepare('UPDATE kpis SET expr = ? WHERE id = ?').run(swap(k.expr), k.id);
    const act = getSetting('active_expr');
    if (act) setSetting('active_expr', swap(act));
  })();
}

const fieldOut = (f, ctx) => ({
  ...f,
  visible: !!f.visible,
  computed: !!f.expr,
  error: f.expr ? ctx.computed.find((c) => c.f.id === f.id)?.error ?? null : null,
});

function cleanFieldInput(b, current = {}) {
  const out = {};
  if ('label' in b) {
    const label = String(b.label ?? '').trim().slice(0, 80);
    if (!label) throw httpError(400, 'Informe o nome do campo.');
    out.label = label;
  }
  if ('type' in b) {
    if (!TYPES.includes(b.type)) throw httpError(400, 'Tipo de campo inválido.');
    out.type = b.type;
  }
  if ('role' in b) {
    if (b.role && !ROLES.includes(b.role)) throw httpError(400, 'Papel inválido.');
    out.role = b.role || null;
  }
  if ('visible' in b) out.visible = b.visible ? 1 : 0;
  if ('expr' in b) out.expr = String(b.expr ?? '').trim();
  return { ...current, ...out };
}

router.get('/fields', (_req, res) => {
  const ctx = buildCtx();
  res.json(ctx.fields.map((f) => fieldOut(f, ctx)));
});

router.post('/fields', (req, res) => {
  const f = cleanFieldInput({ type: 'text', visible: true, expr: '', ...req.body });
  if (f.expr) validateExpr(f.expr);
  if (f.expr && f.role) throw httpError(400, 'Campos calculados não podem ter papel.');
  const key = uniqueKey(f.label);
  const order = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM fields').get().n);
  db.transaction(() => {
    if (f.role) db.prepare('UPDATE fields SET role = NULL WHERE role = ?').run(f.role);
    db.prepare('INSERT INTO fields (key, label, type, role, expr, visible, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(key, f.label, f.type, f.role ?? null, f.expr, f.visible ? 1 : 0, order);
  })();
  const ctx = buildCtx();
  res.status(201).json(fieldOut(ctx.fields.find((x) => x.key === key), ctx));
});

router.put('/fields/order', (req, res) => {
  const keys = Array.isArray(req.body.keys) ? req.body.keys : [];
  const upd = db.prepare('UPDATE fields SET sort_order = ? WHERE key = ?');
  db.transaction(() => keys.forEach((k, i) => upd.run(i + 1, String(k))))();
  res.json({ ok: true });
});

router.patch('/fields/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM fields WHERE id = ?').get(Number(req.params.id));
  if (!cur) throw httpError(404, 'Campo não encontrado.');
  const f = cleanFieldInput(req.body, cur);
  if ('expr' in req.body && f.expr) validateExpr(f.expr);
  if (cur.expr && !f.expr) throw httpError(400, 'Um campo calculado precisa de uma expressão.');
  if (f.expr && f.role) throw httpError(400, 'Campos calculados não podem ter papel.');
  db.transaction(() => {
    if (f.role && f.role !== cur.role) db.prepare('UPDATE fields SET role = NULL WHERE role = ?').run(f.role);
    db.prepare('UPDATE fields SET label = ?, type = ?, role = ?, expr = ?, visible = ? WHERE id = ?')
      .run(f.label, f.type, f.role ?? null, f.expr, f.visible ? 1 : 0, cur.id);
  })();
  if (f.label !== cur.label) rewriteRefs(cur.label, cur.key, f.label);
  const ctx = buildCtx();
  res.json(fieldOut(ctx.fields.find((x) => x.id === cur.id), ctx));
});

router.delete('/fields/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM fields WHERE id = ?').get(Number(req.params.id));
  if (!cur) throw httpError(404, 'Campo não encontrado.');
  db.transaction(() => {
    db.prepare('DELETE FROM fields WHERE id = ?').run(cur.id);
    if (!cur.expr) db.prepare("UPDATE records SET data = json_remove(data, '$.' || ?)").run(cur.key);
  })();
  res.status(204).end();
});

// valores distintos existentes (para montar filtros)
router.get('/fields/:key/values', (req, res) => {
  const st = getStore();
  const f = st.ctx.fields.find((x) => x.key === req.params.key);
  if (!f) throw httpError(404, 'Campo não encontrado.');
  const list = memo(st, `values:${f.key}`, f.expr ? 30000 : null, () => {
    const set = new Set();
    for (const r of st.recs) {
      const v = valueOf(st, r, f.key);
      if (!isEmpty(v)) set.add(String(v));
      if (set.size >= 500) break;
    }
    return [...set].sort((x, y) => x.localeCompare(y, 'pt-BR', { numeric: true }));
  });
  res.json(list);
});

const DEFAULT_DASHBOARD = {
  kpi_active: true,
  kpi_active_equipment: true,
  kpi_oldest_active: true,
  kpi_avg_active: true,
  kpi_avg_closed: true,
  kpi_period_total: true,
  chart_by_group: true,
  chart_by_month: true,
  chart_avg_by_group: true,
  chart_by_user: true,
  chart_top_equipment: true,
  chart_recurrence: true,
  chart_oldest_active: true,
};

// ---------- configurações e KPIs ----------
router.get('/settings', (_req, res) => {
  const ctx = buildCtx();
  let dashboard = {};
  try { dashboard = JSON.parse(getSetting('dashboard_config') || '{}'); } catch {}
  res.json({
    active_expr: getSetting('active_expr'),
    effective: ctx.activeSrc,
    error: ctx.activeError,
    dashboard: { ...DEFAULT_DASHBOARD, ...dashboard },
  });
});

router.put('/settings', (req, res) => {
  if ('active_expr' in req.body) {
    const expr = String(req.body.active_expr ?? '').trim();
    if (expr) validateExpr(expr);
    setSetting('active_expr', expr);
  }
  if ('dashboard' in req.body) {
    let cur = {};
    try { cur = JSON.parse(getSetting('dashboard_config') || '{}'); } catch {}
    const updated = { ...cur, ...req.body.dashboard };
    setSetting('dashboard_config', JSON.stringify(updated));
  }
  res.json({ ok: true });
});

router.get('/kpis', (_req, res) => res.json(db.prepare('SELECT * FROM kpis ORDER BY sort_order, id').all()));
router.post('/kpis', (req, res) => {
  const name = String(req.body.name ?? '').trim().slice(0, 80);
  const expr = String(req.body.expr ?? '').trim();
  if (!name) throw httpError(400, 'Informe o nome do KPI.');
  validateExpr(expr || '');
  if (!expr) throw httpError(400, 'Informe a expressão do KPI.');
  const id = db.prepare('INSERT INTO kpis (name, expr, sort_order) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM kpis))').run(name, expr).lastInsertRowid;
  res.status(201).json(db.prepare('SELECT * FROM kpis WHERE id = ?').get(id));
});
router.patch('/kpis/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM kpis WHERE id = ?').get(Number(req.params.id));
  if (!cur) throw httpError(404, 'KPI não encontrado.');
  const name = String(req.body.name ?? cur.name).trim().slice(0, 80) || cur.name;
  const expr = String(req.body.expr ?? cur.expr).trim();
  validateExpr(expr);
  db.prepare('UPDATE kpis SET name = ?, expr = ? WHERE id = ?').run(name, expr, cur.id);
  res.json(db.prepare('SELECT * FROM kpis WHERE id = ?').get(cur.id));
});
router.delete('/kpis/:id', (req, res) => {
  db.prepare('DELETE FROM kpis WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

// testa uma expressão: quantos registros correspondem
router.post('/expr/test', (req, res) => {
  try {
    const st = getStore();
    const src = String(req.body.expr ?? '');
    const fn = st.ctx.compile(src);
    const r = memo(st, `test:${src}`, ttlFor(st, fn), () => {
      let matches = 0, active = 0;
      for (const rec of st.recs) if (fn(valuesFor(st, rec, fn))) { matches++; if (isActive(st, rec)) active++; }
      return { matches, active };
    });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ---------- registros ----------
const pad2 = (n) => String(n).padStart(2, '0');

function cleanValues(ctx, input) {
  if (!input || typeof input !== 'object') throw httpError(400, 'Dados inválidos.');
  const out = {};
  for (const f of ctx.base) {
    const v = coerce(f.type, input[f.key]);
    if (v !== null) out[f.key] = v;
  }
  if (!Object.keys(out).length) throw httpError(400, 'Preencha pelo menos um campo.');
  return out;
}

const summaryOf = (ctx, data) => {
  const parts = [ctx.role.equipment, ctx.role.sector].map((k) => k && data[k]).filter((v) => !isEmpty(v));
  if (!parts.length) parts.push(...ctx.base.map((f) => data[f.key]).filter((v) => !isEmpty(v)).slice(0, 2));
  return parts.join(' · ').slice(0, 120);
};
const snapshot = (ctx, data, side) => ctx.base.filter((f) => !isEmpty(data[f.key])).map((f) => ({ k: f.key, l: f.label, [side]: data[f.key] }));
const logHistory = (recordId, user, action, summary, changes) =>
  db.prepare('INSERT INTO record_history (record_id, user_name, action, summary, changes) VALUES (?, ?, ?, ?, ?)')
    .run(recordId, user || '', action, summary, JSON.stringify(changes));

router.get('/records', (req, res) => {
  const st = getStore();
  const sort = String(req.query.sort || '');
  const dir = req.query.dir === 'asc' ? 'asc' : 'desc';
  let list = sortedAll(st, sort, dir); // memorizado: a ordenação é feita uma vez por versão dos dados
  if (req.query.status === 'active') list = list.filter((r) => isActive(st, r));
  else if (req.query.status === 'closed') list = list.filter((r) => !isActive(st, r));
  const q = norm(req.query.q || '');
  if (q) list = list.filter((r) => r.s.includes(q));
  const size = Math.min(Math.max(Number(req.query.size) || 25, 5), 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  res.json({ total: list.length, page, size, rows: list.slice((page - 1) * size, page * size).map((r) => recordOut(st, r)) });
});

router.post('/records', (req, res) => {
  const { ctx } = getStore();
  const data = cleanValues(ctx, req.body.values);
  const who = req.user?.username ?? '';
  const id = db.transaction(() => {
    const newId = Number(db.prepare('INSERT INTO records (data, hash, created_by) VALUES (?, ?, ?)').run(JSON.stringify(data), hashValues(data), who).lastInsertRowid);
    logHistory(newId, who, 'create', summaryOf(ctx, data), snapshot(ctx, data, 'to'));
    return newId;
  })();
  upsertRecord(id);
  const st = getStore();
  res.status(201).json(recordOut(st, st.byId.get(id)));
});

router.put('/records/:id', (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT data FROM records WHERE id = ?').get(id);
  if (!old) throw httpError(404, 'Registro não encontrado.');
  const { ctx } = getStore();
  const data = cleanValues(ctx, req.body.values);
  const before = JSON.parse(old.data);
  const changes = [];
  for (const f of ctx.base) {
    const a = coerce(f.type, before[f.key]);
    const b = data[f.key] ?? null;
    if (String(a ?? '') !== String(b ?? '')) changes.push({ k: f.key, l: f.label, from: a, to: b });
  }
  const U = ctx.role.unlocked_at;
  const action = U && changes.some((c) => c.k === U && isEmpty(c.from) && !isEmpty(c.to)) ? 'unlock' : 'update';
  const who = req.user?.username ?? '';
  db.transaction(() => {
    db.prepare("UPDATE records SET data = ?, hash = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(data), hashValues(data), who, id);
    if (changes.length) logHistory(id, who, action, summaryOf(ctx, data), changes);
  })();
  upsertRecord(id);
  res.json({ ok: true });
});

router.post('/records/delete-many', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(204).end();
  const { ctx } = getStore();
  const who = req.user?.username ?? '';
  db.transaction(() => {
    for (const id of ids) {
      const old = db.prepare('SELECT data FROM records WHERE id = ?').get(id);
      if (old) {
        const data = JSON.parse(old.data);
        logHistory(id, who, 'delete', summaryOf(ctx, data), snapshot(ctx, data, 'from'));
        db.prepare('DELETE FROM records WHERE id = ?').run(id);
      }
    }
  })();
  for (const id of ids) removeRecord(id);
  res.status(204).end();
});

router.delete('/records/:id', (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT data FROM records WHERE id = ?').get(id);
  if (old) {
    const { ctx } = getStore();
    const data = JSON.parse(old.data);
    db.transaction(() => {
      logHistory(id, req.user?.username ?? '', 'delete', summaryOf(ctx, data), snapshot(ctx, data, 'from'));
      db.prepare('DELETE FROM records WHERE id = ?').run(id);
    })();
    removeRecord(id);
  }
  res.status(204).end();
});

const historyOut = (h) => ({ ...h, changes: JSON.parse(h.changes) });

router.get('/records/:id/history', (req, res) => {
  const id = Number(req.params.id);
  const entries = db.prepare('SELECT * FROM record_history WHERE record_id = ? ORDER BY id DESC').all(id).map(historyOut);
  const rec = db.prepare('SELECT created_at, created_by, import_id FROM records WHERE id = ?').get(id);
  if (rec && !entries.some((e) => e.action === 'create')) {
    const imp = rec.import_id ? db.prepare('SELECT filename, user_name FROM imports WHERE id = ?').get(rec.import_id) : null;
    entries.push({
      id: 0, record_id: id, at: rec.created_at, user_name: rec.created_by || imp?.user_name || '', action: 'import',
      summary: imp ? `Importado do arquivo ${imp.filename}` : 'Registro anterior ao histórico de alterações', changes: [],
    });
  }
  res.json(entries);
});

// últimas alterações em qualquer registro (inclui exclusões)
router.get('/history/recent', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 10), 1000);
  res.json(db.prepare('SELECT * FROM record_history ORDER BY id DESC LIMIT ?').all(limit).map(historyOut));
});

// ---------- cadeados e histórico por área ----------
const areaOr404 = (id) => {
  const a = db.prepare('SELECT * FROM areas WHERE id = ?').get(Number(id));
  if (!a) throw httpError(404, 'Área não encontrada.');
  return a;
};

// todos os registros (ativos e encerrados) que pertencem à área; memorizado
export function matchedForArea(st, area) {
  if (!area.lock_filter.trim()) return [];
  const fn = st.ctx.compile(area.lock_filter);
  return memo(st, `area:${area.lock_filter}`, ttlFor(st, fn), () => st.recs.filter((r) => fn(valuesFor(st, r, fn))));
}

const parseKeys = (s) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } };

// Quantos bloqueios ativos cada área (com cadeado) tem na planta e há quanto tempo o mais antigo está bloqueado.
router.get('/maps/:id/lock-status', (req, res) => {
  const st = getStore();
  const now = Date.now();
  const areas = db.prepare('SELECT id, lock_filter FROM areas WHERE map_id = ? AND show_lock = 1').all(Number(req.params.id));
  const act = activeRecords(st); // só os ativos (poucos): é isso que mantém o mapa rápido
  const out = {};
  for (const a of areas) {
    try {
      if (!a.lock_filter.trim()) { out[a.id] = { active: 0, error: 'Sem filtro definido.' }; continue; }
      const fn = st.ctx.compile(a.lock_filter);
      let n = 0, oldest = null;
      for (const r of act) {
        if (!fn(valuesFor(st, r, fn))) continue;
        n++;
        if (r.t0 != null) { const h = (now - r.t0) / 3600000; if (oldest == null || h > oldest) oldest = h; }
      }
      out[a.id] = { active: n, oldest_hours: oldest };
    } catch (e) {
      out[a.id] = { active: 0, error: e.message };
    }
  }
  const cfg = getConfig();
  res.json({ areas: out, active_total: act.length, at: now, stages: cfg.lock_stages, nav_effects: cfg.nav_effects });
});

// Registros que pertencem à área (ativos; ou todo o histórico com ?history=1).
router.get('/areas/:id/records', (req, res) => {
  const area = areaOr404(req.params.id);
  const st = getStore();
  const { ctx } = st;
  const now = Date.now();
  let matched = [];
  let error = null;
  try { matched = matchedForArea(st, area); } catch (e) { error = e.message; }
  const history = req.query.history === '1';
  const activeCount = matched.filter((r) => isActive(st, r)).length;
  const getTime = (r) => (r.t0 != null ? r.t0 : (r.created_at ? Date.parse(r.created_at) : r.id));
  const rows = (history ? matched : matched.filter((r) => isActive(st, r)))
    .slice()
    .sort((a, b) => getTime(b) - getTime(a));

  const parsed = parseKeys(area.display_fields);
  const wanted = parsed.filter((k) => k === '__separator__' || ctx.fields.some((f) => f.key === k));
  const fields = (wanted.length
    ? wanted.map((k) => k === '__separator__'
        ? { key: '__separator__', label: 'Separador', type: 'separator' }
        : ctx.fields.find((f) => f.key === k))
    : ctx.fields.filter((f) => f.visible)
  ).map((f) => ({ key: f.key, label: f.label, type: f.type }));

  const realFields = fields.filter((f) => f.key !== '__separator__');
  const titleKey = ctx.role.equipment && realFields.some((f) => f.key === ctx.role.equipment)
    ? ctx.role.equipment
    : realFields[0]?.key;

  res.json({
    area: { id: area.id, name: area.name, code: area.code },
    fields,
    title_key: titleKey,
    counts: { active: activeCount, total: matched.length },
    error,
    rows: rows.slice(0, 300).map((r) => {
      const v = valuesFor(st, r);
      return {
        id: r.id,
        active: isActive(st, r),
        hours: hoursOf(st, r, now),
        t0: r.t0,
        created_at: r.created_at,
        values: Object.fromEntries(realFields.map((f) => [f.key, v[f.key]]))
      };
    }),
  });
});

// Aba "Histórico": ranking, reincidência e linha do tempo por equipamento da área.
router.get('/areas/:id/history', (req, res) => {
  const area = areaOr404(req.params.id);
  const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 3650);
  const cfg = getConfig();
  const st = getStore();
  const now = Date.now();
  let recs = [];
  try { recs = matchedForArea(st, area); } catch (e) { throw httpError(400, `Filtro da área com erro: ${e.message}`); }
  const { _events, ...out } = equipmentAnalysis(st, recs, { fromMs: now - days * 86400000, toMs: now, recurrenceDays: cfg.recurrence_days, now, fallbackName: area.name });
  res.json({
    area: { id: area.id, name: area.name },
    equipment_key: st.ctx.role.equipment || null,
    days,
    recurrence_days: cfg.recurrence_days,
    stages: cfg.lock_stages,
    ...out,
  });
});

// ---------- estatísticas / KPIs ----------
function computeStats(st, days, groupReq) {
  const { ctx } = st;
  const cfg = getConfig();
  const now = Date.now();
  const { locked_at: LA, sector: SE, equipment: EQ, locked_by: LB } = ctx.role;
  const label = (v) => (isEmpty(v) ? '(vazio)' : String(v));
  const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const inPeriod = (r) => !days || !LA || (r.t0 != null && r.t0 >= now - days * 86400000);

  const period = st.recs.filter(inPeriod);
  const active = activeRecords(st);
  const closedDur = [];
  for (const r of period) if (!isActive(st, r)) { const h = hoursOf(st, r, now); if (h != null) closedDur.push(h); }
  const activeDur = active.map((r) => hoursOf(st, r, now)).filter((h) => h != null);

  const groupKey = ctx.fields.some((f) => f.key === groupReq) ? groupReq : SE || EQ;
  const groups = new Map();
  if (groupKey) {
    for (const r of period) {
      const g = label(valueOf(st, r, groupKey));
      const o = groups.get(g) ?? { label: g, active: 0, total: 0, durs: [] };
      o.total++;
      const act = isActive(st, r);
      if (act) o.active++;
      else { const h = hoursOf(st, r, now); if (h != null) o.durs.push(h); }
      groups.set(g, o);
    }
  }
  const groupList = [...groups.values()];

  const months = [];
  const d0 = new Date(); d0.setDate(1); d0.setHours(0, 0, 0, 0);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1);
    months.push({ month: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, count: 0 });
  }
  const monthIdx = new Map(months.map((m, i) => [m.month, i]));
  for (const r of st.recs) {
    if (r.t0 == null) continue;
    const d = new Date(r.t0);
    const i = monthIdx.get(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
    if (i != null) months[i].count++;
  }

  const byUser = new Map();
  if (LB) for (const r of period) { const k = label(valueOf(st, r, LB)); byUser.set(k, (byUser.get(k) ?? 0) + 1); }

  const custom = db.prepare('SELECT * FROM kpis ORDER BY sort_order, id').all().map((k) => {
    try {
      const fn = ctx.compile(k.expr);
      const value = memo(st, `kpi:${k.id}:${k.expr}`, ttlFor(st, fn, 30000), () => {
        let n = 0;
        for (const r of st.recs) if (fn(valuesFor(st, r, fn))) n++;
        return n;
      });
      return { id: k.id, name: k.name, value };
    } catch (e) {
      return { id: k.id, name: k.name, error: e.message };
    }
  });

  const an = equipmentAnalysis(st, st.recs, { fromMs: days ? now - days * 86400000 : 0, toMs: now, recurrenceDays: cfg.recurrence_days, now });
  const hasEq = !an.missing.equipment;

  return {
    roles: ctx.role,
    group_by: groupKey || null,
    recurrence_days: cfg.recurrence_days,
    kpis: {
      active: active.length,
      active_equipment: EQ ? new Set(active.map((r) => norm(valueOf(st, r, EQ))).filter(Boolean)).size : null,
      total: st.recs.length,
      period_total: period.length,
      avg_hours: avg(closedDur),
      oldest_active_hours: activeDur.length ? Math.max(...activeDur) : null,
      avg_active_hours: avg(activeDur),
    },
    custom,
    by_group: groupList.sort((a, b) => b.active - a.active || b.total - a.total).slice(0, 12).map(({ durs, ...g }) => g),
    avg_by_group: groupList.filter((g) => g.durs.length).map((g) => ({ label: g.label, hours: avg(g.durs), count: g.durs.length }))
      .sort((a, b) => b.hours - a.hours).slice(0, 10),
    by_month: months,
    by_user: [...byUser.entries()].map(([l, count]) => ({ label: l, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    oldest_active: active.map((r) => ({ id: r.id, hours: hoursOf(st, r, now), values: (({ _active, ...v }) => v)(valuesFor(st, r)) }))
      .sort((a, b) => (b.hours ?? -1) - (a.hours ?? -1)).slice(0, 8),
    top_equipment: hasEq ? an.groups.slice(0, 10).map((g) => ({ label: g.name, count: g.count, hours: g.total_hours })) : [],
    recurrence: hasEq
      ? an.groups.filter((g) => g.recurrences > 0).sort((a, b) => b.recurrences - a.recurrences || b.count - a.count).slice(0, 10)
        .map((g) => ({ label: g.name, recurrences: g.recurrences, count: g.count, mtbl_hours: g.mtbl_hours }))
      : [],
  };
}

router.get('/stats', (req, res) => {
  const st = getStore();
  const days = Number(req.query.days) || 0;
  const groupReq = String(req.query.groupBy || '');
  res.json(memo(st, `stats:${days}:${groupReq}`, 15000, () => computeStats(st, days, groupReq)));
});

// ---------- importação de Excel (sempre ACRESCENTA) ----------
const xlsx = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    /\.(xlsx|xlsm)$/i.test(file.originalname)
      ? cb(null, true)
      : cb(httpError(400, 'Envie um arquivo Excel .xlsx. Arquivos .xls antigos: abra no Excel e salve como .xlsx.')),
});

function cellValue(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    if ('error' in v) return null;
    return String(v);
  }
  return v;
}

// Leitura em streaming: baixo consumo de memória mesmo com 100 mil+ linhas.
export async function readSheet(buffer, sheetName) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), {
    sharedStrings: 'cache', styles: 'cache', worksheets: 'emit', hyperlinks: 'ignore', entries: 'ignore',
  });
  const sheets = [];
  const rows = [];
  let chosen = null;
  try {
    for await (const ws of reader) {
      sheets.push(ws.name);
      if (chosen === null && (!sheetName || ws.name === sheetName)) {
        chosen = ws.name;
        for await (const row of ws) {
          const vals = row.values;
          rows.push(Array.from({ length: Math.max(vals.length - 1, 0) }, (_, i) => cellValue(vals[i + 1])));
        }
      }
    }
  } catch {
    throw httpError(400, 'Não foi possível ler o arquivo. Ele está corrompido ou protegido por senha?');
  }
  if (chosen === null && sheetName) return readSheet(buffer, undefined);
  if (!sheets.length) throw httpError(400, 'A planilha não tem nenhuma aba.');
  const filled = rows.filter((r) => r.some((v) => !isEmpty(v)));
  if (!filled.length) throw httpError(400, 'A aba selecionada está vazia.');
  const seen = new Map();
  const width = Math.max(...filled.slice(0, 500).map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => {
    const h = String(filled[0][i] ?? '').trim() || `Coluna ${i + 1}`;
    const n = (seen.get(norm(h)) ?? 0) + 1;
    seen.set(norm(h), n);
    return n > 1 ? `${h} (${n})` : h;
  });
  return { sheets, sheet: chosen, headers, rows: filled.slice(1) };
}

const looksDate = (s) => /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s);
function detectType(values) {
  const v = values.filter((x) => !isEmpty(x));
  if (!v.length) return 'text';
  if (v.every((x) => typeof x === 'number')) return 'number';
  if (v.every((x) => x instanceof Date || (typeof x === 'string' && looksDate(x.trim())))) return 'date';
  return 'text';
}

router.post('/import/preview', xlsx.single('file'), wrap(async (req, res) => {
  if (!req.file) throw httpError(400, 'Nenhum arquivo enviado.');
  const { sheets, sheet, headers, rows } = await readSheet(req.file.buffer, req.body.sheet);
  const ctx = buildCtx();
  const byName = new Map();
  ctx.base.forEach((f) => { byName.set(norm(f.label), f.key); byName.set(norm(f.key), f.key); });
  res.json({
    sheets, sheet, row_count: rows.length,
    columns: headers.map((name, index) => {
      const col = rows.slice(0, 300).map((r) => r[index]);
      const samples = col.filter((x) => !isEmpty(x)).slice(0, 3).map((x) => (x instanceof Date ? normDate(x) : String(x)));
      return { index, name, type: detectType(col), samples, suggestion: byName.get(norm(name)) ?? null };
    }),
  });
}));

export function getImportDedupConfig() {
  try {
    const raw = getSetting('import_dedup_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        mode: parsed?.mode === 'custom' ? 'custom' : 'auto',
        fields: Array.isArray(parsed?.fields)
          ? parsed.fields
              .filter((f) => f && (typeof f === 'string' || (typeof f === 'object' && (f.key || f.label))))
              .map((f) => (typeof f === 'string' ? { key: f, label: f } : { key: String(f.key || '').trim(), label: String(f.label || f.key || '').trim() }))
              .filter((f) => f.key || f.label)
          : [],
      };
    }
  } catch {}
  return { mode: 'auto', fields: [] };
}

router.get('/import/dedup-config', (_req, res) => {
  res.json(getImportDedupConfig());
});

router.put('/import/dedup-config', (req, res) => {
  const mode = req.body?.mode === 'custom' ? 'custom' : 'auto';
  const fields = Array.isArray(req.body?.fields)
    ? req.body.fields
        .filter((f) => f && (typeof f === 'string' || (typeof f === 'object' && (f.key || f.label))))
        .map((f) => (typeof f === 'string' ? { key: f, label: f } : { key: String(f.key || '').trim(), label: String(f.label || f.key || '').trim() }))
        .filter((f) => f.key || f.label)
    : [];
  const cfg = { mode, fields };
  setSetting('import_dedup_config', JSON.stringify(cfg));
  res.json(cfg);
});

// Núcleo da importação (usado pela tela e pela importação automática).
export function importRows({
  headers, rows, filename, sheet, mapping,
  skipDuplicates = true, dedupMode, dedupFields,
  filterExpr = '', resolutions = null, userName = '',
}) {
  const ctx = buildCtx();
  const used = new Set();
  const cols = []; // { index, field }
  const newFieldsToCreate = []; // { key, type, label }
  const created = [];
  const savedDedup = getImportDedupConfig();
  const effMode = (dedupMode || savedDedup.mode) === 'custom' ? 'custom' : 'auto';
  const effFields = Array.isArray(dedupFields) ? dedupFields : savedDedup.fields;

  // Compila expressão de filtro (referenciando os nomes das colunas da planilha)
  let filterFn = null;
  if (filterExpr && String(filterExpr).trim()) {
    const excelIx = new Map();
    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i] ?? '').trim();
      if (h) excelIx.set(norm(h), String(i));
    }
    filterFn = compile(String(filterExpr).trim(), excelIx);
  }

  for (const m of mapping) {
    if (m.action === 'map') {
      const f = ctx.base.find((x) => x.key === m.field);
      if (!f) throw httpError(400, 'Um campo escolhido no mapeamento não existe mais.');
      if (used.has(f.key)) throw httpError(400, `Duas colunas foram ligadas ao mesmo campo: ${f.label}.`);
      used.add(f.key);
      cols.push({ index: m.index, field: f });
    } else if (m.action === 'new') {
      const label = String(m.label || headers[m.index] || '').trim().slice(0, 80);
      if (!label) throw httpError(400, 'Dê um nome para o novo campo.');
      const type = TYPES.includes(m.type) ? m.type : 'text';
      const same = ctx.base.find((x) => norm(x.label) === norm(label));
      if (same) {
        if (used.has(same.key)) throw httpError(400, `Duas colunas foram ligadas ao mesmo campo: ${same.label}.`);
        used.add(same.key);
        cols.push({ index: m.index, field: same });
        continue;
      }
      const key = uniqueKey(label);
      const fieldObj = { key, type, label };
      created.push(label);
      used.add(key);
      ctx.base.push(fieldObj);
      newFieldsToCreate.push(fieldObj);
      cols.push({ index: m.index, field: fieldObj });
    }
  }
  if (!cols.length) throw httpError(400, 'Nenhuma coluna foi selecionada para importar.');

  // Resolve quais chaves de campos compõem a verificação personalizada de duplicação
  const customKeys = [];
  if (effMode === 'custom' && effFields.length > 0) {
    for (const c of cols) {
      const matched = effFields.some((tf) => {
        const tk = typeof tf === 'string' ? tf : String(tf.key || '');
        const tl = typeof tf === 'string' ? tf : String(tf.label || '');
        return (
          (tk && tk === c.field.key) ||
          (tk && tk === `new:${norm(c.field.label)}`) ||
          (tl && norm(tl) === norm(c.field.label)) ||
          (tl && headers[c.index] !== undefined && norm(tl) === norm(headers[c.index]))
        );
      });
      if (matched && !customKeys.includes(c.field.key)) {
        customKeys.push(c.field.key);
      }
    }
  }

  const seenFull = new Set();
  const existingByCustom = new Map();
  if (skipDuplicates) {
    const existing = db.prepare('SELECT id, data, hash FROM records').all();
    for (const r of existing) {
      let parsed = null;
      try { parsed = JSON.parse(r.data || '{}'); } catch { parsed = {}; }
      seenFull.add(r.hash || hashValues(parsed));
      if (customKeys.length > 0) {
        const sub = {};
        for (const k of customKeys) {
          if (parsed[k] !== undefined && parsed[k] !== null && String(parsed[k]).trim() !== '') sub[k] = parsed[k];
        }
        if (Object.keys(sub).length > 0) {
          const ch = hashValues(sub);
          if (!existingByCustom.has(ch)) existingByCustom.set(ch, { id: r.id, data: parsed });
        }
      }
    }
  }

  const seenCustomInFile = new Set();
  const toInsert = [];
  const conflicts = [];
  let dup = 0, empty = 0, filteredOut = 0;

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];

    // 1. Filtra pela expressão antes mesmo de verificar duplicações
    if (filterFn) {
      const rawObj = {};
      for (let j = 0; j < headers.length; j++) {
        const rv = row[j];
        if (rv instanceof Date) rawObj[String(j)] = rv.toISOString();
        else if (typeof rv === 'string') rawObj[String(j)] = rv.trim();
        else rawObj[String(j)] = rv ?? null;
      }
      if (!filterFn(rawObj)) {
        filteredOut++;
        continue;
      }
    }

    // 2. Mapeia colunas para o objeto de registro
    const data = {};
    for (const c of cols) {
      const v = coerce(c.field.type, row[c.index]);
      if (v !== null) data[c.field.key] = v;
    }
    if (!Object.keys(data).length) { empty++; continue; }

    const hash = hashValues(data);
    if (skipDuplicates) {
      if (customKeys.length > 0) {
        const sub = {};
        for (const k of customKeys) {
          if (data[k] !== undefined && data[k] !== null && String(data[k]).trim() !== '') sub[k] = data[k];
        }
        if (Object.keys(sub).length > 0) {
          const cHash = hashValues(sub);
          const match = existingByCustom.get(cHash);
          if (match) {
            const existingMapped = {};
            for (const c of cols) {
              const ev = coerce(c.field.type, match.data[c.field.key]);
              if (ev !== null) existingMapped[c.field.key] = ev;
            }
            if (hashValues(existingMapped) === hash) {
              dup++;
              continue;
            }
            // Conflito: mesma chave de duplicação, porém colunas diferentes!
            const diffs = [];
            for (const c of cols) {
              const exVal = existingMapped[c.field.key] ?? null;
              const inVal = data[c.field.key] ?? null;
              if (norm(exVal ?? '') !== norm(inVal ?? '')) {
                diffs.push({
                  key: c.field.key,
                  label: c.field.label,
                  type: c.field.type,
                  existing: exVal,
                  incoming: inVal,
                });
              }
            }
            if (diffs.length === 0) {
              dup++;
              continue;
            }
            const keySummary = customKeys.map((k) => {
              const f = cols.find((c) => c.field.key === k)?.field;
              return `${f?.label || k}: ${data[k] ?? '—'}`;
            }).join(' · ');
            conflicts.push({
              rowNumber: rowIdx + 2,
              existingId: match.id,
              keySummary,
              diffs,
              existingData: existingMapped,
              incomingData: data,
            });
            continue;
          }
          if (seenCustomInFile.has(cHash)) { dup++; continue; }
          seenCustomInFile.add(cHash);
        } else {
          if (seenFull.has(hash)) { dup++; continue; }
          seenFull.add(hash);
        }
      } else {
        if (seenFull.has(hash)) { dup++; continue; }
        seenFull.add(hash);
      }
    }

    toInsert.push({ data, hash });
  }

  // Se há conflitos e o usuário ainda não escolheu qual versão manter, retorna para o modal de resolução
  if (conflicts.length > 0 && resolutions == null) {
    return {
      needs_resolution: true,
      conflicts: conflicts.map(({ existingData: _e, incomingData: _i, ...rest }) => rest),
      summary: {
        total: rows.length,
        new_records: toInsert.length,
        exact_duplicates: dup,
        filtered_out: filteredOut,
        empty,
        conflicts: conflicts.length,
      },
    };
  }

  const result = db.transaction(() => {
    for (const nf of newFieldsToCreate) {
      const order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM fields').get().n;
      db.prepare('INSERT INTO fields (key, label, type, sort_order) VALUES (?, ?, ?, ?)').run(nf.key, nf.label, nf.type, order);
    }

    const importId = db.prepare('INSERT INTO imports (filename, sheet, rows_total, user_name) VALUES (?, ?, ?, ?)')
      .run(filename, sheet, rows.length, userName).lastInsertRowid;

    const ins = db.prepare('INSERT INTO records (data, hash, import_id, created_by) VALUES (?, ?, ?, ?)');
    let imported = 0, updated = 0;
    for (const item of toInsert) {
      ins.run(JSON.stringify(item.data), item.hash, importId, userName);
      imported++;
    }

    const upd = db.prepare("UPDATE records SET data = ?, hash = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?");
    for (const cf of conflicts) {
      const choice = resolutions?.[String(cf.rowNumber)] || 'keep_existing';
      if (choice === 'use_new') {
        const oldRow = db.prepare('SELECT data FROM records WHERE id = ?').get(cf.existingId);
        if (oldRow) {
          let before = {};
          try { before = JSON.parse(oldRow.data || '{}'); } catch {}
          const merged = { ...before };
          for (const c of cols) {
            if (cf.incomingData[c.field.key] !== undefined) merged[c.field.key] = cf.incomingData[c.field.key];
            else delete merged[c.field.key];
          }
          const changes = [];
          for (const c of cols) {
            const a = before[c.field.key] ?? null;
            const b = merged[c.field.key] ?? null;
            if (String(a ?? '') !== String(b ?? '')) changes.push({ k: c.field.key, l: c.field.label, from: a, to: b });
          }
          upd.run(JSON.stringify(merged), hashValues(merged), userName, cf.existingId);
          if (changes.length) logHistory(cf.existingId, userName, 'update', summaryOf(ctx, merged), changes);
          updated++;
        }
      } else {
        dup++;
      }
    }

    db.prepare('UPDATE imports SET rows_imported = ?, rows_skipped = ? WHERE id = ?').run(imported + updated, dup + empty + filteredOut, importId);
    return {
      import_id: importId,
      imported,
      updated,
      skipped_duplicates: dup,
      skipped_empty: empty,
      filtered_out: filteredOut,
      created_fields: created,
    };
  })();
  invalidate();
  return result;
}

router.post('/import', xlsx.single('file'), wrap(async (req, res) => {
  if (!req.file) throw httpError(400, 'Nenhum arquivo enviado.');
  let mapping;
  try { mapping = JSON.parse(req.body.mapping || '[]'); } catch { throw httpError(400, 'Mapeamento inválido.'); }
  let dedupFields;
  if (req.body.dedupFields) {
    try { dedupFields = JSON.parse(req.body.dedupFields); } catch {}
  }
  let resolutions = null;
  if (req.body.resolutions) {
    try { resolutions = JSON.parse(req.body.resolutions); } catch {}
  }
  const { sheet, headers, rows } = await readSheet(req.file.buffer, req.body.sheet);
  const out = importRows({
    headers, rows, sheet, mapping,
    filename: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
    skipDuplicates: req.body.skipDuplicates !== 'false',
    dedupMode: req.body.dedupMode,
    dedupFields,
    filterExpr: req.body.filterExpr || '',
    resolutions,
    userName: req.user?.username ?? '',
  });
  res.status(out.needs_resolution ? 200 : 201).json(out);
}));

router.get('/imports', (_req, res) => res.json(db.prepare('SELECT * FROM imports ORDER BY id DESC LIMIT 50').all()));
router.delete('/imports/:id', (req, res) => {
  const id = Number(req.params.id);
  db.transaction(() => {
    db.prepare('DELETE FROM records WHERE import_id = ?').run(id);
    db.prepare('DELETE FROM imports WHERE id = ?').run(id);
  })();
  invalidate();
  res.status(204).end();
});

// ---------- perfis de importação (mapeamento de colunas salvo) ----------
const profileOut = (p) => ({ id: p.id, name: p.name, mapping: JSON.parse(p.mapping), options: JSON.parse(p.options || '{}'), updated_at: p.updated_at });
export const listProfiles = () => db.prepare('SELECT * FROM import_profiles ORDER BY name COLLATE NOCASE').all().map(profileOut);

// Aplica um perfil às colunas de um arquivo (casando pelo NOME da coluna). Colunas desconhecidas são ignoradas.
export function profileToMapping(profile, headers) {
  const ctx = buildCtx();
  const mapping = [];
  const unknown = [];
  let hit = 0;
  headers.forEach((h, index) => {
    const e = profile.mapping.find((m) => norm(m.header) === norm(h));
    if (!e) { mapping.push({ index, action: 'ignore' }); unknown.push(h); return; }
    hit++;
    if (e.action === 'map' && ctx.base.some((f) => f.key === e.field)) mapping.push({ index, action: 'map', field: e.field });
    else if (e.action === 'new' || e.action === 'map') mapping.push({ index, action: 'new', label: e.label ?? e.header, type: e.type ?? 'text' });
    else mapping.push({ index, action: 'ignore' });
  });
  const missing = profile.mapping.filter((m) => m.action !== 'ignore' && !headers.some((h) => norm(h) === norm(m.header))).map((m) => m.header);
  return { mapping, unknown, missing, score: hit / Math.max(headers.length, profile.mapping.length) };
}

router.get('/import-profiles', (_req, res) => res.json(listProfiles()));

router.post('/import-profiles', (req, res) => {
  const name = String(req.body.name ?? '').trim().slice(0, 80);
  if (!name) throw httpError(400, 'Dê um nome ao perfil.');
  if (!Array.isArray(req.body.mapping) || !req.body.mapping.length) throw httpError(400, 'Mapeamento vazio.');
  const mapping = req.body.mapping.map((m) => {
    if (!['map', 'new', 'ignore'].includes(m.action) || !String(m.header ?? '').trim()) throw httpError(400, 'Mapeamento inválido.');
    return {
      header: String(m.header).trim(), action: m.action,
      ...(m.action === 'map' ? { field: String(m.field) } : {}),
      ...(m.action === 'new' ? { label: String(m.label ?? m.header).trim(), type: TYPES.includes(m.type) ? m.type : 'text' } : {}),
    };
  });
  const options = {
    skipDuplicates: req.body.options?.skipDuplicates !== false,
    filterEnabled: req.body.options?.filterEnabled === true,
    filterExpr: String(req.body.options?.filterExpr ?? '').trim(),
  };
  db.prepare(`INSERT INTO import_profiles (name, mapping, options) VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET mapping = excluded.mapping, options = excluded.options, updated_at = datetime('now')`)
    .run(name, JSON.stringify(mapping), JSON.stringify(options));
  res.status(201).json(profileOut(db.prepare('SELECT * FROM import_profiles WHERE name = ?').get(name)));
});

router.delete('/import-profiles/:id', (req, res) => {
  db.prepare('DELETE FROM import_profiles WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});
