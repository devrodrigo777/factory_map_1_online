import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, preload } from '../api.js';
import MapStage from '../components/MapStage.jsx';
import RecordsPanel from '../components/RecordsPanel.jsx';
import Icon from '../components/Icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../components/Auth.jsx';
import UserMenu from '../components/UserMenu.jsx';
import { bbox, centroid, pointsAttr } from '../geometry.js';
import { stageFor } from '../format.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LEAVE_MS = 240; // mantenha igual à duração do fade em .stage.is-leaving

// Cadeado desenhado em tamanho constante na tela, independente do zoom.
function LockMarker({ x, y, k, count, label, color, onOpen }) {
  return (
    <g
      className="lock-marker"
      style={{ '--lock': color }}
      transform={`translate(${x} ${y}) scale(${1 / k})`}
      role="button"
      tabIndex={0}
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
    >
      <circle r="19" />
      <path d="M-6.5 -1.5V-5a6.5 6.5 0 0113 0v3.5M-8.5 -1.5h17v12h-17z" />
      {count > 1 && (
        <g transform="translate(14 -14)">
          <circle r="9.5" className="count" />
          <text>{count}</text>
        </g>
      )}
    </g>
  );
}

export default function Viewer() {
  const toast = useToast();
  const { user, can, config } = useAuth();
  const stageRef = useRef(null);
  const cache = useRef(new Map());
  const busyRef = useRef(false);

  const [status, setStatus] = useState('loading'); // loading | ready | empty | error
  const [map, setMap] = useState(null);
  const [stack, setStack] = useState([]); // ancestrais: { id, name, box }
  const [intro, setIntro] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | zooming | leaving
  const [selected, setSelected] = useState(null);
  const [tip, setTip] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [locks, setLocks] = useState(null); // { areas: {id: {active}}, active_total, at }
  const [panel, setPanel] = useState(null); // { areaId, history }

  // Busca (e guarda em cache) a planta + a imagem já baixada.
  const fetchMap = useCallback((id) => {
    if (!cache.current.has(id)) {
      const p = (id === 'root' ? api.getRoot() : api.getMap(id)).then(async (m) => {
        if (m) await preload(m.image);
        return m;
      });
      p.catch(() => cache.current.delete(id));
      cache.current.set(id, p);
    }
    return cache.current.get(id);
  }, []);

  const loadRoot = useCallback(() => {
    setStatus('loading');
    cache.current.clear();
    fetchMap('root')
      .then((m) => {
        if (!m) return setStatus('empty');
        setMap(m);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [fetchMap]);

  useEffect(() => {
    loadRoot();
  }, [loadRoot, config?.company?.id]);

  const openArea = async (area) => {
    if (busyRef.current || phase !== 'idle') return;
    setTip(null);
    setPanel(null);
    if (!area.target_map_id) {
      setSelected(area);
      return;
    }
    busyRef.current = true;
    const box = bbox(area.points);
    setSelected(null);
    setPhase('zooming');
    try {
      // zoom na área e, em paralelo, carrega a imagem de detalhe
      const [next] = await Promise.all([
        fetchMap(area.target_map_id),
        stageRef.current.zoomToBox(box, { padding: 0.06 }),
      ]);
      if (!next) throw new Error('A imagem de detalhe não existe mais.');
      setPhase('leaving');
      await wait(LEAVE_MS);
      setStack((s) => [...s, { id: map.id, name: map.name, box }]);
      setIntro({ kind: 'in' });
      setMap(next);
      setPhase('idle');
    } catch (e) {
      setPhase('idle');
      stageRef.current?.fit();
      toast(e.message, 'error');
    } finally {
      busyRef.current = false;
    }
  };

  const goBack = async (index) => {
    if (busyRef.current || phase !== 'idle' || index < 0 || index >= stack.length) return;
    busyRef.current = true;
    const entry = stack[index];
    setSelected(null);
    setPanel(null);
    setTip(null);
    setPhase('leaving');
    try {
      const [prev] = await Promise.all([fetchMap(entry.id), wait(LEAVE_MS)]);
      if (!prev) throw new Error('A planta anterior não existe mais.');
      setStack(stack.slice(0, index));
      setIntro({ kind: 'out', box: entry.box });
      setMap(prev);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setPhase('idle');
      busyRef.current = false;
    }
  };

  // Situação dos cadeados: atualiza ao trocar de planta, a cada 30 s e ao voltar para a aba.
  const mapId = map?.id;
  useEffect(() => {
    if (!mapId) return undefined;
    let stop = false;
    const load = () => api.lockStatus(mapId).then((l) => !stop && setLocks(l)).catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => { stop = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [mapId]);

  // Esc: fecha o painel; depois volta um nível
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (panel) setPanel(null);
      else if (selected) setSelected(null);
      else if (stack.length) goBack(stack.length - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () =>
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();

  // ---------- estados vazios ----------
  if (status === 'loading') {
    return <div className="center-screen"><div className="spinner" role="status" aria-label="Carregando" /></div>;
  }
  if (status === 'error') {
    return (
      <div className="center-screen">
        <h1>Servidor indisponível</h1>
        <p>Não foi possível carregar o mapa. Verifique se o servidor está em execução.</p>
        <button className="btn primary" onClick={loadRoot}>Tentar novamente</button>
      </div>
    );
  }
  if (status === 'empty') {
    return (
      <div className="center-screen">
        <h1>Nenhuma planta cadastrada</h1>
        <p>Envie a imagem da planta da fábrica no painel admin para começar.</p>
        <Link className="btn primary" to={user ? '/admin' : '/login'}>{user ? 'Abrir painel admin' : 'Entrar'}</Link>
      </div>
    );
  }

  const crumbs = [...stack.map((s, i) => ({ name: s.name, index: i })), { name: map.name, index: null }];

  const showLockPanel = (area, history = false) => {
    setSelected(null);
    setPanel({ areaId: area.id, history });
  };

  const overlay = ({ k }) => (
    <>
      {map.areas.map((a) => {
        const [cx, cy] = centroid(a.points, map.width, map.height);
        const cls = `area${a.target_map_id ? ' has-target' : ''}${selected?.id === a.id ? ' is-selected' : ''}`;
        return (
          <g
            key={a.id}
            className={cls}
            style={{ '--c': a.color, '--o': a.opacity }}
            onClick={() => openArea(a)}
            onPointerEnter={() => a.target_map_id && fetchMap(a.target_map_id)}
            onPointerMove={(e) => e.pointerType === 'mouse' && setTip({ x: e.clientX, y: e.clientY, area: a })}
            onPointerLeave={() => setTip(null)}
          >
            <polygon points={pointsAttr(a.points, map.width, map.height)} vectorEffect="non-scaling-stroke" />
            {a.show_label && a.name && (
              <text x={cx} y={cy} fontSize={14 / k} strokeWidth={3.5 / k}>{a.name}</text>
            )}
          </g>
        );
      })}
      {map.areas.map((a) => {
        const count = locks?.areas?.[a.id]?.active ?? 0;
        if (!a.show_lock || count < 1) return null;
        const [cx, cy] = centroid(a.points, map.width, map.height);
        const dy = a.show_label && a.name ? 26 / k : 0; // sobe o cadeado para não cobrir o nome
        const color = locks.stages?.length ? stageFor(locks.areas[a.id].oldest_hours ?? 0, locks.stages).color : undefined;
        return (
          <LockMarker key={`lock-${a.id}`} x={cx} y={cy - dy} k={k} count={count} color={color}
            label={`${count} ${count === 1 ? 'bloqueio ativo' : 'bloqueios ativos'} em ${a.name || 'área'}`}
            onOpen={() => phase === 'idle' && showLockPanel(a)} />
        );
      })}
    </>
  );

  return (
    <div className="viewer">
      <header className="topbar">
        {stack.length > 0 && (
          <button className="btn icon" onClick={() => goBack(stack.length - 1)} aria-label="Voltar um nível">
            <Icon name="back" />
          </button>
        )}
        <nav className="crumbs" aria-label="Localização">
          {crumbs.map((c, i) => (
            <span key={i} className="crumb">
              {c.index === null ? (
                <h1>{c.name}</h1>
              ) : (
                <button onClick={() => goBack(c.index)}>{c.name}</button>
              )}
            </span>
          ))}
        </nav>
        <div className="spacer" />
        {!user && config?.company?.name && (
          <span className="badge off hide-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', fontSize: 12, background: 'rgba(255,255,255,0.08)', borderRadius: 20 }}>
            🏢 {config.company.name}
          </span>
        )}
        {user?.role === 'globaladmin' && (
          <div className="hide-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Link to="/companies" className="badge off" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', fontSize: 12, background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 20, textDecoration: 'none' }}>
              👑 Global Admin
            </Link>
            <Link to="/companies" className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', fontSize: 12, background: 'rgba(245, 158, 11, 0.16)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: 20, textDecoration: 'none', fontWeight: 600 }} title="Ambiente ativo - Clique para alternar de empresa">
              🏢 Ambiente: {user.active_company_name || user.company_name || 'Geral'}
            </Link>
          </div>
        )}
        {locks && (
          <Link className={`chip ${locks.active_total ? 'alert' : ''}`} to={user ? '/dashboard' : '/login'} title={user ? 'Abrir dashboard' : 'Entrar'}>
            <Icon name="lock" size={16} />
            <span>{locks.active_total} {locks.active_total === 1 ? 'bloqueio ativo' : 'bloqueios ativos'}</span>
          </Link>
        )}
        {document.fullscreenEnabled && (
          <button className="btn icon" onClick={toggleFullscreen} aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}>
            <Icon name="full" />
          </button>
        )}
        {user && <Link className="btn icon" to="/dashboard" aria-label="Dashboard"><Icon name="chart" /></Link>}
        {can('operator') && <Link className="btn icon" to={can('admin') ? '/admin' : '/records'} aria-label="Gestão"><Icon name="gear" /></Link>}
        <UserMenu />
      </header>

      <main className="viewer-body">
        <MapStage
          key={map.id}
          ref={stageRef}
          map={map}
          intro={intro}
          overlay={overlay}
          className={phase === 'leaving' ? 'is-leaving' : phase === 'zooming' ? 'is-zooming' : ''}
          onTap={() => setSelected(null)}
        />

        {locks?.stages?.length > 1 && locks.active_total > 0 && (
          <ul className="lock-legend" aria-label="Cor do cadeado pela idade do bloqueio">
            {locks.stages.map((s) => (<li key={s.min_hours}><i style={{ background: s.color }} />{s.label}</li>))}
          </ul>
        )}

        {selected && (
          <aside className="info" key={selected.id}>
            <button className="btn icon ghost info-close" onClick={() => setSelected(null)} aria-label="Fechar">
              <Icon name="close" />
            </button>
            <span className="swatch" style={{ background: selected.color }} />
            <h2>{selected.name || 'Área sem nome'}</h2>
            {selected.code && <p className="code">{selected.code}</p>}
            {selected.description && <p>{selected.description}</p>}
            {selected.show_lock && (
              <button className="btn" onClick={() => showLockPanel(selected, true)}><Icon name="lock" size={16} /> Ver bloqueios e histórico</button>
            )}
          </aside>
        )}

        {panel && (
          <RecordsPanel key={panel.areaId} areaId={panel.areaId} initialHistory={panel.history} stages={locks?.stages ?? []}
            refreshKey={locks?.at} onClose={() => setPanel(null)} />
        )}
      </main>

      {tip && (
        <div className="tooltip" style={{ left: tip.x + 16, top: tip.y + 16 }}>
          <strong>{tip.area.name || 'Área sem nome'}</strong>
          {tip.area.target_map_id && <span>Clique para ver o detalhe</span>}
        </div>
      )}
    </div>
  );
}
