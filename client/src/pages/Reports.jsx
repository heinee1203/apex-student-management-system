import { useState, useEffect } from 'react';
import TopBar from '../components/TopBar';
import { api } from '../utils/api';
import { formatCurrency } from '../utils/format';
import { getCurrentSchoolYear, getAvailableSchoolYears } from '../utils/schoolYear';

// CSV export helper
function exportCSV(filename, headers, rows) {
  const escape = v => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const rateColor = r => r >= 80 ? 'text-status-success' : r >= 50 ? 'text-status-warning' : 'text-status-danger';

// Compact "Export CSV" button used on each card header — hidden on print
function ExportBtn({ onClick }) {
  return (
    <button onClick={onClick} className="no-print text-xs bg-white border border-brand-border hover:bg-brand-light text-brand-navy px-2 py-1 rounded">Export CSV</button>
  );
}

export default function Reports({ onMenuClick }) {
  const [gradeReport, setGradeReport] = useState([]);
  const [methodReport, setMethodReport] = useState([]);
  const [overdueReport, setOverdueReport] = useState([]);
  const [receivables, setReceivables] = useState({ students: [], summary: { count: 0, totalBalance: 0, totalFees: 0, totalPaid: 0 } });
  const [enrollment, setEnrollment] = useState({ rows: [], totals: {}, statuses: [] });
  const [termDist, setTermDist] = useState([]);
  const [aging, setAging] = useState({ rows: [], totals: { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 } });
  const [collectionsMonth, setCollectionsMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [collections, setCollections] = useState({ rows: [], total: 0, paymentCount: 0 });
  const [enrollmentYear, setEnrollmentYear] = useState(getCurrentSchoolYear());
  const schoolYears = getAvailableSchoolYears();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getReportByGradeLevel(),
      api.getReportByPaymentMethod(),
      api.getReportOverdue(),
      api.getReceivables(),
      api.getEnrollmentSummary(enrollmentYear),
      api.getPaymentTermDistribution(),
      api.getAgingReport(),
    ]).then(([g, m, o, r, en, tdist, a]) => {
      setGradeReport(g);
      setMethodReport(m);
      setOverdueReport(o);
      setReceivables(r);
      setEnrollment(en);
      setTermDist(tdist);
      setAging(a);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.getCollectionsDaily({ month: collectionsMonth })
      .then(setCollections)
      .catch(console.error);
  }, [collectionsMonth]);

  // Re-fetch enrollment summary when the selected school year changes
  useEffect(() => {
    api.getEnrollmentSummary(enrollmentYear)
      .then(setEnrollment)
      .catch(console.error);
  }, [enrollmentYear]);

  if (loading) return <div className="flex items-center justify-center h-64 text-brand-slate"><svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>Loading...</div>;

  return (
    <div>
      <TopBar title="Reports" onMenuClick={onMenuClick}>
        <button onClick={() => window.print()} className="bg-brand-steel hover:bg-brand-teal text-white px-4 py-1.5 rounded-lg text-sm font-medium">Print Page</button>
      </TopBar>
      <div className="p-6 space-y-6">
        {/* Enrollment Summary */}
        <div className="report-card bg-white border border-brand-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-brand-border flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-brand-teal">Enrollment Summary</h3>
            <div className="flex items-center gap-2">
              <label className="no-print text-xs text-brand-slate">School Year:</label>
              <select
                value={enrollmentYear}
                onChange={e => setEnrollmentYear(e.target.value)}
                className="no-print bg-white border border-brand-border rounded-lg px-2 py-1 text-xs text-brand-navy font-mono focus:outline-none focus:border-brand-steel"
              >
                {schoolYears.map(sy => <option key={sy} value={sy}>{sy}</option>)}
              </select>
              <ExportBtn onClick={() => exportCSV(
                `enrollment_summary_${enrollmentYear}.csv`,
                ['Grade Level', ...enrollment.statuses, 'Total'],
                [...enrollment.rows.map(r => [r.grade_level, ...enrollment.statuses.map(s => r[s]), r.total]),
                 ['TOTAL', ...enrollment.statuses.map(s => enrollment.totals[s]), enrollment.totals.total]]
              )} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                  <th className="px-4 py-2 text-left">Grade Level</th>
                  {enrollment.statuses.map(s => <th key={s} className="px-4 py-2 text-right">{s}</th>)}
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {enrollment.rows.map(r => (
                  <tr key={r.grade_level} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                    <td className="px-4 py-2 text-brand-navy">{r.grade_level}</td>
                    {enrollment.statuses.map(s => <td key={s} className="px-4 py-2 text-right text-brand-navy">{r[s] || 0}</td>)}
                    <td className="px-4 py-2 text-right font-semibold text-brand-navy">{r.total}</td>
                  </tr>
                ))}
                {enrollment.rows.length > 0 && (
                  <tr className="bg-brand-light font-semibold">
                    <td className="px-4 py-2 text-brand-navy">TOTAL</td>
                    {enrollment.statuses.map(s => <td key={s} className="px-4 py-2 text-right text-brand-navy">{enrollment.totals[s] || 0}</td>)}
                    <td className="px-4 py-2 text-right text-brand-navy">{enrollment.totals.total || 0}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Collection by Grade Level */}
        <div className="report-card bg-white border border-brand-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-brand-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-brand-teal">Collection by Grade Level</h3>
            <ExportBtn onClick={() => exportCSV(
              'collection_by_grade.csv',
              ['Grade', 'Students', 'Total Fees', 'Collected', 'Rate %'],
              gradeReport.map(r => [r.grade_level, r.student_count, r.total_fees, r.collected, r.rate])
            )} />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                <th className="px-4 py-2 text-left">Grade/Year Level</th>
                <th className="px-4 py-2 text-right">Students</th>
                <th className="px-4 py-2 text-right">Total Fees</th>
                <th className="px-4 py-2 text-right">Collected</th>
                <th className="px-4 py-2 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {gradeReport.map(r => (
                <tr key={r.grade_level} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                  <td className="px-4 py-2 text-brand-navy">{r.grade_level}</td>
                  <td className="px-4 py-2 text-right text-brand-navy">{r.student_count}</td>
                  <td className="px-4 py-2 text-right font-mono text-brand-navy">{formatCurrency(r.total_fees)}</td>
                  <td className="px-4 py-2 text-right font-mono text-status-success">{formatCurrency(r.collected)}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`font-mono ${rateColor(r.rate)}`}>{r.rate}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Payment Term Distribution */}
        <div className="report-card bg-white border border-brand-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-brand-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-brand-teal">Payment Term Distribution</h3>
            <ExportBtn onClick={() => exportCSV(
              'payment_term_distribution.csv',
              ['Term', 'Students', 'Total Fees', 'Collected', 'Rate %'],
              termDist.map(r => [r.term, r.student_count, r.total_fees, r.collected, r.rate])
            )} />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                <th className="px-4 py-2 text-left">Term</th>
                <th className="px-4 py-2 text-right">Students</th>
                <th className="px-4 py-2 text-right">Total Fees</th>
                <th className="px-4 py-2 text-right">Collected</th>
                <th className="px-4 py-2 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {termDist.map(r => (
                <tr key={r.term} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                  <td className="px-4 py-2 text-brand-navy">{r.term}</td>
                  <td className="px-4 py-2 text-right text-brand-navy">{r.student_count}</td>
                  <td className="px-4 py-2 text-right font-mono text-brand-navy">{formatCurrency(r.total_fees)}</td>
                  <td className="px-4 py-2 text-right font-mono text-status-success">{formatCurrency(r.collected)}</td>
                  <td className="px-4 py-2 text-right"><span className={`font-mono ${rateColor(r.rate)}`}>{r.rate}%</span></td>
                </tr>
              ))}
              {termDist.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-brand-slate">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Payments by Method */}
        <div className="report-card bg-white border border-brand-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-brand-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-brand-teal">Payments by Method</h3>
            <ExportBtn onClick={() => exportCSV(
              'payments_by_method.csv',
              ['Method', 'Transactions', 'Total', 'Share %'],
              methodReport.map(r => [r.method, r.transaction_count, r.total_amount, r.share])
            )} />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                <th className="px-4 py-2 text-left">Method</th>
                <th className="px-4 py-2 text-right">Transactions</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {methodReport.map(r => (
                <tr key={r.method} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                  <td className="px-4 py-2 text-brand-navy">{r.method}</td>
                  <td className="px-4 py-2 text-right text-brand-navy">{r.transaction_count}</td>
                  <td className="px-4 py-2 text-right font-mono text-status-success">{formatCurrency(r.total_amount)}</td>
                  <td className="px-4 py-2 text-right font-mono text-brand-navy">{r.share}%</td>
                </tr>
              ))}
              {methodReport.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-brand-slate">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Daily Collections */}
        <div className="report-card bg-white border border-brand-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-brand-border flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-brand-teal">Daily Collections</h3>
            <div className="flex items-center gap-2">
              <label className="no-print text-xs text-brand-slate">Month:</label>
              <input
                type="month"
                value={collectionsMonth}
                onChange={e => setCollectionsMonth(e.target.value)}
                className="no-print bg-white border border-brand-border rounded-lg px-2 py-1 text-xs text-brand-navy focus:outline-none focus:border-brand-steel"
              />
              <span className="hidden print:inline text-xs text-brand-slate" style={{ display: 'none' }}>{collectionsMonth}</span>
              <ExportBtn onClick={() => exportCSV(
                `collections_${collectionsMonth}.csv`,
                ['Date', 'Payments', 'Total'],
                collections.rows.map(r => [r.date, r.payment_count, r.total])
              )} />
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-right">Payments</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {collections.rows.map(r => (
                <tr key={r.date} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                  <td className="px-4 py-2 text-brand-navy">{r.date}</td>
                  <td className="px-4 py-2 text-right text-brand-navy">{r.payment_count}</td>
                  <td className="px-4 py-2 text-right font-mono text-status-success">{formatCurrency(r.total)}</td>
                </tr>
              ))}
              {collections.rows.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-brand-slate">No collections for {collectionsMonth}</td></tr>
              )}
              {collections.rows.length > 0 && (
                <tr className="bg-brand-light font-semibold">
                  <td className="px-4 py-2 text-brand-navy">TOTAL</td>
                  <td className="px-4 py-2 text-right text-brand-navy">{collections.paymentCount}</td>
                  <td className="px-4 py-2 text-right font-mono text-status-success">{formatCurrency(collections.total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Aging Report */}
        <div className="report-card bg-white border border-brand-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-brand-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-brand-teal">Accounts Receivable Aging</h3>
            <ExportBtn onClick={() => exportCSV(
              'aging_report.csv',
              ['Student', 'Grade', 'Status', 'Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total'],
              aging.rows.map(r => [`${r.last_name}, ${r.first_name}`, r.grade_level, r.status, r.current, r.d30, r.d60, r.d90, r.d90plus, r.total])
            )} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                  <th className="px-4 py-2 text-left">Student</th>
                  <th className="px-4 py-2 text-left">Grade</th>
                  <th className="px-4 py-2 text-right">Current</th>
                  <th className="px-4 py-2 text-right">1-30 days</th>
                  <th className="px-4 py-2 text-right">31-60 days</th>
                  <th className="px-4 py-2 text-right">61-90 days</th>
                  <th className="px-4 py-2 text-right">90+ days</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {aging.rows.map(r => (
                  <tr key={r.student_id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                    <td className="px-4 py-2 text-brand-navy">{r.last_name}, {r.first_name}</td>
                    <td className="px-4 py-2 text-brand-slate text-xs">{r.grade_level}</td>
                    <td className="px-4 py-2 text-right font-mono text-brand-navy">{formatCurrency(r.current)}</td>
                    <td className="px-4 py-2 text-right font-mono text-status-warning">{formatCurrency(r.d30)}</td>
                    <td className="px-4 py-2 text-right font-mono text-status-warning">{formatCurrency(r.d60)}</td>
                    <td className="px-4 py-2 text-right font-mono text-status-danger">{formatCurrency(r.d90)}</td>
                    <td className="px-4 py-2 text-right font-mono text-status-danger font-semibold">{formatCurrency(r.d90plus)}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-brand-navy">{formatCurrency(r.total)}</td>
                  </tr>
                ))}
                {aging.rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-brand-slate">No outstanding balances</td></tr>
                )}
                {aging.rows.length > 0 && (
                  <tr className="bg-brand-light font-semibold">
                    <td className="px-4 py-2 text-brand-navy" colSpan={2}>TOTAL</td>
                    <td className="px-4 py-2 text-right font-mono text-brand-navy">{formatCurrency(aging.totals.current)}</td>
                    <td className="px-4 py-2 text-right font-mono text-status-warning">{formatCurrency(aging.totals.d30)}</td>
                    <td className="px-4 py-2 text-right font-mono text-status-warning">{formatCurrency(aging.totals.d60)}</td>
                    <td className="px-4 py-2 text-right font-mono text-status-danger">{formatCurrency(aging.totals.d90)}</td>
                    <td className="px-4 py-2 text-right font-mono text-status-danger">{formatCurrency(aging.totals.d90plus)}</td>
                    <td className="px-4 py-2 text-right font-mono text-status-danger">{formatCurrency(aging.totals.total)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Overdue Accounts */}
        <div className="report-card bg-white border border-brand-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-brand-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-brand-teal">Overdue Accounts</h3>
            <ExportBtn onClick={() => exportCSV(
              'overdue_accounts.csv',
              ['Student', 'Grade', 'Balance', 'Overdue Fees'],
              overdueReport.map(r => [`${r.last_name}, ${r.first_name}`, r.grade_level, r.balance, r.overdue_count])
            )} />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                <th className="px-4 py-2 text-left">Student</th>
                <th className="px-4 py-2 text-left">Grade</th>
                <th className="px-4 py-2 text-right">Balance</th>
                <th className="px-4 py-2 text-right">Overdue Fees</th>
              </tr>
            </thead>
            <tbody>
              {overdueReport.map(r => (
                <tr key={r.student_id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                  <td className="px-4 py-2 text-brand-navy">{r.last_name}, {r.first_name}</td>
                  <td className="px-4 py-2 text-brand-navy">{r.grade_level}</td>
                  <td className="px-4 py-2 text-right font-mono text-status-danger">{formatCurrency(r.balance)}</td>
                  <td className="px-4 py-2 text-right text-status-danger">{r.overdue_count}</td>
                </tr>
              ))}
              {overdueReport.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-brand-slate">No overdue accounts</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Year-End Receivables — now uses shared helper, no school_year filter */}
        <div className="report-card bg-white border border-brand-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-brand-border flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-brand-teal">Year-End Receivables</h3>
            <ExportBtn onClick={() => exportCSV(
              'receivables.csv',
              ['Student', 'Grade', 'Status', 'Total Fees', 'Total Paid', 'Balance'],
              receivables.students.map(r => [`${r.last_name}, ${r.first_name}`, r.grade_level, r.status, r.total_fees, r.total_paid, r.balance])
            )} />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                <th className="px-4 py-2 text-left">Student</th>
                <th className="px-4 py-2 text-left">Grade</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Total Fees</th>
                <th className="px-4 py-2 text-right">Total Paid</th>
                <th className="px-4 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {receivables.students.map(r => (
                <tr key={r.student_id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                  <td className="px-4 py-2 text-brand-navy">{r.last_name}, {r.first_name}</td>
                  <td className="px-4 py-2 text-brand-navy">{r.grade_level}</td>
                  <td className="px-4 py-2 text-brand-slate text-xs">{r.status}</td>
                  <td className="px-4 py-2 text-right font-mono text-brand-navy">{formatCurrency(r.total_fees)}</td>
                  <td className="px-4 py-2 text-right font-mono text-status-success">{formatCurrency(r.total_paid)}</td>
                  <td className="px-4 py-2 text-right font-mono text-status-danger font-semibold">{formatCurrency(r.balance)}</td>
                </tr>
              ))}
              {receivables.students.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-brand-slate">No outstanding receivables</td></tr>
              )}
              {receivables.students.length > 0 && (
                <tr className="bg-brand-light font-semibold">
                  <td className="px-4 py-2 text-brand-navy" colSpan={3}>TOTAL ({receivables.summary.count} student{receivables.summary.count !== 1 ? 's' : ''})</td>
                  <td className="px-4 py-2 text-right font-mono text-brand-navy">{formatCurrency(receivables.summary.totalFees)}</td>
                  <td className="px-4 py-2 text-right font-mono text-status-success">{formatCurrency(receivables.summary.totalPaid)}</td>
                  <td className="px-4 py-2 text-right font-mono text-status-danger">{formatCurrency(receivables.summary.totalBalance)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
