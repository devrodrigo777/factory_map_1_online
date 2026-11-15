import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from './Auth.jsx';
import Icon from './Icons.jsx';
import Modal from './Modal.jsx';
import { useToast } from './Toast.jsx';
import { ROLE_NAMES } from '../format.js';

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (!user) return <Link className="btn" to="/login">Entrar</Link>;

  return (
    <div className="user-menu" ref={ref}>
      <button className="btn user-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <span className="avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>
        <span className="user-name">{user.name}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <strong>{user.name}</strong>
            <small>{user.username} · {ROLE_NAMES[user.role]}</small>
          </div>
          <button role="menuitem" onClick={() => { setOpen(false); setPwd(true); }}>Alterar senha</button>
          <button role="menuitem" onClick={logout}>Sair</button>
        </div>
      )}
      {pwd && <PasswordModal onClose={() => setPwd(false)} />}
    </div>
  );
}

function PasswordModal({ onClose }) {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = again && next !== again;

  const save = async () => {
    setBusy(true);
    try {
      await api.changePassword(cur, next);
      toast('Senha alterada.');
      onClose();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal title="Alterar senha" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={save} disabled={busy || !cur || next.length < 8 || next !== again}>Salvar</button></>}>
      <div className="stack">
        <label className="field">Senha atual<input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></label>
        <label className="field">Nova senha (mín. 8 caracteres)<input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <label className="field">Repita a nova senha<input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          {mismatch && <small className="err-text">As senhas não conferem.</small>}
        </label>
      </div>
    </Modal>
  );
}

export { Icon };
