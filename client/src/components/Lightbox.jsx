import { useEffect, useRef, useState } from 'react';
import Icon from './Icons.jsx';

async function downloadFile(url, preferredName) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch error');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = preferredName || url.split('/').pop().split('?')[0] || 'foto.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  } catch {
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', preferredName || '');
    a.setAttribute('target', '_blank');
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

export default function Lightbox({ title, urls = [], initialIndex = 0, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (menuOpen) setMenuOpen(false);
        else onClose();
      } else if (e.key === 'ArrowLeft') {
        setLoading(true);
        setError(false);
        setIndex((i) => (i > 0 ? i - 1 : urls.length - 1));
      } else if (e.key === 'ArrowRight') {
        setLoading(true);
        setError(false);
        setIndex((i) => (i < urls.length - 1 ? i + 1 : 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [urls.length, onClose, menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointer);
    return () => window.removeEventListener('pointerdown', onPointer);
  }, [menuOpen]);

  const currentUrl = urls[index];

  const getCleanName = (u, i) => {
    try {
      const parts = u.split('/').pop().split('?')[0].split('.');
      const ext = parts.length > 1 ? parts.pop() : 'jpg';
      const cleanExt = ext.length > 0 && ext.length <= 4 ? ext : 'jpg';
      return `foto_${i + 1}.${cleanExt}`;
    } catch {
      return `foto_${i + 1}.jpg`;
    }
  };

  const handleDownloadCurrent = () => {
    if (!currentUrl) return;
    setMenuOpen(false);
    downloadFile(currentUrl, getCleanName(currentUrl, index));
  };

  const handleDownloadAll = async () => {
    setMenuOpen(false);
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i];
      await downloadFile(u, getCleanName(u, i));
      if (i < urls.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  };

  return (
    <div className="lightbox-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-dialog" role="dialog" aria-modal="true" aria-label={title || 'Fotos'}>
        <header className="lightbox-header">
          <div className="lightbox-title">
            <Icon name="image" size={18} />
            <h3>{title || 'Fotos'}</h3>
            {urls.length > 1 && <span className="lightbox-counter">{index + 1} de {urls.length}</span>}
          </div>
          <div className="lightbox-actions">
            {urls.length === 1 && currentUrl && (
              <button
                type="button"
                className="btn icon ghost"
                onClick={handleDownloadCurrent}
                title="Baixar foto"
                aria-label="Baixar foto"
              >
                <Icon name="download" />
              </button>
            )}

            {urls.length > 1 && (
              <div className="lightbox-download-wrap" ref={menuRef}>
                <button
                  type="button"
                  className={`btn icon ghost ${menuOpen ? 'active' : ''}`}
                  onClick={() => setMenuOpen((o) => !o)}
                  title="Baixar fotos"
                  aria-label="Opções de download"
                  aria-expanded={menuOpen}
                >
                  <Icon name="download" />
                </button>
                {menuOpen && (
                  <div className="lightbox-download-menu" role="menu">
                    <button
                      type="button"
                      className="lightbox-menu-item"
                      onClick={handleDownloadCurrent}
                    >
                      <Icon name="download" size={16} />
                      <span>Baixar esta foto</span>
                    </button>
                    <button
                      type="button"
                      className="lightbox-menu-item"
                      onClick={handleDownloadAll}
                    >
                      <Icon name="download" size={16} />
                      <span>Baixar todas as fotos ({urls.length})</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <button className="btn icon ghost" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button>
          </div>
        </header>

        <div className="lightbox-body">
          {urls.length > 1 && (
            <button className="btn icon ghost lightbox-nav prev" onClick={() => { setLoading(true); setError(false); setIndex((i) => (i > 0 ? i - 1 : urls.length - 1)); }} aria-label="Foto anterior">
              <Icon name="back" />
            </button>
          )}

          <div className="lightbox-content">
            {loading && <div className="spinner" role="status" aria-label="Carregando imagem" />}
            {error ? (
              <div className="lightbox-error">
                <p>Não foi possível carregar a imagem na pré-visualização.</p>
                <a href={currentUrl} target="_blank" rel="noreferrer" className="btn primary">Abrir link da imagem</a>
              </div>
            ) : (
              <img
                key={currentUrl}
                src={currentUrl}
                alt={title || 'Foto'}
                className={`lightbox-img ${loading ? 'is-loading' : ''}`}
                onLoad={() => setLoading(false)}
                onError={() => { setLoading(false); setError(true); }}
              />
            )}
          </div>

          {urls.length > 1 && (
            <button className="btn icon ghost lightbox-nav next" onClick={() => { setLoading(true); setError(false); setIndex((i) => (i < urls.length - 1 ? i + 1 : 0)); }} aria-label="Próxima foto">
              <span style={{ transform: 'rotate(180deg)', display: 'inline-block' }}><Icon name="back" /></span>
            </button>
          )}
        </div>

        {urls.length > 1 && (
          <div className="lightbox-thumbs">
            {urls.map((u, i) => (
              <button key={i} type="button" className={`lightbox-thumb ${i === index ? 'active' : ''}`} onClick={() => { setLoading(true); setError(false); setIndex(i); }}>
                <img src={u} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
