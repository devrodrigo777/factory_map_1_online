import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, preload } from '../api.js';
import MapStage from '../components/MapStage.jsx';
import RecordsPanel from '../components/RecordsPanel.jsx';
import Icon from '../components/Icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../components/Auth.jsx';
import UserMenu from '../components/UserMenu.jsx';
import LanguageSelector from '../components/LanguageSelector.jsx';
import { useTranslation } from '../i18n/I18nContext.jsx';
import { bbox, centroid, pointsAttr } from '../geometry.js';
import { formatDateTime, formatHours, stageFor } from '../format.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LEAVE_MS = 240; // mantenha igual à duração do fade em .stage.is-leaving

// Cadeado desenhado em tamanho constante na tela, independente do zoom.
function LockMarker({ x, y, k, count, label, color, onOpen }) {
  return (
    <g
      className="lock-marker"
      style={{ '--lock': color, outline: 'none' }}
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
  const { user, can } = useAuth();
  const { t } = useTranslation();
  const stageRef = useRef(null);
  const cache = useRef(new Map());
  const busyRef = useRef(false);
  const touchZoomedRef = useRef(false);

  const [status, setStatus] = useState('loading'); // loading | ready | empty | error
  const [map, setMap] = useState(null);
  const [stack, setStack] = useState([]); // ancestrais: { id, name, box }
  const [intro, setIntro] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | zooming | leaving
  const [selected, setSelected] = useState(null);
  const [tip, setTip] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [locks, setLocks] = useState(null); // { areas: {id: {active}}, active_total, at, nav_effects }
  const [panel, setPanel] = useState(null); // { areaId, history }
  const [highlightAreaId, setHighlightAreaId] = useState(null);

  // Modo Apresentação
  const [presentation, setPresentation] = useState(false);
  const [presIndex, setPresIndex] = useState(0);

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

  useEffect(loadRoot, [loadRoot]);

  const closeLockPanel = useCallback(() => {
    setPanel(null);
    setHighlightAreaId(null);
    if (touchZoomedRef.current) {
      touchZoomedRef.current = false;
      stageRef.current?.fit(true);
    }
  }, []);

  const openArea = async (area) => {
    if (busyRef.current || phase !== 'idle') return;
    setTip(null);
    if (panel) {
      closeLockPanel();
      if (!area.target_map_id) return;
    }
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
    closeLockPanel();
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

  // Situação dos cadeados e sincronização das áreas da planta a cada 30 s
  const mapId = map?.id;
  useEffect(() => {
    if (!mapId) return undefined;
    let stop = false;
    const load = async () => {
      try {
        const [l, freshMap] = await Promise.all([
          api.lockStatus(mapId),
          api.getMap(mapId)
        ]);
        if (stop) return;
        if (l) setLocks(l);
        if (freshMap) {
          setMap((prev) => {
            if (!prev) return freshMap;
            const areasChanged = JSON.stringify(prev.areas) !== JSON.stringify(freshMap.areas);
            const nameChanged = prev.name !== freshMap.name;
            const effChanged = prev.image_effect !== freshMap.image_effect;
            if (areasChanged || nameChanged || effChanged) {
              return { ...prev, ...freshMap };
            }
            return prev;
          });
          cache.current.set(mapId, Promise.resolve(freshMap));
        }
      } catch {}
    };

    load();
    const timer = setInterval(load, 30000);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [mapId]);

  // Esc: fecha o painel; depois volta um nível
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (presentation) {
        setPresentation(false);
        setHighlightAreaId(null);
        stageRef.current?.fit(true);
      } else if (panel) {
        closeLockPanel();
      } else if (selected) {
        setSelected(null);
      } else if (stack.length) {
        goBack(stack.length - 1);
      }
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

  // Configurações de efeitos de navegação
  const navEffects = locks?.nav_effects;
  const touchZoomEnabled = navEffects ? navEffects.touch_zoom !== false : true;
  const touchZoomPercent = navEffects?.touch_zoom_percent != null ? Number(navEffects.touch_zoom_percent) : 100;
  const presZoomPercent = navEffects?.presentation_zoom_percent != null
    ? Number(navEffects.presentation_zoom_percent)
    : (navEffects?.touch_zoom_percent != null ? Number(navEffects.touch_zoom_percent) : 100);
  const presButtonEnabled = navEffects ? navEffects.presentation_button !== false : true;
  const presDuration = navEffects?.presentation_time_seconds || 10;
  const [presZoom, setPresZoom] = useState(true);

  // Sincroniza presZoom inicial a partir de nav_effects
  useEffect(() => {
    if (navEffects?.presentation_zoom !== undefined) {
      setPresZoom(!!navEffects.presentation_zoom);
    }
  }, [navEffects?.presentation_zoom]);

  // Lista de áreas para alternar no modo apresentação
  const lockedAreas = (map?.areas || []).filter((a) => (locks?.areas?.[a.id]?.active ?? 0) > 0);
  const presAreas = lockedAreas.length > 0 ? lockedAreas : (map?.areas || []).filter((a) => a.show_lock);

  const togglePresentation = () => {
    if (presentation) {
      setPresentation(false);
      setHighlightAreaId(null);
      stageRef.current?.fit(true);
    } else {
      if (panel) closeLockPanel();
      if (selected) setSelected(null);
      setPresIndex(0);
      setPresentation(true);
      if (!presZoom) {
        stageRef.current?.fit(true);
      }
    }
  };

  // Timer do modo apresentação para rotacionar entre áreas e focar em cada uma
  useEffect(() => {
    if (!presentation || presAreas.length === 0) return undefined;
    const current = presAreas[presIndex % presAreas.length];
    if (current) {
      setHighlightAreaId(current.id);
      if (presZoom && current.points?.length >= 3) {
        const box = bbox(current.points);
        const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
        const margins = isMobile
          ? { right: 0, left: 0, top: 0, bottom: (window.innerHeight || 600) * 0.45 }
          : { right: 380, left: 0, top: 0, bottom: 0 };
        stageRef.current?.zoomToBox(box, { padding: 0.15, margins, zoomPercent: presZoomPercent });
      } else if (!presZoom) {
        stageRef.current?.fit(true);
      }
    }

    const timer = setInterval(() => {
      setPresIndex((i) => (i + 1) % presAreas.length);
    }, presDuration * 1000);

    return () => clearInterval(timer);
  }, [presentation, presAreas, presIndex, presDuration, presZoom, presZoomPercent]);

  // Interromper modo apresentação ao interagir com o card/área
  const onPresentationInteract = (area) => {
    setPresentation(false);
    showLockPanel(area);
  };

  const showLockPanel = (area, history = false) => {
    if (presentation) setPresentation(false);
    setSelected(null);
    setHighlightAreaId(area.id);
    setPanel({ areaId: area.id, history });

    // Efeito dinâmico por toque: zoom na área e centralização no espaço disponível fora do modal
    if (touchZoomEnabled && area?.points?.length >= 3) {
      touchZoomedRef.current = true;
      const box = bbox(area.points);
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
      const margins = isMobile
        ? { right: 0, left: 0, top: 0, bottom: (window.innerHeight || 600) * 0.55 }
        : { right: 428, left: 0, top: 0, bottom: 0 };
      stageRef.current?.zoomToBox(box, { padding: 0.15, margins, zoomPercent: touchZoomPercent });
    }
  };

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
        <h1>{t('viewer.no_plants_title', 'Nenhuma planta cadastrada')}</h1>
        <p>{t('viewer.no_plants_desc', 'Envie a imagem da planta da fábrica no painel admin para começar.')}</p>
        <Link className="btn primary" to="/admin">{t('viewer.open_admin', 'Abrir painel admin')}</Link>
      </div>
    );
  }

  const crumbs = [...stack.map((s, i) => ({ name: s.name, index: i })), { name: map.name, index: null }];
  const hasFocusedArea = Boolean(panel?.areaId || highlightAreaId || selected?.id);

  const overlay = ({ k }) => (
    <>
      {map.areas.map((a) => {
        const [cx, cy] = centroid(a.points, map.width, map.height);
        const isLockHighlight = (panel?.areaId === a.id) || (highlightAreaId === a.id);
        const isFocused = isLockHighlight || (selected?.id === a.id);
        const isDimmed = hasFocusedArea && !isFocused;
        const cls = `area${a.target_map_id ? ' has-target' : ''}${selected?.id === a.id ? ' is-selected' : ''}${isLockHighlight ? ' is-lock-highlight' : ''}${isDimmed ? ' is-dimmed' : ''}`;
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
            {a.show_label && (a.name || a.sub_label) && (
              <>
                {a.name && <text x={cx} y={a.sub_label ? cy - 5 / k : cy} fontSize={14 / k} strokeWidth={3.5 / k}>{a.name}</text>}
                {a.sub_label && <text className="area-sublabel" x={cx} y={a.name ? cy + 10 / k : cy} fontSize={10.5 / k} strokeWidth={2.5 / k}>{a.sub_label}</text>}
              </>
            )}
          </g>
        );
      })}
      {map.areas.map((a) => {
        const count = locks?.areas?.[a.id]?.active ?? 0;
        if (!a.show_lock || count < 1) return null;
        const [cx, cy] = centroid(a.points, map.width, map.height);
        const dy = a.show_label && (a.name || a.sub_label) ? (a.name && a.sub_label ? 30 / k : 26 / k) : 0; // sobe o cadeado para não cobrir o nome
        const color = locks.stages?.length ? stageFor(locks.areas[a.id].oldest_hours ?? 0, locks.stages).color : undefined;
        return (
          <LockMarker key={`lock-${a.id}`} x={cx} y={cy - dy} k={k} count={count} color={color}
            label={`${count} ${count === 1 ? 'bloqueio ativo' : 'bloqueios ativos'} em ${a.name || 'área'}`}
            onOpen={() => phase === 'idle' && showLockPanel(a)} />
        );
      })}
    </>
  );

  const currentPresArea = presentation && presAreas.length > 0 ? presAreas[presIndex % presAreas.length] : null;

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
        {locks && (
          <Link className={`chip ${locks.active_total ? 'alert' : ''}`} to={user ? '/dashboard' : '/login'} title={user ? 'Abrir dashboard' : 'Entrar'}>
            <Icon name="lock" size={16} />
            <span>{locks.active_total} {locks.active_total === 1 ? 'bloqueio ativo' : 'bloqueios ativos'}</span>
          </Link>
        )}
        {presButtonEnabled && (
          <button
            className={`btn icon ${presentation ? 'on presentation-btn-active' : ''}`}
            onClick={togglePresentation}
            aria-label={presentation ? t('viewer.presentation_stop', 'Interromper modo apresentação') : t('viewer.presentation_start', 'Iniciar modo apresentação')}
            title={presentation ? t('viewer.presentation_stop', 'Interromper modo apresentação') : t('viewer.presentation_start', 'Iniciar modo apresentação')}
          >
            <Icon name={presentation ? 'pause' : 'play'} />
          </button>
        )}
        {document.fullscreenEnabled && (
          <button className="btn icon" onClick={toggleFullscreen} aria-label={fullscreen ? t('viewer.fullscreen_exit', 'Sair da tela cheia') : t('viewer.fullscreen_enter', 'Tela cheia')}>
            <Icon name="full" />
          </button>
        )}
        {user && <Link className="btn icon" to="/dashboard" aria-label={t('nav.dashboard', 'Dashboard')}><Icon name="chart" /></Link>}
        {can('operator') && <Link className="btn icon" to={can('admin') ? '/admin' : '/records'} aria-label="Gestão"><Icon name="gear" /></Link>}
        <LanguageSelector />
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
          onTap={() => {
            if (presentation) {
              setPresentation(false);
              setHighlightAreaId(null);
            }
            if (panel) {
              closeLockPanel();
            } else {
              setSelected(null);
              setHighlightAreaId(null);
              if (touchZoomedRef.current) {
                touchZoomedRef.current = false;
                stageRef.current?.fit(true);
              }
            }
          }}
        />

        {locks?.stages?.length > 1 && locks.active_total > 0 && (
          <ul className="lock-legend" aria-label="Cor do cadeado pela idade do bloqueio">
            {locks.stages.map((s) => (<li key={s.min_hours}><i style={{ background: s.color }} />{s.label}</li>))}
          </ul>
        )}

        {selected && !panel && (
          <aside className="info" key={selected.id}>
            <button className="btn icon ghost info-close" onClick={() => { setSelected(null); setHighlightAreaId(null); }} aria-label="Fechar">
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
            refreshKey={locks?.at} onClose={closeLockPanel} />
        )}

        {presentation && currentPresArea && (
          <PresentationPanel
            key={`pres-${currentPresArea.id}`}
            area={currentPresArea}
            lockCount={locks?.areas?.[currentPresArea.id]?.active ?? 0}
            durationSeconds={presDuration}
            onSelect={() => onPresentationInteract(currentPresArea)}
            zoomEnabled={presZoom}
            onToggleZoom={(val) => {
              setPresZoom(val);
              if (!val) {
                stageRef.current?.fit(true);
              } else {
                if (currentPresArea?.points?.length >= 3) {
                  const box = bbox(currentPresArea.points);
                  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
                  const margins = isMobile
                    ? { right: 0, left: 0, top: 0, bottom: (window.innerHeight || 600) * 0.45 }
                    : { right: 380, left: 0, top: 0, bottom: 0 };
                  stageRef.current?.zoomToBox(box, { padding: 0.15, margins, zoomPercent: presZoomPercent });
                }
              }
            }}
          />
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

function PresentationPanel({ area, lockCount, durationSeconds = 10, onSelect, zoomEnabled = true, onToggleZoom }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [timeLeft, setTimeLeft] = useState(durationSeconds);

  useEffect(() => {
    setTimeLeft(durationSeconds);
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const rem = Math.max(0, durationSeconds - elapsed);
      setTimeLeft(rem);
    }, 100);
    return () => clearInterval(interval);
  }, [area.id, durationSeconds]);

  useEffect(() => {
    let stop = false;
    api.areaRecords(area.id, false)
      .then((d) => !stop && setData(d))
      .catch(() => {});
    return () => { stop = true; };
  }, [area.id]);

  const rows = data?.rows ?? [];
  const fields = data?.fields ?? [];
  const equipKey = data?.title_key || fields.find((f) => /equip/i.test(f.label))?.key;

  const sortedRows = rows.slice().sort((a, b) => {
    const tA = a.t0 != null ? a.t0 : (a.created_at ? Date.parse(a.created_at) : a.id);
    const tB = b.t0 != null ? b.t0 : (b.created_at ? Date.parse(b.created_at) : b.id);
    return tB - tA;
  });

  const pct = Math.min(100, Math.max(0, (timeLeft / durationSeconds) * 100));

  return (
    <aside className="presentation-panel" onClick={onSelect} title="Toque ou clique para abrir detalhes deste cadeado">
      <div className="presentation-top">
        <div className="presentation-badge-row">
          <span className="presentation-badge">
            <span className="presentation-dot" />
            {t('viewer.presentation_badge', 'Modo Apresentação')}
          </span>
          <span className="presentation-timer-text">
            {Math.ceil(timeLeft)}s
          </span>
        </div>
        <h2 className="presentation-title">{area.name || t('common.none', 'Área sem nome')}</h2>
        {area.code && <p className="code" style={{ margin: 0, fontSize: 13, color: 'var(--steel)' }}>{area.code}</p>}
        <div className="presentation-progress-bar">
          <div className="presentation-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        {onToggleZoom && (
          <div className="presentation-controls-row" onClick={(e) => e.stopPropagation()}>
            <label className="presentation-zoom-toggle" title={t('settings.presentation_zoom_desc', 'Habilitar ou desabilitar zoom dinâmico de foco nas áreas durante a apresentação')}>
              <input
                type="checkbox"
                checked={zoomEnabled}
                onChange={(e) => onToggleZoom(e.target.checked)}
              />
              <span>{t('settings.presentation_zoom_title', 'Zoom dinâmico de foco nas áreas')}</span>
            </label>
          </div>
        )}
      </div>

      <div className="presentation-body">
        <div className="pres-active-banner">
          <span className="pres-label">{t('viewer.active_locks_title', 'Bloqueios Ativos')}</span>
          <span className="pres-active-count">
            {data?.counts?.active ?? lockCount}
          </span>
        </div>

        {sortedRows.length > 0 ? (
          <div className="pres-summary-section">
            <span className="pres-label pres-summary-title">
              {t('viewer.lock_summary_title', 'Resumo dos Bloqueios')} ({sortedRows.length})
            </span>
            <div className="pres-summary-list">
              {sortedRows.map((r) => (
                <div key={r.id} className="pres-summary-item">
                  <div className="pres-summary-info">
                    <strong className="pres-summary-name">
                      {equipKey ? (r.values[equipKey] || `Reg #${r.id}`) : `Reg #${r.id}`}
                    </strong>
                    {(r.t0 != null || r.created_at) && (
                      <small className="pres-summary-date">
                        {formatDateTime(r.t0 != null ? r.t0 : r.created_at)}
                      </small>
                    )}
                  </div>
                  <span className="badge on pres-summary-badge">
                    {formatHours(r.hours)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="muted" style={{ textAlign: 'center', margin: '24px 0', fontSize: 13 }}>
            {t('viewer.no_active_locks', 'Nenhum bloqueio ativo nesta área.')}
          </p>
        )}
      </div>

      <div className="presentation-footer">
        <Icon name="cursor" size={14} />
        <span>{t('viewer.presentation_hint', 'Clique no modal para interagir')}</span>
      </div>
    </aside>
  );
}
