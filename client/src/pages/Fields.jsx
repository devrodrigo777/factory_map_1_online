import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Shell from '../components/Shell.jsx';
import ExprInput from '../components/ExprInput.jsx';
import Icon from '../components/Icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';
import { useTranslation } from '../i18n/I18nContext.jsx';
import { ROLE_LABELS } from '../format.js';

const TYPE_LABEL = { text: 'Texto', number: 'Número', date: 'Data/hora', photo: 'Foto URL' };

export default function Fields() {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('fields'); // 'fields' | 'default_kpis'
  const [fields, setFields] = useState(null);
  const [kpis, setKpis] = useState([]);
  const [activeExpr, setActiveExpr] = useState('');
  const [settings, setSettings] = useState(null);
  const [dashboardCfg, setDashboardCfg] = useState({});
  const [newField, setNewField] = useState(null); // { label, type, expr }
  const [newKpi, setNewKpi] = useState(null);

  const fail = useCallback((e) => toast(e.message, 'error'), [toast]);
  const load = useCallback(() => {
    api.listFields().then(setFields).catch(fail);
    api.listKpis().then(setKpis).catch(fail);
    api.getSettings().then((s) => {
      setSettings(s);
      setActiveExpr(s.active_expr);
      setDashboardCfg(s.dashboard || {});
    }).catch(fail);
  }, [fail]);
  useEffect(load, [load]);

  const toggleDashboard = async (key) => {
    const nextVal = dashboardCfg[key] === false ? true : false;
    const nextCfg = { ...dashboardCfg, [key]: nextVal };
    setDashboardCfg(nextCfg);
    try {
      await api.saveSettings({ dashboard: { [key]: nextVal } });
      toast('Configuração do dashboard atualizada.');
    } catch (e) {
      fail(e);
      load();
    }
  };

  const patch = async (f, body) => {
    try { await api.patchField(f.id, body); load(); } catch (e) { fail(e); load(); }
  };
  const move = async (i, d) => {
    const keys = fields.map((f) => f.key);
    [keys[i], keys[i + d]] = [keys[i + d], keys[i]];
    try { await api.orderFields(keys); load(); } catch (e) { fail(e); }
  };
  const remove = async (f) => {
    const ok = await confirm({
      title: 'Excluir campo',
      message: `Excluir o campo "${f.label}"${f.computed ? '' : ' e os valores dele em todos os registros'}?`,
      confirmText: 'Excluir campo',
      danger: true,
    });
    if (!ok) return;
    try { await api.deleteField(f.id); load(); } catch (e) { fail(e); }
  };
  const addField = async () => {
    try { await api.createField(newField); setNewField(null); load(); } catch (e) { fail(e); }
  };
  const saveActive = async () => {
    try { await api.saveSettings({ active_expr: activeExpr }); toast('Definição salva.'); load(); } catch (e) { fail(e); }
  };
  const addKpi = async () => {
    try { await api.createKpi(newKpi); setNewKpi(null); load(); } catch (e) { fail(e); }
  };

  const baseFields = (fields || []).filter((f) => !f.computed);

  return (
    <Shell title="Campos e KPIs">
      <div className="page narrow">
        <div className="tabs-mini" role="tablist" style={{ marginBottom: 12 }}>
          <button role="tab" aria-selected={tab === 'fields'} className={tab === 'fields' ? 'on' : ''} onClick={() => setTab('fields')}>
            Campos e regras
          </button>
          <button role="tab" aria-selected={tab === 'default_kpis'} className={tab === 'default_kpis' ? 'on' : ''} onClick={() => setTab('default_kpis')}>
            {t('fields.default_kpis_tab', 'KPIs padrões')}
          </button>
        </div>

        {tab === 'default_kpis' ? (
          <>
            <section className="card">
              <h2>{t('fields.dashboard_cards_title', 'Cards de indicadores do Dashboard')}</h2>
              <p className="muted">{t('fields.dashboard_cards_desc', 'Ative ou desative os cards numéricos exibidos no topo do Dashboard.')}</p>
              <div className="choice-list">
                {[
                  { key: 'kpi_active', label: t('dashboard.kpi_active_now', 'Bloqueios ativos agora'), desc: t('fields.kpi_active_desc', 'Contagem dos bloqueios que estão abertos no momento') },
                  { key: 'kpi_active_equipment', label: t('dashboard.kpi_blocked_equip', 'Equipamentos bloqueados'), desc: t('fields.kpi_active_equipment_desc', 'Quantidade de equipamentos únicos com bloqueios ativos') },
                  { key: 'kpi_oldest_active', label: t('dashboard.kpi_oldest_active', 'Bloqueio ativo mais antigo'), desc: t('fields.kpi_oldest_active_desc', 'Duração em horas/dias do bloqueio aberto há mais tempo') },
                  { key: 'kpi_avg_active', label: t('dashboard.kpi_avg_active', 'Tempo médio dos ativos'), desc: t('fields.kpi_avg_active_desc', 'Média de duração dos bloqueios atualmente ativos') },
                  { key: 'kpi_avg_closed', label: t('dashboard.kpi_avg_closed', 'Duração média (encerrados)'), desc: t('fields.kpi_avg_closed_desc', 'Média de tempo dos bloqueios finalizados no período selecionado') },
                  { key: 'kpi_period_total', label: t('dashboard.kpi_period_locks', 'Total no período / histórico'), desc: t('fields.kpi_period_total_desc', 'Quantidade de bloqueios registrados no período e no histórico geral') },
                ].map((item) => (
                  <label key={item.key} className={`choice ${dashboardCfg[item.key] !== false ? 'on' : ''}`}>
                    <input type="checkbox" checked={dashboardCfg[item.key] !== false} onChange={() => toggleDashboard(item.key)} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.desc}</small>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="card">
              <h2>{t('fields.dashboard_metrics_title', 'Métricas e gráficos do Dashboard')}</h2>
              <p className="muted">{t('fields.dashboard_metrics_desc', 'Ative ou desative os gráficos e tabelas analíticas exibidos no Dashboard.')}</p>
              <div className="choice-list">
                {[
                  { key: 'chart_by_group', label: t('fields.chart_by_group_label', 'Bloqueios por setor / grupo'), desc: t('fields.chart_by_group_desc', 'Gráfico de barras com bloqueios ativos e total por área ou grupo') },
                  { key: 'chart_by_month', label: t('dashboard.chart_by_month', 'Bloqueios por mês'), desc: t('fields.chart_by_month_desc', 'Gráfico de colunas com a evolução mensal de bloqueios') },
                  { key: 'chart_avg_by_group', label: t('fields.chart_avg_by_group_label', 'Duração média por setor / grupo'), desc: t('fields.chart_avg_by_group_desc', 'Gráfico de barras com a média de tempo dos bloqueios por área ou grupo') },
                  { key: 'chart_by_user', label: t('dashboard.chart_top_users', 'Quem mais bloqueou'), desc: t('fields.chart_by_user_desc', 'Ranking de operadores que mais efetuaram bloqueios') },
                  { key: 'chart_top_equipment', label: t('dashboard.chart_top_equipment', 'Equipamentos mais bloqueados'), desc: t('fields.chart_top_equipment_desc', 'Ranking de equipamentos com maior incidência de bloqueio') },
                  { key: 'chart_recurrence', label: t('fields.chart_recurrence_label', 'Reincidência de bloqueios'), desc: t('fields.chart_recurrence_desc', 'Equipamentos que tiveram novos bloqueios dentro do prazo de reincidência') },
                  { key: 'chart_oldest_active', label: t('fields.chart_oldest_active_label', 'Tabela: Ativos há mais tempo'), desc: t('fields.chart_oldest_active_desc', 'Lista detalhada com os bloqueios ativos mais antigos') },
                ].map((item) => (
                  <label key={item.key} className={`choice ${dashboardCfg[item.key] !== false ? 'on' : ''}`}>
                    <input type="checkbox" checked={dashboardCfg[item.key] !== false} onChange={() => toggleDashboard(item.key)} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.desc}</small>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="card">
              <h2>Campos dos registros</h2>
              <p className="muted">
                Os campos são livres: renomeie, crie novos ou apague. Marque o <strong>papel</strong> dos campos que o sistema precisa
                entender (para KPIs e gráficos). Campos <strong>calculados</strong> (ƒ) usam uma expressão sobre os outros campos.
              </p>
              {!fields ? <div className="spinner" /> : (
                <ul className="field-list">
                  {fields.map((f, i) => (
                    <li key={f.id} className="field-row">
                      <div className="field-main">
                        <input defaultValue={f.label} aria-label="Nome do campo"
                          onBlur={(e) => e.target.value.trim() && e.target.value !== f.label && patch(f, { label: e.target.value })} />
                        <select value={f.type} onChange={(e) => patch(f, { type: e.target.value })} aria-label="Tipo">
                          {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                        <select value={f.role || ''} onChange={(e) => patch(f, { role: e.target.value })} aria-label="Papel">
                          <option value="">Sem papel</option>
                          {Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                        <label className="check compact"><input type="checkbox" checked={f.visible} onChange={(e) => patch(f, { visible: e.target.checked })} /> Exibir</label>
                        <div className="row-actions">
                          <button className="btn icon ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">▲</button>
                          <button className="btn icon ghost" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label="Descer">▼</button>
                          <button className="btn icon ghost danger" onClick={() => remove(f)} aria-label="Excluir campo"><Icon name="trash" /></button>
                        </div>
                      </div>
                      {f.computed && (
                        <div className="field-expr">
                          <span className="fx">ƒ</span>
                          <CalcExpr field={f} fields={baseFields} onSave={(expr) => patch(f, { expr })} />
                        </div>
                      )}
                      {f.error && <p className="expr-test err">{f.error}</p>}
                    </li>
                  ))}
                </ul>
              )}

              {newField ? (
                <div className="new-box">
                  <div className="form-grid">
                    <label className="field">Nome
                      <input value={newField.label} onChange={(e) => setNewField({ ...newField, label: e.target.value })} autoFocus />
                    </label>
                    <label className="field">Tipo
                      <select value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value })}>
                        {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </label>
                  </div>
                  {newField.calc && (
                    <label className="field">Expressão
                      <ExprInput value={newField.expr} onChange={(expr) => setNewField({ ...newField, expr })} fields={baseFields}
                        placeholder="daysSince([Data de bloqueio])" builder={false} />
                    </label>
                  )}
                  <div className="row">
                    <button className="btn primary" onClick={addField} disabled={!newField.label.trim() || (newField.calc && !newField.expr.trim())}>Criar campo</button>
                    <button className="btn" onClick={() => setNewField(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="row">
                  <button className="btn" onClick={() => setNewField({ label: '', type: 'text', expr: '' })}><Icon name="plus" /> Novo campo</button>
                  <button className="btn" onClick={() => setNewField({ label: '', type: 'number', expr: '', calc: true })}><Icon name="plus" /> Novo campo calculado</button>
                </div>
              )}
            </section>

            <section className="card">
              <h2>O que é um bloqueio “ativo”?</h2>
              <p className="muted">
                Deixe vazio para usar o padrão: o registro está ativo enquanto o campo com papel “Data de desbloqueio” estiver vazio.
                Para regras próprias, escreva uma expressão (ex.: <code>isEmpty([Data de desbloqueio]) and [Status] != "Cancelado"</code>).
              </p>
              {settings?.error && <p className="expr-test err">{settings.error}</p>}
              <ExprInput value={activeExpr} onChange={setActiveExpr} fields={baseFields} placeholder="(padrão)" />
              <div className="row"><button className="btn primary" onClick={saveActive} disabled={activeExpr === settings?.active_expr}>Salvar definição</button></div>
            </section>

            <section className="card">
              <h2>KPIs personalizados</h2>
              <p className="muted">Cada KPI conta os registros que atendem a uma expressão e aparece no Dashboard. Use <code>ativo</code> para considerar só bloqueios ativos.</p>
              <ul className="field-list">
                {kpis.map((k) => (
                  <li key={k.id} className="field-row">
                    <KpiRow kpi={k} fields={baseFields.concat((fields || []).filter((f) => f.computed))}
                      onSave={async (body) => { try { await api.patchKpi(k.id, body); toast('KPI salvo.'); load(); } catch (e) { fail(e); } }}
                      onDelete={async () => {
                        const ok = await confirm({
                          title: 'Excluir KPI',
                          message: `Excluir o KPI "${k.name}"?`,
                          confirmText: 'Excluir KPI',
                          danger: true,
                        });
                        if (ok) { await api.deleteKpi(k.id); load(); }
                      }} />
                  </li>
                ))}
              </ul>
              {newKpi ? (
                <div className="new-box">
                  <label className="field">Nome do KPI
                    <input value={newKpi.name} onChange={(e) => setNewKpi({ ...newKpi, name: e.target.value })} placeholder="Bloqueios ativos há mais de 7 dias" autoFocus />
                  </label>
                  <label className="field">Expressão
                    <ExprInput value={newKpi.expr} onChange={(expr) => setNewKpi({ ...newKpi, expr })} fields={fields || []} placeholder="ativo and daysSince([Data de bloqueio]) > 7" />
                  </label>
                  <div className="row">
                    <button className="btn primary" onClick={addKpi} disabled={!newKpi.name.trim() || !newKpi.expr.trim()}>Criar KPI</button>
                    <button className="btn" onClick={() => setNewKpi(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="row"><button className="btn" onClick={() => setNewKpi({ name: '', expr: '' })}><Icon name="plus" /> Novo KPI</button></div>
              )}
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}

function CalcExpr({ field, fields, onSave }) {
  const [v, setV] = useState(field.expr);
  return (
    <div className="grow">
      <ExprInput value={v} onChange={setV} fields={fields} builder={false} />
      {v !== field.expr && <button className="btn primary" onClick={() => onSave(v)}>Salvar expressão</button>}
    </div>
  );
}

function KpiRow({ kpi, fields, onSave, onDelete }) {
  const [name, setName] = useState(kpi.name);
  const [expr, setExpr] = useState(kpi.expr);
  const changed = name !== kpi.name || expr !== kpi.expr;
  return (
    <div className="kpi-edit">
      <div className="field-main">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome do KPI" />
        <div className="row-actions">
          {changed && <button className="btn primary" onClick={() => onSave({ name, expr })}>Salvar</button>}
          <button className="btn icon ghost danger" onClick={onDelete} aria-label="Excluir KPI"><Icon name="trash" /></button>
        </div>
      </div>
      <ExprInput value={expr} onChange={setExpr} fields={fields} builder={false} />
    </div>
  );
}
