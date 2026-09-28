// Modal genérico de confirmação
export default function ConfirmModal({ title, message, confirmLabel = 'Confirmar', danger, onConfirm, onClose }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{title}</h3>
        {message && <p style={{ margin: 0, color: 'var(--txt-dim)', fontSize: 14 }}>{message}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            style={danger ? { background: 'var(--red)' } : undefined}
            onClick={() => { onClose(); onConfirm?.(); }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
