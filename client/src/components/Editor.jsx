import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import MapStage from './MapStage.jsx';
import Icon from './Icons.jsx';
import ExprInput from './ExprInput.jsx';
import { useToast } from './Toast.jsx';
import { useConfirm } from './ConfirmModal.jsx';
import { centroid, clamp, pointsAttr, rectPoints } from '../geometry.js';

const COLORS = ['#2B5C8F', '#E4572E', '#2E8B6B', '#B8860B', '#7B4FA3', '#C23B6B'];
const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
let seq = 0;
const newUid = () => `n${++seq}`;
const withUid = (a) => ({ ...a, uid: `a${a.id}` });
const MAX_HISTORY = 30; // Suporta histórico de pelo menos 10 passos (até 30)

export default function Editor({ mapId, maps, onChanged, onDirty, onDeleted, onOpenMap }) {
  const toast = useToast();
  const confirm = useConfirm();
  const stageRef = useRef(null);
  const imgInput = useRef(null);

  const [map, setMap] = useState(null);
  const [areas, setAreas] = useState([]);
  const areasRef = useRef(areas);
  areasRef.current = areas;

  const [selectedUids, setSelectedUids] = useState([]);
  const [tool, setTool] = useState('select'); // select | polygon | rect
  const [draft, setDraft] = useState([]); // pontos normalizados em desenho
  const [hover, setHover] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [imageEffect, setImageEffect] = useState('none');
  const [fields, setFields] = useState([]);

  // Histórico de Desfazer/Refazer (Ctrl+Z / Ctrl+Y)
  const historyRef = useRef([]);
  const historyIdxRef = useRef(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Movimentação magnética leve (desativável pelo usuário)
  const [snapMagnetic, setSnapMagnetic] = useState(() => localStorage.getItem('editor_snap_magnetic') !== 'false');

  const toggleSnapMagnetic = () => {
    const next = !snapMagnetic;
    setSnapMagnetic(next);
    localStorage.setItem('editor_snap_magnetic', String(next));
  };

  const mark = useCallback(() => { setDirty(true); onDirty(true); }, [onDirty]);
  const clean = useCallback(() => { setDirty(false); onDirty(false); }, [onDirty]);

  const initHistory = (initialAreas) => {
    historyRef.current = [JSON.parse(JSON.stringify(initialAreas))];
    historyIdxRef.current = 0;
    setCanUndo(false);
    setCanRedo(false);
  };

  const pushHistory = (newAreas) => {
    const serialized = JSON.parse(JSON.stringify(newAreas));
    const currentIdx = historyIdxRef.current;
    const nextHistory = historyRef.current.slice(0, currentIdx + 1);
    nextHistory.push(serialized);
    if (nextHistory.length > MAX_HISTORY) {
      nextHistory.shift();
    }
    historyRef.current = nextHistory;
    historyIdxRef.current = nextHistory.length - 1;
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(false);
  };

  const undo = () => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const prevAreas = JSON.parse(JSON.stringify(historyRef.current[historyIdxRef.current]));
    setAreas(prevAreas);
    setSelectedUids((prev) => prevAreas.filter((a) => prev.includes(a.uid)).map((a) => a.uid));
    mark();
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(true);
    toast('Ação desfeita (Ctrl+Z)');
  };

  const redo = () => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const nextAreas = JSON.parse(JSON.stringify(historyRef.current[historyIdxRef.current]));
    setAreas(nextAreas);
    setSelectedUids((prev) => nextAreas.filter((a) => prev.includes(a.uid)).map((a) => a.uid));
    mark();
    setCanUndo(true);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
    toast('Ação refeita (Ctrl+Y)');
  };

  const load = useCallback(async () => {
    try {
      const m = await api.getMap(mapId);
      setMap(m);
      setName(m.name);
      setImageEffect(m.image_effect || 'none');
      const withU = m.areas.map(withUid);
      setAreas(withU);
      initHistory(withU);
      clean();
    } catch (e) {
      toast(e.message, 'error');
    }
  }, [mapId, clean, toast]);

  const handleEffectChange = async (eff) => {
    setImageEffect(eff);
    setMap((prev) => (prev ? { ...prev, image_effect: eff } : prev));
    try {
      await api.patchMap(mapId, { image_effect: eff });
      toast('Efeito visual aplicado à planta.');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.listFields().then(setFields).catch(() => {}); }, []);

  const isNoneSelected = selectedUids.length === 0;
  const isSingle = selectedUids.length === 1;
  const isMulti = selectedUids.length > 1;
  const selArea = isSingle ? areas.find((a) => a.uid === selectedUids[0]) || null : null;
  const selectedAreas = areas.filter((a) => selectedUids.includes(a.uid));

  const norm = (p) => ({ x: clamp(p.x / map.width, 0, 1), y: clamp(p.y / map.height, 0, 1) });

  // Magnetismo leve ao arrastar pontos (alinha ortogonalmente com vértices adjacentes e cantos de outras áreas)
  const getSnapTarget = (x, y, uid, vertIdx) => {
    if (!snapMagnetic) return { x, y };
    const k = stageRef.current?.view?.k || 1;
    const thresholdX = 9 / (map.width * k);
    const thresholdY = 9 / (map.height * k);

    let bestDx = thresholdX;
    let bestDy = thresholdY;
    let snappedX = x;
    let snappedY = y;

    const area = areas.find((a) => a.uid === uid);
    if (!area) return { x, y };

    const pts = area.points;
    const prev = pts[(vertIdx - 1 + pts.length) % pts.length];
    const next = pts[(vertIdx + 1) % pts.length];
    const candidates = [prev, next];

    areas.forEach((other) => {
      if (other.uid === uid) {
        pts.forEach((p, idx) => {
          if (idx !== vertIdx && idx !== (vertIdx - 1 + pts.length) % pts.length && idx !== (vertIdx + 1) % pts.length) {
            candidates.push(p);
          }
        });
      } else {
        other.points.forEach((p) => candidates.push(p));
      }
    });

    for (const [cx, cy] of candidates) {
      const dx = Math.abs(x - cx);
      if (dx < bestDx) {
        bestDx = dx;
        snappedX = cx;
      }
      const dy = Math.abs(y - cy);
      if (dy < bestDy) {
        bestDy = dy;
        snappedY = cy;
      }
    }

    return { x: snappedX, y: snappedY };
  };

  // ---------- criar / editar áreas ----------
  const addArea = (points) => {
    const uid = newUid();
    const next = [...areas, {
      uid, id: null, name: `Área ${areas.length + 1}`, code: '', description: '', points,
      color: COLORS[areas.length % COLORS.length], opacity: 0.25, show_label: true, target_map_id: null,
      lock_filter: '', show_lock: false, display_fields: [],
    }];
    setAreas(next);
    pushHistory(next);
    setSelectedUids([uid]);
    setDraft([]);
    setHover(null);
    setTool('select');
    mark();
  };

  const patchArea = (uid, patch) => {
    const next = areas.map((a) => (a.uid === uid ? { ...a, ...patch } : a));
    setAreas(next);
    pushHistory(next);
    mark();
  };

  const removeArea = async (uid) => {
    const a = areas.find((x) => x.uid === uid);
    const ok = await confirm({
      title: 'Excluir área',
      message: `Deseja excluir a área "${a?.name || 'selecionada'}"?`,
      confirmText: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const next = areas.filter((x) => x.uid !== uid);
    setAreas(next);
    pushHistory(next);
    setSelectedUids((prev) => prev.filter((id) => id !== uid));
    mark();
  };

  const removeSelectedAreas = async () => {
    const count = selectedUids.length;
    const ok = await confirm({
      title: 'Excluir áreas selecionadas',
      message: `Deseja excluir as ${count} áreas selecionadas?`,
      confirmText: `Excluir ${count} áreas`,
      danger: true,
    });
    if (!ok) return;
    const next = areas.filter((x) => !selectedUids.includes(x.uid));
    setAreas(next);
    pushHistory(next);
    setSelectedUids([]);
    mark();
  };

  const finishPolygon = () => {
    if (draft.length >= 3) addArea(draft);
    else toast('Marque pelo menos 3 pontos para fechar a área.', 'error');
  };

  const cancelDraft = () => { setDraft([]); setHover(null); };
  const chooseTool = (t) => { setTool(t); cancelDraft(); if (t !== 'select') setSelectedUids([]); };

  const handleHover = (pt) => {
    if (!pt) { setHover(null); return; }
    setHover(norm(pt));
  };

  const onTap = (pt) => {
    // Ao clicar no fundo em modo 'select', limpa qualquer seleção ativa
    if (tool === 'select') {
      setSelectedUids([]);
      return;
    }
    const p = norm(pt);
    if (tool === 'polygon') {
      if (draft.length >= 3) {
        const [fx, fy] = draft[0];
        const d = Math.hypot((fx - p.x) * map.width, (fy - p.y) * map.height) * stageRef.current.view.k;
        if (d < 18) return finishPolygon();
      }
      setDraft((d) => [...d, [p.x, p.y]]);
    } else if (tool === 'rect') {
      if (!draft.length) return setDraft([[p.x, p.y]]);
      const pts = rectPoints(draft[0], [p.x, p.y]);
      const w = (pts[1][0] - pts[0][0]) * map.width;
      const h = (pts[2][1] - pts[0][1]) * map.height;
      if (w < 4 || h < 4) return toast('Retângulo muito pequeno.', 'error');
      addArea(pts);
    }
  };

  // ---------- arrastar vértices / mover área com suporte a histórico ----------
  const drag = (e, onMove, onEnd) => {
    e.stopPropagation();
    e.preventDefault();
    const id = e.pointerId;
    const start = stageRef.current.clientToContent(e.clientX, e.clientY);
    let moved = false;
    const move = (ev) => {
      if (ev.pointerId !== id) return;
      moved = true;
      onMove(stageRef.current.clientToContent(ev.clientX, ev.clientY), start);
    };
    const up = (ev) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (moved && onEnd) onEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const setPoint = (uid, i, p) => {
    const raw = norm(p);
    const snapped = getSnapTarget(raw.x, raw.y, uid, i);
    setAreas((l) => l.map((a) => (a.uid !== uid ? a : { ...a, points: a.points.map((pt, j) => (j === i ? [snapped.x, snapped.y] : pt)) })));
    mark();
  };

  const startVertex = (e, uid, i) => drag(e, (p) => setPoint(uid, i, p), () => pushHistory(areasRef.current));

  const startInsert = (e, a, i) => {
    const q = a.points[(i + 1) % a.points.length];
    const mid = [(a.points[i][0] + q[0]) / 2, (a.points[i][1] + q[1]) / 2];
    const next = areas.map((x) => (x.uid !== a.uid ? x : { ...x, points: [...x.points.slice(0, i + 1), mid, ...x.points.slice(i + 1)] }));
    setAreas(next);
    mark();
    drag(e, (p) => setPoint(a.uid, i + 1, p), () => pushHistory(areasRef.current));
  };

  const removeVertex = (uid, i) => {
    const next = areas.map((a) => (a.uid !== uid || a.points.length <= 3 ? a : { ...a, points: a.points.filter((_, j) => j !== i) }));
    setAreas(next);
    pushHistory(next);
    mark();
  };

  // Mover área única ou todas as áreas selecionadas em conjunto
  const startMove = (e, primaryArea) => {
    const movingUids = selectedUids.includes(primaryArea.uid) ? selectedUids : [primaryArea.uid];
    const movingAreas = areas.filter((x) => movingUids.includes(x.uid));
    const allPts = movingAreas.flatMap((x) => x.points);
    const xs = allPts.map((p) => p[0]);
    const ys = allPts.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const snapshots = movingAreas.map((x) => ({ uid: x.uid, points: x.points }));

    drag(
      e,
      (p, s) => {
        const dx = clamp((p.x - s.x) / map.width, -minX, 1 - maxX);
        const dy = clamp((p.y - s.y) / map.height, -minY, 1 - maxY);
        setAreas((l) =>
          l.map((x) => {
            const snap = snapshots.find((s) => s.uid === x.uid);
            if (!snap) return x;
            return { ...x, points: snap.points.map(([px, py]) => [px + dx, py + dy]) };
          })
        );
        mark();
      },
      () => pushHistory(areasRef.current)
    );
  };

  // ---------- teclado (atalhos de histórico, ferramentas e exclusão) ----------
  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;

      // Desfazer: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
        return;
      }

      // Refazer: Ctrl+Y / Cmd+Y
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === 'Escape') {
        if (draft.length) cancelDraft();
        else if (tool !== 'select') setTool('select');
        else setSelectedUids([]);
      } else if (e.key === 'Enter' && tool === 'polygon' && draft.length >= 3) {
        finishPolygon();
      } else if (e.key === 'Backspace' && draft.length) {
        setDraft((d) => d.slice(0, -1));
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedUids.length > 0 && !draft.length) {
        if (isSingle) removeArea(selectedUids[0]);
        else removeSelectedAreas();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- persistência ----------
  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.saveAreas(mapId, areas.map(({ uid, ...a }) => a));
      setMap(saved);
      const list = saved.areas.map(withUid);
      setAreas(list);
      setSelectedUids((prev) => list.filter((a) => prev.includes(a.uid)).map((a) => a.uid));
      clean();
      onChanged();
      toast('Alterações salvas.');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const renameMap = async () => {
    const n = name.trim();
    if (!n || n === map.name) return setName(map.name);
    try { setMap({ ...map, ...(await api.patchMap(mapId, { name: n })), areas: map.areas }); onChanged(); } catch (e) { toast(e.message, 'error'); }
  };

  const makeRoot = async () => {
    try { await api.patchMap(mapId, { is_root: true }); setMap((m) => ({ ...m, is_root: true })); onChanged(); toast('Esta planta agora é a tela inicial.'); } catch (e) { toast(e.message, 'error'); }
  };

  const replaceImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (dirty) {
      const ok = await confirm({
        title: 'Trocar imagem da planta',
        message: 'Trocar a imagem recarrega a planta e descarta alterações não salvas. Deseja continuar?',
        confirmText: 'Continuar e trocar',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await api.replaceImage(mapId, file);
      await load();
      onChanged();
      toast('Imagem substituída. As áreas foram mantidas na mesma posição relativa.');
    } catch (err) { toast(err.message, 'error'); }
  };

  const deleteMap = async () => {
    const ok = await confirm({
      title: 'Excluir planta',
      message: `Excluir a planta "${map.name}" e todas as suas áreas? Áreas de outras plantas que abrem esta imagem perderão o vínculo.`,
      confirmText: 'Excluir planta',
      danger: true,
    });
    if (!ok) return;
    try { await api.deleteMap(mapId); onDeleted(); toast('Planta excluída.'); } catch (e) { toast(e.message, 'error'); }
  };

  if (!map) return <div className="center-screen inline"><div className="spinner" /></div>;

  // ---------- desenho ----------
  const r = (coarse ? 13 : 8);
  const overlay = ({ k }) => (
    <>
      {areas.map((a) => {
        const isSel = selectedUids.includes(a.uid);
        const [cx, cy] = centroid(a.points, map.width, map.height);
        return (
          <g
            key={a.uid}
            className={`area${isSel ? ' is-selected' : ''}${isMulti && isSel ? ' is-multi' : ''}${tool !== 'select' ? ' is-passive' : ''}${a.target_map_id ? ' has-target' : ''}`}
            style={{ '--c': a.color, '--o': a.opacity }}
          >
            <polygon
              points={pointsAttr(a.points, map.width, map.height)}
              vectorEffect="non-scaling-stroke"
              onClick={(e) => {
                if (tool !== 'select') return;
                e.stopPropagation();
                if (e.ctrlKey || e.metaKey) {
                  setSelectedUids((prev) =>
                    prev.includes(a.uid) ? prev.filter((id) => id !== a.uid) : [...prev, a.uid]
                  );
                } else {
                  setSelectedUids([a.uid]);
                }
              }}
              onPointerDown={(e) => {
                if (tool !== 'select') return;
                e.stopPropagation();
                if (e.ctrlKey || e.metaKey) return;
                if (isSel) {
                  startMove(e, a);
                } else {
                  setSelectedUids([a.uid]);
                  startMove(e, a);
                }
              }}
            />

            {/* Destaque visual luminoso com linha pontilhada neon para áreas na seleção múltipla */}
            {isMulti && isSel && (
              <polygon
                points={pointsAttr(a.points, map.width, map.height)}
                vectorEffect="non-scaling-stroke"
                className="multi-sel-glow"
                pointerEvents="none"
              />
            )}

            {/* Badge distintivo circular com check no centro de cada área da seleção múltipla */}
            {isMulti && isSel && (
              <g transform={`translate(${cx}, ${cy})`} pointerEvents="none">
                <circle r={14 / k} fill="#0284c7" stroke="#ffffff" strokeWidth={2.5 / k} filter="drop-shadow(0 2px 5px rgba(0,0,0,0.5))" />
                <path
                  d={`M ${-5 / k} ${0} L ${-1.5 / k} ${3.5 / k} L ${5 / k} ${-3.5 / k}`}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={2.5 / k}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            )}

            {a.show_label && a.name && (!isMulti || !isSel) && (
              <text x={cx} y={cy} fontSize={14 / k} strokeWidth={3.5 / k}>{a.name}</text>
            )}
          </g>
        );
      })}

      {/* Alças de ajuste de vértices disponíveis quando apenas UMA área estiver selecionada */}
      {isSingle && selArea && tool === 'select' && (
        <g>
          {selArea.points.map((p, i) => {
            const q = selArea.points[(i + 1) % selArea.points.length];
            return (
              <circle key={`m${i}`} className="handle mid" cx={((p[0] + q[0]) / 2) * map.width} cy={((p[1] + q[1]) / 2) * map.height}
                r={(r * 0.65) / k} strokeWidth={1.5 / k} onPointerDown={(e) => startInsert(e, selArea, i)} />
            );
          })}
          {selArea.points.map((p, i) => (
            <circle key={`v${i}`} className="handle vertex" cx={p[0] * map.width} cy={p[1] * map.height}
              r={r / k} strokeWidth={2 / k}
              onPointerDown={(e) => startVertex(e, selArea.uid, i)} onDoubleClick={() => removeVertex(selArea.uid, i)} />
          ))}
        </g>
      )}

      {draft.length > 0 && (() => {
        const live = hover ? [...draft, [hover.x, hover.y]] : draft;
        const pts = tool === 'rect' && hover ? rectPoints(draft[0], [hover.x, hover.y]) : live;
        return (
          <g className="draft">
            {tool === 'rect' && hover
              ? <polygon points={pointsAttr(pts, map.width, map.height)} vectorEffect="non-scaling-stroke" />
              : <polyline points={pointsAttr(pts, map.width, map.height)} vectorEffect="non-scaling-stroke" />}
            {draft.map((p, i) => (
              <circle key={i} className={`handle vertex${i === 0 && draft.length >= 3 && tool === 'polygon' ? ' close' : ''}`}
                cx={p[0] * map.width} cy={p[1] * map.height} r={(i === 0 ? r * 1.2 : r * 0.8) / k} strokeWidth={2 / k} style={{ pointerEvents: 'none' }} />
            ))}
          </g>
        );
      })()}
    </>
  );

  const hint =
    tool === 'polygon' ? (draft.length < 3 ? 'Toque na planta para marcar os cantos da área.' : 'Continue marcando ou toque no primeiro ponto para fechar.')
    : tool === 'rect' ? (draft.length ? 'Toque no canto oposto.' : 'Toque no primeiro canto do retângulo.')
    : isMulti ? `${selectedUids.length} áreas selecionadas. Arraste qualquer uma para mover todas juntas.`
    : selArea ? 'Arraste os pontos para ajustar. Segure CTRL para selecionar múltiplas áreas.'
    : 'Toque em uma área para editar, segure CTRL para seleção múltipla, ou clique no fundo para ver a planta.';

  const otherMaps = maps.filter((m) => m.id !== mapId);

  return (
    <div className="editor">
      <div className="ed-toolbar">
        <div className="seg" role="group" aria-label="Ferramentas">
          <button className={`btn ${tool === 'select' ? 'active' : ''}`} onClick={() => chooseTool('select')}><Icon name="cursor" /><span>Selecionar</span></button>
          <button className={`btn ${tool === 'polygon' ? 'active' : ''}`} onClick={() => chooseTool('polygon')}><Icon name="polygon" /><span>Polígono</span></button>
          <button className={`btn ${tool === 'rect' ? 'active' : ''}`} onClick={() => chooseTool('rect')}><Icon name="square" /><span>Retângulo</span></button>
        </div>

        {/* Botões de Desfazer e Refazer (Histórico de passos) */}
        <div className="seg" role="group" aria-label="Histórico de alterações">
          <button
            type="button"
            className="btn icon"
            onClick={undo}
            disabled={!canUndo}
            title="Desfazer (Ctrl+Z)"
            aria-label="Desfazer"
          >
            <Icon name="undo" />
          </button>
          <button
            type="button"
            className="btn icon"
            onClick={redo}
            disabled={!canRedo}
            title="Refazer (Ctrl+Y)"
            aria-label="Refazer"
          >
            <Icon name="redo" />
          </button>
        </div>

        {/* Botão de alternância magnética */}
        <button
          type="button"
          className={`btn ${snapMagnetic ? 'active' : ''}`}
          onClick={toggleSnapMagnetic}
          title={snapMagnetic ? 'Alinhamento magnético ativado (clique para desativar)' : 'Alinhamento magnético desativado (clique para ativar)'}
        >
          <Icon name="magnet" />
          <span>{snapMagnetic ? 'Magnético: Ativo' : 'Magnético: Inativo'}</span>
        </button>

        {tool === 'polygon' && draft.length > 0 && (
          <>
            <button className="btn primary" onClick={finishPolygon} disabled={draft.length < 3}><Icon name="check" /><span>Concluir</span></button>
            <button className="btn" onClick={cancelDraft}><Icon name="close" /><span>Cancelar</span></button>
          </>
        )}
        <div className="spacer" />
        {dirty && <span className="dirty">Alterações não salvas</span>}
        <button className="btn primary" onClick={save} disabled={!dirty || saving}><Icon name="save" /><span>{saving ? 'Salvando…' : 'Salvar'}</span></button>
      </div>

      <div className="ed-body">
        <div className="ed-canvas">
          <MapStage
            key={map.image}
            ref={stageRef}
            map={map}
            overlay={overlay}
            onTap={onTap}
            onHover={tool !== 'select' && draft.length ? handleHover : undefined}
            className={tool !== 'select' ? 'is-drawing' : ''}
          />
          <p className="canvas-hint">{hint}</p>
        </div>

        <aside className="inspector">
          {/* Seção 1: 'Planta' e 'Áreas' aparecem SOMENTE quando nada estiver selecionado (clique no fundo) */}
          {isNoneSelected && (
            <>
              <section className="panel">
                <h2>Planta</h2>
                <label className="field">Nome
                  <input value={name} onChange={(e) => setName(e.target.value)} onBlur={renameMap} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                </label>
                <div className="row">
                  <input ref={imgInput} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" onChange={replaceImage} />
                  <button className="btn" onClick={() => imgInput.current.click()}><Icon name="swap" /> Trocar imagem</button>
                  <button className="btn" onClick={makeRoot} disabled={map.is_root}><Icon name="star" /> {map.is_root ? 'Tela inicial' : 'Definir como inicial'}</button>
                  <button className="btn danger" onClick={deleteMap}><Icon name="trash" /> Excluir</button>
                </div>

                <div className="map-effect-panel">
                  <span className="map-effect-title">Efeito na imagem de fundo:</span>
                  <div className="map-effect-options">
                    <button
                      type="button"
                      className={`btn-effect ${(!imageEffect || imageEffect === 'none') ? 'active' : ''}`}
                      onClick={() => handleEffectChange('none')}
                      title="Imagem original"
                    >
                      Padrão
                    </button>
                    <button
                      type="button"
                      className={`btn-effect ${imageEffect === 'grayscale' ? 'active' : ''}`}
                      onClick={() => handleEffectChange('grayscale')}
                      title="Converter imagem para Preto e Branco"
                    >
                      Preto e Branco
                    </button>
                    <button
                      type="button"
                      className={`btn-effect ${imageEffect === 'bright' ? 'active' : ''}`}
                      onClick={() => handleEffectChange('bright')}
                      title="Aumentar luminosidade (mais clara)"
                    >
                      Mais Clara
                    </button>
                    <button
                      type="button"
                      className={`btn-effect ${imageEffect === 'dark' ? 'active' : ''}`}
                      onClick={() => handleEffectChange('dark')}
                      title="Diminuir luminosidade (mais escura)"
                    >
                      Mais Escura
                    </button>
                  </div>
                </div>

                <p className="muted">{map.width} × {map.height} px</p>
              </section>

              <section className="panel">
                <h2>Áreas ({areas.length})</h2>
                {areas.length === 0 && <p className="muted">Nenhuma área ainda. Use Polígono ou Retângulo para desenhar a primeira.</p>}
                <ul className="area-list">
                  {areas.map((a) => {
                    const isSelectedInList = selectedUids.includes(a.uid);
                    return (
                      <li key={a.uid}>
                        <button
                          className={isSelectedInList ? 'active' : ''}
                          onClick={(e) => {
                            chooseTool('select');
                            if (e.ctrlKey || e.metaKey) {
                              setSelectedUids((prev) =>
                                prev.includes(a.uid) ? prev.filter((id) => id !== a.uid) : [...prev, a.uid]
                              );
                            } else {
                              setSelectedUids([a.uid]);
                            }
                          }}
                        >
                          <span className="swatch" style={{ background: a.color }} />
                          <span>{a.name || 'Sem nome'}</span>
                          {isMulti && isSelectedInList && <span className="multi-check-tag">✓</span>}
                          {a.target_map_id && <Icon name="open" size={15} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          )}

          {/* Seção 2: Edição de Área ÚNICA selecionada */}
          {isSingle && selArea && (
            <>
              <section className="panel" key={selArea.uid}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h2>Área selecionada</h2>
                  <button className="btn icon ghost" onClick={() => setSelectedUids([])} title="Fechar e voltar à planta">
                    <Icon name="close" size={16} />
                  </button>
                </div>
                <label className="field">Nome
                  <input value={selArea.name} onChange={(e) => patchArea(selArea.uid, { name: e.target.value })} />
                </label>
                <label className="field">Código
                  <input value={selArea.code} placeholder="Ex.: PRD-01" onChange={(e) => patchArea(selArea.uid, { code: e.target.value })} />
                  <small>Será usado para ligar esta área a planilhas e métricas.</small>
                </label>
                <label className="field">Descrição
                  <textarea rows={3} value={selArea.description} onChange={(e) => patchArea(selArea.uid, { description: e.target.value })} />
                </label>
                <label className="field">Ao clicar, abrir
                  <select value={selArea.target_map_id ?? ''} onChange={(e) => patchArea(selArea.uid, { target_map_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">Apenas mostrar informações</option>
                    {otherMaps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  {otherMaps.length === 0 && <small>Envie outra imagem para usá-la como detalhe.</small>}
                </label>
                {selArea.target_map_id && (
                  <button className="btn" onClick={() => onOpenMap(selArea.target_map_id)}><Icon name="open" /> Editar imagem de detalhe</button>
                )}
                <div className="row">
                  <label className="field color">Cor
                    <input type="color" value={selArea.color} onChange={(e) => patchArea(selArea.uid, { color: e.target.value })} />
                  </label>
                  <label className="field grow">Opacidade ({Math.round(selArea.opacity * 100)}%)
                    <input type="range" min="0" max="0.8" step="0.05" value={selArea.opacity} onChange={(e) => patchArea(selArea.uid, { opacity: Number(e.target.value) })} />
                  </label>
                </div>
                <label className="check">
                  <input type="checkbox" checked={selArea.show_label} onChange={(e) => patchArea(selArea.uid, { show_label: e.target.checked })} />
                  Mostrar o nome sobre a área
                </label>
                <button className="btn danger" onClick={() => removeArea(selArea.uid)}><Icon name="trash" /> Excluir área</button>
              </section>

              <section className="panel" key={`lock-${selArea.uid}`}>
                <h2>Cadeado (LOTOTO)</h2>
                <label className="check">
                  <input type="checkbox" checked={selArea.show_lock} onChange={(e) => patchArea(selArea.uid, { show_lock: e.target.checked })} />
                  Mostrar cadeado quando houver bloqueio ativo
                </label>
                {selArea.show_lock && (
                  <>
                    <div className="field">Quais registros pertencem a esta área?
                      <ExprInput
                        value={selArea.lock_filter}
                        onChange={(v) => patchArea(selArea.uid, { lock_filter: v })}
                        fields={fields.filter((f) => !f.computed)}
                        placeholder={'[Setor] == "Produção"'}
                      />
                      <small>Área macro: filtre só pelo setor. Área de detalhe: setor e equipamento.</small>
                    </div>
                    <DisplayFieldsConfig
                      fields={fields}
                      value={selArea.display_fields}
                      onChange={(cols) => patchArea(selArea.uid, { display_fields: cols })}
                    />
                  </>
                )}
              </section>
            </>
          )}

          {/* Seção 3: Edição MÚLTIPLA com CTRL (oculta dados individuais e exibe apenas configs comuns de informações de cadeado) */}
          {isMulti && (
            <>
              <section className="panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h2>{selectedUids.length} áreas selecionadas</h2>
                  <button className="btn icon ghost" onClick={() => setSelectedUids([])} title="Limpar seleção e voltar à planta">
                    <Icon name="close" size={16} />
                  </button>
                </div>
                <p className="muted" style={{ margin: '4px 0' }}>
                  Edição em lote: configure as informações comuns de cadeado para todas as {selectedUids.length} áreas selecionadas.
                </p>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn danger" onClick={removeSelectedAreas}>
                    <Icon name="trash" /> Excluir {selectedUids.length} áreas selecionadas
                  </button>
                </div>
              </section>

              <section className="panel">
                <DisplayFieldsConfig
                  fields={fields}
                  value={selectedAreas[0]?.display_fields || []}
                  onChange={(cols) => {
                    const next = areas.map((a) => {
                      if (!selectedUids.includes(a.uid)) return a;
                      return { ...a, display_fields: cols };
                    });
                    setAreas(next);
                    pushHistory(next);
                    mark();
                  }}
                />
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function DisplayFieldsConfig({ fields, value = [], onChange }) {
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const items = useMemo(() => {
    const map = new Map(fields.map((f) => [f.key, f]));
    const list = [];
    const seen = new Set();

    if (Array.isArray(value) && value.length > 0) {
      for (const k of value) {
        if (k === '__separator__') {
          list.push({ key: '__separator__', label: 'Separador', isSeparator: true, checked: true });
          seen.add('__separator__');
        } else if (map.has(k)) {
          const f = map.get(k);
          list.push({ key: f.key, label: f.label, computed: f.computed, isSeparator: false, checked: true });
          seen.add(k);
        }
      }
      for (const f of fields) {
        if (!seen.has(f.key)) {
          list.push({ key: f.key, label: f.label, computed: f.computed, isSeparator: false, checked: false });
        }
      }
      if (!seen.has('__separator__')) {
        list.push({ key: '__separator__', label: 'Separador', isSeparator: true, checked: true });
      }
    } else {
      for (const f of fields) {
        list.push({ key: f.key, label: f.label, computed: f.computed, isSeparator: false, checked: true });
      }
      list.push({ key: '__separator__', label: 'Separador', isSeparator: true, checked: true });
    }

    return list;
  }, [fields, value]);

  const emit = (newItems) => {
    const keys = newItems.filter((it) => it.isSeparator || it.checked).map((it) => it.key);
    onChange(keys);
  };

  const move = (fromIdx, toIdx) => {
    if (fromIdx < 0 || fromIdx >= items.length || toIdx < 0 || toIdx >= items.length || fromIdx === toIdx) return;
    const next = [...items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    emit(next);
  };

  const toggleCheck = (idx) => {
    const next = items.map((it, i) => (i === idx ? { ...it, checked: !it.checked } : it));
    emit(next);
  };

  const resetDefault = () => {
    const keys = fields.map((f) => f.key);
    keys.push('__separator__');
    onChange(keys);
  };

  const activeItems = items.filter((it) => it.isSeparator || it.checked);
  const sepActiveIdx = activeItems.findIndex((it) => it.isSeparator);
  const isSepAtEnd = sepActiveIdx === activeItems.length - 1;

  return (
    <div className="display-fields-config">
      <div className="display-fields-title">Informações mostradas ao clicar no cadeado</div>
      <div className="display-fields-header">
        <small className="muted">Ordene os itens ou use as setas. Mova o Separador para cima para ativá-lo.</small>
        <button type="button" className="btn ghost small reset-btn" onClick={resetDefault} title="Restaurar lista e ordem padrão">
          Padrão
        </button>
      </div>

      <ul
        className="display-fields-list"
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setDragOverIdx(null);
          }
        }}
      >
        {items.map((it, idx) => {
          const isTarget = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx;
          const showPlaceholderBefore = isTarget && idx < dragIdx;
          const showPlaceholderAfter = isTarget && idx > dragIdx;

          const placeholderEl = (
            <li
              key={`placeholder-${idx}`}
              className="field-order-placeholder"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={() => {
                move(dragIdx, idx);
                setDragIdx(null);
                setDragOverIdx(null);
              }}
            >
              <span>Posicionar aqui</span>
            </li>
          );

          if (it.isSeparator) {
            return (
              <Fragment key="__separator__">
                {showPlaceholderBefore && placeholderEl}
                <li
                  className={`field-order-item separator-item ${isSepAtEnd ? 'sep-inactive' : 'sep-active'} ${dragIdx === idx ? 'is-dragging' : ''} ${isTarget ? 'is-drop-target' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    setDragIdx(idx);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverIdx !== idx) setDragOverIdx(idx);
                  }}
                  onDrop={() => {
                    move(dragIdx, idx);
                    setDragIdx(null);
                    setDragOverIdx(null);
                  }}
                  onDragEnd={() => {
                    setDragIdx(null);
                    setDragOverIdx(null);
                  }}
                >
                  <div className="field-order-handle" title="Arrastar para reordenar">
                    <Icon name="grip" size={15} />
                  </div>
                  <div className="field-order-content">
                    <div className="field-order-title">
                      <strong>Separador</strong>
                      <span className={`badge ${isSepAtEnd ? 'off' : 'on'}`}>
                        {isSepAtEnd ? 'Inativo no final' : 'Ativo'}
                      </span>
                    </div>
                    <small className="field-order-hint">
                      {isSepAtEnd
                        ? 'No final (inativo). Mova para cima para colapsar itens.'
                        : 'Itens abaixo ficarão colapsados com botão para expandir.'}
                    </small>
                  </div>
                  <div className="field-order-actions">
                    <button
                      type="button"
                      className="btn icon ghost small"
                      disabled={idx === 0}
                      onClick={() => move(idx, idx - 1)}
                      title="Mover para cima"
                    >
                      <Icon name="arrowUp" size={13} />
                    </button>
                    <button
                      type="button"
                      className="btn icon ghost small"
                      disabled={idx === items.length - 1}
                      onClick={() => move(idx, idx + 1)}
                      title="Mover para baixo"
                    >
                      <Icon name="arrowDown" size={13} />
                    </button>
                  </div>
                </li>
                {showPlaceholderAfter && placeholderEl}
              </Fragment>
            );
          }

          return (
            <Fragment key={it.key}>
              {showPlaceholderBefore && placeholderEl}
              <li
                className={`field-order-item ${!it.checked ? 'is-unchecked' : ''} ${dragIdx === idx ? 'is-dragging' : ''} ${isTarget ? 'is-drop-target' : ''}`}
                draggable
                onDragStart={(e) => {
                  setDragIdx(idx);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverIdx !== idx) setDragOverIdx(idx);
                }}
                onDrop={() => {
                  move(dragIdx, idx);
                  setDragIdx(null);
                  setDragOverIdx(null);
                }}
                onDragEnd={() => {
                  setDragIdx(null);
                  setDragOverIdx(null);
                }}
              >
                <div className="field-order-handle" title="Arrastar para reordenar">
                  <Icon name="grip" size={15} />
                </div>
                <label className="field-order-check">
                  <input
                    type="checkbox"
                    checked={it.checked}
                    onChange={() => toggleCheck(idx)}
                  />
                  <span className="field-order-label">
                    {it.label}{it.computed ? ' ƒ' : ''}
                  </span>
                </label>
                <div className="field-order-actions">
                  <button
                    type="button"
                    className="btn icon ghost small"
                    disabled={idx === 0}
                    onClick={() => move(idx, idx - 1)}
                    title="Mover para cima"
                  >
                    <Icon name="arrowUp" size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn icon ghost small"
                    disabled={idx === items.length - 1}
                    onClick={() => move(idx, idx + 1)}
                    title="Mover para baixo"
                  >
                    <Icon name="arrowDown" size={13} />
                  </button>
                </div>
              </li>
              {showPlaceholderAfter && placeholderEl}
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}
