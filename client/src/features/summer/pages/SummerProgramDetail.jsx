import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import TopBar from '../../../components/TopBar';
import Modal from '../../../components/Modal';
import StatusBadge from '../../../components/StatusBadge';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toast';
import { useAuth } from '../../../context/AuthContext';
import { summerApi } from '../utils/summerApi';
import { formatCurrency, formatDate } from '../../../utils/format';
import EnrollStudentDialog from '../components/EnrollStudentDialog';
import RecordPaymentDialog from '../components/RecordPaymentDialog';

const CLASS_TYPES = ['class', 'tutorial'];
const GRADES = ['Nursery 1', 'Nursery 2', 'Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];

export default function SummerProgramDetail({ onMenuClick }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const addToast = useToast();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('Admin');
  const canManageClasses = hasRole('Admin', 'Registrar');
  const canEnroll = hasRole('Admin', 'Registrar');
  const canPay = hasRole('Admin', 'Treasurer');

  const [program, setProgram] = useState(null);
  const [classes, setClasses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [activeTab, setActiveTab] = useState('classes');
  const [loading, setLoading] = useState(true);

  // Class form
  const [classFormOpen, setClassFormOpen] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [classForm, setClassForm] = useState({
    name: '', class_type: 'class', subject: '', fee: '', capacity: '',
    schedule_days: '', schedule_time: '', start_date: '', end_date: '',
    teacher_name: '', room: '', notes: '',
  });

  // Enrollment + payment dialogs
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [enrollClassId, setEnrollClassId] = useState(null);
  const [payDialogOpen, setPayDialogOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    try {
      const [p, c, e, pay] = await Promise.all([
        summerApi.getProgram(id),
        summerApi.getClasses({ program_id: id }),
        summerApi.getEnrollments({ program_id: id }),
        summerApi.getPayments({ program_id: id }),
      ]);
      setProgram(p);
      setClasses(c);
      setEnrollments(e);
      setPayments(pay);
    } catch (err) { addToast(err.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  // Class CRUD
  const openAddClass = () => {
    setEditingClass(null);
    setClassForm({ name: '', class_type: 'class', subject: '', fee: '', capacity: '', schedule_days: '', schedule_time: '', start_date: '', end_date: '', teacher_name: '', room: '', notes: '' });
    setClassFormOpen(true);
  };
  const openEditClass = (c) => {
    setEditingClass(c.id);
    setClassForm({
      name: c.name, class_type: c.class_type, subject: c.subject || '',
      fee: c.fee, capacity: c.capacity || '', schedule_days: c.schedule_days || '',
      schedule_time: c.schedule_time || '', start_date: c.start_date || '',
      end_date: c.end_date || '', teacher_name: c.teacher_name || '',
      room: c.room || '', notes: c.notes || '',
    });
    setClassFormOpen(true);
  };
  const handleClassSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...classForm, summer_program_id: parseInt(id), fee: parseFloat(classForm.fee) || 0, capacity: parseInt(classForm.capacity) || 0 };
      if (editingClass) {
        await summerApi.updateClass(editingClass, data);
        addToast('Class updated');
      } else {
        await summerApi.createClass(data);
        addToast('Class created');
      }
      setClassFormOpen(false);
      load();
    } catch (err) { addToast(err.message, 'error'); }
  };
  const handleDeleteClass = async () => {
    try {
      await summerApi.deleteClass(deleteTarget);
      addToast('Class deleted');
      setDeleteTarget(null);
      load();
    } catch (err) { addToast(err.message, 'error'); setDeleteTarget(null); }
  };
  const handleCancelClass = async (classId) => {
    try {
      await summerApi.cancelClass(classId);
      addToast('Class cancelled');
      load();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleEnrollSuccess = () => { setEnrollDialogOpen(false); load(); };
  const handlePaySuccess = () => { setPayDialogOpen(false); load(); };

  if (loading) return (
    <div>
      <TopBar title="Summer Program" onMenuClick={onMenuClick} />
      <div className="p-6 text-brand-slate">Loading…</div>
    </div>
  );
  if (!program) return null;

  const tabs = [
    { id: 'classes', label: `Classes (${classes.length})` },
    { id: 'enrollments', label: `Enrollments (${enrollments.filter(e => e.status === 'active').length})` },
    { id: 'payments', label: `Payments (${payments.filter(p => !p.voided).length})` },
  ];

  return (
    <div>
      <TopBar title={program.name} onMenuClick={onMenuClick}>
        <button onClick={() => navigate('/summer')} className="text-brand-navy hover:text-brand-teal text-sm flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
      </TopBar>

      <div className="p-6 space-y-4">
        {/* Program header */}
        <div className="bg-white border border-brand-border rounded-xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-brand-slate">S.Y. {program.school_year} · {program.start_date} — {program.end_date}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
                  program.status === 'active' ? 'bg-status-success/15 text-status-success border-status-success/30'
                  : program.status === 'draft' ? 'bg-brand-steel/15 text-brand-steel border-brand-steel/30'
                  : 'bg-brand-slate/15 text-brand-slate border-brand-slate/30'
                }`}>{program.status}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div><div className="text-xl font-bold text-brand-navy">{program.class_count}</div><div className="text-[10px] text-brand-slate uppercase">Classes</div></div>
              <div><div className="text-xl font-bold text-brand-navy">{program.enrollment_count}</div><div className="text-[10px] text-brand-slate uppercase">Enrolled</div></div>
              <div>
                <div className="text-xl font-bold text-status-success font-mono">{formatCurrency(program.total_collected)}</div>
                <div className="text-[10px] text-brand-slate uppercase">Collected</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-brand-border">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id ? 'border-brand-steel text-brand-teal font-semibold' : 'border-transparent text-brand-slate hover:text-brand-navy'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Classes tab */}
        {activeTab === 'classes' && (
          <div>
            {canManageClasses && program.status !== 'closed' && (
              <div className="flex justify-end mb-3">
                <button onClick={openAddClass} className="bg-brand-steel hover:bg-brand-teal text-white px-4 py-1.5 rounded-lg text-sm font-medium">
                  + Add Class
                </button>
              </div>
            )}
            <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-right">Fee</th>
                    <th className="px-4 py-3 text-center">Enrolled / Cap</th>
                    <th className="px-4 py-3 text-left">Schedule</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-brand-slate">No classes yet. Add one to get started.</td></tr>
                  )}
                  {classes.map(c => (
                    <tr key={c.id} className={`border-b border-brand-border/50 hover:bg-brand-light/50 ${c.status === 'cancelled' ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-2 font-medium text-brand-navy">{c.name}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${c.class_type === 'tutorial' ? 'bg-[#8A6DB5]/15 text-[#6B4D8A]' : 'bg-brand-steel/15 text-brand-steel'}`}>
                          {c.class_type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{formatCurrency(c.fee)}</td>
                      <td className="px-4 py-2 text-center">
                        <span className="font-semibold">{c.enrolled_count || 0}</span>
                        <span className="text-brand-slate"> / {c.capacity === 0 ? '∞' : c.capacity}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-brand-slate">
                        {c.schedule_days && <span>{c.schedule_days}</span>}
                        {c.schedule_time && <span className="ml-1">{c.schedule_time}</span>}
                        {!c.schedule_days && !c.schedule_time && '—'}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
                          c.status === 'open' ? 'bg-status-success/15 text-status-success border-status-success/30'
                          : c.status === 'cancelled' ? 'bg-status-danger/15 text-status-danger border-status-danger/30'
                          : 'bg-brand-slate/15 text-brand-slate border-brand-slate/30'
                        }`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1 justify-center">
                          {canEnroll && c.status === 'open' && (
                            <button onClick={() => { setEnrollClassId(c.id); setEnrollDialogOpen(true); }} className="text-status-success hover:text-status-success/80 p-1" title="Enroll Student">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                            </button>
                          )}
                          {canManageClasses && (
                            <button onClick={() => openEditClass(c)} className="text-brand-slate hover:text-status-warning p-1" title="Edit">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                          )}
                          {canManageClasses && c.status === 'open' && (
                            <button onClick={() => handleCancelClass(c.id)} className="text-brand-slate hover:text-status-danger p-1" title="Cancel Class">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                            </button>
                          )}
                          {canManageClasses && (c.enrolled_count || 0) === 0 && (
                            <button onClick={() => setDeleteTarget(c.id)} className="text-brand-slate hover:text-status-danger p-1" title="Delete">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Enrollments tab */}
        {activeTab === 'enrollments' && (
          <div>
            <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                    <th className="px-4 py-3 text-left">Student</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Class</th>
                    <th className="px-4 py-3 text-right">Fee</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Enrolled</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-brand-slate">No enrollments yet.</td></tr>
                  )}
                  {enrollments.map(e => (
                    <tr key={e.id} className={`border-b border-brand-border/50 hover:bg-brand-light/50 ${e.status !== 'active' ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-2 font-medium text-brand-navy">
                        {e.is_external ? e.external_full_name : `${e.last_name}, ${e.first_name}`}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${e.is_external ? 'bg-status-warning/15 text-status-warning' : 'bg-brand-steel/15 text-brand-steel'}`}>
                          {e.is_external ? 'External' : 'Internal'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-brand-navy">{e.class_name}</td>
                      <td className="px-4 py-2 text-right font-mono">{formatCurrency(e.total_due)}</td>
                      <td className="px-4 py-2 text-right font-mono text-status-success">{formatCurrency(e.total_paid)}</td>
                      <td className="px-4 py-2 text-right font-mono text-status-danger">{formatCurrency(e.balance)}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
                          e.status === 'active' ? 'bg-status-success/15 text-status-success border-status-success/30'
                          : e.status === 'withdrawn' ? 'bg-status-danger/15 text-status-danger border-status-danger/30'
                          : 'bg-brand-slate/15 text-brand-slate border-brand-slate/30'
                        }`}>{e.status}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-brand-slate">{formatDate(e.enrolled_at?.split('T')[0] || e.enrolled_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Payments tab */}
        {activeTab === 'payments' && (
          <div>
            {canPay && (
              <div className="flex justify-end mb-3">
                <button onClick={() => setPayDialogOpen(true)} className="bg-brand-steel hover:bg-brand-teal text-white px-4 py-1.5 rounded-lg text-sm font-medium">
                  + Record Payment
                </button>
              </div>
            )}
            <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                    <th className="px-4 py-3 text-left">OR #</th>
                    <th className="px-4 py-3 text-left">Payer</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Method</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-brand-slate">No payments yet.</td></tr>
                  )}
                  {payments.map(p => (
                    <tr key={p.id} className={`border-b border-brand-border/50 hover:bg-brand-light/50 ${p.voided ? 'opacity-50 line-through' : ''}`}>
                      <td className="px-4 py-2 font-mono text-xs text-brand-slate">{p.or_number || '—'}</td>
                      <td className="px-4 py-2 text-brand-navy">{p.is_external ? p.external_full_name : `Student ${p.student_id?.slice(0, 8)}`}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-status-success">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-2 text-brand-navy">{p.payment_method}</td>
                      <td className="px-4 py-2 text-xs text-brand-slate">{p.paid_at}</td>
                      <td className="px-4 py-2">
                        {p.voided ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-status-danger/15 text-status-danger border border-status-danger/30">voided</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-status-success/15 text-status-success border border-status-success/30">posted</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Class form modal */}
      <Modal isOpen={classFormOpen} onClose={() => setClassFormOpen(false)} title={editingClass ? 'Edit Class' : 'Add Class'} wide>
        <form onSubmit={handleClassSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Class Name *</label>
              <input type="text" value={classForm.name} onChange={e => setClassForm(f => ({ ...f, name: e.target.value }))} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Type *</label>
              <select value={classForm.class_type} onChange={e => setClassForm(f => ({ ...f, class_type: e.target.value }))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
                {CLASS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Subject</label>
              <input type="text" value={classForm.subject} onChange={e => setClassForm(f => ({ ...f, subject: e.target.value }))} placeholder="Math, English, Art…" className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Fee (₱)</label>
              <input type="number" step="0.01" value={classForm.fee} onChange={e => setClassForm(f => ({ ...f, fee: e.target.value }))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Capacity (0=unlimited)</label>
              <input type="number" value={classForm.capacity} onChange={e => setClassForm(f => ({ ...f, capacity: e.target.value }))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Schedule Days</label>
              <input type="text" value={classForm.schedule_days} onChange={e => setClassForm(f => ({ ...f, schedule_days: e.target.value }))} placeholder="Mon,Wed,Fri" className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Schedule Time</label>
              <input type="text" value={classForm.schedule_time} onChange={e => setClassForm(f => ({ ...f, schedule_time: e.target.value }))} placeholder="09:00-11:00" className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Teacher Name</label>
              <input type="text" value={classForm.teacher_name} onChange={e => setClassForm(f => ({ ...f, teacher_name: e.target.value }))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Room</label>
              <input type="text" value={classForm.room} onChange={e => setClassForm(f => ({ ...f, room: e.target.value }))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setClassFormOpen(false)} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm text-white bg-brand-steel hover:bg-brand-teal rounded-lg">{editingClass ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteClass} message="This will permanently delete this class." />

      <EnrollStudentDialog isOpen={enrollDialogOpen} onClose={() => setEnrollDialogOpen(false)} classId={enrollClassId} onSuccess={handleEnrollSuccess} />
      <RecordPaymentDialog isOpen={payDialogOpen} onClose={() => setPayDialogOpen(false)} programId={id} onSuccess={handlePaySuccess} />
    </div>
  );
}
