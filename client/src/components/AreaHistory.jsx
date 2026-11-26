import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { HBars, Timeline } from './Charts.jsx';
import Icon from './Icons.jsx';
import { useTranslation } from '../i18n/I18nContext.jsx';
import { dynamicRecordKey } from '../i18n/keys.js';
import { formatHours, formatInt, stageFor } from '../format.js';

// Aba "Histórico" do painel do cadeado: ranking, reincidência e linha do tempo por equipamento.
export default function AreaHistory({ areaId, refreshKey }) {
  const { td } = useTranslation();
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stop = false;
    api.areaHistory(areaId, days).then((d) => !stop && (setData(d), setError(''))).catch((e) => !stop && setError(e.message));
    return () => { stop = true; };
  }, [areaId, days, refreshKey]);

  if (error) return <p className="expr-test err">{error}</p>;
  if (!data) return <div className="center-screen inline"><div className="spinner" /></div>;

  const k = data.kpis;
  const recurrent = data.groups.filter((g) => g.recurrences > 0).sort((a, b) => b.recurrences - a.recurrences).slice(0, 8);

  return (
    <div className="history">
      <div className="history-bar">
        <label className="field inline">Período
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value="30">30 dias</option><option value="90">90 dias</option>
            <option value="180">180 dias</option><option value="365">12 meses</option>
          </select>
        </label>
        <a className="btn" href={`/api/reports/area/${areaId}.pdf?days=${days}`} target="_blank" rel="noreferrer"><Icon name="file" size={16} /> PDF</a>
      </div>

      {data.missing.locked_at ? (
        <p className="notice">Defina, em Campos e KPIs, qual campo é a data de bloqueio para ver o histórico.</p>
      ) : (
        <>
          <div className="mini-kpis">
            <div><strong>{formatInt(k.lockouts)}</strong><span>bloqueios</span></div>
            <div><strong>{data.missing.equipment ? '—' : k.equipment}</strong><span>equipamentos</span></div>
            <div><strong>{formatHours(k.avg_hours)}</strong><span>duração média</span></div>
            <div><strong>{k.recurrences}</strong><span>reincidências</span></div>
          </div>

          <h3>Equipamentos mais bloqueados</h3>
          <HBars items={data.groups.slice(0, 8).map((g) => ({
            label: data.equipment_key ? td(dynamicRecordKey(data.equipment_key, g.name), g.name) : g.name,
            value: g.count,
          }))} />

          <h3>Reincidência <small>(novo bloqueio em até {data.recurrence_days} dias)</small></h3>
          {recurrent.length === 0 ? <p className="muted">Nenhuma reincidência no período.</p> : (
            <ul className="rec-list">
              {recurrent.map((g) => (
                <li key={g.name}>
                  <span className="rl-name" title={g.name}>
                    {data.equipment_key ? td(dynamicRecordKey(data.equipment_key, g.name), g.name) : g.name}
                  </span>
                  <span><strong>{g.recurrences}</strong> de {g.count}</span>
                  <small>entre bloqueios: {formatHours(g.mtbl_hours)}</small>
                </li>
              ))}
            </ul>
          )}

          <h3>Linha do tempo</h3>
          <Timeline rows={data.timeline} from={data.from} to={data.to} stageColor={(h) => stageFor(h, data.stages).color} />
          {data.timeline.some((r) => r.total > r.segments.length) && <p className="muted">Equipamentos com muitos bloqueios mostram só os mais recentes.</p>}
        </>
      )}
    </div>
  );
}
