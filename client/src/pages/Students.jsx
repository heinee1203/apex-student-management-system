import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import Modal from '../components/Modal';
import PayStatusBadge from '../components/PayStatusBadge';
import StatusBadge from '../components/StatusBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { api } from '../utils/api';
import { formatCurrency } from '../utils/format';
import { getCurrentSchoolYear } from '../utils/schoolYear';
import { useAuth } from '../context/AuthContext';

const gradeLevels = ['Nursery 1', 'Nursery 2', 'Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];
const paymentTerms = ['Monthly', 'Quarterly', 'Annually'];
const payStatuses = ['Paid', 'Partial', 'Unpaid', 'Overdue'];
const statuses = ['Enrolled', 'Dropped', 'LOA', 'Graduated', 'Irregular'];
const scholarships = ['None', 'Full Scholarship', 'Half Scholarship', 'Academic Scholar', 'Athletic Scholar', 'Government (TES)', 'CHED Scholarship', 'LGU Scholarship'];

const emptyForm = { student_id: '', first_name: '', middle_name: '', last_name: '', grade_level: 'Nursery 1', section: '', status: 'Enrolled', email: '', phone: '', guardian: '', guardian_phone: '', scholarship: 'None', date_enrolled: '', address: '', payment_term: 'Monthly', total_tuition: '', school_year: getCurrentSchoolYear() };

export default function Students({ onMenuClick }) {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterTerm, setFilterTerm] = useState('');
  const [filterPayStatus, setFilterPayStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [tuitionWarning, setTuitionWarning] = useState('');
  const addToast = useToast();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canEdit = hasRole('Admin', 'Registrar');

  const load = () => {
    setLoading(true);
    api.getStudents(search ? { search } : {}).then(setStudents).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

  // Auto-fill total_tuition from tuition schedule based on payment term
  useEffect(() => {
    if (!modalOpen) return;
    if (!form.grade_level || !form.school_year) return;
    api.getTuitionRate(form.grade_level, form.school_year)
      .then(res => {
        if (res.annual_rate != null) {
          let total;
          if (form.payment_term === 'Monthly') {
            total = (res.monthly_rate || res.annual_rate / 10) * 10;
          } else if (form.payment_term === 'Quarterly') {
            total = (res.quarterly_rate || res.annual_rate / 4) * 4;
          } else {
            total = res.annual_rate;
          }
          setForm(prev => ({ ...prev, total_tuition: total }));
          setTuitionWarning('');
        } else {
          setForm(prev => ({ ...prev, total_tuition: 0 }));
          setTuitionWarning('No tuition rate found for this grade level. Set it in Settings → Tuition Fee Schedule.');
        }
      })
      .catch(() => {});
  }, [modalOpen, form.grade_level, form.school_year, form.payment_term]);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setTuitionWarning(''); setModalOpen(true); };
  const openEdit = (s) => {
    setEditing(s.student_id);
    setForm({ student_id: s.student_id, first_name: s.first_name, middle_name: s.middle_name || '', last_name: s.last_name, grade_level: s.grade_level, section: s.section || '', status: s.status, email: s.email || '', phone: s.phone || '', guardian: s.guardian || '', guardian_phone: s.guardian_phone || '', scholarship: s.scholarship || 'None', date_enrolled: s.date_enrolled || '', address: s.address || '', payment_term: s.payment_term || 'Monthly', total_tuition: s.total_tuition || '', school_year: s.school_year || '2024-2025' });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...form, total_tuition: parseFloat(form.total_tuition) };
      if (editing) {
        const orig = students.find(s => s.student_id === editing);
        const termChanged = orig && (form.payment_term !== (orig.payment_term || 'Monthly') || parseFloat(form.total_tuition) !== parseFloat(orig.total_tuition || 0));
        if (termChanged && !window.confirm('Changing payment term or tuition will regenerate tuition installments. Existing tuition fees will be replaced. Continue?')) {
          return;
        }
        await api.updateStudent(editing, data);
        addToast('Student updated successfully');
      } else {
        const result = await api.createStudent(data);
        if (result.obligations_created) {
          const { tuition, other_fees } = result.obligations_created;
          addToast(`Student enrolled — ${tuition} tuition installment${tuition !== 1 ? 's' : ''} + ${other_fees} other fee${other_fees !== 1 ? 's' : ''} created`);
        } else {
          addToast('Student created successfully');
        }
      }
      setModalOpen(false);
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteStudent(deleteTarget);
      addToast('Student deleted successfully');
      setDeleteTarget(null);
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const filtered = students.filter(s => {
    if (filterGrade && s.grade_level !== filterGrade) return false;
    if (filterTerm && s.payment_term !== filterTerm) return false;
    if (filterPayStatus && s.pay_status !== filterPayStatus) return false;
    return true;
  });
  const hasActiveFilters = filterGrade || filterTerm || filterPayStatus;
  const clearFilters = () => { setSearch(''); setFilterGrade(''); setFilterTerm(''); setFilterPayStatus(''); };

  return (
    <div>
      <TopBar title="Students" onMenuClick={onMenuClick}>
        <input
          type="text"
          placeholder="Search students..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white border border-brand-border rounded-lg px-3 py-1.5 text-sm text-brand-navy placeholder-brand-slate focus:outline-none focus:border-brand-steel w-44"
        />
        <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} className="bg-white border border-brand-border rounded-lg px-2 py-1.5 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
          <option value="">All Grade Levels</option>
          {gradeLevels.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={filterTerm} onChange={e => setFilterTerm(e.target.value)} className="bg-white border border-brand-border rounded-lg px-2 py-1.5 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
          <option value="">All Terms</option>
          {paymentTerms.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterPayStatus} onChange={e => setFilterPayStatus(e.target.value)} className="bg-white border border-brand-border rounded-lg px-2 py-1.5 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
          <option value="">All Status</option>
          {payStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(hasActiveFilters || search) && (
          <button onClick={clearFilters} className="text-xs text-brand-slate hover:text-status-danger underline whitespace-nowrap">Clear Filters</button>
        )}
        {canEdit && <button onClick={openAdd} className="bg-brand-steel hover:bg-brand-teal text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap">
          + Add Student
        </button>}
      </TopBar>

      <div className="p-6">
        {(hasActiveFilters || search) && (
          <p className="text-xs text-brand-slate mb-2">Showing {filtered.length} of {students.length} students</p>
        )}
        <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Grade/Year</th>
                  <th className="px-4 py-3">Section</th>
                  <th className="px-4 py-3">Term</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total Fees</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Pay Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.student_id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                    <td className="px-4 py-2 font-mono text-xs text-brand-slate">{s.student_id}</td>
                    <td className="px-4 py-2">
                      <Link to={`/students/${s.student_id}`} className="text-brand-steel hover:text-brand-teal font-medium">
                        {s.last_name}, {s.first_name} {s.middle_name ? s.middle_name.charAt(0) + '.' : ''}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-brand-navy">{s.grade_level}</td>
                    <td className="px-4 py-2 text-brand-navy">{s.section || '—'}</td>
                    <td className="px-4 py-2 text-brand-navy">{s.payment_term || '—'}</td>
                    <td className="px-4 py-2"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-2 text-right font-mono text-brand-navy">{formatCurrency(s.total_fees)}</td>
                    <td className="px-4 py-2 text-right font-mono text-status-success">{formatCurrency(s.total_paid)}</td>
                    <td className="px-4 py-2 text-right font-mono text-status-danger">{formatCurrency(s.balance)}</td>
                    <td className="px-4 py-2"><PayStatusBadge status={s.pay_status} /></td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => navigate(`/students/${s.student_id}`)} className="text-brand-slate hover:text-brand-steel p-1" title="View">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </button>
                        {canEdit && <button onClick={() => openEdit(s)} className="text-brand-slate hover:text-status-warning p-1" title="Edit">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>}
                        <button onClick={() => navigate(`/soa/print/${s.student_id}`)} className="text-brand-slate hover:text-brand-steel p-1" title="Print SOA">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        </button>
                        {canEdit && <button onClick={() => setDeleteTarget(s.student_id)} className="text-brand-slate hover:text-status-danger p-1" title="Delete">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !loading && (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-brand-slate">No students found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Student' : 'Add Student'} wide>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Student ID *</label>
              <input type="text" value={form.student_id} onChange={e => setField('student_id', e.target.value)} required disabled={!!editing} placeholder="2024-00106" className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy disabled:opacity-50 focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">First Name *</label>
              <input type="text" value={form.first_name} onChange={e => setField('first_name', e.target.value)} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Middle Name</label>
              <input type="text" value={form.middle_name} onChange={e => setField('middle_name', e.target.value)} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Last Name *</label>
              <input type="text" value={form.last_name} onChange={e => setField('last_name', e.target.value)} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Grade/Year Level *</label>
              <select value={form.grade_level} onChange={e => setField('grade_level', e.target.value)} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
                {gradeLevels.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Section</label>
              <input type="text" value={form.section} onChange={e => setField('section', e.target.value)} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Status</label>
              <select value={form.status} onChange={e => setField('status', e.target.value)} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setField('email', e.target.value)} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Phone</label>
              <input type="text" value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="09XX-XXX-XXXX" className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Payment Term *</label>
              <select value={form.payment_term} onChange={e => setField('payment_term', e.target.value)} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
                <option value="Annually">Annually</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Total Tuition (&#8369;) *</label>
              <input type="number" step="0.01" value={form.total_tuition} readOnly className="w-full bg-brand-light border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy cursor-not-allowed" />
              {tuitionWarning && <p className="text-xs text-status-danger mt-0.5">{tuitionWarning}</p>}
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">School Year</label>
              <div className="w-full bg-brand-light border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy font-semibold">{form.school_year}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Guardian</label>
              <input type="text" value={form.guardian} onChange={e => setField('guardian', e.target.value)} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Guardian Phone</label>
              <input type="text" value={form.guardian_phone} onChange={e => setField('guardian_phone', e.target.value)} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Scholarship</label>
              <select value={form.scholarship} onChange={e => setField('scholarship', e.target.value)} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
                {scholarships.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Date Enrolled</label>
              <input type="date" value={form.date_enrolled} onChange={e => setField('date_enrolled', e.target.value)} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Address</label>
              <input type="text" value={form.address} onChange={e => setField('address', e.target.value)} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm text-white bg-brand-steel hover:bg-brand-teal rounded-lg">{editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} message="This will permanently delete this student and all their fees and payments." />
    </div>
  );
}
