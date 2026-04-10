import { useState, useEffect, useMemo } from 'react';
import TopBar from '../components/TopBar';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { api } from '../utils/api';
import { formatCurrency, formatDate } from '../utils/format';
import { useSchoolYear } from '../utils/useSchoolYear';
import { useAuth } from '../context/AuthContext';

const methods = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Check', 'Installment Plan'];
const gradeLevels = ['Nursery 1', 'Nursery 2', 'Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Philippine school year quarters
const quarters = [
  { label: 'Q1 (Jun–Aug)', months: [5, 6, 7] },
  { label: 'Q2 (Sep–Nov)', months: [8, 9, 10] },
  { label: 'Q3 (Dec–Feb)', months: [11, 0, 1] },
  { label: 'Q4 (Mar–May)', months: [2, 3, 4] },
];

const PAGE_SIZE = 25;

// Tailwind classes per payment method (text color only — keeps it clean)
const methodClass = (m) => {
  switch (m) {
    case 'Cash': return 'text-status-success';
    case 'Bank Transfer': return 'text-brand-steel';
    case 'GCash': return 'text-brand-steel';
    case 'Maya': return 'text-[#8A6DB5]';
    case 'Check': return 'text-brand-slate';
    default: return 'text-brand-navy';
  }
};

export default function Payments({ onMenuClick }) {
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // School-year context from the DB (authoritative current_school_year)
  const { selectedSY: filterSY, setSelectedSY: setFilterSY, availableYears: schoolYears } = useSchoolYear();
  const [form, setForm] = useState({ student_id: '', amount: '', date: '', method: 'Cash', receipt_no: '', school_year: '', notes: '' });
  const addToast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole('Admin', 'Registrar', 'Treasurer');

  // Filters (school year lives in the hook above)
  const [filterGrade, setFilterGrade] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterQuarter, setFilterQuarter] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [search, setSearch] = useState('');

  // Sorting + pagination
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  const load = () => {
    setLoading(true);
    Promise.all([api.getPayments(), api.getStudents()]).then(([p, s]) => {
      setPayments(p);
      setStudents(s);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filterGrade, filterMonth, filterQuarter, filterMethod, filterSY, search, sortKey, sortDir]);

  // Filtered payments
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = payments.filter(p => {
      if (filterGrade && p.grade_level !== filterGrade) return false;
      if (filterMethod && p.method !== filterMethod) return false;
      if (filterSY && p.school_year !== filterSY) return false;

      if (p.date) {
        const d = new Date(p.date);
        const monthIdx = d.getMonth();
        if (filterMonth) {
          const selectedMonthIdx = months.indexOf(filterMonth);
          if (monthIdx !== selectedMonthIdx) return false;
        }
        if (filterQuarter) {
          const quart = quarters.find(qq => qq.label === filterQuarter);
          if (quart && !quart.months.includes(monthIdx)) return false;
        }
      } else {
        if (filterMonth || filterQuarter) return false;
      }

      if (q) {
        const name = `${p.last_name || ''} ${p.first_name || ''}`.toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });

    // Sort
    const sorted = [...list];
    const dir = sortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'date': av = a.date || ''; bv = b.date || ''; break;
        case 'student': av = `${a.last_name},${a.first_name}`; bv = `${b.last_name},${b.first_name}`; break;
        case 'amount': av = a.amount || 0; bv = b.amount || 0; break;
        default: av = 0; bv = 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return sorted;
  }, [payments, filterGrade, filterMonth, filterQuarter, filterMethod, filterSY, search, sortKey, sortDir]);

  const hasFilters = filterGrade || filterMonth || filterQuarter || filterMethod || search;

  // Stats from filtered set
  const stats = useMemo(() => {
    const count = filtered.length;
    const total = filtered.reduce((s, p) => s + (p.amount || 0), 0);
    const avg = count > 0 ? total / count : 0;
    // This month: current calendar month
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7); // YYYY-MM
    const thisMonthTotal = filtered
      .filter(p => p.date && p.date.startsWith(thisMonth))
      .reduce((s, p) => s + (p.amount || 0), 0);
    return { count, total, avg, thisMonthTotal };
  }, [filtered]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const clearFilters = () => {
    setFilterGrade('');
    setFilterMonth('');
    setFilterQuarter('');
    setFilterMethod('');
    setSearch('');
    // Leave filterSY alone — the DB-authoritative current SY stays selected.
  };

  const handleMonthChange = (val) => { setFilterMonth(val); if (val) setFilterQuarter(''); };
  const handleQuarterChange = (val) => { setFilterQuarter(val); if (val) setFilterMonth(''); };

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'date' ? 'desc' : 'asc'); }
  };
  const sortIcon = (key) => {
    if (sortKey !== key) return <span className="text-brand-border">↕</span>;
    return <span className="text-brand-steel">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  // CSV export
  const exportCSV = () => {
    const header = ['Date', 'Student', 'Grade', 'Receipt No.', 'Amount', 'Method', 'S.Y.', 'Notes'];
    const escape = v => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filtered.map(p => [
      p.date || '',
      `${p.last_name}, ${p.first_name}`,
      p.grade_level || '',
      p.receipt_no || '',
      p.amount,
      p.method || '',
      p.school_year || '',
      p.notes || '',
    ].map(escape).join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments_${filterSY || 'all'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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

  const selectClass = "bg-white border border-brand-border rounded-lg px-3 py-1.5 text-sm text-brand-navy focus:outline-none focus:border-brand-steel";

  return (
    <div>
      <TopBar title="Payments" onMenuClick={onMenuClick}>
        <button onClick={() => window.print()} className="bg-white border border-brand-border hover:bg-brand-light text-brand-navy px-3 py-1.5 rounded-lg text-sm font-medium">Print</button>
        <button onClick={exportCSV} className="bg-white border border-brand-border hover:bg-brand-light text-brand-navy px-3 py-1.5 rounded-lg text-sm font-medium">Export CSV</button>
        {canEdit && <button onClick={() => { setEditing(null); setForm({ student_id: '', amount: '', date: '', method: 'Cash', receipt_no: '', school_year: filterSY || '', notes: '' }); setModalOpen(true); }} className="bg-brand-steel hover:bg-brand-teal text-white px-4 py-1.5 rounded-lg text-sm font-medium">+ Add Payment</button>}
      </TopBar>

      <div className="p-6 space-y-4">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-brand-border border-l-4 border-l-brand-steel rounded-xl p-4 shadow-sm">
            <p className="text-xs text-brand-slate font-medium uppercase tracking-wider mb-1">Total Payments</p>
            <p className="text-xl font-bold font-mono text-brand-navy">{stats.count}</p>
          </div>
          <div className="bg-white border border-brand-border border-l-4 border-l-status-success rounded-xl p-4 shadow-sm">
            <p className="text-xs text-brand-slate font-medium uppercase tracking-wider mb-1">Total Collected</p>
            <p className="text-xl font-bold font-mono text-status-success truncate">{formatCurrency(stats.total)}</p>
          </div>
          <div className="bg-white border border-brand-border border-l-4 border-l-brand-teal rounded-xl p-4 shadow-sm">
            <p className="text-xs text-brand-slate font-medium uppercase tracking-wider mb-1">Average Payment</p>
            <p className="text-xl font-bold font-mono text-brand-teal truncate">{formatCurrency(stats.avg)}</p>
          </div>
          <div className="bg-white border border-brand-border border-l-4 border-l-status-warning rounded-xl p-4 shadow-sm">
            <p className="text-xs text-brand-slate font-medium uppercase tracking-wider mb-1">This Month</p>
            <p className="text-xl font-bold font-mono text-status-warning truncate">{formatCurrency(stats.thisMonthTotal)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} className={selectClass}>
            <option value="">All Grade Levels</option>
            {gradeLevels.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={filterMonth} onChange={e => handleMonthChange(e.target.value)} className={selectClass}>
            <option value="">All Months</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterQuarter} onChange={e => handleQuarterChange(e.target.value)} className={selectClass}>
            <option value="">All Quarters</option>
            {quarters.map(q => <option key={q.label} value={q.label}>{q.label}</option>)}
          </select>
          <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)} className={selectClass}>
            <option value="">All Methods</option>
            {methods.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterSY || ''} onChange={e => setFilterSY(e.target.value)} className={selectClass}>
            <option value="">All Years</option>
            {schoolYears.map(sy => <option key={sy} value={sy}>{sy}</option>)}
          </select>
          <div className="relative">
            <input
              type="text"
              placeholder="Search student..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-white border border-brand-border rounded-lg px-3 py-1.5 text-sm text-brand-navy placeholder-brand-slate focus:outline-none focus:border-brand-steel w-44 pr-7"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-slate hover:text-brand-navy">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="text-sm text-brand-slate hover:text-status-danger underline">Clear Filters</button>
          )}
        </div>

        {/* Summary */}
        <p className="text-sm text-brand-slate">
          Showing <span className="font-semibold text-brand-navy">{filtered.length}</span>
          {hasFilters ? ' of ' : ' '}
          {hasFilters && <span className="font-semibold text-brand-navy">{payments.length}</span>}
          {' payments · Total: '}
          <span className="font-semibold text-status-success font-mono">{formatCurrency(stats.total)}</span>
        </p>

        <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                  <th className="px-4 py-3 text-left cursor-pointer hover:text-brand-navy" onClick={() => handleSort('date')}>
                    Date <span className="ml-0.5">{sortIcon('date')}</span>
                  </th>
                  <th className="px-4 py-3 text-left cursor-pointer hover:text-brand-navy" onClick={() => handleSort('student')}>
                    Student <span className="ml-0.5">{sortIcon('student')}</span>
                  </th>
                  <th className="px-4 py-3 text-left">Grade</th>
                  <th className="px-4 py-3 text-left">Receipt No.</th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:text-brand-navy" onClick={() => handleSort('amount')}>
                    Amount <span className="ml-0.5">{sortIcon('amount')}</span>
                  </th>
                  <th className="px-4 py-3 text-left">Method</th>
                  <th className="px-4 py-3 text-left">S.Y.</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map(p => (
                  <tr key={p.id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                    <td className="px-4 py-2 text-brand-navy whitespace-nowrap">{formatDate(p.date)}</td>
                    <td className="px-4 py-2 text-brand-navy">{p.last_name}, {p.first_name}</td>
                    <td className="px-4 py-2 text-brand-slate text-xs">{p.grade_level || '—'}</td>
                    <td className="px-4 py-2 font-mono text-[11px] text-brand-slate whitespace-nowrap">{p.receipt_no}</td>
                    <td className="px-4 py-2 text-right font-mono text-status-success">{formatCurrency(p.amount)}</td>
                    <td className={`px-4 py-2 font-medium ${methodClass(p.method)}`}>{p.method}</td>
                    <td className="px-4 py-2 font-mono text-xs text-brand-slate">{p.school_year || '—'}</td>
                    <td className="px-4 py-2 text-brand-slate max-w-[200px] truncate" title={p.notes || ''}>{p.notes || '—'}</td>
                    <td className="px-4 py-2">
                      {canEdit && <div className="flex gap-1">
                        <button onClick={() => { setEditing(p.id); setForm({ student_id: p.student_id, amount: p.amount, date: p.date, method: p.method, receipt_no: p.receipt_no || '', school_year: p.school_year || filterSY || '', notes: p.notes || '' }); setModalOpen(true); }} title="Edit" className="text-brand-slate hover:text-status-warning p-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => setDeleteTarget(p.id)} title="Delete" className="text-brand-slate hover:text-status-danger p-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-brand-slate">
                  <svg className="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  {hasFilters ? 'No payments match the selected filters' : 'No payments found'}
                </td></tr>}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-brand-border">
              <span className="text-xs text-brand-slate">Page {page} of {totalPages} · {filtered.length} payment{filtered.length !== 1 ? 's' : ''}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 text-sm text-brand-navy hover:bg-brand-light rounded disabled:opacity-30">«</button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 text-sm text-brand-navy hover:bg-brand-light rounded disabled:opacity-30">‹</button>
                <span className="px-3 py-1 text-sm text-brand-navy font-mono">{page}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 text-sm text-brand-navy hover:bg-brand-light rounded disabled:opacity-30">›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 text-sm text-brand-navy hover:bg-brand-light rounded disabled:opacity-30">»</button>
              </div>
            </div>
          )}
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
