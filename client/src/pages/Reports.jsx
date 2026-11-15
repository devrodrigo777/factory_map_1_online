import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Shell from '../components/Shell.jsx';
import Icon from '../components/Icons.jsx';
import { useToast } from '../components/Toast.jsx';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function Reports() {
  const toast = useToast();
  const [fields, setFields] = useState([]);
  const [cols, setCols] = useState(null); // null = padrão do sistema
  const [sectors, setSectors] = useState([]);
  const [areas, setAreas] = useState([]);
  const today = new Date();
  const [from, setFrom] = useState(iso(new Date(today.getTime() - 29 * 86400000)));
  const [to, setTo] = useState(iso(today));
  const [sector, setSector] = useState('');
  const [areaId, setAreaId] = useState('');
  const [days, setDays] = useState(90);

  useEffect(() => {
    (async () => {
      try {
        const fl = await api.listFields();
        setFields(fl);
        const sec = fl.find((f) => f.role === 'sector');
        if (sec) setSectors(await api.fieldValues(sec.key));
        const maps = await api.listMaps();
        const all = [];
        for (const m of maps) {
          const full = await api.getMap(m.id);
          full.areas.filter((a) => a.show_lock && a.lock_filter).forEach((a) => all.push({ id: a.id, label: `${m.name} › ${a.name || `Área ${a.id}`}` }));
        }
        setAreas(all);
        if (all[0]) setAreaId(String(all[0].id));
      } catch (e) { toast(e.message, 'error'); }
    })();
  }, [toast]);

  const colsParam = useMemo(() => (cols && cols.length ? `&fields=${cols.join(',')}` : ''), [cols]);
  const open = (url) => window.open(url, '_blank', 'noopener');
  const toggle = (key) => {
    const cur = cols ?? fields.filter((f) => ['sector', 'equipment', 'locked_by', 'locked_at'].includes(f.role)).map((f) => f.key);
    setCols(cur.includes(key) ? cur.filter((k) => k !== key) : fields.map((f) => f.key).filter((k) => cur.includes(k) || k === key));
  };
  const isOn = (key) => (cols ? cols.includes(key) : ['sector', 'equipment', 'locked_by', 'locked_at'].includes(fields.find((f) => f.key === key)?.role));

  return (
    <Shell title="Relatórios">
      <div className="page narrow">
        <section className="card">
          <h2>Colunas dos relatórios</h2>
          <p className="muted">Escolha quais campos aparecem nas tabelas dos relatórios “Bloqueios ativos” e “Histórico por período”.</p>
          <div className="chips-pick">
            {fields.map((f) => (
              <label key={f.key} className={`chip-check ${isOn(f.key) ? 'on' : ''}`}>
                <input type="checkbox" checked={!!isOn(f.key)} onChange={() => toggle(f.key)} />{f.label}{f.computed ? ' ƒ' : ''}
              </label>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Bloqueios ativos (passagem de turno)</h2>
          <p className="muted">Lista tudo que está bloqueado agora, por setor, com a idade de cada bloqueio colorida conforme as faixas configuradas.</p>
          <div className="row"><button className="btn primary" onClick={() => open(`/api/reports/active.pdf?x=1${colsParam}`)}><Icon name="file" /> Gerar PDF</button></div>
        </section>

        <section className="card">
          <h2>Histórico de bloqueios por período</h2>
          <p className="muted">KPIs, equipamentos mais bloqueados, reincidência e o detalhamento de cada bloqueio.</p>
          <div className="form-grid">
            <label className="field">De<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="field">Até<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
            {sectors.length > 0 && (
              <label className="field">Setor
                <select value={sector} onChange={(e) => setSector(e.target.value)}>
                  <option value="">Todos os setores</option>{sectors.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="row"><button className="btn primary" onClick={() => open(`/api/reports/period.pdf?from=${from}&to=${to}&sector=${encodeURIComponent(sector)}${colsParam}`)}><Icon name="file" /> Gerar PDF</button></div>
        </section>

        <section className="card">
          <h2>Ficha de uma área / equipamento</h2>
          <p className="muted">Histórico de uma área com cadeado: ranking, linha do tempo por equipamento, reincidência e todos os bloqueios.</p>
          {areas.length === 0 ? <p className="notice">Nenhuma área com cadeado configurado.</p> : (
            <>
              <div className="form-grid">
                <label className="field">Área
                  <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>{areas.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
                </label>
                <label className="field">Período
                  <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                    <option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option>
                    <option value="180">Últimos 180 dias</option><option value="365">Últimos 12 meses</option>
                  </select>
                </label>
              </div>
              <div className="row"><button className="btn primary" disabled={!areaId} onClick={() => open(`/api/reports/area/${areaId}.pdf?days=${days}`)}><Icon name="file" /> Gerar PDF</button></div>
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}
