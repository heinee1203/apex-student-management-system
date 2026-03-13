import { useState, useEffect } from 'react';
import TopBar from '../components/TopBar';
import { api } from '../utils/api';
import { formatCurrency } from '../utils/format';

export default function Reports({ onMenuClick }) {
  const [gradeReport, setGradeReport] = useState([]);
  const [methodReport, setMethodReport] = useState([]);
  const [scholarshipReport, setScholarshipReport] = useState([]);
  const [overdueReport, setOverdueReport] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getReportByGradeLevel(),
      api.getReportByPaymentMethod(),
      api.getReportScholarships(),
      api.getReportOverdue(),
    ]).then(([g, m, s, o]) => {
      setGradeReport(g);
      setMethodReport(m);
      setScholarshipReport(s);
      setOverdueReport(o);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full text-brand-slate">Loading...</div>;

  return (
    <div>
      <TopBar title="Reports" onMenuClick={onMenuClick} />
      <div className="p-6 space-y-6">
        {/* Collection by Grade Level */}
        <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-brand-border">
            <h3 className="text-sm font-semibold text-brand-teal">Collection by Grade Level</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-brand-slate border-b border-brand-border">
                <th className="px-4 py-2">Grade/Year Level</th>
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
                    <span className={`font-mono ${r.rate >= 80 ? 'text-status-success' : r.rate >= 50 ? 'text-status-warning' : 'text-status-danger'}`}>{r.rate}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Payments by Method */}
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-brand-border">
              <h3 className="text-sm font-semibold text-brand-teal">Payments by Method</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-brand-slate border-b border-brand-border">
                  <th className="px-4 py-2">Method</th>
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
              </tbody>
            </table>
          </div>

          {/* Scholarship Distribution */}
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-brand-border">
              <h3 className="text-sm font-semibold text-brand-teal">Scholarship Distribution</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-brand-slate border-b border-brand-border">
                  <th className="px-4 py-2">Scholarship Type</th>
                  <th className="px-4 py-2 text-right">Students</th>
                </tr>
              </thead>
              <tbody>
                {scholarshipReport.map(r => (
                  <tr key={r.scholarship} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                    <td className="px-4 py-2 text-brand-navy">{r.scholarship}</td>
                    <td className="px-4 py-2 text-right text-brand-navy">{r.student_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Overdue Accounts */}
        <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-brand-border">
            <h3 className="text-sm font-semibold text-brand-teal">Overdue Accounts</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-brand-slate border-b border-brand-border">
                <th className="px-4 py-2">Student</th>
                <th className="px-4 py-2">Grade</th>
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
      </div>
    </div>
  );
}
