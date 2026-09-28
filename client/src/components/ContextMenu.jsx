import { useEffect } from 'react';

// Menu contextual flutuante (botão direito)
export default function ContextMenu({ x, y, items, onClose }) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="ctx-overlay"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div className="ctx-menu" style={{ left: x, top: y }} role="menu">
        {items.map((it, i) => (
          <button
            key={i}
            className={it.danger ? 'danger' : ''}
            onClick={() => { onClose(); it.onClick?.(); }}
          >
            {it.icon}{it.label}
          </button>
        ))}
      </div>
    </>
  );
}
