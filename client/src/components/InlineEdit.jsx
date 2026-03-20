import { useState } from 'react';

export default function InlineEdit({ value, onSave, type = 'text', options = null, canEdit = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const handleSave = () => {
    onSave(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value || '');
    setEditing(false);
  };

  if (!editing) {
    return (
      <p className="text-brand-navy flex items-center gap-1">
        {value || '—'}
        {canEdit && (
          <button onClick={() => { setDraft(value || ''); setEditing(true); }} className="text-brand-slate hover:text-status-warning p-0.5" title="Edit">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
        )}
      </p>
    );
  }

  const inputClass = "w-full bg-white border border-brand-border rounded px-2 py-0.5 text-sm text-brand-navy focus:outline-none focus:border-brand-steel";

  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      {type === 'select' && options ? (
        <select value={draft} onChange={e => setDraft(e.target.value)} className={inputClass} autoFocus>
          <option value="">— Select —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={draft} onChange={e => setDraft(e.target.value)} className={inputClass} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }} />
      )}
      <button onClick={handleSave} className="text-status-success hover:text-green-700 p-0.5" title="Save">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      </button>
      <button onClick={handleCancel} className="text-brand-slate hover:text-status-danger p-0.5" title="Cancel">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}
