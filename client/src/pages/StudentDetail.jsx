import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import TopBar from '../components/TopBar';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import PayStatusBadge from '../components/PayStatusBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import InlineEdit from '../components/InlineEdit';
import { api } from '../utils/api';
import { getCurrentSchoolYear } from '../utils/schoolYear';
import { useSchoolYear } from '../utils/useSchoolYear';
import { formatCurrency, formatDate } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const methods = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Check', 'Installment Plan'];

export default function StudentDetail({ onMenuClick }) {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const addToast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole('Admin', 'Registrar', 'Treasurer');
  // Authoritative current school year from school_settings, used for the
  // Enroll button label so it reflects the year the click will actually
  // enroll the student into (the /enroll endpoint bumps student.school_year
  // forward to current_school_year before generating fees — commit 4745bc7).
  const { current: currentSY } = useSchoolYear();

  const [student, setStudent] = useState(null);
  const [obligations, setObligations] = useState([]);
  const [payments, setPayments] = useState([]);
  const [activeTab, setActiveTab] = useState('fees');
  const [loading, setLoading] = useState(true);
  const [feeTypesList, setFeeTypesList] = useState([]);

  // Fee modal
  const [feeModalOpen, setFeeModalOpen] = useState(false);
  const [editingFee, setEditingFee] = useState(null);
  const [feeForm, setFeeForm] = useState({ fee_type: 'Tuition Fee', payment_term: '', installment_number: '', school_year: getCurrentSchoolYear(), amount: '', due_date: '', description: '' });

  // Payment modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [editingPay, setEditingPay] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', date: '', method: 'Cash', receipt_no: '', school_year: getCurrentSchoolYear(), notes: '' });

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteType, setDeleteType] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [dropModalOpen, setDropModalOpen] = useState(false);
  const [dropDate, setDropDate] = useState(new Date().toISOString().slice(0, 10));
  const [dropPreview, setDropPreview] = useState(null);
  const [dropping, setDropping] = useState(false);
  const [reEnrolling, setReEnrolling] = useState(false);
  const [editingTuition, setEditingTuition] = useState(false);
  const [tuitionValue, setTuitionValue] = useState('');
  const photoInputRef = useRef(null);
  const isAdmin = hasRole('Admin');

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

  const openDropModal = async () => {
    const today = new Date().toISOString().slice(0, 10);
    setDropDate(today);
    setDropModalOpen(true);
    try {
      const preview = await api.dropStudentPreview(studentId, { dropped_date: today });
      setDropPreview(preview);
    } catch { setDropPreview(null); }
  };

  const handleDropDateChange = async (date) => {
    setDropDate(date);
    try {
      const preview = await api.dropStudentPreview(studentId, { dropped_date: date });
      setDropPreview(preview);
    } catch { setDropPreview(null); }
  };

  const handleDrop = async () => {
    try {
      setDropping(true);
      const result = await api.dropStudent(studentId, { dropped_date: dropDate });
      addToast(result.message);
      setDropModalOpen(false);
      load();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setDropping(false);
    }
  };

  const handleReEnroll = async () => {
    try {
      setReEnrolling(true);
      await api.reEnrollStudent(studentId);
      addToast('Student re-enrolled');
      load();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setReEnrolling(false);
    }
  };

  const handleTuitionSave = async () => {
    const newAmount = parseFloat(tuitionValue);
    if (isNaN(newAmount) || newAmount < 0) { addToast('Invalid amount', 'error'); return; }
    const oldAmount = student.total_tuition || 0;
    if (!window.confirm(`Changing tuition from ${formatCurrency(oldAmount)} to ${formatCurrency(newAmount)} will regenerate tuition installments. Existing tuition obligations will be replaced. Payments already recorded will remain. Continue?`)) return;
    try {
      await api.updateStudent(studentId, { total_tuition: newAmount, payment_term: student.payment_term, school_year: student.school_year });
      addToast('Tuition updated and installments regenerated');
      setEditingTuition(false);
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleInlineSave = async (field, value) => {
    try {
      await api.updateStudent(studentId, { [field]: value || null });
      addToast('Student updated');
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-brand-slate"><svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>Loading...</div>;
  if (!student) return <div className="flex items-center justify-center h-full text-brand-slate">Student not found</div>;

  // Fix rounding: treat balances between -1 and 0 as 0 (installment division artifacts)
  const rawBalance = student.balance || 0;
  const displayBalance = Math.abs(rawBalance) < 1 ? 0 : rawBalance;
  const isFullyPaid = displayBalance <= 0 && student.total_fees > 0;
  const progress = student.total_fees > 0 ? Math.min((student.total_paid / student.total_fees) * 100, 100) : 0;

  // Calculate age from birth_date
  const calculateAge = (birthDate) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return null;
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };
  const age = calculateAge(student.birth_date);

  // Format phone number: 09457415141 → 0945-741-5141
  const formatPhone = (phone) => {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 11) return `${digits.slice(0,4)}-${digits.slice(4,7)}-${digits.slice(7)}`;
    return phone;
  };

  // Payment counts for tab label
  const paymentCount = payments.length;

  // Check if a specific obligation line is paid (rough: based on FIFO payment allocation)
  // We'll compute per-fee status by allocating payments across obligations in due_date order
  const obligationsWithStatus = (() => {
    const sorted = [...obligations].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
    let remaining = student.total_paid || 0;
    return sorted.map(o => {
      let status;
      if (remaining >= o.amount) {
        status = 'Paid';
        remaining -= o.amount;
      } else if (remaining > 0) {
        status = 'Partial';
        remaining = 0;
      } else {
        status = 'Unpaid';
      }
      return { ...o, lineStatus: status };
    });
  })();

  return (
    <div>
      <TopBar title="Student Profile" onMenuClick={onMenuClick}>
        <button onClick={() => navigate('/students')} className="text-brand-navy hover:text-brand-teal text-sm flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
        {canEdit && (student.status === 'Registered' || student.status === 'Not Enrolled') && (
          <button onClick={handleEnroll} disabled={enrolling} className="bg-status-success hover:bg-status-success/90 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50">
            {enrolling ? 'Enrolling...' : `Enroll for S.Y. ${currentSY || student.school_year || ''}`}
          </button>
        )}
        {canEdit && (student.status === 'Enrolled' || student.status === 'LOA') && (
          <button onClick={openDropModal} className="bg-white border border-status-danger text-status-danger hover:bg-status-danger hover:text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
            Drop Student
          </button>
        )}
        {canEdit && student.status === 'Dropped' && (
          <button onClick={handleReEnroll} disabled={reEnrolling} className="bg-brand-steel hover:bg-brand-teal text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50">
            {reEnrolling ? 'Re-enrolling...' : 'Re-enroll'}
          </button>
        )}
        <Link to={`/soa/print/${studentId}`} className="bg-brand-teal hover:bg-brand-navy text-white px-4 py-1.5 rounded-lg text-sm font-medium shadow-sm">Print SOA</Link>
      </TopBar>

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-5">
          <div className="relative group flex-shrink-0">
            {student.photo_url ? (
              <img src={student.photo_url} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-brand-border shadow-sm" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-brand-steel/10 border-2 border-brand-border flex items-center justify-center text-[28px] font-bold text-brand-steel shadow-sm">
                {student.first_name[0]}{student.last_name[0]}
              </div>
            )}
            {canEdit && (
              <button
                onClick={() => photoInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                title="Upload photo"
              >
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
            )}
            <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoUpload} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-brand-navy leading-tight">{student.first_name} {student.middle_name ? student.middle_name + ' ' : ''}{student.last_name}</h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-brand-slate flex-wrap">
              <span className="font-mono">{student.student_id}</span>
              <span className="text-brand-border">·</span>
              <span>{student.grade_level}</span>
              <span className="text-brand-border">·</span>
              <span>{student.section || 'No Section'}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <StatusBadge status={student.status} />
              <PayStatusBadge status={isFullyPaid ? 'Paid' : student.pay_status} />
            </div>
            {student.status === 'Dropped' && (
              <div className="mt-3 flex items-center gap-2 text-xs text-status-warning bg-status-warning/10 border border-status-warning/20 rounded-lg px-3 py-1.5">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                This student was dropped{student.dropped_date ? ` on ${formatDate(student.dropped_date)}` : ''}
              </div>
            )}
          </div>
        </div>

        {/* Two column */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Personal Info */}
          <div className="bg-white border border-brand-border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-teal mb-4">Personal Information</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-brand-slate">LRN</span>
                <InlineEdit value={student.lrn} onSave={v => handleInlineSave('lrn', v)} canEdit={canEdit} mono />
              </div>
              <div>
                <span className="text-xs text-brand-slate">Birth Date{age != null ? ` · ${age} yr${age !== 1 ? 's' : ''} old` : ''}</span>
                <InlineEdit value={student.birth_date} displayValue={student.birth_date ? formatDate(student.birth_date) : ''} onSave={v => handleInlineSave('birth_date', v)} type="date" canEdit={canEdit} />
              </div>
              <div>
                <span className="text-xs text-brand-slate">Gender</span>
                <InlineEdit value={student.gender} onSave={v => handleInlineSave('gender', v)} type="select" options={['Male', 'Female']} canEdit={canEdit} />
              </div>
              <div>
                <span className="text-xs text-brand-slate">Email</span>
                <InlineEdit value={student.email} onSave={v => handleInlineSave('email', v)} type="email" canEdit={canEdit} />
              </div>
              <div>
                <span className="text-xs text-brand-slate">Phone</span>
                <InlineEdit value={student.phone} displayValue={formatPhone(student.phone)} onSave={v => handleInlineSave('phone', v)} canEdit={canEdit} />
              </div>
              <div>
                <span className="text-xs text-brand-slate">Parent's Name</span>
                <InlineEdit value={student.parent_name} onSave={v => handleInlineSave('parent_name', v)} canEdit={canEdit} />
              </div>
              <div>
                <span className="text-xs text-brand-slate">Guardian</span>
                <InlineEdit value={student.guardian} onSave={v => handleInlineSave('guardian', v)} canEdit={canEdit} />
              </div>
              <div>
                <span className="text-xs text-brand-slate">Guardian Phone</span>
                <InlineEdit value={student.guardian_phone} displayValue={formatPhone(student.guardian_phone)} onSave={v => handleInlineSave('guardian_phone', v)} canEdit={canEdit} />
              </div>
              {[
                ['Date Enrolled', formatDate(student.date_enrolled)],
                ['Payment Term', student.payment_term],
              ].map(([label, val]) => (
                <div key={label}>
                  <span className="text-xs text-brand-slate">{label}</span>
                  <p className="text-brand-navy">{val || '—'}</p>
                </div>
              ))}
              <div>
                <span className="text-xs text-brand-slate">Total Tuition</span>
                {editingTuition ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <input type="number" step="0.01" value={tuitionValue} onChange={e => setTuitionValue(e.target.value)} className="w-28 bg-white border border-brand-border rounded px-2 py-0.5 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" autoFocus />
                    <button onClick={handleTuitionSave} className="text-xs bg-brand-steel hover:bg-brand-teal text-white px-2 py-0.5 rounded">Save</button>
                    <button onClick={() => setEditingTuition(false)} className="text-xs text-brand-slate hover:text-brand-navy px-1 py-0.5">Cancel</button>
                  </div>
                ) : (
                  <p className="text-brand-navy flex items-center gap-1">
                    {student.total_tuition ? formatCurrency(student.total_tuition) : '—'}
                    {isAdmin && (
                      <button onClick={() => { setTuitionValue(student.total_tuition || 0); setEditingTuition(true); }} className="text-brand-slate hover:text-status-warning p-0.5" title="Edit tuition">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                    )}
                  </p>
                )}
              </div>
              {[
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
          <div className="bg-white border border-brand-border rounded-xl p-5 shadow-sm">
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
                  <p className={`text-lg font-bold font-mono ${isFullyPaid ? 'text-status-success' : 'text-status-danger'}`}>{formatCurrency(displayBalance)}</p>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-brand-slate mb-1">
                  <span>Payment Progress</span>
                  <span>{progress.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-brand-light rounded-full h-3 overflow-hidden">
                  <div
                    className="h-3 rounded-full transition-all"
                    style={{ width: `${progress}%`, backgroundColor: isFullyPaid ? '#34D399' : '#6B9DB5' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div>
          <div className="flex border-b border-brand-border mb-4">
            <button onClick={() => setActiveTab('fees')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'fees' ? 'border-brand-steel text-brand-steel' : 'border-transparent text-brand-slate hover:text-brand-navy'}`}>
              Fees & Obligations ({obligations.length})
            </button>
            <button onClick={() => setActiveTab('payments')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'payments' ? 'border-brand-steel text-brand-steel' : 'border-transparent text-brand-slate hover:text-brand-navy'}`}>
              Payment History ({paymentCount})
            </button>
          </div>

          {activeTab === 'fees' && (
            <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-brand-border flex justify-between items-center">
                <h3 className="text-sm font-semibold text-brand-teal">Assessed Fees</h3>
                {canEdit && <button onClick={() => { setEditingFee(null); setFeeForm({ fee_type: 'Tuition Fee', payment_term: '', installment_number: '', school_year: getCurrentSchoolYear(), amount: '', due_date: '', description: '' }); setFeeModalOpen(true); }} className="text-xs bg-brand-steel hover:bg-brand-teal text-white px-3 py-1 rounded-lg">+ Add Fee</button>}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                    <th className="px-4 py-2 text-left">Fee Type</th>
                    <th className="px-4 py-2 text-left">Description</th>
                    <th className="px-4 py-2 text-left">Term</th>
                    <th className="px-4 py-2 text-left">Installment</th>
                    <th className="px-4 py-2 text-left">Due Date</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {obligationsWithStatus.map(o => {
                    const overdue = o.due_date && o.due_date < new Date().toISOString().split('T')[0] && o.lineStatus !== 'Paid';
                    const isOneTime = !o.payment_term || o.payment_term === 'Annually' || o.fee_type !== 'Tuition Fee';
                    const termDisplay = o.fee_type === 'Tuition Fee' ? (o.payment_term || 'One-time') : 'One-time';
                    const statusColor = o.lineStatus === 'Paid' ? 'bg-status-success/15 text-status-success' : o.lineStatus === 'Partial' ? 'bg-status-warning/15 text-status-warning' : 'bg-status-danger/15 text-status-danger';
                    return (
                      <tr key={o.id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                        <td className="px-4 py-2 text-brand-navy">{o.fee_type}</td>
                        <td className="px-4 py-2 text-brand-slate">{o.description || '—'}</td>
                        <td className="px-4 py-2 text-brand-navy">{termDisplay}</td>
                        <td className="px-4 py-2 text-brand-slate text-xs">{o.installment_number || <span className="text-brand-border">N/A</span>}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className={overdue ? 'text-status-danger font-semibold' : 'text-brand-navy'}>{formatDate(o.due_date)}</span>
                            {overdue && <span className="text-[10px] bg-status-danger/15 text-status-danger px-1.5 py-0.5 rounded font-semibold">OVERDUE</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>{o.lineStatus}</span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-brand-navy">{formatCurrency(o.amount)}</td>
                        <td className="px-4 py-2">
                          {canEdit && <div className="flex gap-1">
                            <button onClick={() => { setEditingFee(o.id); setFeeForm({ fee_type: o.fee_type, payment_term: o.payment_term || '', installment_number: o.installment_number || '', school_year: o.school_year, amount: o.amount, due_date: o.due_date || '', description: o.description || '' }); setFeeModalOpen(true); }} title="Edit" className="text-brand-slate hover:text-status-warning p-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => { setDeleteTarget(o.id); setDeleteType('fee'); }} title="Delete" className="text-brand-slate hover:text-status-danger p-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>}
                        </td>
                      </tr>
                    );
                  })}
                  {obligations.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-brand-slate">
                    <svg className="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    No fees assessed
                  </td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-brand-border flex justify-between items-center">
                <h3 className="text-sm font-semibold text-brand-teal">Payment History</h3>
                {canEdit && <button onClick={() => { setEditingPay(null); setPayForm({ amount: '', date: '', method: 'Cash', receipt_no: '', school_year: getCurrentSchoolYear(), notes: '' }); setPayModalOpen(true); }} className="text-xs bg-brand-steel hover:bg-brand-teal text-white px-3 py-1 rounded-lg">+ Add Payment</button>}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Receipt No.</th>
                    <th className="px-4 py-2 text-left">Method</th>
                    <th className="px-4 py-2 text-left">Notes</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-left">Actions</th>
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
                          <button onClick={() => { setEditingPay(p.id); setPayForm({ amount: p.amount, date: p.date, method: p.method, receipt_no: p.receipt_no || '', school_year: p.school_year || getCurrentSchoolYear(), notes: p.notes || '' }); setPayModalOpen(true); }} title="Edit" className="text-brand-slate hover:text-status-warning p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => { setDeleteTarget(p.id); setDeleteType('payment'); }} title="Delete" className="text-brand-slate hover:text-status-danger p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>}
                      </td>
                    </tr>
                  ))}
                  {payments.length > 0 && (
                    <tr className="bg-brand-light/60 font-semibold">
                      <td className="px-4 py-2 text-brand-navy" colSpan={4}>TOTAL ({payments.length} payment{payments.length !== 1 ? 's' : ''})</td>
                      <td className="px-4 py-2 text-right font-mono text-status-success">{formatCurrency(payments.reduce((sum, p) => sum + (p.amount || 0), 0))}</td>
                      <td></td>
                    </tr>
                  )}
                  {payments.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-brand-slate">
                    <svg className="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    No payments recorded
                  </td></tr>}
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
              <label className="block text-xs text-brand-slate mb-1">School Year</label>
              <div className="w-full bg-brand-light border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy font-semibold">{feeForm.school_year}</div>
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
            <div className="w-full bg-brand-light border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy font-semibold">{payForm.school_year}</div>
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

      {/* Drop Student Modal */}
      <Modal isOpen={dropModalOpen} onClose={() => setDropModalOpen(false)} title="Drop Student">
        <div className="space-y-4">
          <p className="text-sm text-brand-navy">
            Drop <strong>{student?.first_name} {student?.last_name}</strong> and cancel future fees.
          </p>
          <div>
            <label className="block text-xs text-brand-slate mb-1">Date Dropped *</label>
            <input type="date" value={dropDate} onChange={e => handleDropDateChange(e.target.value)} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
          </div>
          {dropPreview && (
            <div className="bg-brand-light rounded-lg p-4 text-sm space-y-1">
              <p className="font-medium text-brand-navy">This will:</p>
              <p className="text-brand-slate">Cancel <span className="font-semibold text-status-danger">{dropPreview.cancelledTuition}</span> future tuition installment{dropPreview.cancelledTuition !== 1 ? 's' : ''}</p>
              <p className="text-brand-slate">Cancel <span className="font-semibold text-status-danger">{dropPreview.cancelledOtherFees}</span> unpaid non-tuition fee{dropPreview.cancelledOtherFees !== 1 ? 's' : ''}</p>
              <p className="text-xs text-brand-slate mt-2">All recorded payments will be kept.</p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setDropModalOpen(false)} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">Cancel</button>
            <button onClick={handleDrop} disabled={dropping} className="px-4 py-2 text-sm text-white bg-status-danger hover:bg-status-danger/90 rounded-lg disabled:opacity-50">
              {dropping ? 'Dropping...' : 'Drop Student'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
