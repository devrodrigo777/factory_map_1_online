import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Icon from './Icons.jsx';
import AreaHistory from './AreaHistory.jsx';
import Lightbox from './Lightbox.jsx';
import { useTranslation } from '../i18n/I18nContext.jsx';
import { dynamicAreaKey, dynamicFieldKey, dynamicRecordKey } from '../i18n/keys.js';
import { formatHours, formatValue, parsePhotoUrls, stageFor } from '../format.js';

// Painel lateral com os bloqueios de uma área (macro: todos os equipamentos do setor;
// detalhe: o(s) bloqueio(s) daquele equipamento).
export default function RecordsPanel({ areaId, refreshKey, initialHistory = false, stages = [], onClose }) {
  const { t, td } = useTranslation();
  const [tab, setTab] = useState('locks');
  const [history, setHistory] = useState(initialHistory);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(null); // { title, urls }
  const [expandedCards, setExpandedCards] = useState(() => new Set());
  const [currentCard, setCurrentCard] = useState(0);
  const carouselRef = useRef(null);

  useEffect(() => {
    let stop = false;
    api.areaRecords(areaId, history)
      .then((d) => { if (!stop) { setData(d); setError(''); } })
      .catch((e) => !stop && setError(e.message));
    return () => { stop = true; };
  }, [areaId, history, refreshKey]);

  const titleKey = data?.title_key;
  const detailFields = (data?.fields ?? []).filter((f) => f.key !== titleKey);
  const sepIdx = detailFields.findIndex((f) => f.key === '__separator__');
  const hasActiveSeparator = sepIdx !== -1 && sepIdx < detailFields.length - 1;
  const primaryFields = hasActiveSeparator ? detailFields.slice(0, sepIdx) : detailFields.filter((f) => f.key !== '__separator__');
  const collapsedFields = hasActiveSeparator ? detailFields.slice(sepIdx + 1) : [];

  const sortedRows = (data?.rows ?? []).slice().sort((a, b) => {
    const tA = a.t0 != null ? a.t0 : (a.created_at ? Date.parse(a.created_at) : a.id);
    const tB = b.t0 != null ? b.t0 : (b.created_at ? Date.parse(b.created_at) : b.id);
    return tB - tA;
  });

  useEffect(() => {
    setCurrentCard(0);
    if (carouselRef.current) carouselRef.current.scrollLeft = 0;
  }, [areaId, history, sortedRows.length]);

  const handleCarouselScroll = (e) => {
    const carousel = e.currentTarget;
    if (carousel.clientWidth > 0) {
      setCurrentCard(Math.max(
        0,
        Math.min(sortedRows.length - 1, Math.round(carousel.scrollLeft / carousel.clientWidth))
      ));
    }
  };

  const toggleCardExpand = (id) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderField = (f, r) => {
    const val = r.values[f.key];
    const isPhoto = f.type === 'photo';
    const urls = isPhoto ? parsePhotoUrls(val) : [];
    const displayValue = formatValue(f.type, val, f.key);
    return (
      <div key={f.key}>
        <dt>{td(dynamicFieldKey(f.key, f.label), f.label)}</dt>
        <dd>
          {isPhoto ? (
            urls.length > 0 ? (
              <button
                type="button"
                className="photo-link-btn"
                onClick={() => setLightbox({ title: td(dynamicFieldKey(f.key, f.label), f.label), urls })}
                title={`Ver ${urls.length === 1 ? '1 foto anexada' : `${urls.length} fotos anexadas`}`}
              >
                <Icon name="image" size={15} />
                <span>{urls.length === 1 ? '1 anexo' : `${urls.length} anexos`}</span>
              </button>
            ) : (
              '—'
            )
          ) : (
            f.type === 'text' && val != null
              ? td(dynamicRecordKey(f.key, val), displayValue)
              : displayValue
          )}
        </dd>
      </div>
    );
  };

  return (
    <aside className={`records-panel${tab === 'history' ? ' wide' : ''}`} aria-label="Bloqueios da área">
      <header>
        <div>
          <h2>
            {data?.area.name
              ? td(dynamicAreaKey(data.area.id, 'name', data.area.name), data.area.name)
              : t('records_panel.title_default', 'Bloqueios')}
          </h2>
          {data && (
            <p className="muted">
              {data.counts.active === 0
                ? t('records_panel.no_active_locks', 'Nenhum bloqueio ativo')
                : (data.counts.active === 1
                    ? t('records_panel.active_locks_count', { count: 1 })
                    : t('records_panel.active_locks_count_plural', { count: data.counts.active }))}
              {data.counts.total > data.counts.active && ` · ${t('records_panel.in_history_suffix', { count: data.counts.total })}`}
            </p>
          )}
        </div>
        <button className="btn icon ghost" onClick={onClose} aria-label={t('common.close', 'Fechar')}><Icon name="close" /></button>
      </header>

      <div className="tabs-mini" role="tablist">
        <button role="tab" aria-selected={tab === 'locks'} className={tab === 'locks' ? 'on' : ''} onClick={() => setTab('locks')}>
          {data ? `${t('records_panel.tab_locked', 'Bloqueados')} (${history ? (data.rows?.length ?? 0) : (data.counts?.active ?? 0)})` : t('records_panel.tab_locked', 'Bloqueados')}
        </button>
        <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
          {t('records_panel.tab_history', 'Histórico')}
        </button>
      </div>

      {tab === 'history' ? (
        <div className="records-list"><AreaHistory areaId={areaId} refreshKey={refreshKey} /></div>
      ) : (
      <>
      <label className="check history-toggle">
        <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} />
        {t('records_panel.include_closed', 'Incluir encerrados')}
      </label>

      <div className="records-list">
        {error && <p className="expr-test err">{error}</p>}
        {data?.error && <p className="expr-test err">{t('records_panel.area_filter_error', 'Filtro da área com erro')}: {data.error}</p>}
        {data && !data.error && sortedRows.length === 0 && (
          <p className="muted empty">{history ? t('records_panel.empty_for_area', 'Nenhum registro para esta área.') : t('records_panel.all_clear_area', 'Tudo liberado nesta área.')}</p>
        )}
        <div className="lock-card-carousel" ref={carouselRef} onScroll={handleCarouselScroll}>
          {sortedRows.map((r) => {
            const isExpanded = expandedCards.has(r.id);
            return (
              <article key={r.id} className={`lock-card ${r.active ? 'on' : 'off'}`}
                style={r.active && stages.length ? { borderLeftColor: stageFor(r.hours, stages).color } : undefined}>
                <header>
                  <strong>
                    {titleKey
                      ? td(dynamicRecordKey(titleKey, r.values[titleKey]), formatValue('text', r.values[titleKey]))
                      : `Registro ${r.id}`}
                  </strong>
                  <span className={`badge ${r.active ? 'on' : 'off'}`}
                    style={r.active && stages.length ? { background: stageFor(r.hours, stages).color, color: '#fff' } : undefined}>
                    {r.active ? `${t('viewer.active_for', 'Ativo há')} ${formatHours(r.hours)}` : `${t('viewer.closed_badge', 'Encerrado')} · ${formatHours(r.hours)}`}
                  </span>
                </header>
                <dl>
                  {primaryFields.map((f) => renderField(f, r))}
                  {hasActiveSeparator && isExpanded && (
                    collapsedFields.map((f) => renderField(f, r))
                  )}
                </dl>
                {hasActiveSeparator && (
                  <button
                    type="button"
                    className="lock-card-toggle-btn"
                    onClick={() => toggleCardExpand(r.id)}
                    title={isExpanded ? t('records_panel.collapse_info', 'Contrair informações') : t('records_panel.expand_info', 'Expandir mais informações')}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? t('records_panel.collapse_info', 'Contrair informações') : t('records_panel.expand_info', 'Expandir mais informações')}
                  >
                    <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={18} />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </div>
      {sortedRows.length > 0 && (
        <div className="lock-card-position">
          <span role="status" aria-live="polite">
            {t('records_panel.carousel_position', { current: currentCard + 1, total: sortedRows.length })}
          </span>
          <div
            className="lock-card-progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={sortedRows.length}
            aria-valuenow={currentCard + 1}
            aria-label={t('records_panel.carousel_progress', 'Posição do bloqueio')}
          >
            <span style={{ width: `${((currentCard + 1) / sortedRows.length) * 100}%` }} />
          </div>
        </div>
      )}
      </>
      )}
      {lightbox && (
        <Lightbox
          title={lightbox.title}
          urls={lightbox.urls}
          onClose={() => setLightbox(null)}
        />
      )}
    </aside>
  );
}
