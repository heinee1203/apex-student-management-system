import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar';
import StatCard from '../components/StatCard';
import PayStatusBadge from '../components/PayStatusBadge';
import { api } from '../utils/api';
import { formatCurrency, formatDate } from '../utils/format';

export default function Dashboard({ onMenuClick }) {
  const [stats, setStats] = useState(null);
  const [recentPayments, setRecentPayments] = useState([]);
  const [balanceList, setBalanceList] = useState([]);
  const [feeBreakdown, setFeeBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getDashboardStats(),
      api.getRecentPayments(),
      api.getBalanceList(),
      api.getFeeBreakdown(),
    ]).then(([s, rp, bl, fb]) => {
      setStats(s);
      setRecentPayments(rp);
      setBalanceList(bl);
      setFeeBreakdown(fb);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full text-brand-slate">Loading...</div>;

  return (
    <div>
      <TopBar title="Dashboard" onMenuClick={onMenuClick} />
      <div className="p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Enrolled Students" value={stats?.totalStudents || 0} color="cyan" />
          <StatCard label="Total Fees" value={formatCurrency(stats?.totalFees)} color="blue" />
          <StatCard label="Total Collected" value={formatCurrency(stats?.totalCollected)} color="emerald" />
          <StatCard label="Outstanding" value={formatCurrency(stats?.outstanding)} color="red" />
          <StatCard label="Collection Rate" value={`${stats?.collectionRate || 0}%`} color="amber" />
          <StatCard label="Fully Paid" value={stats?.fullyPaid || 0} color="purple" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Payments */}
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-brand-border">
              <h3 className="text-sm font-semibold text-brand-teal">Recent Payments</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-brand-slate border-b border-brand-border">
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Student</th>
                    <th className="px-4 py-2">Receipt</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map(p => (
                    <tr key={p.id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                      <td className="px-4 py-2 text-brand-navy">{formatDate(p.date)}</td>
                      <td className="px-4 py-2">
                        <Link to={`/students/${p.student_id}`} className="text-brand-steel hover:text-brand-teal">{p.last_name}, {p.first_name}</Link>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-brand-slate">{p.receipt_no}</td>
                      <td className="px-4 py-2 text-right font-mono text-status-success">{formatCurrency(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Students With Balance */}
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-brand-border">
              <h3 className="text-sm font-semibold text-brand-teal">Students With Balance</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-brand-slate border-b border-brand-border">
                    <th className="px-4 py-2">Student</th>
                    <th className="px-4 py-2">Grade</th>
                    <th className="px-4 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {balanceList.map(s => (
                    <tr key={s.student_id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                      <td className="px-4 py-2">
                        <Link to={`/students/${s.student_id}`} className="text-brand-steel hover:text-brand-teal">{s.last_name}, {s.first_name}</Link>
                      </td>
                      <td className="px-4 py-2 text-brand-navy">{s.grade_level}</td>
                      <td className="px-4 py-2 text-right font-mono text-status-danger">{formatCurrency(s.balance)}</td>
                    </tr>
                  ))}
                  {balanceList.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-brand-slate">All students are fully paid</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Fee Breakdown */}
        <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-brand-border">
            <h3 className="text-sm font-semibold text-brand-teal">Fee Breakdown by Type</h3>
          </div>
          <div className="p-5 space-y-3">
            {feeBreakdown.map(fb => (
              <div key={fb.fee_type}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-brand-navy">{fb.fee_type}</span>
                  <span className="font-mono text-brand-slate">{formatCurrency(fb.total_assessed)}</span>
                </div>
                <div className="w-full bg-brand-light rounded-full h-2">
                  <div
                    className="bg-brand-steel h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(fb.rate, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
