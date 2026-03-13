import { useState, useRef, useEffect } from 'react';

const SETTINGS_PIN = '253007';

export default function PinDialog({ onSuccess, onCancel }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (pin === SETTINGS_PIN) {
      onSuccess();
    } else {
      setError('Incorrect PIN');
      setPin('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && pin.length === 6) handleSubmit();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">&#128274;</div>
          <h2 className="text-lg font-bold text-slate-800">Settings Protected</h2>
          <p className="text-sm text-slate-500 mt-1">Enter 6-digit PIN to continue</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4 text-center">
            {error}
          </div>
        )}

        <input
          ref={inputRef}
          type="password"
          maxLength={6}
          value={pin}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '');
            setPin(val);
            setError('');
          }}
          onKeyDown={handleKeyDown}
          placeholder="&#8226; &#8226; &#8226; &#8226; &#8226; &#8226;"
          className="w-full text-center text-2xl tracking-[0.5em] p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 mb-4"
        />

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={pin.length !== 6}
            className="flex-1 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40"
          >
            Unlock
          </button>
        </div>
      </div>
    </div>
  );
}
