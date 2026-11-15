// Motor de expressões (estilo "fórmulas de BI"), seguro: sem eval.
//   [Setor] == "Produção" and [Equipamento] == "Corte a laser"
//   ativo and daysSince([Data de bloqueio]) > 7
// Campos entre colchetes (pelo nome ou pela chave). Texto sem diferenciar maiúsculas/acentos.

export class ExprError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

export const norm = (v) => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
export const isEmpty = (v) => v == null || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && Number.isNaN(v));

const ISO_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/;
export function toTime(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && ISO_RE.test(v.trim())) {
    let s = v.trim().replace(' ', 'T');
    if (s.length === 10) s += 'T00:00:00';
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

const toNum = (v) => {
  if (isEmpty(v)) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// -1/0/1 ou null quando algum lado é vazio
function cmp(a, b) {
  if (isEmpty(a) || isEmpty(b)) return null;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const ta = toTime(a), tb = toTime(b);
  if (ta != null && tb != null) return ta - tb;
  const na = toNum(a), nb = toNum(b);
  if (na != null && nb != null) return na - nb;
  return norm(a).localeCompare(norm(b));
}
const eq = (a, b) => {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (isEmpty(a) || isEmpty(b)) return false;
  return cmp(a, b) === 0;
};

const DAY = 86400000;
const timeOf = (v) => toTime(v instanceof Date ? v : v);
const FN = {
  isempty: (x) => isEmpty(x),
  vazio: (x) => isEmpty(x),
  contains: (a, b) => norm(a).includes(norm(b)),
  contem: (a, b) => norm(a).includes(norm(b)),
  startswith: (a, b) => norm(a).startsWith(norm(b)),
  endswith: (a, b) => norm(a).endsWith(norm(b)),
  lower: (a) => (isEmpty(a) ? null : String(a).toLowerCase()),
  upper: (a) => (isEmpty(a) ? null : String(a).toUpperCase()),
  trim: (a) => {
    if (isEmpty(a)) return null;
    if (Array.isArray(a)) return a.map((x) => String(x ?? '').trim()).filter((x) => x.length > 0);
    return String(a).trim();
  },
  limpar: (a) => FN.trim(a),
  split: (str, delim) => {
    if (isEmpty(str)) return [];
    const items = Array.isArray(str) ? str : [str];
    const d = delim != null ? String(delim) : null;
    return items.flatMap((item) => {
      const s = String(item ?? '');
      const separator = d != null ? d : (s.includes(';') ? ';' : ',');
      return s.split(separator).map((x) => x.trim()).filter((x) => x.length > 0);
    });
  },
  separar: (str, delim) => FN.split(str, delim),
  len: (a) => String(a ?? '').length,
  now: () => new Date(),
  agora: () => new Date(),
  today: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; },
  hoje: () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; },
  dayssince: (d) => { const t = timeOf(d); return t == null ? null : (Date.now() - t) / DAY; },
  diasdesde: (d) => FN.dayssince(d),
  hourssince: (d) => { const t = timeOf(d); return t == null ? null : (Date.now() - t) / 3600000; },
  horasdesde: (d) => FN.hourssince(d),
  diffdays: (a, b) => { const x = timeOf(a), y = timeOf(b); return x == null || y == null ? null : (y - x) / DAY; },
  difdias: (a, b) => FN.diffdays(a, b),
  diffhours: (a, b) => { const x = timeOf(a), y = timeOf(b); return x == null || y == null ? null : (y - x) / 3600000; },
  difhoras: (a, b) => FN.diffhours(a, b),
  year: (d) => { const t = timeOf(d); return t == null ? null : new Date(t).getFullYear(); },
  ano: (d) => FN.year(d),
  month: (d) => { const t = timeOf(d); return t == null ? null : new Date(t).getMonth() + 1; },
  mes: (d) => FN.month(d),
  day: (d) => { const t = timeOf(d); return t == null ? null : new Date(t).getDate(); },
  if: (c, a, b) => (c ? a : b ?? null),
  se: (c, a, b) => (c ? a : b ?? null),
  coalesce: (...xs) => xs.find((x) => !isEmpty(x)) ?? null,
  round: (n, d = 0) => { const x = toNum(n); return x == null ? null : Math.round(x * 10 ** d) / 10 ** d; },
  abs: (n) => { const x = toNum(n); return x == null ? null : Math.abs(x); },
  min: (...xs) => { const v = xs.map(toNum).filter((x) => x != null); return v.length ? Math.min(...v) : null; },
  max: (...xs) => { const v = xs.map(toNum).filter((x) => x != null); return v.length ? Math.max(...v) : null; },
  text: (x) => (isEmpty(x) ? '' : String(x)),
  number: (x) => toNum(x),
  oneof: (x, ...xs) => xs.some((y) => eq(x, y)),
  between: (x, a, b) => { const l = cmp(x, a), h = cmp(x, b); return l != null && h != null && l >= 0 && h <= 0; },
};

