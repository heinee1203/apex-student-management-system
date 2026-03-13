import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import TopBar from '../components/TopBar';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import PayStatusBadge from '../components/PayStatusBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { api } from '../utils/api';
import { formatCurrency, formatDate } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const methods = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Check', 'Installment Plan'];

export default function StudentDetail({ onMenuClick }) {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const addToast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole('Admin', 'Registrar');

  const [student, setStudent] = useState(null);
  const [obligations, setObligations] = useState([]);
  const [payments, setPayments] = useState([]);
  const [activeTab, setActiveTab] = useState('fees');
  const [loading, setLoading] = useState(true);
  const [feeTypesList, setFeeTypesList] = useState([]);

  // Fee modal
  const [feeModalOpen, setFeeModalOpen] = useState(false);
  const [editingFee, setEditingFee] = useState(null);
  const [feeForm, setFeeForm] = useState({ fee_type: 'Tuition Fee', payment_term: '', installment_number: '', school_year: '2024-2025', amount: '', due_date: '', description: '' });

  // Payment modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [editingPay, setEditingPay] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', date: '', method: 'Cash', receipt_no: '', school_year: '2024-2025', notes: '' });

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteType, setDeleteType] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const photoInputRef = useRef(null);

  const load = async () => {
    try {
      const [s, o, p] = await Promise.all([
        api.getStudent(studentId),
        api.getObligations({ student_id: studentId }),
        api.getPayments({ student_id: studentId }),
      ]);
      setStudent(s);
      setObligations(o);
      setPayments(p);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [studentId]);
  useEffect(() => { api.getFeeTypes().then(types => setFeeTypesList(types.map(t => t.name))).catch(console.error); }, []);

  const handleFeeSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...feeForm, student_id: studentId, amount: parseFloat(feeForm.amount) };
      if (editingFee) {
        await api.updateObligation(editingFee, data);
        addToast('Fee updated');
      } else {
        await api.createObligation(data);
        addToast('Fee added');
      }
      setFeeModalOpen(false);
      load();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...payForm, student_id: studentId, amount: parseFloat(payForm.amount) };
      if (editingPay) {
        await api.updatePayment(editingPay, data);
        addToast('Payment updated');
      } else {
        await api.createPayment(data);
        addToast('Payment recorded');
      }
      setPayModalOpen(false);
      load();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDelete = async () => {
    try {
      if (deleteType === 'fee') await api.deleteObligation(deleteTarget);
      else await api.deletePayment(deleteTarget);
      addToast(`${deleteType === 'fee' ? 'Fee' : 'Payment'} deleted`);
      setDeleteTarget(null);
      load();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await api.uploadStudentPhoto(studentId, file);
      addToast('Photo uploaded');
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
    e.target.value = '';
  };

  const handleEnroll = async () => {
    try {
      setEnrolling(true);
      const result = await api.enrollStudent(studentId);
      addToast(`Student enrolled — ${result.tuitionCount} tuition + ${result.otherFeesCount} fee obligations created`);
      load();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full text-brand-slate">Loading...</div>;
  if (!student) return <div className="flex items-center justify-center h-full text-brand-slate">Student not found</div>;

  const progress = student.total_fees > 0 ? Math.min((student.total_paid / student.total_fees) * 100, 100) : 0;

  return (
    <div>
      <TopBar title="Student Profile" onMenuClick={onMenuClick}>
        <button onClick={() => navigate('/students')} className="text-brand-navy hover:text-brand-teal text-sm flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
        <Link to={`/soa/print/${studentId}`} className="bg-brand-steel hover:bg-brand-teal text-white px-4 py-1.5 rounded-lg text-sm font-medium">Print SOA</Link>
      </TopBar>

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="relative group">
            {student.photo_url ? (
              <img src={student.photo_url} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-brand-border" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-brand-steel/10 flex items-center justify-center text-xl font-bold text-brand-steel">
                {student.first_name[0]}{student.last_name[0]}
              </div>
            )}
            {canEdit && (
              <button
                onClick={() => photoInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                title="Upload photo"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
            )}
            <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoUpload} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-brand-navy">{student.first_name} {student.middle_name ? student.middle_name + ' ' : ''}{student.last_name}</h2>
              {canEdit && (student.status === 'Registered' || student.status === 'Not Enrolled') && (
                <button onClick={handleEnroll} disabled={enrolling} className="bg-[#2E8B6A] hover:bg-[#257256] text-white px-3 py-1 rounded-lg text-xs font-medium disabled:opacity-50">
                  {enrolling ? 'Enrolling...' : `Enroll for S.Y. ${student.school_year || ''}`}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-brand-slate">
              <span className="font-mono">{student.student_id}</span>
              <span>{student.grade_level} — {student.section || 'No Section'}</span>
              <StatusBadge status={student.status} />
              <PayStatusBadge status={student.pay_status} />
            </div>
          </div>
        </div>

        {/* Two column */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Personal Info */}
          <div className="bg-white border border-brand-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-brand-teal mb-4">Personal Information</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Email', student.email],
                ['Phone', student.phone],
                ['Guardian', student.guardian],
                ['Guardian Phone', student.guardian_phone],
                ['Scholarship', student.scholarship],
                ['Date Enrolled', formatDate(student.date_enrolled)],
                ['Payment Term', student.payment_term],
                ['Total Tuition', student.total_tuition ? formatCurrency(student.total_tuition) : null],
                ['School Year', student.school_year],
                ['Address', student.address],
              ].map(([label, val]) => (
                <div key={label} className={label === 'Address' ? 'col-span-2' : ''}>
                  <span className="text-xs text-brand-slate">{label}</span>
                  <p className="text-brand-navy">{val || '—'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-white border border-brand-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-brand-teal mb-4">Financial Summary</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-brand-slate">Total Fees</p>
                  <p className="text-lg font-bold font-mono text-brand-navy">{formatCurrency(student.total_fees)}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-slate">Total Paid</p>
                  <p className="text-lg font-bold font-mono text-status-success">{formatCurrency(student.total_paid)}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-slate">Balance</p>
                  <p className="text-lg font-bold font-mono text-status-danger">{formatCurrency(student.balance)}</p>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-brand-slate mb-1">
                  <span>Payment Progress</span>
                  <span>{progress.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-brand-light rounded-full h-3">
                  <div className="bg-brand-steel h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div>
          <div className="flex border-b border-brand-border mb-4">
            <button onClick={() => setActiveTab('fees')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'fees' ? 'border-brand-steel text-brand-steel' : 'border-transparent text-brand-slate hover:text-brand-navy'}`}>
              Fees & Obligations
            </button>
            <button onClick={() => setActiveTab('payments')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'payments' ? 'border-brand-steel text-brand-steel' : 'border-transparent text-brand-slate hover:text-brand-navy'}`}>
              Payment History
            </button>
          </div>

          {activeTab === 'fees' && (
            <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-brand-border flex justify-between items-center">
                <h3 className="text-sm font-semibold text-brand-teal">Assessed Fees</h3>
                {canEdit && <button onClick={() => { setEditingFee(null); setFeeForm({ fee_type: 'Tuition Fee', payment_term: '', installment_number: '', school_year: '2024-2025', amount: '', due_date: '', description: '' }); setFeeModalOpen(true); }} className="text-xs bg-brand-steel hover:bg-brand-teal text-white px-3 py-1 rounded-lg">+ Add Fee</button>}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-brand-slate border-b border-brand-border">
                    <th className="px-4 py-2">Fee Type</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2">Term</th>
                    <th className="px-4 py-2">Installment</th>
                    <th className="px-4 py-2">S.Y.</th>
                    <th className="px-4 py-2">Due Date</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {obligations.map(o => {
                    const overdue = o.due_date && o.due_date < new Date().toISOString().split('T')[0];
                    return (
                      <tr key={o.id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                        <td className="px-4 py-2 text-brand-navy">{o.fee_type}</td>
                        <td className="px-4 py-2 text-brand-slate">{o.description || '—'}</td>
                        <td className="px-4 py-2 text-brand-navy">{o.payment_term || '—'}</td>
                        <td className="px-4 py-2 text-brand-navy">{o.installment_number || '—'}</td>
                        <td className="px-4 py-2 font-mono text-xs text-brand-slate">{o.school_year}</td>
                        <td className={`px-4 py-2 ${overdue ? 'text-status-danger font-semibold' : 'text-brand-navy'}`}>{formatDate(o.due_date)}</td>
                        <td className="px-4 py-2 text-right font-mono text-brand-navy">{formatCurrency(o.amount)}</td>
                        <td className="px-4 py-2">
                          {canEdit && <div className="flex gap-1">
                            <button onClick={() => { setEditingFee(o.id); setFeeForm({ fee_type: o.fee_type, payment_term: o.payment_term || '', installment_number: o.installment_number || '', school_year: o.school_year, amount: o.amount, due_date: o.due_date || '', description: o.description || '' }); setFeeModalOpen(true); }} className="text-brand-slate hover:text-status-warning p-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => { setDeleteTarget(o.id); setDeleteType('fee'); }} className="text-brand-slate hover:text-status-danger p-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>}
                        </td>
                      </tr>
                    );
                  })}
                  {obligations.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-brand-slate">No fees assessed</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-brand-border flex justify-between items-center">
                <h3 className="text-sm font-semibold text-brand-teal">Payment History</h3>
                {canEdit && <button onClick={() => { setEditingPay(null); setPayForm({ amount: '', date: '', method: 'Cash', receipt_no: '', school_year: '2024-2025', notes: '' }); setPayModalOpen(true); }} className="text-xs bg-brand-steel hover:bg-brand-teal text-white px-3 py-1 rounded-lg">+ Add Payment</button>}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-brand-slate border-b border-brand-border">
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Receipt No.</th>
                    <th className="px-4 py-2">Method</th>
                    <th className="px-4 py-2">Notes</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                      <td className="px-4 py-2 text-brand-navy">{formatDate(p.date)}</td>
                      <td className="px-4 py-2 font-mono text-xs text-brand-slate">{p.receipt_no}</td>
                      <td className="px-4 py-2 text-brand-navy">{p.method}</td>
                      <td className="px-4 py-2 text-brand-slate">{p.notes || '—'}</td>
                      <td className="px-4 py-2 text-right font-mono text-status-success">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-2">
                        {canEdit && <div className="flex gap-1">
                          <button onClick={() => { setEditingPay(p.id); setPayForm({ amount: p.amount, date: p.date, method: p.method, receipt_no: p.receipt_no || '', school_year: p.school_year || '2024-2025', notes: p.notes || '' }); setPayModalOpen(true); }} className="text-brand-slate hover:text-status-warning p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => { setDeleteTarget(p.id); setDeleteType('payment'); }} className="text-brand-slate hover:text-status-danger p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>}
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-brand-slate">No payments recorded</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Fee Modal */}
      <Modal isOpen={feeModalOpen} onClose={() => setFeeModalOpen(false)} title={editingFee ? 'Edit Fee' : 'Add Fee'}>
        <form onSubmit={handleFeeSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-brand-slate mb-1">Fee Type *</label>
            <select value={feeForm.fee_type} onChange={e => setFeeForm(p => ({...p, fee_type: e.target.value}))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
              {feeTypesList.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Payment Term</label>
              <select value={feeForm.payment_term} onChange={e => setFeeForm(p => ({...p, payment_term: e.target.value}))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
                <option value="">N/A</option>
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
                <option value="Annually">Annually</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Installment #</label>
              <input type="text" value={feeForm.installment_number} onChange={e => setFeeForm(p => ({...p, installment_number: e.target.value}))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">School Year *</label>
              <input type="text" value={feeForm.school_year} onChange={e => setFeeForm(p => ({...p, school_year: e.target.value}))} placeholder="2024-2025" className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Amount (₱) *</label>
              <input type="number" step="0.01" value={feeForm.amount} onChange={e => setFeeForm(p => ({...p, amount: e.target.value}))} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Due Date</label>
              <input type="date" value={feeForm.due_date} onChange={e => setFeeForm(p => ({...p, due_date: e.target.value}))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-brand-slate mb-1">Description</label>
            <input type="text" value={feeForm.description} onChange={e => setFeeForm(p => ({...p, description: e.target.value}))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setFeeModalOpen(false)} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm text-white bg-brand-steel hover:bg-brand-teal rounded-lg">{editingFee ? 'Update' : 'Add Fee'}</button>
          </div>
        </form>
      </Modal>

      {/* Payment Modal */}
      <Modal isOpen={payModalOpen} onClose={() => setPayModalOpen(false)} title={editingPay ? 'Edit Payment' : 'Record Payment'}>
        <form onSubmit={handlePaySubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Amount (₱) *</label>
              <input type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm(p => ({...p, amount: e.target.value}))} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Date *</label>
              <input type="date" value={payForm.date} onChange={e => setPayForm(p => ({...p, date: e.target.value}))} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Method *</label>
              <select value={payForm.method} onChange={e => setPayForm(p => ({...p, method: e.target.value}))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
                {methods.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Receipt No.</label>
              <input type="text" value={payForm.receipt_no} onChange={e => setPayForm(p => ({...p, receipt_no: e.target.value}))} placeholder="Auto-generated" className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-brand-slate mb-1">School Year</label>
            <input type="text" value={payForm.school_year} onChange={e => setPayForm(p => ({...p, school_year: e.target.value}))} placeholder="2024-2025" className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
          </div>
          <div>
            <label className="block text-xs text-brand-slate mb-1">Notes</label>
            <input type="text" value={payForm.notes} onChange={e => setPayForm(p => ({...p, notes: e.target.value}))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setPayModalOpen(false)} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm text-white bg-brand-steel hover:bg-brand-teal rounded-lg">{editingPay ? 'Update' : 'Record Payment'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
    </div>
  );
}
