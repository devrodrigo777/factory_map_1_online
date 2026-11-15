// Análise por equipamento: ranking, reincidência, tempo entre bloqueios e linha do tempo.
import { isEmpty, norm } from './expr.js';
import { isActive, valueOf } from './store.js';

const DAY = 86400000;

/**
 * recs: registros (já filtrados, ex.: os da área). Considera os bloqueios que se sobrepõem ao período.
 * Reincidência = novo bloqueio do mesmo equipamento até `recurrenceDays` dias depois do desbloqueio anterior.
 */
export function equipmentAnalysis(st, recs, { fromMs, toMs, recurrenceDays = 7, now = Date.now(), fallbackName = 'Todos', segmentsPerRow = 300 }) {
  const { role } = st.ctx;
  const EQ = role.equipment;
  const LB = role.locked_by;
  const groups = new Map();

  for (const r of recs) {
    if (r.t0 == null) continue;
    const active = isActive(st, r);
    const end = active ? now : r.t1 != null && r.t1 >= r.t0 ? r.t1 : null;
    if (r.t0 > toMs || (end ?? r.t0) < fromMs) continue;
    const raw = EQ ? valueOf(st, r, EQ) : null;
    const name = isEmpty(raw) ? (EQ ? '(sem equipamento)' : fallbackName) : String(raw);
    const key = norm(name);
    let g = groups.get(key);
    if (!g) { g = { name, events: [] }; groups.set(key, g); }
    g.events.push({ id: r.id, start: r.t0, end, active, by: LB ? valueOf(st, r, LB) : null });
  }

  const out = [];
  for (const g of groups.values()) {
    const ev = g.events.sort((a, b) => a.start - b.start);
    const closed = ev.filter((e) => !e.active && e.end != null);
    let recurrences = 0;
    let gapSum = 0;
    for (let i = 1; i < ev.length; i++) {
      const prev = ev[i - 1];
      gapSum += ev[i].start - prev.start;
      if (prev.end != null && ev[i].start >= prev.end && ev[i].start - prev.end <= recurrenceDays * DAY) recurrences++;
    }
    out.push({
      name: g.name,
      count: ev.length,
      active: ev.some((e) => e.active),
      total_hours: ev.reduce((s, e) => s + (e.end != null ? (e.end - e.start) / 3600000 : 0), 0),
      avg_hours: closed.length ? closed.reduce((s, e) => s + (e.end - e.start), 0) / closed.length / 3600000 : null,
      last_at: ev[ev.length - 1].start,
      recurrences,
      mtbl_hours: ev.length > 1 ? gapSum / (ev.length - 1) / 3600000 : null, // tempo médio entre bloqueios
      events: ev,
    });
  }
  out.sort((a, b) => b.count - a.count || b.total_hours - a.total_hours);

  const all = out.flatMap((g) => g.events);
  const closedAll = all.filter((e) => !e.active && e.end != null);
  return {
    from: fromMs, to: toMs,
    missing: { equipment: !EQ, locked_at: !role.locked_at },
    kpis: {
      lockouts: all.length,
      equipment: out.length,
      active: all.filter((e) => e.active).length,
      avg_hours: closedAll.length ? closedAll.reduce((s, e) => s + (e.end - e.start), 0) / closedAll.length / 3600000 : null,
      total_hours: out.reduce((s, g) => s + g.total_hours, 0),
      recurrences: out.reduce((s, g) => s + g.recurrences, 0),
    },
    groups: out.map(({ events, ...g }) => g),
    timeline: out.slice(0, 15).map((g) => ({
      name: g.name,
      total: g.events.length,
      segments: g.events.slice(-segmentsPerRow).map((e) => ({ id: e.id, start: e.start, end: e.active ? null : e.end, by: e.by })),
    })),
    _events: out, // uso interno (relatórios)
  };
}
