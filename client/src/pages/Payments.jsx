import { useState, useEffect } from 'react';
import TopBar from '../components/TopBar';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { api } from '../utils/api';
import { formatCurrency, formatDate } from '../utils/format';
import { getCurrentSchoolYear } from '../utils/schoolYear';
import { useAuth } from '../context/AuthContext';

const methods = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Check', 'Installment Plan'];
export default function Payments({ onMenuClick }) {
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ student_id: '', amount: '', date: '', method: 'Cash', receipt_no: '', school_year: getCurrentSchoolYear(), notes: '' });
  const addToast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole('Admin', 'Registrar');

  const load = () => {
    setLoading(true);
    Promise.all([api.getPayments(), api.getStudents()]).then(([p, s]) => {
      setPayments(p);
      setStudents(s);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...form, amount: parseFloat(form.amount) };
      if (editing) {
        await api.updatePayment(editing, data);
        addToast('Payment updated');
      } else {
        await api.createPayment(data);
        addToast('Payment recorded');
      }
      setModalOpen(false);
      load();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDelete = async () => {
    try {
      await api.deletePayment(deleteTarget);
      addToast('Payment deleted');
      setDeleteTarget(null);
      load();
    } catch (err) { addToast(err.message, 'error'); }
  };

  return (
    <div>
      <TopBar title="Payments" onMenuClick={onMenuClick}>
        {canEdit && <button onClick={() => { setEditing(null); setForm({ student_id: '', amount: '', date: '', method: 'Cash', receipt_no: '', school_year: getCurrentSchoolYear(), notes: '' }); setModalOpen(true); }} className="bg-brand-steel hover:bg-brand-teal text-white px-4 py-1.5 rounded-lg text-sm font-medium">+ Add Payment</button>}
      </TopBar>

      <div className="p-6">
        <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Receipt No.</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">S.Y.</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                    <td className="px-4 py-2 text-brand-navy">{formatDate(p.date)}</td>
                    <td className="px-4 py-2 text-brand-navy">{p.last_name}, {p.first_name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-brand-slate">{p.receipt_no}</td>
                    <td className="px-4 py-2 text-right font-mono text-status-success">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-2 text-brand-navy">{p.method}</td>
                    <td className="px-4 py-2 font-mono text-xs text-brand-slate">{p.school_year || '—'}</td>
                    <td className="px-4 py-2 text-brand-slate max-w-[150px] truncate">{p.notes || '—'}</td>
                    <td className="px-4 py-2">
                      {canEdit && <div className="flex gap-1">
                        <button onClick={() => { setEditing(p.id); setForm({ student_id: p.student_id, amount: p.amount, date: p.date, method: p.method, receipt_no: p.receipt_no || '', school_year: p.school_year || getCurrentSchoolYear(), notes: p.notes || '' }); setModalOpen(true); }} className="text-brand-slate hover:text-status-warning p-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => setDeleteTarget(p.id)} className="text-brand-slate hover:text-status-danger p-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>}
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && !loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-brand-slate">No payments found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Payment' : 'Record Payment'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-brand-slate mb-1">Student *</label>
            <select value={form.student_id} onChange={e => setForm(p => ({...p, student_id: e.target.value}))} required disabled={!!editing} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy disabled:opacity-50 focus:outline-none focus:border-brand-steel">
              <option value="">Select student...</option>
              {students.map(s => <option key={s.student_id} value={s.student_id}>{s.last_name}, {s.first_name} ({s.student_id})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Amount (₱) *</label>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(p => ({...p, amount: e.target.value}))} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Date *</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({...p, date: e.target.value}))} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Method *</label>
              <select value={form.method} onChange={e => setForm(p => ({...p, method: e.target.value}))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
                {methods.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Receipt No.</label>
              <input type="text" value={form.receipt_no} onChange={e => setForm(p => ({...p, receipt_no: e.target.value}))} placeholder="Auto-generated if blank" className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-brand-slate mb-1">School Year</label>
            <div className="w-full bg-brand-light border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy font-semibold">{form.school_year}</div>
          </div>
          <div>
            <label className="block text-xs text-brand-slate mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm text-white bg-brand-steel hover:bg-brand-teal rounded-lg">{editing ? 'Update' : 'Record'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
    </div>
  );
}
