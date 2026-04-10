import { useState, useEffect, useMemo } from 'react';
import TopBar from '../components/TopBar';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { api } from '../utils/api';
import { formatCurrency, formatDate } from '../utils/format';
import { getCurrentSchoolYear } from '../utils/schoolYear';
import { useAuth } from '../context/AuthContext';

const GRADE_LEVELS = ['Nursery 1', 'Nursery 2', 'Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];
const TERMS = ['Monthly', 'Quarterly', 'Annually'];
const PAGE_SIZE = 25;

export default function Fees({ onMenuClick }) {
  const [obligations, setObligations] = useState([]);
  const [payments, setPayments] = useState([]);
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
  const canEdit = hasRole('Admin', 'Registrar', 'Treasurer');

  // Filters
  const [filterGrade, setFilterGrade] = useState('');
  const [filterFeeType, setFilterFeeType] = useState('');
  const [filterTerm, setFilterTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSY, setFilterSY] = useState('');
  const [search, setSearch] = useState('');

  // Sorting + pagination
  const [sortKey, setSortKey] = useState('student');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  const gradeCount = assignTo === 'grade' && gradeLevel ? students.filter(s => s.grade_level === gradeLevel && s.status === 'Enrolled' && s.school_year === form.school_year).length : 0;

  const load = () => {
    setLoading(true);
    Promise.all([api.getObligations(), api.getStudents(), api.getPayments()]).then(([o, s, p]) => {
      setObligations(o);
      setStudents(s);
      setPayments(p);
      setSelectedIds(new Set());
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { api.getFeeTypes().then(types => setFeeTypesList(types.map(t => t.name))).catch(console.error); }, []);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filterGrade, filterFeeType, filterTerm, filterStatus, filterSY, search]);

  const today = new Date().toISOString().split('T')[0];
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Compute FIFO payment allocation per student to determine per-obligation status
  const obligationsWithStatus = useMemo(() => {
    // Group obligations by student, sorted by due_date
    const byStudent = {};
    for (const o of obligations) {
      if (!byStudent[o.student_id]) byStudent[o.student_id] = [];
      byStudent[o.student_id].push(o);
    }
    // Sum payments by student
    const paidByStudent = {};
    for (const p of payments) {
      paidByStudent[p.student_id] = (paidByStudent[p.student_id] || 0) + (p.amount || 0);
    }

    const result = [];
    for (const [studentId, list] of Object.entries(byStudent)) {
      const sorted = [...list].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
      let remaining = paidByStudent[studentId] || 0;
      for (const o of sorted) {
        let payStatus;
        let paidAmount;
        if (remaining >= o.amount) {
          payStatus = 'Paid';
          paidAmount = o.amount;
          remaining -= o.amount;
        } else if (remaining > 0) {
          payStatus = 'Partial';
          paidAmount = remaining; // the actual allocated portion
          remaining = 0;
        } else {
          payStatus = 'Unpaid';
          paidAmount = 0;
        }
        const overdue = payStatus !== 'Paid' && o.due_date && o.due_date < today;
        result.push({ ...o, payStatus, paidAmount, effectiveStatus: overdue ? 'Overdue' : payStatus });
      }
    }
    return result;
  }, [obligations, payments, today]);

  // Available school years for filter
  const schoolYears = useMemo(() => {
    const set = new Set(obligations.map(o => o.school_year).filter(Boolean));
    return [...set].sort().reverse();
  }, [obligations]);

  // Standardized description
  const getDisplayDescription = (o) => {
    if (o.description && o.description !== 'Total Assessment' && o.description !== 'Annual Assessment') return o.description;
    if (o.fee_type === 'Tuition Fee') {
      if (o.installment_number && o.payment_term && o.payment_term !== 'Annually') {
        // Parse installment like "3/10" or "3"
        const parts = String(o.installment_number).split('/');
        return `Tuition — Installment ${parts[0]}${parts[1] ? ' of ' + parts[1] : ''}`;
      }
      return `Annual Tuition${o.grade_level ? ' — ' + o.grade_level : ''}`;
    }
    return o.fee_type;
  };

  // Filtered + sorted
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = obligationsWithStatus.filter(o => {
      if (filterGrade && o.grade_level !== filterGrade) return false;
      if (filterFeeType && o.fee_type !== filterFeeType) return false;
      if (filterTerm) {
        const isOneTime = o.fee_type !== 'Tuition Fee' || !o.payment_term || o.payment_term === 'Annually';
        if (filterTerm === 'One-time') { if (!isOneTime) return false; }
        else if (o.payment_term !== filterTerm) return false;
      }
      if (filterStatus && o.effectiveStatus !== filterStatus) return false;
      if (filterSY && o.school_year !== filterSY) return false;
      if (q) {
        const name = `${o.last_name || ''} ${o.first_name || ''}`.toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...list];
    const dir = sortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'student': av = `${a.last_name},${a.first_name}`; bv = `${b.last_name},${b.first_name}`; break;
        case 'grade': av = a.grade_level || ''; bv = b.grade_level || ''; break;
        case 'feeType': av = a.fee_type || ''; bv = b.fee_type || ''; break;
        case 'amount': av = a.amount || 0; bv = b.amount || 0; break;
        case 'dueDate': av = a.due_date || '9999'; bv = b.due_date || '9999'; break;
        default: av = 0; bv = 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return sorted;
  }, [obligationsWithStatus, filterGrade, filterFeeType, filterTerm, filterStatus, filterSY, search, sortKey, sortDir]);

  // Summary stats from filtered view. Uses the FIFO-allocated paidAmount per
  // obligation computed above, so partial payments are counted correctly.
  // When no filter is active, totals match the Dashboard exactly:
  //   totalPaid = Σ min(student.fees, student.paid) per student
  //   outstanding = Σ max(0, student.fees - student.paid) per student
  const stats = useMemo(() => {
    const totalFees = filtered.reduce((s, o) => s + (o.amount || 0), 0);
    const totalPaid = filtered.reduce((s, o) => s + (o.paidAmount || 0), 0);
    const rawOutstanding = totalFees - totalPaid;
    // Rounding fix: |outstanding| < 1 → 0 (matches Dashboard / getStudentBalance)
    const outstanding = Math.abs(rawOutstanding) < 1 ? 0 : rawOutstanding;
    const overdueCount = filtered.filter(o => o.effectiveStatus === 'Overdue').length;
    return { totalFees, totalPaid, outstanding, overdueCount };
  }, [filtered]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hasFilters = filterGrade || filterFeeType || filterTerm || filterStatus || filterSY || search;
  const clearFilters = () => {
    setFilterGrade(''); setFilterFeeType(''); setFilterTerm(''); setFilterStatus(''); setFilterSY(''); setSearch('');
  };

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortIcon = (key) => {
    if (sortKey !== key) return <span className="text-brand-border">↕</span>;
    return <span className="text-brand-steel">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  // Bulk selection
  const allOnPageSelected = pageItems.length > 0 && pageItems.every(o => selectedIds.has(o.id));
  const togglePageSelection = () => {
    const next = new Set(selectedIds);
    if (allOnPageSelected) pageItems.forEach(o => next.delete(o.id));
    else pageItems.forEach(o => next.add(o.id));
    setSelectedIds(next);
  };
  const toggleRow = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected obligation${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    try {
      for (const id of selectedIds) {
        await api.deleteObligation(id);
      }
      addToast(`${selectedIds.size} obligation${selectedIds.size !== 1 ? 's' : ''} deleted`);
      setSelectedIds(new Set());
      load();
    } catch (err) { addToast(err.message, 'error'); }
  };

  // CSV export
  const exportCSV = () => {
    const header = ['Student', 'Grade', 'Fee Type', 'Description', 'Term', 'Installment', 'S.Y.', 'Due Date', 'Amount', 'Status'];
    const escape = v => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filtered.map(o => {
      const isOneTime = o.fee_type !== 'Tuition Fee' || !o.payment_term || o.payment_term === 'Annually';
      const term = isOneTime ? 'One-time' : o.payment_term;
      return [
        `${o.last_name}, ${o.first_name}`,
        o.grade_level || '',
        o.fee_type,
        getDisplayDescription(o),
        term,
        o.installment_number || '',
        o.school_year,
        o.due_date || '',
        o.amount,
        o.effectiveStatus,
      ].map(escape).join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');
    const sy = filterSY || 'all';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fees_obligations_${sy}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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

  const selectClass = "bg-white border border-brand-border rounded-lg px-3 py-1.5 text-sm text-brand-navy focus:outline-none focus:border-brand-steel";

  return (
    <div>
      <TopBar title="Fees & Obligations" onMenuClick={onMenuClick}>
        <button onClick={exportCSV} className="bg-white border border-brand-border hover:bg-brand-light text-brand-navy px-3 py-1.5 rounded-lg text-sm font-medium">Export CSV</button>
        {canEdit && <button onClick={() => { setEditing(null); setAssignTo('student'); setGradeLevel(''); setForm({ student_id: '', fee_type: feeTypesList[0] || 'Tuition Fee', payment_term: '', installment_number: '', school_year: getCurrentSchoolYear(), amount: '', due_date: '', description: '' }); setModalOpen(true); }} className="bg-brand-steel hover:bg-brand-teal text-white px-4 py-1.5 rounded-lg text-sm font-medium">+ Add Fee</button>}
      </TopBar>

      <div className="p-6 space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-brand-border border-l-4 border-l-brand-steel rounded-xl p-4 shadow-sm">
            <p className="text-xs text-brand-slate font-medium uppercase tracking-wider mb-1">Total Fees</p>
            <p className="text-xl font-bold font-mono text-brand-navy truncate">{formatCurrency(stats.totalFees)}</p>
          </div>
          <div className="bg-white border border-brand-border border-l-4 border-l-status-success rounded-xl p-4 shadow-sm">
            <p className="text-xs text-brand-slate font-medium uppercase tracking-wider mb-1">Total Paid</p>
            <p className="text-xl font-bold font-mono text-status-success truncate">{formatCurrency(stats.totalPaid)}</p>
          </div>
          <div className="bg-white border border-brand-border border-l-4 border-l-status-danger rounded-xl p-4 shadow-sm">
            <p className="text-xs text-brand-slate font-medium uppercase tracking-wider mb-1">Outstanding</p>
            <p className="text-xl font-bold font-mono text-status-danger truncate">{formatCurrency(stats.outstanding)}</p>
          </div>
          <div className="bg-white border border-brand-border border-l-4 border-l-status-warning rounded-xl p-4 shadow-sm">
            <p className="text-xs text-brand-slate font-medium uppercase tracking-wider mb-1">Overdue</p>
            <p className="text-xl font-bold text-status-warning truncate">{stats.overdueCount} fee{stats.overdueCount !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} className={selectClass}>
            <option value="">All Grade Levels</option>
            {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={filterFeeType} onChange={e => setFilterFeeType(e.target.value)} className={selectClass}>
            <option value="">All Fee Types</option>
            {feeTypesList.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={filterTerm} onChange={e => setFilterTerm(e.target.value)} className={selectClass}>
            <option value="">All Terms</option>
            {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
            <option value="One-time">One-time</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectClass}>
            <option value="">All Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Partial">Partial</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Overdue">Overdue</option>
          </select>
          <select value={filterSY} onChange={e => setFilterSY(e.target.value)} className={selectClass}>
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

        {/* Summary line */}
        <p className="text-sm text-brand-slate">
          Showing <span className="font-semibold text-brand-navy">{filtered.length}</span>
          {hasFilters ? ' of ' : ' '}
          {hasFilters && <span className="font-semibold text-brand-navy">{obligationsWithStatus.length}</span>}
          {' obligations · Total: '}
          <span className="font-semibold text-brand-navy font-mono">{formatCurrency(stats.totalFees)}</span>
        </p>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && canEdit && (
          <div className="bg-brand-steel/10 border border-brand-steel/30 rounded-lg px-4 py-2 flex items-center justify-between">
            <span className="text-sm text-brand-navy">
              <span className="font-semibold">{selectedIds.size}</span> selected
            </span>
            <div className="flex gap-2">
              <button onClick={() => setSelectedIds(new Set())} className="text-sm text-brand-slate hover:text-brand-navy px-3 py-1">Clear</button>
              <button onClick={handleBulkDelete} className="text-sm text-white bg-status-danger hover:bg-status-danger/90 px-3 py-1 rounded-lg">Delete Selected</button>
            </div>
          </div>
        )}

        <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                  {canEdit && (
                    <th className="px-3 py-3 w-8">
                      <input type="checkbox" checked={allOnPageSelected} onChange={togglePageSelection} className="accent-brand-steel" />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left cursor-pointer hover:text-brand-navy" onClick={() => handleSort('student')}>
                    Student <span className="ml-0.5">{sortIcon('student')}</span>
                  </th>
                  <th className="px-4 py-3 text-left cursor-pointer hover:text-brand-navy" onClick={() => handleSort('grade')}>
                    Grade <span className="ml-0.5">{sortIcon('grade')}</span>
                  </th>
                  <th className="px-4 py-3 text-left cursor-pointer hover:text-brand-navy" onClick={() => handleSort('feeType')}>
                    Fee Type <span className="ml-0.5">{sortIcon('feeType')}</span>
                  </th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-left">Term</th>
                  <th className="px-4 py-3 text-left">Installment</th>
                  <th className="px-4 py-3 text-left">S.Y.</th>
                  <th className="px-4 py-3 text-left cursor-pointer hover:text-brand-navy" onClick={() => handleSort('dueDate')}>
                    Due Date <span className="ml-0.5">{sortIcon('dueDate')}</span>
                  </th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:text-brand-navy" onClick={() => handleSort('amount')}>
                    Amount <span className="ml-0.5">{sortIcon('amount')}</span>
                  </th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map(o => {
                  const isOneTime = o.fee_type !== 'Tuition Fee' || !o.payment_term || o.payment_term === 'Annually';
                  const termDisplay = isOneTime ? 'One-time' : o.payment_term;
                  const statusColor = o.effectiveStatus === 'Paid' ? 'bg-status-success/15 text-status-success'
                    : o.effectiveStatus === 'Partial' ? 'bg-status-warning/15 text-status-warning'
                    : o.effectiveStatus === 'Overdue' ? 'bg-status-danger/20 text-status-danger border border-status-danger/40 font-bold'
                    : 'bg-status-danger/15 text-status-danger';
                  const isSelected = selectedIds.has(o.id);
                  // Due date coloring
                  let dueDateClass = 'text-brand-navy';
                  if (o.due_date) {
                    if (o.payStatus !== 'Paid' && o.due_date < today) dueDateClass = 'text-status-danger font-semibold';
                    else if (o.payStatus !== 'Paid' && o.due_date <= weekFromNow) dueDateClass = 'text-status-warning font-semibold';
                  }
                  return (
                    <tr key={o.id} className={`border-b border-brand-border/50 hover:bg-brand-light/50 ${isSelected ? 'bg-brand-steel/5' : ''}`}>
                      {canEdit && (
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleRow(o.id)} className="accent-brand-steel" />
                        </td>
                      )}
                      <td className="px-4 py-2 text-brand-navy">{o.last_name}, {o.first_name}</td>
                      <td className="px-4 py-2 text-brand-slate text-xs">{o.grade_level || '—'}</td>
                      <td className="px-4 py-2 text-brand-navy">{o.fee_type}</td>
                      <td className="px-4 py-2 text-brand-slate">{getDisplayDescription(o)}</td>
                      <td className="px-4 py-2 text-brand-navy">{termDisplay}</td>
                      <td className="px-4 py-2 text-brand-slate text-xs">{o.installment_number || <span className="text-brand-border">N/A</span>}</td>
                      <td className="px-4 py-2 font-mono text-xs text-brand-slate">{o.school_year}</td>
                      <td className={`px-4 py-2 ${dueDateClass}`}>{formatDate(o.due_date)}</td>
                      <td className="px-4 py-2 text-right font-mono text-brand-navy">{formatCurrency(o.amount)}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>{o.effectiveStatus}</span>
                      </td>
                      <td className="px-4 py-2">
                        {canEdit && <div className="flex gap-1">
                          <button onClick={() => { setEditing(o.id); setForm({ student_id: o.student_id, fee_type: o.fee_type, payment_term: o.payment_term || '', installment_number: o.installment_number || '', school_year: o.school_year, amount: o.amount, due_date: o.due_date || '', description: o.description || '' }); setModalOpen(true); }} title="Edit" className="text-brand-slate hover:text-status-warning p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => setDeleteTarget(o.id)} title="Delete" className="text-brand-slate hover:text-status-danger p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && !loading && <tr><td colSpan={canEdit ? 12 : 11} className="px-4 py-8 text-center text-brand-slate">
                  <svg className="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
                  {hasFilters ? 'No obligations match the selected filters' : 'No obligations found'}
                </td></tr>}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-brand-border">
              <span className="text-xs text-brand-slate">Page {page} of {totalPages} · {filtered.length} obligation{filtered.length !== 1 ? 's' : ''}</span>
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
