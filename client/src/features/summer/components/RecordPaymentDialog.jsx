import { useState, useEffect, useMemo } from 'react';
import Modal from '../../../components/Modal';
import { useToast } from '../../../components/Toast';
import { summerApi } from '../utils/summerApi';
import { formatCurrency } from '../../../utils/format';

const METHODS = ['cash', 'gcash', 'bank_transfer', 'check'];

export default function RecordPaymentDialog({ isOpen, onClose, programId, onSuccess }) {
  const [payerType, setPayerType] = useState('internal'); // 'internal' | 'external'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [externalName, setExternalName] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [openEnrollments, setOpenEnrollments] = useState([]);
  const addToast = useToast();

  // Fetch open enrollments for the selected payer (for FIFO preview)
  useEffect(() => {
    if (!isOpen) return;
    setOpenEnrollments([]);
    const fetchEnrollments = async () => {
      try {
        let params = {};
        if (payerType === 'internal' && selectedStudent) {
          params = { student_id: selectedStudent.id };
        } else if (payerType === 'external' && externalName.length >= 2) {
          params = { external_name: externalName };
        } else return;
        const all = await summerApi.getEnrollments(params);
        setOpenEnrollments(all.filter(e => e.status === 'active' && e.balance > 0));
      } catch { setOpenEnrollments([]); }
    };
    fetchEnrollments();
  }, [isOpen, payerType, selectedStudent?.id, externalName]);

  // FIFO preview computation — client-side simulation of the server's FIFO logic
  const fifoPreview = useMemo(() => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0 || openEnrollments.length === 0) return { rows: [], unallocated: 0 };

    const sorted = [...openEnrollments].sort((a, b) =>
      (a.enrolled_at || '').localeCompare(b.enrolled_at || '')
    );
    let remaining = amt;
    const rows = sorted.map(e => {
      const alloc = Math.min(remaining, e.balance);
      remaining -= alloc;
      return {
        enrollment_id: e.id,
        class_name: e.class_name,
        enrolled_at: e.enrolled_at?.split('T')[0] || e.enrolled_at,
        balance: e.balance,
        will_apply: alloc,
        new_balance: e.balance - alloc,
      };
    });
    return { rows, unallocated: Math.round(remaining * 100) / 100 };
  }, [amount, openEnrollments]);

  const handleSearch = async (q) => {
    setSearchQuery(q);
    setSelectedStudent(null);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const results = await summerApi.searchStudents(q);
      setSearchResults(results);
    } catch { setSearchResults([]); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = {
        amount: parseFloat(amount),
        payment_method: method,
        reference_no: referenceNo || undefined,
        paid_at: paidAt,
        remarks: remarks || undefined,
      };
      if (payerType === 'internal') {
        if (!selectedStudent) { addToast('Select a student', 'error'); setSubmitting(false); return; }
        data.student_id = selectedStudent.id;
        data.is_external = false;
      } else {
        data.is_external = true;
        data.external_full_name = externalName;
      }
      const result = await summerApi.createPayment(data);
      addToast(`Payment recorded — OR# ${result.or_number}${result.unallocated > 0 ? ` (₱${result.unallocated} credit)` : ''}`);
      // Reset
      setSearchQuery(''); setSearchResults([]); setSelectedStudent(null);
      setExternalName(''); setAmount(''); setMethod('cash'); setReferenceNo('');
      setPaidAt(new Date().toISOString().slice(0, 10)); setRemarks('');
      onSuccess?.();
    } catch (err) { addToast(err.message, 'error'); }
    finally { setSubmitting(false); }
  };

  const inputCls = "w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel";
  const amtParsed = parseFloat(amount) || 0;
  const isValid = amtParsed > 0 && paidAt && method && (
    (payerType === 'internal' && selectedStudent) || (payerType === 'external' && externalName.length >= 2)
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Summer Payment" wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Payer type toggle */}
        <div className="flex border-b border-brand-border mb-2">
          <button type="button" onClick={() => { setPayerType('internal'); setSelectedStudent(null); setSearchQuery(''); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${payerType === 'internal' ? 'border-brand-steel text-brand-teal' : 'border-transparent text-brand-slate'}`}>
            Apex Student
          </button>
          <button type="button" onClick={() => { setPayerType('external'); setExternalName(''); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${payerType === 'external' ? 'border-brand-steel text-brand-teal' : 'border-transparent text-brand-slate'}`}>
            External Student
          </button>
        </div>

        {/* Payer selection */}
        {payerType === 'internal' ? (
          <div>
            <label className="block text-xs text-brand-slate mb-1">Search Student</label>
            <input type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)} placeholder="Name or ID…" className={inputCls} />
            {searchResults.length > 0 && (
              <div className="mt-1 border border-brand-border rounded-lg max-h-32 overflow-y-auto">
                {searchResults.map(s => (
                  <button key={s.id} type="button"
                    onClick={() => { setSelectedStudent(s); setSearchResults([]); setSearchQuery(`${s.last_name}, ${s.first_name}`); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-brand-light/50 border-b border-brand-border/30">
                    <span className="font-medium text-brand-navy">{s.last_name}, {s.first_name}</span>
                    <span className="text-brand-slate text-xs ml-2">{s.student_id}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedStudent && (
              <div className="mt-1 text-xs text-status-success">Selected: {selectedStudent.last_name}, {selectedStudent.first_name}</div>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-xs text-brand-slate mb-1">External Student Name (must match enrollment)</label>
            <input type="text" value={externalName} onChange={e => setExternalName(e.target.value)} placeholder="Jane Doe" className={inputCls} />
          </div>
        )}

        {/* Payment details */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-brand-slate mb-1">Amount (₱) *</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} required className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-brand-slate mb-1">Method *</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className={inputCls}>
              {METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-brand-slate mb-1">Date *</label>
            <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} required className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-brand-slate mb-1">Reference #</label>
            <input type="text" value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="GCash ref, check #…" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-brand-slate mb-1">Remarks</label>
            <input type="text" value={remarks} onChange={e => setRemarks(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* FIFO Preview — the must-have UX detail per §5 */}
        {(fifoPreview.rows.length > 0 || fifoPreview.unallocated > 0) && amtParsed > 0 && (
          <div className="bg-brand-light border border-brand-border rounded-lg p-3">
            <h4 className="text-xs font-semibold text-brand-navy uppercase tracking-wider mb-2">FIFO Allocation Preview</h4>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-brand-slate border-b border-brand-border">
                  <th className="px-2 py-1 text-left">Enrolled On</th>
                  <th className="px-2 py-1 text-left">Class</th>
                  <th className="px-2 py-1 text-right">Balance</th>
                  <th className="px-2 py-1 text-right">Will Apply</th>
                  <th className="px-2 py-1 text-right">New Balance</th>
                </tr>
              </thead>
              <tbody>
                {fifoPreview.rows.filter(r => r.will_apply > 0).map(r => (
                  <tr key={r.enrollment_id} className="border-b border-brand-border/30">
                    <td className="px-2 py-1 text-brand-slate">{r.enrolled_at}</td>
                    <td className="px-2 py-1 text-brand-navy">{r.class_name}</td>
                    <td className="px-2 py-1 text-right font-mono text-status-danger">{formatCurrency(r.balance)}</td>
                    <td className="px-2 py-1 text-right font-mono text-status-success font-semibold">{formatCurrency(r.will_apply)}</td>
                    <td className="px-2 py-1 text-right font-mono">{formatCurrency(r.new_balance)}</td>
                  </tr>
                ))}
                {fifoPreview.unallocated > 0 && (
                  <tr className="border-t border-brand-border">
                    <td colSpan={3} className="px-2 py-1 text-brand-slate font-semibold">Credit on Account</td>
                    <td className="px-2 py-1 text-right font-mono text-status-warning font-semibold">{formatCurrency(fifoPreview.unallocated)}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {openEnrollments.length === 0 && amtParsed > 0 && (payerType === 'internal' ? selectedStudent : externalName.length >= 2) && (
          <div className="bg-status-warning/5 border border-status-warning/30 rounded-lg px-3 py-2 text-xs text-brand-navy">
            No open enrollments found for this payer. The full amount will be unallocated credit.
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">Cancel</button>
          <button type="submit" disabled={!isValid || submitting} className="px-4 py-2 text-sm text-white bg-brand-steel hover:bg-brand-teal rounded-lg disabled:opacity-50">
            {submitting ? 'Recording…' : `Record ₱${amtParsed > 0 ? amtParsed.toLocaleString() : '0'}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
