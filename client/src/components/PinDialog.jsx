import { useState, useRef, useEffect } from 'react';

const SETTINGS_PIN = '253007';

export default function PinDialog({ onSuccess, onCancel }) {
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    setError('');

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (value && index === 5) {
      const fullPin = newPin.join('');
      if (fullPin.length === 6) {
        validate(fullPin);
      }
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') {
      validate(pin.join(''));
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const newPin = [...pin];
    for (let i = 0; i < 6; i++) {
      newPin[i] = pasted[i] || '';
    }
    setPin(newPin);
    if (pasted.length === 6) {
      validate(pasted);
    } else {
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  const validate = (fullPin) => {
    if (fullPin === SETTINGS_PIN) {
      onSuccess();
    } else {
      setError('Incorrect PIN');
      setShaking(true);
      setTimeout(() => {
        setShaking(false);
        setPin(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }, 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4 ${shaking ? 'animate-shake' : ''}`}>
        {/* Lock Icon */}
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 rounded-full bg-[#1E293B] flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>

        <h2 className="text-center text-lg font-bold text-[#1E293B] mb-1">Settings Protected</h2>
        <p className="text-center text-sm text-[#64748B] mb-6">Enter PIN to access Settings</p>

        {/* PIN Inputs */}
        <div className="flex justify-center gap-2 mb-4" onPaste={handlePaste}>
          {pin.map((digit, i) => (
            <input
              key={i}
              ref={(el) => (inputRefs.current[i] = el)}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={`w-11 h-12 text-center text-lg font-bold border-2 rounded-lg outline-none transition-all
                ${error ? 'border-red-400 bg-red-50' : 'border-[#CBD5E1] focus:border-[#6B9DB5] focus:ring-2 focus:ring-[#6B9DB5]/20'}`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="text-center text-sm text-red-500 mb-4">{error}</p>
        )}

        {/* Buttons */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-[#CBD5E1] text-[#475569] text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => validate(pin.join(''))}
            className="flex-1 py-2.5 bg-[#1E293B] text-white text-sm font-semibold rounded-lg hover:bg-[#334155] transition-colors"
          >
            Unlock
          </button>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}