// ---------- tokenizer ----------
const KW = { and: 'and', e: 'and', or: 'or', ou: 'or', not: 'not', nao: 'not' };
const CONST = { true: true, verdadeiro: true, false: false, falso: false, null: null, nulo: null };

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '[') {
      const j = src.indexOf(']', i);
      if (j < 0) throw new ExprError('Falta fechar "]" em um nome de campo.');
      out.push({ t: 'field', v: src.slice(i + 1, j).trim() });
      i = j + 1; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) j++;
        s += src[j++];
      }
      if (j >= src.length) throw new ExprError('Texto sem aspas de fechamento.');
      out.push({ t: 'str', v: s });
      i = j + 1; continue;
    }
    const rest = src.slice(i);
    let m;
    if ((m = /^\d+(?:\.\d+)?/.exec(rest))) { out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if ((m = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(rest))) { out.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
    const two = rest.slice(0, 2);
    if (['==', '!=', '<>', '<=', '>=', '&&', '||'].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('=<>+-*/%!(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new ExprError(`Caractere inesperado: "${c}"`);
  }
  return out;
}

// ---------- parser ----------
function parse(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (...v) => peek()?.t === 'op' && v.includes(peek().v);
  const kw = (t) => (t?.t === 'id' ? KW[norm(t.v)] : undefined);
  const isKw = (name) => kw(peek()) === name;
  const expectOp = (v) => {
    if (!isOp(v)) throw new ExprError(`Esperado "${v}".`);
    i++;
  };

  const parseOr = () => {
    let a = parseAnd();
    while (isKw('or') || isOp('||')) { i++; a = { t: 'or', a, b: parseAnd() }; }
    return a;
  };
  const parseAnd = () => {
    let a = parseNot();
    while (isKw('and') || isOp('&&')) { i++; a = { t: 'and', a, b: parseNot() }; }
    return a;
  };
  const parseNot = () => {
    if (isKw('not') || isOp('!')) { i++; return { t: 'not', a: parseNot() }; }
    return parseCmp();
  };
  const parseCmp = () => {
    let a = parseAdd();
    while (isOp('==', '=', '!=', '<>', '<', '>', '<=', '>=')) {
      const op = peek().v; i++;
      a = { t: 'cmp', op, a, b: parseAdd() };
    }
    return a;
  };
  const parseAdd = () => {
    let a = parseMul();
    while (isOp('+', '-')) { const op = peek().v; i++; a = { t: 'bin', op, a, b: parseMul() }; }
    return a;
  };
  const parseMul = () => {
    let a = parseUnary();
    while (isOp('*', '/', '%')) { const op = peek().v; i++; a = { t: 'bin', op, a, b: parseUnary() }; }
    return a;
  };
  const parseUnary = () => {
    if (isOp('-')) { i++; return { t: 'neg', a: parseUnary() }; }
    return parsePrimary();
  };
  const parsePrimary = () => {
    const t = tokens[i++];
    if (!t) throw new ExprError('A expressão terminou antes do esperado.');
    if (t.t === 'num' || t.t === 'str') return { t: 'lit', v: t.v };
    if (t.t === 'field') return { t: 'field', v: t.v };
    if (t.t === 'op' && t.v === '(') { const e = parseOr(); expectOp(')'); return e; }
    if (t.t === 'id') {
      const n = norm(t.v);
      if (isOp('(')) {
        i++;
        const args = [];
        if (!isOp(')')) {
          do { args.push(parseOr()); } while (isOp(',') && ++i);
        }
        expectOp(')');
        return { t: 'call', name: n, raw: t.v, args };
      }
      if (n in CONST) return { t: 'lit', v: CONST[n] };
      if (n === 'ativo') return { t: 'active' };
      throw new ExprError(`"${t.v}" não é reconhecido. Nomes de campos vão entre colchetes, por exemplo [${t.v}].`);
    }
    throw new ExprError(`Símbolo inesperado: "${t.v}"`);
  };

  const ast = parseOr();
  if (i < tokens.length) throw new ExprError(`Trecho inesperado perto de "${tokens[i].v}".`);
  return ast;
}

// ---------- compilação ----------
const TIME_FN = new Set(['now', 'agora', 'today', 'hoje', 'dayssince', 'diasdesde', 'hourssince', 'horasdesde']);

function build(n, ix, meta) {
  switch (n.t) {
    case 'lit': return () => n.v;
    case 'active': meta.usesActive = true; return (r) => !!r._active;
    case 'field': {
      const key = ix.get(norm(n.v));
      if (!key) throw new ExprError(`Campo desconhecido: [${n.v}]`);
      meta.refs.add(key);
      return (r) => r[key] ?? null;
    }
    case 'or': { const a = build(n.a, ix, meta), b = build(n.b, ix, meta); return (r) => !!(a(r) || b(r)); }
    case 'and': { const a = build(n.a, ix, meta), b = build(n.b, ix, meta); return (r) => !!(a(r) && b(r)); }
    case 'not': { const a = build(n.a, ix, meta); return (r) => !a(r); }
    case 'neg': { const a = build(n.a, ix, meta); return (r) => { const x = toNum(a(r)); return x == null ? null : -x; }; }
    case 'cmp': {
      const a = build(n.a, ix, meta), b = build(n.b, ix, meta);
      const op = n.op;
      return (r) => {
        const x = a(r), y = b(r);
        if (op === '==' || op === '=') return eq(x, y);
        if (op === '!=' || op === '<>') return !eq(x, y);
        const c = cmp(x, y);
        if (c == null) return false;
        return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
      };
    }
    case 'bin': {
      const a = build(n.a, ix, meta), b = build(n.b, ix, meta);
      return (r) => {
        const x = a(r), y = b(r);
        if (n.op === '+' && ((typeof x === 'string' && toNum(x) == null) || (typeof y === 'string' && toNum(y) == null))) {
          return String(x ?? '') + String(y ?? '');
        }
        const p = toNum(x), q = toNum(y);
        if (p == null || q == null) return null;
        switch (n.op) {
          case '+': return p + q;
          case '-': return p - q;
          case '*': return p * q;
          case '/': return q === 0 ? null : p / q;
          default: return q === 0 ? null : p % q;
        }
      };
    }
    case 'call': {
      const f = FN[n.name];
      if (!f) throw new ExprError(`Função desconhecida: ${n.raw}()`);
      if (TIME_FN.has(n.name)) meta.volatile = true;
      const args = n.args.map((a) => build(a, ix, meta));
      return (r) => f(...args.map((a) => a(r)));
    }
    default: throw new ExprError('Expressão inválida.');
  }
}

/** ix: Map(nome normalizado -> chave do campo). Devolve fn(valores) => resultado. */
export function compile(src, ix) {
  if (!String(src ?? '').trim()) throw new ExprError('A expressão está vazia.');
  const meta = { refs: new Set(), volatile: false, usesActive: false };
  const fn = build(parse(tokenize(String(src))), ix, meta);
  const safe = (r) => {
    try { return fn(r); } catch { return null; }
  };
  // análise usada pelo cache: quais campos lê, se depende da hora atual, se usa "ativo"
  safe.refs = [...meta.refs];
  safe.volatile = meta.volatile;
  safe.usesActive = meta.usesActive;
  return safe;
}
