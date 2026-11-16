import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Editor from '../components/Editor.jsx';
import Icon from '../components/Icons.jsx';
import Shell from '../components/Shell.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';

export default function Admin() {
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef(null);
  const [maps, setMaps] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    const list = await api.listMaps();
    setMaps(list);
    return list;
  }, []);

  useEffect(() => {
    refresh()
      .then((list) => list.length && setSelectedId(list[0].id))
      .catch((e) => toast(e.message, 'error'));
  }, [refresh, toast]);

  // avisa antes de fechar a aba com alterações não salvas
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const confirmLeave = async () => {
    if (!dirty) return true;
    return await confirm({
      title: 'Descartar alterações?',
      message: 'Há alterações não salvas nesta planta. Deseja descartar?',
      confirmText: 'Descartar alterações',
      danger: true,
    });
  };

  const select = async (id) => {
    if (id === selectedId) return;
    const ok = await confirmLeave();
    if (!ok) return;
    setDirty(false);
    setSelectedId(id);
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ok = await confirmLeave();
    if (!ok) return;
    setUploading(true);
    try {
      const name = file.name.replace(/\.[^.]+$/, '');
      const created = await api.createMap(file, name);
      await refresh();
      setDirty(false);
      setSelectedId(created.id);
      toast('Planta enviada. Agora desenhe as áreas clicáveis.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const onDeleted = async () => {
    setDirty(false);
    const list = await refresh();
    setSelectedId(list[0]?.id ?? null);
  };

  return (
    <Shell title="Plantas e áreas">
      <div className="admin-body">
        <aside className="sidebar">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden onChange={onUpload} />
          <button className="btn primary wide" onClick={() => fileRef.current.click()} disabled={uploading}>
            <Icon name="upload" /> {uploading ? 'Enviando…' : 'Enviar imagem'}
          </button>
          <ul className="map-list">
            {maps?.map((m) => (
              <li key={m.id}>
                <button className={`map-item ${m.id === selectedId ? 'active' : ''}`} onClick={() => select(m.id)}>
                  <img src={m.image} alt="" loading="lazy" />
                  <span className="map-item-text">
                    <strong>{m.name}</strong>
                    <small>{m.area_count} {m.area_count === 1 ? 'área' : 'áreas'}{m.is_root ? ' · inicial' : ''}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="admin-main">
          {selectedId ? (
            <Editor
              key={selectedId}
              mapId={selectedId}
              maps={maps || []}
              onChanged={refresh}
              onDirty={setDirty}
              onDeleted={onDeleted}
              onOpenMap={select}
            />
          ) : (
            <div className="center-screen inline">
              <h2>{maps ? 'Comece enviando a planta' : 'Carregando…'}</h2>
              {maps && <p>Envie a imagem da planta geral. Depois você desenha as áreas clicáveis e liga cada uma a uma imagem de detalhe.</p>}
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}
