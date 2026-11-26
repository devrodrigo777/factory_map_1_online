import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Shell from '../components/Shell.jsx';
import { Columns, HBars } from '../components/Charts.jsx';
import { useToast } from '../components/Toast.jsx';
import { useTranslation } from '../i18n/I18nContext.jsx';
import { dynamicFieldKey, dynamicRecordKey } from '../i18n/keys.js';
import { ROLE_LABELS, formatHours, formatInt, formatValue } from '../format.js';

export default function Dashboard() {
  const toast = useToast();
  const { t, td } = useTranslation();
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
  const groupField = fields.find((f) => f.key === data?.group_by);
  const groupLabel = groupField ? td(dynamicFieldKey(groupField.key, groupField.label), groupField.label) : '';
  const missing = data ? ['locked_at', 'unlocked_at'].filter((r) => !data.roles[r]) : [];

  const filters = (
    <>
      <select className="topbar-select" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Período">
        <option value="30">{t('dashboard.period_30', 'Últimos 30 dias')}</option>
        <option value="90">{t('dashboard.period_90', 'Últimos 90 dias')}</option>
        <option value="180">{t('dashboard.period_180', 'Últimos 180 dias')}</option>
        <option value="365">{t('dashboard.period_365', 'Últimos 12 meses')}</option>
        <option value="0">{t('dashboard.period_all', 'Todo o período')}</option>
      </select>
    </>
  );

  return (
    <Shell title={t('dashboard.title', 'Dashboard')} actions={filters}>
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
              {dashboardCfg.kpi_active !== false && <Kpi label={t('dashboard.kpi_active_now', 'Bloqueios ativos agora')} value={formatInt(k.active)} accent />}
              {dashboardCfg.kpi_active_equipment !== false && <Kpi label={t('dashboard.kpi_blocked_equip', 'Equipamentos bloqueados')} value={formatInt(k.active_equipment)} />}
              {dashboardCfg.kpi_oldest_active !== false && <Kpi label={t('dashboard.kpi_oldest_active', 'Bloqueio ativo mais antigo')} value={formatHours(k.oldest_active_hours)} />}
              {dashboardCfg.kpi_avg_active !== false && <Kpi label={t('dashboard.kpi_avg_active', 'Tempo médio dos ativos')} value={formatHours(k.avg_active_hours)} />}
              {dashboardCfg.kpi_avg_closed !== false && <Kpi label={t('dashboard.kpi_avg_closed', 'Duração média (encerrados)')} value={formatHours(k.avg_hours)} />}
              {dashboardCfg.kpi_period_total !== false && (
                <Kpi label={days === '0' ? t('dashboard.kpi_total_records', 'Registros no total') : t('dashboard.kpi_period_locks', 'Bloqueios no período')} value={formatInt(k.period_total)} sub={t('dashboard.kpi_in_history', { count: formatInt(k.total) })} />
              )}
              {data.custom.map((c) => (
                <Kpi key={c.id} label={c.name} value={c.error ? '!' : formatInt(c.value)} sub={c.error} />
              ))}
            </section>

            <div className="dash-grid">
              {dashboardCfg.chart_by_group !== false && (
                <section className="card">
                  <header className="card-head">
                    <h2>{groupLabel ? `Por ${groupLabel.toLowerCase()}` : t('dashboard.chart_by_group', 'Por grupo')}</h2>
                    <select value={groupBy || data.group_by || ''} onChange={(e) => setGroupBy(e.target.value)} aria-label="Agrupar por">
                      {groupable.map((f) => <option key={f.key} value={f.key}>{td(dynamicFieldKey(f.key, f.label), f.label)}</option>)}
                    </select>
                  </header>
                  <p className="muted">{t('dashboard.active_now_legend', 'Ativos agora (forte) e total de bloqueios no período (claro).')}</p>
                  <HBars items={data.by_group.map((g) => ({
                    label: data.group_by ? td(dynamicRecordKey(data.group_by, g.label), g.label) : g.label,
                    value: g.active,
                    second: g.total,
                  }))}
                    format={(v) => v} />
                </section>
              )}

              {dashboardCfg.chart_by_month !== false && (
                <section className="card">
                  <h2>{t('dashboard.chart_by_month', 'Bloqueios por mês')}</h2>
                  <Columns items={data.by_month} />
                </section>
              )}

              {dashboardCfg.chart_avg_by_group !== false && (
                <section className="card">
                  <h2>Duração média por {groupLabel?.toLowerCase() || 'grupo'}</h2>
                  <HBars items={data.avg_by_group.map((g) => ({
                    label: data.group_by ? td(dynamicRecordKey(data.group_by, g.label), g.label) : g.label,
                    value: g.hours,
                  }))} format={formatHours}
                    empty="Precisa de data de bloqueio e de desbloqueio." />
                </section>
              )}

              {dashboardCfg.chart_by_user !== false && (
                <section className="card">
                  <h2>{t('dashboard.chart_top_users', 'Quem mais bloqueou')}</h2>
                  <HBars items={data.by_user.map((u) => ({
                    label: data.roles.locked_by ? td(dynamicRecordKey(data.roles.locked_by, u.label), u.label) : u.label,
                    value: u.count,
                  }))}
                    empty="Defina o campo “Quem bloqueou” em Campos e KPIs." />
                </section>
              )}

              {dashboardCfg.chart_top_equipment !== false && (
                <section className="card">
                  <h2>{t('dashboard.chart_top_equipment', 'Equipamentos mais bloqueados')}</h2>
                  <HBars items={data.top_equipment.map((e) => ({
                    label: data.roles.equipment ? td(dynamicRecordKey(data.roles.equipment, e.label), e.label) : e.label,
                    value: e.count,
                  }))}
                    empty="Defina o campo “Equipamento” e a data de bloqueio em Campos e KPIs." />
                </section>
              )}

              {dashboardCfg.chart_recurrence !== false && (
                <section className="card">
                  <h2>{t('dashboard.chart_recurrence', 'Reincidência')}</h2>
                  <p className="muted">{t('dashboard.recurrence_desc', { days: data.recurrence_days })}</p>
                  <HBars items={data.recurrence.map((e) => ({
                    label: data.roles.equipment ? td(dynamicRecordKey(data.roles.equipment, e.label), e.label) : e.label,
                    value: e.recurrences,
                  }))} empty="Nenhuma reincidência no período." />
                </section>
              )}

              {dashboardCfg.chart_oldest_active !== false && (
                <section className="card wide">
                  <h2>{t('dashboard.chart_oldest_active', 'Ativos há mais tempo')}</h2>
                  {data.oldest_active.length === 0 ? <p className="muted">{t('dashboard.no_active_locks', 'Nenhum bloqueio ativo.')}</p> : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead><tr>
                          {['equipment', 'sector', 'locked_by', 'locked_at'].filter((r) => data.roles[r]).map((r) => {
                            const field = fields.find((f) => f.key === data.roles[r]);
                            const label = field?.label || ROLE_LABELS[r];
                            return <th key={r}>{td(dynamicFieldKey(data.roles[r], label), label)}</th>;
                          })}
                          <th>{t('dashboard.col_active_for', 'ATIVO HÁ')}</th>
                        </tr></thead>
                        <tbody>
                          {data.oldest_active.map((r) => (
                            <tr key={r.id}>
                              {['equipment', 'sector', 'locked_by', 'locked_at'].filter((x) => data.roles[x]).map((x) => (
                                <td key={x}>
                                  {x !== 'locked_at' && r.values[data.roles[x]] != null
                                    ? td(
                                      dynamicRecordKey(data.roles[x], r.values[data.roles[x]]),
                                      formatValue('text', r.values[data.roles[x]])
                                    )
                                    : formatValue('date', r.values[data.roles[x]])}
                                </td>
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
