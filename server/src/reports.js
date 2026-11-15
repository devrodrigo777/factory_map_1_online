// Relatórios imprimíveis em PDF (A4 paisagem): bloqueios ativos, histórico por período e ficha por área/equipamento.
import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { db } from './db.js';
import { getConfig } from './core.js';
import { isEmpty, norm, toTime } from './expr.js';
import { activeRecords, getStore, hoursOf, valueOf, valuesFor } from './store.js';
import { equipmentAnalysis } from './analytics.js';
import { matchedForArea } from './loto.js';

export const router = Router();
const httpError = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const INK = '#16202B', STEEL = '#5A6978', PAPER = '#F3F5F7', BLUE = '#2B5C8F', SIGNAL = '#E4572E', M = 36;
const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const fmtH = (h) => (h == null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${nf.format(h)} h` : `${nf.format(h / 24)} dias`);
const fmtDT = (ms) => (ms == null ? '—' : new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }));
const fmtD = (ms) => new Date(ms).toLocaleDateString('pt-BR');
const ymd = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
function fmtVal(type, v) {
  if (isEmpty(v)) return '—';
  if (type === 'number') return typeof v === 'number' ? nf.format(v) : String(v);
  if (type === 'date') { const t = toTime(v); return t == null ? String(v) : String(v).length === 10 ? fmtD(t) : fmtDT(t); }
  return String(v);
}
const stageFor = (h, stages) => stages.reduce((cur, s) => (h >= s.min_hours ? s : cur), stages[0]);
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

// ---------- peças de desenho ----------
const bottom = (doc) => doc.page.height - doc.page.margins.bottom;
function ensureSpace(doc, h) {
  if (doc.y + h > bottom(doc)) doc.addPage();
}

function section(doc, text) {
  ensureSpace(doc, 40);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(text, M, doc.y, { lineBreak: false });
  const y = doc.y + 16;
  doc.moveTo(M, y).lineTo(doc.page.width - M, y).lineWidth(0.6).strokeColor('#C8D0D8').stroke();
  doc.x = M; doc.y = y + 8;
}

function note(doc, text) {
  ensureSpace(doc, 24);
  doc.font('Helvetica').fontSize(9).fillColor(STEEL).text(text, M, doc.y, { width: doc.page.width - M * 2 });
  doc.fillColor(INK); doc.x = M; doc.y += 6;
}

function kpiRow(doc, items) {
  ensureSpace(doc, 70);
  const W = doc.page.width - M * 2, gap = 8, w = (W - gap * (items.length - 1)) / items.length, y = doc.y, h = 46;
  items.forEach((it, i) => {
    const x = M + i * (w + gap);
    doc.roundedRect(x, y, w, h, 5).fill(it.accent ? INK : PAPER);
    doc.fillColor(it.accent ? '#AEBCCB' : STEEL).font('Helvetica').fontSize(8).text(it.label, x + 8, y + 7, { width: w - 16, lineBreak: false, ellipsis: true });
    doc.fillColor(it.accent ? '#fff' : INK).font('Helvetica-Bold').fontSize(17).text(String(it.value), x + 8, y + 21, { width: w - 16, lineBreak: false, ellipsis: true });
  });
  doc.fillColor(INK); doc.x = M; doc.y = y + h + 14;
}

function legend(doc, stages) {
  ensureSpace(doc, 24);
  let x = M;
  const y = doc.y;
  doc.font('Helvetica').fontSize(8).fillColor(STEEL).text('Cor da coluna “Há” (idade do bloqueio):', x, y + 2, { lineBreak: false });
  x += 165;
  for (const s of stages) {
    doc.rect(x, y, 10, 10).fill(s.color);
    doc.fillColor(INK).text(s.label, x + 14, y + 2, { lineBreak: false });
    x += 22 + doc.widthOfString(s.label) + 10;
  }
  doc.x = M; doc.y = y + 22;
}

function table(doc, cols, rows, { cellStyle, rowFont = 8.5 } = {}) {
  const W = doc.page.width - M * 2, pad = 4;
  const sum = cols.reduce((s, c) => s + c.w, 0);
  const widths = cols.map((c) => (c.w / sum) * W);
  const head = () => {
    const y = doc.y;
    doc.rect(M, y, W, 18).fill(INK);
    let x = M;
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8);
    cols.forEach((c, i) => { doc.text(c.label, x + pad, y + 5, { width: widths[i] - pad * 2, align: c.align || 'left', lineBreak: false, ellipsis: true }); x += widths[i]; });
    doc.x = M; doc.y = y + 18;
  };
  ensureSpace(doc, 60);
  head();
  rows.forEach((row, ri) => {
    doc.font('Helvetica').fontSize(rowFont);
    const text = cols.map((c) => String(row[c.key] ?? '—'));
    const h = Math.max(...text.map((t, i) => doc.heightOfString(t, { width: widths[i] - pad * 2 })), 10) + pad * 2;
    if (doc.y + h > bottom(doc)) { doc.addPage(); head(); }
    const y = doc.y;
    if (ri % 2 === 1) doc.rect(M, y, W, h).fill(PAPER);
    let x = M;
    cols.forEach((c, i) => {
      const st = cellStyle?.(c, row);
      if (st?.fill) doc.rect(x, y, widths[i], h).fill(st.fill);
      doc.fillColor(st?.color || INK).font(st?.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(rowFont)
        .text(text[i], x + pad, y + pad, { width: widths[i] - pad * 2, align: c.align || 'left' });
      x += widths[i];
    });
    doc.fillColor(INK);
    doc.x = M; doc.y = y + h;
    doc.moveTo(M, doc.y).lineTo(M + W, doc.y).lineWidth(0.4).strokeColor('#E1E6EB').stroke();
  });
  doc.x = M; doc.y += 10;
}

// barras horizontais; devolve o y final
function hbars(doc, { x, y, w, title, items, fmt = (v) => v, color = BLUE, max = 10 }) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(title, x, y, { width: w, lineBreak: false, ellipsis: true });
  let yy = y + 17;
  const list = items.slice(0, max);
  if (!list.length) {
    doc.font('Helvetica').fontSize(9).fillColor(STEEL).text('Sem dados no período.', x, yy, { lineBreak: false });
    return yy + 16;
  }
  const m = Math.max(...list.map((i) => i.value), 1);
  const labelW = Math.min(150, w * 0.38), valW = 50, barW = w - labelW - valW - 8;
  for (const it of list) {
    doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(it.label, x, yy + 2, { width: labelW - 6, lineBreak: false, ellipsis: true });
    doc.rect(x + labelW, yy, barW, 12).fill('#EEF1F4');
    doc.rect(x + labelW, yy, Math.max(1, (barW * it.value) / m), 12).fill(color);
    doc.fillColor(INK).font('Helvetica-Bold').text(fmt(it.value), x + labelW + barW + 4, yy + 2, { width: valW, align: 'right', lineBreak: false });
    yy += 17;
  }
  return yy;
}

function twoCharts(doc, left, right) {
  const W = doc.page.width - M * 2, gap = 24, w = (W - gap) / 2;
  const rows = Math.max(Math.min(left.items.length, 10), Math.min(right.items.length, 10), 1);
  ensureSpace(doc, 24 + rows * 17 + 10);
  const y = doc.y;
  const b1 = hbars(doc, { ...left, x: M, y, w });
  const b2 = hbars(doc, { ...right, x: M + w + gap, y, w });
  doc.x = M; doc.y = Math.max(b1, b2) + 12;
}

// linha do tempo (Gantt) por equipamento
function gantt(doc, { rows, from, to }) {
  if (!rows.length) return;
  const W = doc.page.width - M * 2, labelW = 130, gx = M + labelW, gw = W - labelW, rowH = 15;
  const H = rows.length * rowH + 22;
  ensureSpace(doc, Math.min(H, 200) + 10);
  const y0 = doc.y, span = Math.max(to - from, 1);
  for (let i = 0; i <= 6; i++) {
    const x = gx + (gw * i) / 6;
    doc.moveTo(x, y0 + 12).lineTo(x, y0 + H).lineWidth(0.3).strokeColor('#D5DBE1').stroke();
    doc.fillColor(STEEL).font('Helvetica').fontSize(7.5).text(fmtD(from + (span * i) / 6), x - 22, y0, { width: 44, align: 'center', lineBreak: false });
  }
  rows.forEach((r, i) => {
    const y = y0 + 16 + i * rowH;
    if (i % 2 === 0) doc.rect(M, y, W, rowH).fill('#F7F9FA');
    doc.fillColor(INK).font('Helvetica').fontSize(8.5).text(r.name, M + 4, y + 3.5, { width: labelW - 8, lineBreak: false, ellipsis: true });
    for (const s of r.segments) {
      const a = Math.max(s.start, from), b = Math.min(s.end ?? to, to);
      if (b < a) continue;
      doc.rect(gx + ((a - from) / span) * gw, y + 3, Math.max(2, ((b - a) / span) * gw), rowH - 6).fill(s.end == null ? SIGNAL : BLUE);
    }
  });
  const cut = rows.some((r) => r.total > r.segments.length);
  doc.fillColor(STEEL).fontSize(8).text(`Azul: bloqueio encerrado · Laranja: ainda ativo${cut ? ' · equipamentos com muitos bloqueios mostram só os mais recentes' : ''}`, M, y0 + H + 4, { lineBreak: false });
  doc.fillColor(INK); doc.x = M; doc.y = y0 + H + 22;
}

// ---------- montagem do documento ----------
async function renderPdf(res, { filename, title, subtitle, user }, build) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: M, left: M, right: M, bottom: M + 8 }, bufferPages: true, info: { Title: title, Author: 'Mapa de bloqueios LOTO' } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((ok) => doc.on('end', ok));
  const W = doc.page.width - M * 2;

  doc.rect(0, 0, doc.page.width, 60).fill(INK);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(19).text(title, M, 14, { lineBreak: false });
  doc.fillColor('#AEBCCB').font('Helvetica').fontSize(10).text(subtitle, M, 38, { lineBreak: false });
  doc.fontSize(9).text(`Gerado em ${fmtDT(Date.now())}${user ? ` por ${user}` : ''}`, M, 22, { width: W, align: 'right', lineBreak: false });
  doc.fillColor(INK); doc.x = M; doc.y = 76;

  doc.on('pageAdded', () => {
    doc.rect(0, 0, doc.page.width, 26).fill(INK);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10).text(title, M, 8, { lineBreak: false });
    doc.fillColor(INK).font('Helvetica'); doc.x = M; doc.y = 42;
  });

  build(doc);

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const b = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor(STEEL);
    doc.text('Mapa de bloqueios LOTO', M, doc.page.height - 26, { lineBreak: false });
    doc.text(`Página ${i + 1} de ${range.count}`, M, doc.page.height - 26, { width: W, align: 'right', lineBreak: false });
    doc.page.margins.bottom = b;
  }
  doc.end();
  await done;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(Buffer.concat(chunks));
}

const who = (req) => req.user?.name || req.user?.username || '';

function defaultKeys(st) {
  const k = ['sector', 'equipment', 'locked_by', 'locked_at'].map((r) => st.ctx.role[r]).filter(Boolean);
  return k.length ? k : st.ctx.fields.filter((f) => f.visible).slice(0, 5).map((f) => f.key);
}
function pickFields(st, query) {
  const keys = String(query || '').split(',').map((s) => s.trim()).filter((k) => st.ctx.fields.some((f) => f.key === k));
  return (keys.length ? keys : defaultKeys(st)).map((k) => st.ctx.fields.find((f) => f.key === k));
}
const colOf = (f) => ({ key: f.key, label: f.label, w: f.type === 'date' ? 1.1 : f.type === 'number' ? 0.7 : 1.4, align: f.type === 'number' ? 'right' : 'left' });

function recurrenceTable(doc, groups, recDays) {
  const list = groups.filter((g) => g.recurrences > 0).sort((a, b) => b.recurrences - a.recurrences || b.count - a.count).slice(0, 15);
  if (!list.length) { note(doc, `Nenhuma reincidência (novo bloqueio do mesmo equipamento em até ${recDays} dias após o desbloqueio anterior).`); return; }
  table(doc, [
    { key: 'name', label: 'Equipamento', w: 2.2 },
    { key: 'count', label: 'Bloqueios', w: 0.8, align: 'right' },
    { key: 'rec', label: `Reincidências (até ${recDays} d)`, w: 1.3, align: 'right' },
    { key: 'mtbl', label: 'Tempo médio entre bloqueios', w: 1.5, align: 'right' },
    { key: 'last', label: 'Último bloqueio', w: 1.2 },
  ], list.map((g) => ({ name: g.name, count: g.count, rec: g.recurrences, mtbl: fmtH(g.mtbl_hours), last: fmtDT(g.last_at) })));
}

// ---------- relatórios ----------
router.get('/reports/active.pdf', wrap(async (req, res) => {
  const st = getStore();
  const { ctx } = st;
  const cfg = getConfig();
  const now = Date.now();
  const fields = pickFields(st, req.query.fields);
  const SE = ctx.role.sector, EQ = ctx.role.equipment;
  const act = activeRecords(st).slice().sort((a, b) => {
    const sa = SE ? norm(valueOf(st, a, SE)) : '', sb = SE ? norm(valueOf(st, b, SE)) : '';
    return sa < sb ? -1 : sa > sb ? 1 : (a.t0 ?? Infinity) - (b.t0 ?? Infinity);
  });
  const hrs = act.map((r) => hoursOf(st, r, now)).filter((h) => h != null);

  await renderPdf(res, {
    filename: `bloqueios-ativos-${ymd()}.pdf`, title: 'Bloqueios ativos',
    subtitle: `Situação em ${fmtDT(now)} · passagem de turno`, user: who(req),
  }, (doc) => {
    kpiRow(doc, [
      { label: 'Bloqueios ativos', value: act.length, accent: true },
      { label: 'Equipamentos bloqueados', value: EQ ? new Set(act.map((r) => norm(valueOf(st, r, EQ)))).size : '—' },
      { label: 'Bloqueio mais antigo', value: fmtH(hrs.length ? Math.max(...hrs) : null) },
      { label: 'Tempo médio', value: fmtH(avg(hrs)) },
    ]);
    if (!act.length) { note(doc, 'Nenhum bloqueio ativo neste momento.'); return; }
    legend(doc, cfg.lock_stages);
    const rows = act.map((r) => {
      const v = valuesFor(st, r);
      const h = hoursOf(st, r, now);
      const o = { _age: fmtH(h), _h: h };
      fields.forEach((f) => { o[f.key] = fmtVal(f.type, v[f.key]); });
      return o;
    });
    table(doc, [...fields.map(colOf), { key: '_age', label: 'Há', w: 0.8, align: 'center' }], rows, {
      cellStyle: (c, row) => (c.key === '_age' && row._h != null ? { fill: stageFor(row._h, cfg.lock_stages).color, color: '#fff', bold: true } : null),
    });
  });
}));

router.get('/reports/period.pdf', wrap(async (req, res) => {
  const st = getStore();
  const { ctx } = st;
  const cfg = getConfig();
  const now = Date.now();
  const parse = (s, fallback) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : fallback; };
  const fromMs = parse(req.query.from, now - 30 * 86400000);
  const toMs = parse(req.query.to, new Date().setHours(0, 0, 0, 0)) + 86399999;
  if (toMs < fromMs) throw httpError(400, 'A data final é anterior à inicial.');
  const sector = String(req.query.sector ?? '').trim();
  const SE = ctx.role.sector;
  const fields = pickFields(st, req.query.fields);

  let recs = st.recs.filter((r) => r.t0 != null && r.t0 >= fromMs && r.t0 <= toMs);
  if (sector && SE) recs = recs.filter((r) => norm(valueOf(st, r, SE)) === norm(sector));
  const an = equipmentAnalysis(st, recs, { fromMs, toMs, recurrenceDays: cfg.recurrence_days, now });

  await renderPdf(res, {
    filename: `historico-bloqueios-${ymd()}.pdf`, title: 'Histórico de bloqueios',
    subtitle: `${fmtD(fromMs)} a ${fmtD(toMs)}${sector ? ` · setor ${sector}` : ''}`, user: who(req),
  }, (doc) => {
    if (an.missing.locked_at) { note(doc, 'Defina, em “Campos e KPIs”, qual campo é a Data de bloqueio para gerar este relatório.'); return; }
    const k = an.kpis;
    kpiRow(doc, [
      { label: 'Bloqueios no período', value: k.lockouts, accent: true },
      { label: 'Equipamentos envolvidos', value: an.missing.equipment ? '—' : k.equipment },
      { label: 'Duração média', value: fmtH(k.avg_hours) },
      { label: 'Horas bloqueadas', value: fmtH(k.total_hours) },
      { label: `Reincidências (até ${cfg.recurrence_days} d)`, value: k.recurrences },
      { label: 'Ainda ativos', value: k.active },
    ]);

    const bySector = new Map();
    if (SE) for (const r of recs) { const s = isEmpty(valueOf(st, r, SE)) ? '(vazio)' : String(valueOf(st, r, SE)); bySector.set(s, (bySector.get(s) ?? 0) + 1); }
    twoCharts(doc,
      { title: 'Equipamentos mais bloqueados (nº de bloqueios)', items: an.groups.map((g) => ({ label: g.name, value: g.count })) },
      SE
        ? { title: 'Bloqueios por setor', color: SIGNAL, items: [...bySector.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) }
        : { title: 'Horas bloqueadas por equipamento', color: SIGNAL, fmt: fmtH, items: [...an.groups].sort((a, b) => b.total_hours - a.total_hours).map((g) => ({ label: g.name, value: g.total_hours })) });

    section(doc, 'Reincidência');
    recurrenceTable(doc, an.groups, cfg.recurrence_days);

    section(doc, 'Detalhamento dos bloqueios');
    const events = an._events.flatMap((g) => g.events).sort((a, b) => b.start - a.start);
    const LIMIT = 3000;
    if (events.length > LIMIT) note(doc, `Mostrando os ${LIMIT} bloqueios mais recentes de ${events.length}. Restrinja o período ou o setor para ver todos.`);
    const rows = events.slice(0, LIMIT).map((e) => {
      const v = valuesFor(st, st.byId.get(e.id));
      const o = { _dur: fmtH(((e.active ? now : e.end) - e.start) / 3600000), _st: e.active ? 'Ativo' : 'Encerrado' };
      if (e.end == null && !e.active) o._dur = '—';
      fields.forEach((f) => { o[f.key] = fmtVal(f.type, v[f.key]); });
      return o;
    });
    table(doc, [...fields.map(colOf), { key: '_dur', label: 'Duração', w: 0.8, align: 'right' }, { key: '_st', label: 'Estado', w: 0.8 }], rows, {
      cellStyle: (c, row) => (c.key === '_st' && row._st === 'Ativo' ? { color: '#A92F12', bold: true } : null),
    });
  });
}));

router.get('/reports/area/:id.pdf', wrap(async (req, res) => {
  const area = db.prepare('SELECT * FROM areas WHERE id = ?').get(Number(req.params.id));
  if (!area) throw httpError(404, 'Área não encontrada.');
  const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 3650);
  const st = getStore();
  const cfg = getConfig();
  const now = Date.now();
  let recs;
  try { recs = matchedForArea(st, area); } catch (e) { throw httpError(400, `Filtro da área com erro: ${e.message}`); }
  const fromMs = now - days * 86400000;
  const an = equipmentAnalysis(st, recs, { fromMs, toMs: now, recurrenceDays: cfg.recurrence_days, now, fallbackName: area.name });
  const LB = st.ctx.role.locked_by;

  await renderPdf(res, {
    filename: `ficha-${norm(area.name).replace(/[^a-z0-9]+/g, '-') || 'area'}-${ymd()}.pdf`,
    title: `Histórico: ${area.name}`, subtitle: `Últimos ${days} dias (${fmtD(fromMs)} a ${fmtD(now)})`, user: who(req),
  }, (doc) => {
    if (an.missing.locked_at) { note(doc, 'Defina, em “Campos e KPIs”, qual campo é a Data de bloqueio para gerar este relatório.'); return; }
    const k = an.kpis;
    kpiRow(doc, [
      { label: 'Bloqueios no período', value: k.lockouts, accent: true },
      { label: 'Equipamentos', value: an.missing.equipment ? '—' : k.equipment },
      { label: 'Duração média', value: fmtH(k.avg_hours) },
      { label: 'Horas bloqueadas', value: fmtH(k.total_hours) },
      { label: `Reincidências (até ${cfg.recurrence_days} d)`, value: k.recurrences },
      { label: 'Ativos agora', value: k.active },
    ]);
    twoCharts(doc,
      { title: 'Mais bloqueados (nº de bloqueios)', items: an.groups.map((g) => ({ label: g.name, value: g.count })) },
      { title: 'Horas bloqueadas', color: SIGNAL, fmt: fmtH, items: [...an.groups].sort((a, b) => b.total_hours - a.total_hours).map((g) => ({ label: g.name, value: g.total_hours })) });

    section(doc, 'Linha do tempo por equipamento');
    gantt(doc, { rows: an.timeline, from: fromMs, to: now });

    section(doc, 'Reincidência');
    recurrenceTable(doc, an.groups, cfg.recurrence_days);

    section(doc, 'Bloqueios do período');
    const events = an._events.flatMap((g) => g.events.map((e) => ({ ...e, name: g.name }))).sort((a, b) => b.start - a.start).slice(0, 3000);
    table(doc, [
      { key: 'name', label: 'Equipamento', w: 2 },
      ...(LB ? [{ key: 'by', label: 'Quem bloqueou', w: 1.4 }] : []),
      { key: 'start', label: 'Início', w: 1.2 },
      { key: 'end', label: 'Fim', w: 1.2 },
      { key: 'dur', label: 'Duração', w: 0.9, align: 'right' },
      { key: 'st', label: 'Estado', w: 0.9 },
    ], events.map((e) => ({
      name: e.name, by: isEmpty(e.by) ? '—' : String(e.by), start: fmtDT(e.start), end: e.active ? '—' : fmtDT(e.end),
      dur: fmtH((((e.active ? now : e.end) ?? e.start) - e.start) / 3600000), st: e.active ? 'Ativo' : 'Encerrado',
    })), { cellStyle: (c, row) => (c.key === 'st' && row.st === 'Ativo' ? { color: '#A92F12', bold: true } : null) });
  });
}));
