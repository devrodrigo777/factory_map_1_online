import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Shell from '../components/Shell.jsx';
import { Columns, HBars } from '../components/Charts.jsx';
import { useToast } from '../components/Toast.jsx';
import { ROLE_LABELS, formatHours, formatInt, formatValue } from '../format.js';

export default function Dashboard() {
  const toast = useToast();
  const [days, setDays] = useState('90');
  const [groupBy, setGroupBy] = useState('');
  const [fields, setFields] = useState([]);
  const [data, setData] = useState(null);
  const [dashboardCfg, setDashboardCfg] = useState({});

  useEffect(() => {
    api.listFields().then(setFields).catch(() => {});
    api.getSettings().then((s) => setDashboardCfg(s.dashboard || {})).catch(() => {});
  }, []);

  const load = useCallback(() => {
    api.stats({ days, ...(groupBy ? { groupBy } : {}) }).then(setData).catch((e) => toast(e.message, 'error'));
  }, [days, groupBy, toast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000); // painel de chão de fábrica: atualiza sozinho
    return () => clearInterval(t);
  }, [load]);

  const groupable = fields.filter((f) => f.type === 'text' || f.type === 'number');
  const k = data?.kpis;
  const groupLabel = fields.find((f) => f.key === data?.group_by)?.label;
  const missing = data ? ['locked_at', 'unlocked_at'].filter((r) => !data.roles[r]) : [];

  const filters = (
    <>
      <select className="topbar-select" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Período">
        <option value="30">Últimos 30 dias</option>
        <option value="90">Últimos 90 dias</option>
        <option value="180">Últimos 180 dias</option>
        <option value="365">Últimos 12 meses</option>
        <option value="0">Todo o período</option>
      </select>
    </>
  );

  return (
    <Shell title="Dashboard" actions={filters}>
      <div className="page dash">
        {!data && <div className="center-screen inline"><div className="spinner" /></div>}
        {data && (
          <>
            {missing.length > 0 && (
              <p className="notice">
                Para calcular durações e histórico, indique em <Link to="/fields">Campos e KPIs</Link> qual campo é a{' '}
                {missing.map((r) => ROLE_LABELS[r].toLowerCase()).join(' e a ')}.
              </p>
            )}

            <section className="kpi-grid" aria-label="Indicadores">
              {dashboardCfg.kpi_active !== false && <Kpi label="Bloqueios ativos agora" value={formatInt(k.active)} accent />}
              {dashboardCfg.kpi_active_equipment !== false && <Kpi label="Equipamentos bloqueados" value={formatInt(k.active_equipment)} />}
              {dashboardCfg.kpi_oldest_active !== false && <Kpi label="Bloqueio ativo mais antigo" value={formatHours(k.oldest_active_hours)} />}
              {dashboardCfg.kpi_avg_active !== false && <Kpi label="Tempo médio dos ativos" value={formatHours(k.avg_active_hours)} />}
              {dashboardCfg.kpi_avg_closed !== false && <Kpi label="Duração média (encerrados)" value={formatHours(k.avg_hours)} />}
              {dashboardCfg.kpi_period_total !== false && (
                <Kpi label={days === '0' ? 'Registros no total' : 'Bloqueios no período'} value={formatInt(k.period_total)} sub={`${formatInt(k.total)} no histórico`} />
              )}
              {data.custom.map((c) => (
                <Kpi key={c.id} label={c.name} value={c.error ? '!' : formatInt(c.value)} sub={c.error} />
              ))}
            </section>

            <div className="dash-grid">
              {dashboardCfg.chart_by_group !== false && (
                <section className="card">
                  <header className="card-head">
                    <h2>{groupLabel ? `Por ${groupLabel.toLowerCase()}` : 'Por grupo'}</h2>
                    <select value={groupBy || data.group_by || ''} onChange={(e) => setGroupBy(e.target.value)} aria-label="Agrupar por">
                      {groupable.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  </header>
                  <p className="muted">Ativos agora (forte) e total de bloqueios no período (claro).</p>
                  <HBars items={data.by_group.map((g) => ({ label: g.label, value: g.active, second: g.total }))}
                    format={(v) => v} />
                </section>
              )}

              {dashboardCfg.chart_by_month !== false && (
                <section className="card">
                  <h2>Bloqueios por mês</h2>
                  <Columns items={data.by_month} />
                </section>
              )}

              {dashboardCfg.chart_avg_by_group !== false && (
                <section className="card">
                  <h2>Duração média por {groupLabel?.toLowerCase() || 'grupo'}</h2>
                  <HBars items={data.avg_by_group.map((g) => ({ label: g.label, value: g.hours }))} format={formatHours}
                    empty="Precisa de data de bloqueio e de desbloqueio." />
                </section>
              )}

              {dashboardCfg.chart_by_user !== false && (
                <section className="card">
                  <h2>Quem mais bloqueou</h2>
                  <HBars items={data.by_user.map((u) => ({ label: u.label, value: u.count }))}
                    empty="Defina o campo “Quem bloqueou” em Campos e KPIs." />
                </section>
              )}

              {dashboardCfg.chart_top_equipment !== false && (
                <section className="card">
                  <h2>Equipamentos mais bloqueados</h2>
                  <HBars items={data.top_equipment.map((e) => ({ label: e.label, value: e.count }))}
                    empty="Defina o campo “Equipamento” e a data de bloqueio em Campos e KPIs." />
                </section>
              )}

              {dashboardCfg.chart_recurrence !== false && (
                <section className="card">
                  <h2>Reincidência</h2>
                  <p className="muted">Novo bloqueio do mesmo equipamento em até {data.recurrence_days} dias após o desbloqueio anterior.</p>
                  <HBars items={data.recurrence.map((e) => ({ label: e.label, value: e.recurrences }))} empty="Nenhuma reincidência no período." />
                </section>
              )}

              {dashboardCfg.chart_oldest_active !== false && (
                <section className="card wide">
                  <h2>Ativos há mais tempo</h2>
                  {data.oldest_active.length === 0 ? <p className="muted">Nenhum bloqueio ativo.</p> : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead><tr>
                          {['equipment', 'sector', 'locked_by', 'locked_at'].filter((r) => data.roles[r]).map((r) => <th key={r}>{ROLE_LABELS[r]}</th>)}
                          <th>ATIVO HÁ</th>
                        </tr></thead>
                        <tbody>
                          {data.oldest_active.map((r) => (
                            <tr key={r.id}>
                              {['equipment', 'sector', 'locked_by', 'locked_at'].filter((x) => data.roles[x]).map((x) => (
                                <td key={x}>{formatValue(x === 'locked_at' ? 'date' : 'text', r.values[data.roles[x]])}</td>
                              ))}
                              <td><strong>{formatHours(r.hours)}</strong></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className={`kpi${accent ? ' accent' : ''}`}>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}
