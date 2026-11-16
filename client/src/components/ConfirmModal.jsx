import { createContext, useContext, useState, useCallback } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icons.jsx';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      if (typeof options === 'string') {
        options = { message: options };
      }
      setDialog({
        title: options.title || 'Confirmação',
        message: options.message,
        confirmText: options.confirmText || 'Confirmar',
        cancelText: options.cancelText || 'Cancelar',
        danger: options.danger !== false,
        icon: options.icon || (options.danger !== false ? 'trash' : 'check'),
        resolve,
      });
    });
  }, []);

  const handleAction = (result) => {
    if (dialog?.resolve) dialog.resolve(result);
    setDialog(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <Modal
          title={dialog.title}
          onClose={() => handleAction(false)}
          footer={
            <>
              <button
                type="button"
                className="btn"
                onClick={() => handleAction(false)}
              >
                {dialog.cancelText}
              </button>
              <button
                type="button"
                className={`btn ${dialog.danger ? 'danger-solid' : 'primary'}`}
                onClick={() => handleAction(true)}
                autoFocus
              >
                <Icon name={dialog.icon} size={16} />
                <span>{dialog.confirmText}</span>
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: dialog.danger ? '#fee2e2' : '#e0f2fe',
                color: dialog.danger ? '#b91c1c' : '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name={dialog.danger ? 'trash' : 'swap'} size={22} />
            </div>
            <p style={{ margin: 0, fontSize: '14.5px', lineHeight: 1.5, color: '#334155', whiteSpace: 'pre-line' }}>
              {dialog.message}
            </p>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm deve ser usado dentro de ConfirmProvider');
  }
  return context;
}
