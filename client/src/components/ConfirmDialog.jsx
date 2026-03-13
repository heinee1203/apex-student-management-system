export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="modal-content bg-white border border-brand-border rounded-xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-[#C0504D]/15 flex items-center justify-center">
              <svg className="w-5 h-5 text-[#C0504D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-brand-navy">{title || 'Confirm Delete'}</h3>
          </div>
          <p className="text-brand-slate text-sm mb-6">{message || 'Are you sure? This action cannot be undone.'}</p>
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-brand-navy hover:text-brand-teal bg-brand-light hover:bg-brand-border rounded-lg transition-colors">Cancel</button>
            <button onClick={onConfirm} className="px-4 py-2 text-sm text-white bg-[#C0504D] hover:bg-[#a8413e] rounded-lg transition-colors">Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}
