// Cache em memória dos registros já convertidos. É o que mantém o sistema rápido com 100 mil+ registros:
//  - os registros são lidos/convertidos uma única vez e atualizados de forma incremental a cada edição;
//  - campos calculados e "ativo" são avaliados sob demanda e guardados;
//  - consultas pesadas (ordenações, filtros de área, contagens) são memorizadas até algo mudar.
import { db, tenantContext } from './db.js';
import { buildCtx, coerce } from './core.js';
import { isEmpty, norm, toTime } from './expr.js';

const RAW = 'SELECT id, data, created_at, created_by, updated_by, import_id FROM records';
const VOLATILE_MS = 5000; // valores que dependem da hora atual são recalculados no máximo a cada 5 s
const stores = new Map(); // isolamento de store em memória por empresa

const currentCompanyId = () => tenantContext.getStore()?.companyId || 1;

export const invalidate = () => {
  const cid = tenantContext.getStore()?.companyId;
  if (cid) stores.delete(cid);
  else stores.clear();
};

function buildRec(ctx, row) {
  const data = JSON.parse(row.data);
  const b = {};
  for (const f of ctx.base) b[f.key] = coerce(f.type, data[f.key]);
  return {
    id: row.id, created_at: row.created_at, created_by: row.created_by, updated_by: row.updated_by, import_id: row.import_id,
    b, c: null, cAt: 0, a: undefined, aAt: 0,
    t0: ctx.role.locked_at ? toTime(b[ctx.role.locked_at]) : null,     // bloqueio (ms)
    t1: ctx.role.unlocked_at ? toTime(b[ctx.role.unlocked_at]) : null, // desbloqueio (ms)
    s: ctx.base.map((f) => norm(b[f.key])).join('\u0001'),             // texto para busca
  };
}

export function getStore() {
  const cid = currentCompanyId();
  const dv = db.pragma('data_version', { simple: true }); // muda quando OUTRO processo altera o banco
  let state = stores.get(cid);
  if (state && state.dv !== dv) {
    stores.delete(cid);
    state = null;
  }
  if (!state) {
    const ctx = buildCtx();
    const recs = [];
    for (const row of db.prepare(`${RAW} ORDER BY id`).iterate()) recs.push(buildRec(ctx, row));
    state = { ctx, recs, byId: new Map(recs.map((r) => [r.id, r])), derived: new Map(), dv };
    stores.set(cid, state);
  }
  return state;
}

// atualizações incrementais (criar/editar/excluir um registro sem reconstruir tudo)
export function upsertRecord(id) {
  const cid = currentCompanyId();
  const state = stores.get(cid);
  if (!state) return;
  const row = db.prepare(`${RAW} WHERE id = ?`).get(id);
  if (!row) return removeRecord(id);
  const rec = buildRec(state.ctx, row);
  const old = state.byId.get(id);
  if (old) state.recs[state.recs.indexOf(old)] = rec; else state.recs.push(rec);
  state.byId.set(id, rec);
  state.derived.clear();
}
export function removeRecord(id) {
  const cid = currentCompanyId();
  const state = stores.get(cid);
  if (!state) return;
  const old = state.byId.get(id);
  if (old) { state.recs.splice(state.recs.indexOf(old), 1); state.byId.delete(id); }
  state.derived.clear();
}

// ---------- memória de resultados ----------
export function memo(st, key, ttl, compute) {
  const hit = st.derived.get(key);
  const now = Date.now();
  if (hit && (ttl == null || now - hit.at < ttl)) return hit.v;
  if (st.derived.size > 300) st.derived.clear();
  const v = compute();
  st.derived.set(key, { v, at: now });
  return v;
}

// a expressão depende da hora atual (direta ou indiretamente)?
export const isVolatileFn = (st, fn) => st.ctx.isVolatile(fn) || (fn.usesActive && st.ctx.activeVolatile);
export const ttlFor = (st, fn, ttl = VOLATILE_MS) => (isVolatileFn(st, fn) ? ttl : null);

// ---------- valores de um registro ----------
export function computedOf(st, rec) {
  const { ctx } = st;
  if (!ctx.computed.length) return rec.b;
  const now = Date.now();
  if (rec.c && (!ctx.computedVolatile || now - rec.cAt < VOLATILE_MS)) return rec.c;
  const v = { ...rec.b };
  for (const c of ctx.computed) v[c.f.key] = coerce(c.f.type, c.fn(v));
  rec.c = v;
  rec.cAt = now;
  return v;
}

export function isActive(st, rec) {
  const { ctx } = st;
  const now = Date.now();
  if (rec.a !== undefined && (!ctx.activeVolatile || now - rec.aAt < VOLATILE_MS)) return rec.a;
  rec.a = !!ctx.activeFn(ctx.activeNeedsComputed ? computedOf(st, rec) : rec.b);
  rec.aAt = now;
  return rec.a;
}

/** Valores para avaliar uma expressão (fn) sobre o registro; sem fn devolve tudo (calculados + ativo). */
export function valuesFor(st, rec, fn) {
  const needC = !fn || st.ctx.needsComputed(fn);
  const v = needC ? computedOf(st, rec) : rec.b;
  if (!fn || fn.usesActive) v._active = isActive(st, rec);
  return v;
}

export const valueOf = (st, rec, key) => (st.ctx.computedKeys.has(key) ? computedOf(st, rec) : rec.b)[key];

export function activeRecords(st) {
  return memo(st, 'active', st.ctx.activeVolatile ? VOLATILE_MS : null, () => st.recs.filter((r) => isActive(st, r)));
}

export function recordOut(st, rec) {
  const { _active, ...values } = valuesFor(st, rec);
  return { id: rec.id, active: isActive(st, rec), created_at: rec.created_at, created_by: rec.created_by, updated_by: rec.updated_by, values };
}

// todos os registros ordenados por um campo (memorizado)
export function sortedAll(st, key, dir) {
  const f = st.ctx.fields.find((x) => x.key === key);
  const computed = !!f && st.ctx.computedKeys.has(key);
  return memo(st, `sort:${f ? key : 'id'}:${dir}`, computed && st.ctx.computedVolatile ? VOLATILE_MS : null, () => {
    if (!f) return dir === 'asc' ? st.recs.slice() : st.recs.slice().reverse();
    const keyed = st.recs.map((r) => {
      const v = (computed ? computedOf(st, r) : r.b)[key];
      let k = null;
      if (!isEmpty(v)) {
        if (f.type === 'number') k = typeof v === 'number' ? v : Number(v);
        else if (f.type === 'date') k = toTime(v) ?? norm(v);
        else k = norm(v);
      }
      return { r, k };
    });
    const sign = dir === 'desc' ? -1 : 1;
    keyed.sort((a, b) => {
      if (a.k == null || b.k == null) return a.k == null ? (b.k == null ? 0 : 1) : -1; // vazios por último
      return a.k < b.k ? -sign : a.k > b.k ? sign : 0;
    });
    return keyed.map((x) => x.r);
  });
}

export const hoursOf = (st, rec, now = Date.now()) => {
  if (rec.t0 == null) return null;
  if (isActive(st, rec)) return Math.max(0, (now - rec.t0) / 3600000);
  return rec.t1 != null && rec.t1 >= rec.t0 ? (rec.t1 - rec.t0) / 3600000 : null;
};
