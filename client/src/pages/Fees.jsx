import { useState, useEffect } from 'react';
import TopBar from '../components/TopBar';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { api } from '../utils/api';
import { formatCurrency, formatDate } from '../utils/format';
import { getCurrentSchoolYear } from '../utils/schoolYear';
import { useAuth } from '../context/AuthContext';

export default function Fees({ onMenuClick }) {
  const [obligations, setObligations] = useState([]);
  const [students, setStudents] = useState([]);
  const [feeTypesList, setFeeTypesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ student_id: '', fee_type: 'Tuition Fee', payment_term: '', installment_number: '', school_year: getCurrentSchoolYear(), amount: '', due_date: '', description: '' });
  const [assignTo, setAssignTo] = useState('student');
  const [gradeLevel, setGradeLevel] = useState('');
  const addToast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole('Admin', 'Registrar');

  const GRADE_LEVELS = ['Nursery 1', 'Nursery 2', 'Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];
  const gradeCount = assignTo === 'grade' && gradeLevel ? students.filter(s => s.grade_level === gradeLevel && s.status === 'Enrolled' && s.school_year === form.school_year).length : 0;

  const load = () => {
    setLoading(true);
    Promise.all([api.getObligations(), api.getStudents()]).then(([o, s]) => {
      setObligations(o);
      setStudents(s);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { api.getFeeTypes().then(types => setFeeTypesList(types.map(t => t.name))).catch(console.error); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        const data = { ...form, amount: parseFloat(form.amount) };
        await api.updateObligation(editing, data);
        addToast('Obligation updated');
      } else if (assignTo === 'grade') {
        const amt = parseFloat(form.amount);
        if (!gradeLevel) { addToast('Please select a grade level', 'error'); return; }
        if (gradeCount === 0) { addToast('No enrolled students in this grade level', 'error'); return; }
        if (!window.confirm(`This will add ${form.fee_type} (${formatCurrency(amt)}) to ${gradeCount} student${gradeCount !== 1 ? 's' : ''} in ${gradeLevel}. Continue?`)) return;
        const result = await api.bulkCreateObligations({ grade_level: gradeLevel, school_year: form.school_year, fee_type: form.fee_type, amount: amt, due_date: form.due_date || undefined, description: form.description || undefined });
        addToast(`Fee added to ${result.count} student${result.count !== 1 ? 's' : ''}`);
      } else {
        const data = { ...form, amount: parseFloat(form.amount) };
        await api.createObligation(data);
        addToast('Obligation added');
      }
      setModalOpen(false);
      load();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDelete = async () => {
    try {
      await api.deleteObligation(deleteTarget);
      addToast('Obligation deleted');
      setDeleteTarget(null);
      load();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div>
      <TopBar title="Fees & Obligations" onMenuClick={onMenuClick}>
        {canEdit && <button onClick={() => { setEditing(null); setAssignTo('student'); setGradeLevel(''); setForm({ student_id: '', fee_type: feeTypesList[0] || 'Tuition Fee', payment_term: '', installment_number: '', school_year: getCurrentSchoolYear(), amount: '', due_date: '', description: '' }); setModalOpen(true); }} className="bg-brand-steel hover:bg-brand-teal text-white px-4 py-1.5 rounded-lg text-sm font-medium">+ Add Fee</button>}
      </TopBar>

      <div className="p-6">
        <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Fee Type</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Term</th>
                  <th className="px-4 py-3">Installment</th>
                  <th className="px-4 py-3">S.Y.</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {obligations.map(o => {
                  const overdue = o.due_date && o.due_date < today;
                  return (
                    <tr key={o.id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                      <td className="px-4 py-2 text-brand-navy">{o.last_name}, {o.first_name}</td>
                      <td className="px-4 py-2 text-brand-navy">{o.fee_type}</td>
                      <td className="px-4 py-2 text-brand-slate">{o.description || '—'}</td>
                      <td className="px-4 py-2 text-brand-navy">{o.payment_term || '—'}</td>
                      <td className="px-4 py-2 text-brand-navy">{o.installment_number || '—'}</td>
                      <td className="px-4 py-2 font-mono text-xs text-brand-slate">{o.school_year}</td>
                      <td className="px-4 py-2 text-right font-mono text-brand-navy">{formatCurrency(o.amount)}</td>
                      <td className={`px-4 py-2 ${overdue ? 'text-status-danger font-semibold' : 'text-brand-navy'}`}>
                        {formatDate(o.due_date)}
                        {overdue && <span className="ml-1 text-xs bg-status-danger/10 text-status-danger px-1.5 py-0.5 rounded">Overdue</span>}
                      </td>
                      <td className="px-4 py-2">
                        {canEdit && <div className="flex gap-1">
                          <button onClick={() => { setEditing(o.id); setForm({ student_id: o.student_id, fee_type: o.fee_type, payment_term: o.payment_term || '', installment_number: o.installment_number || '', school_year: o.school_year, amount: o.amount, due_date: o.due_date || '', description: o.description || '' }); setModalOpen(true); }} className="text-brand-slate hover:text-status-warning p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => setDeleteTarget(o.id)} className="text-brand-slate hover:text-status-danger p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>}
                      </td>
                    </tr>
                  );
                })}
                {obligations.length === 0 && !loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-brand-slate">No obligations found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Obligation' : 'Add Obligation'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Assign To toggle — only shown when adding */}
          {!editing && (
            <div>
              <label className="block text-xs text-brand-slate mb-2">Assign To *</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="assignTo" value="student" checked={assignTo === 'student'} onChange={() => setAssignTo('student')} className="accent-brand-steel" />
                  <span className="text-sm text-brand-navy">Single Student</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="assignTo" value="grade" checked={assignTo === 'grade'} onChange={() => setAssignTo('grade')} className="accent-brand-steel" />
                  <span className="text-sm text-brand-navy">Entire Grade Level</span>
                </label>
              </div>
            </div>
          )}

          {/* Single Student selector */}
          {(editing || assignTo === 'student') && (
            <div>
              <label className="block text-xs text-brand-slate mb-1">Student *</label>
              <select value={form.student_id} onChange={e => setForm(p => ({...p, student_id: e.target.value}))} required disabled={!!editing} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy disabled:opacity-50 focus:outline-none focus:border-brand-steel">
                <option value="">Select student...</option>
                {students.filter(s => s.status === 'Enrolled').map(s => <option key={s.student_id} value={s.student_id}>{s.last_name}, {s.first_name} ({s.student_id})</option>)}
              </select>
            </div>
          )}

          {/* Grade Level selector */}
          {!editing && assignTo === 'grade' && (
            <div>
              <label className="block text-xs text-brand-slate mb-1">Grade Level *</label>
              <select value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
                <option value="">Select grade level...</option>
                {GRADE_LEVELS.map(gl => <option key={gl} value={gl}>{gl}</option>)}
              </select>
              {gradeLevel && (
                <p className="text-xs text-brand-slate mt-1">Enrolled students in {gradeLevel}: <span className="font-semibold text-brand-navy">{gradeCount}</span></p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs text-brand-slate mb-1">Fee Type *</label>
            <select value={form.fee_type} onChange={e => setForm(p => ({...p, fee_type: e.target.value}))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
              {feeTypesList.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Amount (₱) *</label>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(p => ({...p, amount: e.target.value}))} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Due Date</label>
              <input type="date" value={form.due_date} onChange={e => setForm(p => ({...p, due_date: e.target.value}))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
          </div>
          {/* Payment Term and School Year — only show payment term for single student / edit */}
          <div className="grid grid-cols-2 gap-4">
            {(editing || assignTo === 'student') && (
              <div>
                <label className="block text-xs text-brand-slate mb-1">Payment Term</label>
                <select value={form.payment_term} onChange={e => setForm(p => ({...p, payment_term: e.target.value}))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
                  <option value="">N/A</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Annually">Annually</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-brand-slate mb-1">School Year</label>
              <div className="w-full bg-brand-light border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy font-semibold">{form.school_year}</div>
            </div>
          </div>
          <div>
            <label className="block text-xs text-brand-slate mb-1">Description</label>
            <input type="text" value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm text-white bg-brand-steel hover:bg-brand-teal rounded-lg">{editing ? 'Update' : 'Add'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
    </div>
  );
}
