// Gráficos simples em HTML/CSS (sem bibliotecas; funcionam offline).
export function HBars({ items, format = (v) => v, empty = 'Sem dados no período.' }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="hbars">
      {items.map((i) => (
        <li key={i.label}>
          <span className="hb-label" title={i.label}>{i.label}</span>
          <span className="hb-track">
            {i.second != null && <span className="hb-fill second" style={{ width: `${(i.second / max) * 100}%` }} />}
            <span className="hb-fill" style={{ width: `${(i.value / max) * 100}%` }} />
          </span>
          <span className="hb-value">{format(i.value)}</span>
        </li>
      ))}
    </ul>
  );
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function Columns({ items }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="cols-chart" role="img" aria-label="Bloqueios por mês">
      {items.map((i) => (
        <div key={i.month} className="col">
          <span className="col-value">{i.count || ''}</span>
          <span className="col-bar" style={{ height: `${(i.count / max) * 100}%` }} />
          <span className="col-label">{MONTHS[Number(i.month.slice(5)) - 1]}</span>
        </div>
      ))}
    </div>
  );
}

const fmtDay = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

// Linha do tempo por equipamento: cada barra é um bloqueio (azul = encerrado; cor da faixa de idade = ainda ativo).
export function Timeline({ rows, from, to, stageColor }) {
  if (!rows.length) return <p className="muted">Sem bloqueios no período.</p>;
  const span = Math.max(to - from, 1);
  const ticks = [from, from + span / 2, to];
  return (
    <div className="timeline" role="img" aria-label="Linha do tempo de bloqueios por equipamento">
      <div className="tl-axis"><span className="tl-name" />
        <div className="tl-track">{ticks.map((t, i) => <span key={i} style={{ left: `${(i / 2) * 100}%` }}>{fmtDay(t)}</span>)}</div>
      </div>
      {rows.map((r) => (
        <div key={r.name} className="tl-row">
          <span className="tl-name" title={r.name}>{r.name}</span>
          <div className="tl-track">
            {r.segments.map((s) => {
              const a = Math.max(s.start, from);
              const b = Math.min(s.end ?? to, to);
              if (b < a) return null;
              const active = s.end == null;
              return (
                <i key={s.id} className={`tl-bar${active ? ' on' : ''}`}
                  style={{ left: `${((a - from) / span) * 100}%`, width: `max(3px, ${((b - a) / span) * 100}%)`, background: active ? stageColor((to - s.start) / 3600000) : undefined }}
                  title={`${new Date(s.start).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${active ? ' → ainda ativo' : ` → ${new Date(s.end).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}${s.by ? ` · ${s.by}` : ''}`} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
