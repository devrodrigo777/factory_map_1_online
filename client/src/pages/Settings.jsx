import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Shell from '../components/Shell.jsx';
import Icon from '../components/Icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatDateTime } from '../format.js';

export default function Settings() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const fail = useCallback((e) => toast(e.message, 'error'), [toast]);
  const load = useCallback(() => api.getConfig().then(setData).catch(fail), [fail]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const save = async (section, value, okMsg) => {
    try {
      const r = await api.saveConfig({ [section]: value });
      setData((d) => ({ ...d, ...r }));
      toast(okMsg);
    } catch (e) { fail(e); }
  };

  if (!data) return <Shell title="Configurações"><div className="center-screen inline"><div className="spinner" /></div></Shell>;
  const { config } = data;

  return (
    <Shell title="Configurações">
      <div className="page narrow">
        <NavigationEffectsCard cfg={config.nav_effects} onSave={(v) => save('nav_effects', v, 'Efeitos de navegação salvos.')} />
        <LockColors cfg={config} onSave={(stages, days) => api.saveConfig({ lock_stages: stages, recurrence_days: days }).then((r) => { setData((d) => ({ ...d, ...r })); toast('Cores e reincidência salvas.'); }).catch(fail)} />
        <BackupCard cfg={config.backup} status={data.backup} onSave={(v) => save('backup', v, 'Backup automático salvo.')}
          onRun={async () => { try { const r = await api.runBackupJob(); setData((d) => ({ ...d, ...r })); toast('Backup executado.'); } catch (e) { fail(e); } }} />
        <section className="card">
          <h2>Registro dos backups automáticos</h2>
          {data.logs.filter((l) => l.job === 'backup').length === 0 ? <p className="muted">Nada executado ainda.</p> : (
            <div className="table-wrap tall">
              <table className="table">
                <thead><tr><th>Quando</th><th>Tarefa</th><th>Resultado</th><th>Detalhe</th></tr></thead>
                <tbody>
                  {data.logs.filter((l) => l.job === 'backup').map((l) => (
                    <tr key={l.id}>
                      <td>{formatDateTime(l.at)}</td>
                      <td>Backup</td>
                      <td><span className={`badge ${l.status === 'error' ? 'on' : l.status === 'warn' ? 'warn' : 'off'}`}>{l.status === 'error' ? 'Erro' : l.status === 'warn' ? 'Atenção' : 'OK'}</span></td>
                      <td className="msg-cell">{l.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}

// ---------- cores do cadeado por idade ----------
function LockColors({ cfg, onSave }) {
  const [stages, setStages] = useState(cfg.lock_stages);
  const [days, setDays] = useState(cfg.recurrence_days);
  const set = (i, patch) => setStages(stages.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const dirty = JSON.stringify(stages) !== JSON.stringify(cfg.lock_stages) || Number(days) !== cfg.recurrence_days;

  return (
    <section className="card">
      <h2>Cor do cadeado pela idade do bloqueio</h2>
      <p className="muted">
        O cadeado no mapa muda de cor conforme há quanto tempo o bloqueio ativo <strong>mais antigo</strong> da área está bloqueado.
        Cada faixa vale a partir das horas indicadas (24 h = 1 dia, 168 h = 7 dias).
      </p>
      <ul className="stage-list">
        {stages.map((s, i) => (
          <li key={i}>
            <label className="field">A partir de (horas)
              <input type="number" min="0" value={s.min_hours} disabled={i === 0} onChange={(e) => set(i, { min_hours: Number(e.target.value) })} />
            </label>
            <label className="field color">Cor<input type="color" value={s.color} onChange={(e) => set(i, { color: e.target.value })} /></label>
            <label className="field grow">Nome na legenda<input value={s.label} maxLength={30} onChange={(e) => set(i, { label: e.target.value })} /></label>
            <span className="stage-preview" style={{ background: s.color }} aria-hidden="true"><Icon name="lock" size={16} /></span>
            <button className="btn icon ghost danger" disabled={i === 0} onClick={() => setStages(stages.filter((_, j) => j !== i))} aria-label="Remover faixa"><Icon name="trash" /></button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button className="btn" disabled={stages.length >= 8}
          onClick={() => setStages([...stages, { min_hours: (stages.at(-1)?.min_hours ?? 0) + 24, color: '#A32020', label: 'Nova faixa' }])}><Icon name="plus" /> Adicionar faixa</button>
      </div>
      <label className="field inline">Reincidência: novo bloqueio do mesmo equipamento em até
        <input className="narrow-input" type="number" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)} /> dias após o desbloqueio anterior
      </label>
      <div className="row"><button className="btn primary" disabled={!dirty} onClick={() => onSave(stages, Number(days))}>Salvar</button></div>
    </section>
  );
}

const statusLine = (s) =>
  s.last_run ? `${formatDateTime(s.last_run)} — ${s.last_ok === false ? 'FALHOU: ' : ''}${s.last_message || ''}` : 'Ainda não executado.';

// ---------- backup automático ----------
function BackupCard({ cfg, status, onSave, onRun }) {
  const [c, setC] = useState(cfg);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setC({ ...c, ...patch });
  const dirty = JSON.stringify(c) !== JSON.stringify(cfg);
  return (
    <section className="card">
      <h2>Backup automático</h2>
      <label className="check"><input type="checkbox" checked={c.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Ligado</label>
      <fieldset className="cfg-group" disabled={!c.enabled}>
        <div className="choice-list">
          <label className={`choice ${c.mode === 'daily' ? 'on' : ''}`}>
            <input type="radio" checked={c.mode === 'daily'} onChange={() => set({ mode: 'daily' })} />
            <span><strong>Todo dia, no horário</strong>
              <input className="narrow-input time-input" type="time" value={c.time} onChange={(e) => set({ time: e.target.value })} aria-label="Horário" /></span>
          </label>
          <label className={`choice ${c.mode === 'every' ? 'on' : ''}`}>
            <input type="radio" checked={c.mode === 'every'} onChange={() => set({ mode: 'every' })} />
            <span><strong>A cada</strong>
              <span><input className="narrow-input num-input" type="number" min="1" max="168" value={c.every_hours} onChange={(e) => set({ every_hours: Number(e.target.value) })} aria-label="Horas" /> horas</span></span>
          </label>
        </div>
        <div className="form-grid">
          <label className="field">Conteúdo
            <select value={c.type} onChange={(e) => set({ type: e.target.value })}>
              <option value="full">Dados + configurações</option><option value="data">Somente dados</option>
            </select>
          </label>
          <label className="field">Quantos backups guardar (máx. 5)
            <input type="number" min="1" max="5" value={Math.min(5, Math.max(1, c.keep || 5))} onChange={(e) => set({ keep: Math.min(5, Math.max(1, Number(e.target.value))) })} />
            <small>No ambiente online são mantidos no máximo 5 backups automáticos no servidor (o mais antigo é excluído para dar lugar ao novo, mantendo sempre os {Math.min(5, c.keep || 5)} arquivos mais recentes).</small>
          </label>
        </div>
        {c.type === 'full' && (
          <label className="check"><input type="checkbox" checked={c.include_users} onChange={(e) => set({ include_users: e.target.checked })} /> Incluir usuários e senhas (criptografadas)</label>
        )}
      </fieldset>
      <p className="job-status">
        <strong>Último:</strong> {statusLine(status)}
        {status.next_at && c.enabled && <><br /><strong>Próximo:</strong> {formatDateTime(status.next_at)}</>}
      </p>
      <div className="row">
        <button className="btn primary" disabled={!dirty} onClick={() => onSave(c)}>Salvar</button>
        <button className="btn" disabled={busy || status.running} onClick={async () => { setBusy(true); await onRun(); setBusy(false); }}>{busy || status.running ? 'Executando…' : 'Fazer backup agora'}</button>
      </div>
    </section>
  );
}

// ---------- efeitos de navegação ----------
function NavigationEffectsCard({ cfg = {}, onSave }) {
  const [c, setC] = useState({
    touch_zoom: cfg.touch_zoom !== undefined ? !!cfg.touch_zoom : true,
    presentation_button: cfg.presentation_button !== undefined ? !!cfg.presentation_button : true,
    presentation_time_seconds: cfg.presentation_time_seconds || 10,
  });
  const set = (patch) => setC((prev) => ({ ...prev, ...patch }));
  const dirty = JSON.stringify(c) !== JSON.stringify({
    touch_zoom: cfg.touch_zoom !== undefined ? !!cfg.touch_zoom : true,
    presentation_button: cfg.presentation_button !== undefined ? !!cfg.presentation_button : true,
    presentation_time_seconds: cfg.presentation_time_seconds || 10,
  });

  return (
    <section className="card">
      <h2>Efeitos de navegação</h2>
      <p className="muted">
        Configure o comportamento dinâmico de aproximação por toque e o modo de apresentação automática.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
        <label className="check">
          <input
            type="checkbox"
            checked={c.touch_zoom}
            onChange={(e) => set({ touch_zoom: e.target.checked })}
          />
          <span>
            <strong>Efeito dinâmico por toque</strong>
            <small className="muted" style={{ display: 'block', marginTop: 2 }}>
              Ao clicar em um cadeado, aproxima (zoom) na área correspondente e a centraliza no espaço disponível fora do modal. Ao fechar o modal ou tocar na área, o zoom retorna ao enquadramento geral da planta.
            </small>
          </span>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={c.presentation_button}
            onChange={(e) => set({ presentation_button: e.target.checked })}
          />
          <span>
            <strong>Botão Modo Apresentação</strong>
            <small className="muted" style={{ display: 'block', marginTop: 2 }}>
              Exibe um botão com ícone de play no menu superior (ao lado do botão de tela cheia). Ao clicar, o mapa entra em modo de apresentação e destaca automaticamente cada área bloqueada.
            </small>
          </span>
        </label>

        {c.presentation_button && (
          <fieldset className="cfg-group" style={{ marginTop: 4 }}>
            <label className="field inline">
              Tempo de exibição de cada área (segundos):
              <input
                className="narrow-input"
                type="number"
                min="3"
                max="300"
                value={c.presentation_time_seconds}
                onChange={(e) => set({ presentation_time_seconds: Math.max(2, Math.min(600, Number(e.target.value) || 10)) })}
              />
            </label>
            <small className="muted">
              Tempo em que cada área bloqueada permanece destacada com suas métricas compactadas antes de alternar para a próxima área (padrão 10 s).
            </small>
          </fieldset>
        )}
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" disabled={!dirty} onClick={() => onSave(c)}>
          Salvar
        </button>
      </div>
    </section>
  );
}
