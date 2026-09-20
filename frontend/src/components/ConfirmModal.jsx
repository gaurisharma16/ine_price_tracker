export default function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel} id="confirm-cancel-btn">Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} id="confirm-ok-btn">Stop Tracking</button>
        </div>
      </div>
    </div>
  );
}
