// Núcleo compartilhado: conversões de valores, contexto de campos/expressões e configurações.
import crypto from 'node:crypto';
import { db, getSetting, setSetting } from './db.js';
import { compile, isEmpty, norm } from './expr.js';

const pad = (n) => String(n).padStart(2, '0');
function fmtDate(y, mo, d, h = 0, mi = 0, s = 0) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  return h || mi || s ? `${date}T${pad(h)}:${pad(mi)}${s ? ':' + pad(s) : ''}` : date;
}

export function normDate(v) {
  if (isEmpty(v)) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // o ExcelJS entrega a data/hora "como escrita na célula" em campos UTC
    return fmtDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate(), v.getUTCHours(), v.getUTCMinutes(), v.getUTCSeconds());
  }
  if (typeof v === 'number') return v > 20000 && v < 80000 ? normDate(new Date(Math.round((v - 25569) * 86400000))) : null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) return fmtDate(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) ?? s;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return fmtDate(y, +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) ?? s;
  }
  return s; // texto que não parece data: mantém para o usuário ver e corrigir
}

function parseNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  let s = String(v ?? '').trim().replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function coerce(type, v) {
  if (isEmpty(v)) return null;
  if (type === 'number') return parseNumber(v);
  if (type === 'date') return normDate(v);
  if (v instanceof Date) return normDate(v);
  if (type === 'photo') {
    if (Array.isArray(v)) {
      const arr = v.map((x) => String(x ?? '').trim()).filter(Boolean);
      return arr.length ? JSON.stringify(arr) : null;
    }
    const s = String(v ?? '').trim();
    if (!s) return null;
    if (s.startsWith('[') && s.endsWith(']')) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) {
          const clean = arr.map((x) => String(x ?? '').trim()).filter(Boolean);
          return clean.length ? JSON.stringify(clean) : null;
        }
      } catch {}
    }
    return s;
  }
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (Array.isArray(v)) return JSON.stringify(v);
  return String(v).trim();
}

export function hashValues(values) {
  const entries = Object.keys(values).sort().filter((k) => !isEmpty(values[k])).map((k) => [k, norm(values[k])]);
  return crypto.createHash('sha1').update(JSON.stringify(entries)).digest('hex');
}


// ---------- contexto: campos + expressões compiladas ----------
const constFn = (v) => { const f = () => v; f.refs = []; f.volatile = false; f.usesActive = false; return f; };

export function buildCtx() {
  const fields = db.prepare('SELECT * FROM fields ORDER BY sort_order, id').all();
  const index = new Map();
  fields.forEach((f) => index.set(norm(f.key), f.key));
  fields.forEach((f) => index.set(norm(f.label), f.key)); // o nome visível tem prioridade

  const base = fields.filter((f) => !f.expr);
  const baseKeys = new Set(base.map((f) => f.key));
  const role = {}; // papéis só valem para campos "de verdade" (não calculados)
  fields.forEach((f) => { if (f.role && baseKeys.has(f.key)) role[f.role] = f.key; });

  const computed = fields.filter((f) => f.expr).map((f) => {
    try { return { f, fn: compile(f.expr, index) }; } catch (e) { return { f, fn: constFn(null), error: e.message }; }
  });
  const computedKeys = new Set(computed.map((c) => c.f.key));

  // campos calculados que dependem da hora atual (direta ou indiretamente)
  const volKeys = new Set();
  for (let changed = true; changed;) {
    changed = false;
    for (const c of computed) {
      if (!volKeys.has(c.f.key) && (c.fn.volatile || c.fn.refs.some((k) => volKeys.has(k)))) { volKeys.add(c.f.key); changed = true; }
    }
  }
  const isVolatile = (fn) => !!fn && (fn.volatile || fn.refs.some((k) => volKeys.has(k)));

  const activeSrc = getSetting('active_expr') || (role.unlocked_at ? `isEmpty([${role.unlocked_at}])` : '');
  let activeFn = constFn(true);
  let activeError = null;
  if (activeSrc) {
    try { activeFn = compile(activeSrc, index); } catch (e) { activeError = e.message; }
  }

  return {
    fields, index, base, computed, computedKeys, role,
    computedVolatile: volKeys.size > 0,
    activeFn, activeError, activeSrc,
    activeVolatile: isVolatile(activeFn),
    activeNeedsComputed: activeFn.refs.some((k) => computedKeys.has(k)),
    isVolatile,
    needsComputed: (fn) => fn.refs.some((k) => computedKeys.has(k)),
    compile: (src) => compile(src, index),
  };
}

export function validateExpr(src) {
  if (String(src ?? '').trim()) buildCtx().compile(src);
}

// ---------- configurações (cores do cadeado, backup e importação automáticos) ----------
export const DEFAULT_CONFIG = {
  lock_stages: [
    { min_hours: 0, color: '#2B5C8F', label: 'Recente' },
    { min_hours: 24, color: '#E0A100', label: 'Mais de 24 h' },
    { min_hours: 72, color: '#E4572E', label: 'Mais de 72 h' },
    { min_hours: 168, color: '#A32020', label: 'Mais de 7 dias' },
  ],
  recurrence_days: 7,
  backup: { enabled: true, mode: 'daily', time: '02:00', every_hours: 6, type: 'full', include_users: true, keep: 14, copy_to: '' },
  import: { enabled: false, folder: '', interval_s: 60, profile_id: null, after: 'move', min_match: 0.6, check_on_login: false },
};

export function getConfig() {
  let saved = {};
  try { saved = JSON.parse(getSetting('config') || '{}'); } catch { /* usa padrão */ }
  return {
    ...DEFAULT_CONFIG, ...saved,
    backup: { ...DEFAULT_CONFIG.backup, ...(saved.backup ?? {}) },
    import: { ...DEFAULT_CONFIG.import, ...(saved.import ?? {}) },
  };
}
export const saveConfig = (cfg) => setSetting('config', JSON.stringify(cfg));
