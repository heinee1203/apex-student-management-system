import { formatCurrency, formatDate } from '../utils/format';

export default function SOADocument({ data }) {
  if (!data) return null;

  const { student, obligations, payments, totals, schoolInfo, payment_term, school_year } = data;
  const today = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="soa-document bg-white text-black mx-auto shadow-xl rounded-lg" style={{ fontFamily: "'Inter', sans-serif", width: '8.5in', minHeight: '11in', padding: '0.5in' }}>
      {/* Header */}
      <div className="text-center mb-6 pb-4" style={{ borderBottom: '3px solid #2C5F6E' }}>
        <img src="/apex-logo.png" alt="Apex Learning Academy" className="mx-auto mb-2 rounded-full object-cover" style={{ width: '60px', height: '60px' }} />
        <h1 className="text-xl font-bold uppercase tracking-wide" style={{ color: '#2C5F6E' }}>{schoolInfo.school_name || 'Apex Learning Academy Incorporated'}</h1>
        <p className="text-sm text-gray-600">{schoolInfo.school_address || 'School Address'}</p>
        <p className="text-xs text-gray-500 mt-1">
          {schoolInfo.school_contact} | {schoolInfo.school_email} | {schoolInfo.school_website}
        </p>
      </div>

      <h2 className="text-center text-lg font-bold mb-6 tracking-widest uppercase" style={{ color: '#1E3A44' }}>Statement of Account</h2>

      {/* Student Info */}
      <div className="soa-student-info grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-6 rounded p-4" style={{ border: '1px solid #D6DDE2', backgroundColor: '#F4F6F8' }}>
        <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Student Name:</span> {student.first_name} {student.middle_name ? student.middle_name + ' ' : ''}{student.last_name}</div>
        <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Student ID:</span> <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{student.student_id}</span></div>
        <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Grade/Year:</span> {student.grade_level}</div>
        <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Section:</span> {student.section || '—'}</div>
        <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Payment Term:</span> {payment_term || student?.payment_term || '—'}</div>
        <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>S.Y.:</span> {school_year}</div>
        <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Scholarship:</span> {student.scholarship || 'None'}</div>
        <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Status:</span> {student.status}</div>
        <div className="col-span-2"><span className="font-semibold" style={{ color: '#2C5F6E' }}>Date Issued:</span> {today}</div>
      </div>

      {/* Assessed Fees */}
      <h3 className="font-bold text-sm mb-2 uppercase tracking-wider" style={{ color: '#2C5F6E' }}>Assessed Fees</h3>
      <table className="w-full mb-4 text-sm" style={{ border: '1px solid #D6DDE2' }}>
        <thead>
          <tr style={{ backgroundColor: '#2C5F6E', color: 'white' }}>
            <th className="px-3 py-1.5 text-left" style={{ border: '1px solid #2C5F6E' }}>Fee Type</th>
            <th className="px-3 py-1.5 text-left" style={{ border: '1px solid #2C5F6E' }}>Description</th>
            <th className="px-3 py-1.5 text-left" style={{ border: '1px solid #2C5F6E' }}>Due Date</th>
            <th className="px-3 py-1.5 text-center" style={{ border: '1px solid #2C5F6E' }}>Installment</th>
            <th className="px-3 py-1.5 text-right" style={{ border: '1px solid #2C5F6E' }}>Amount (₱)</th>
          </tr>
        </thead>
        <tbody>
          {obligations.map((o, i) => (
            <tr key={i}>
              <td className="px-3 py-1" style={{ border: '1px solid #D6DDE2' }}>{o.fee_type}</td>
              <td className="px-3 py-1" style={{ border: '1px solid #D6DDE2' }}>{o.description || '—'}</td>
              <td className="px-3 py-1" style={{ border: '1px solid #D6DDE2' }}>{o.due_date ? formatDate(o.due_date) : '—'}</td>
              <td className="px-3 py-1 text-center" style={{ border: '1px solid #D6DDE2' }}>{o.installment_number || '—'}</td>
              <td className="px-3 py-1 text-right" style={{ border: '1px solid #D6DDE2', fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(o.amount)}</td>
            </tr>
          ))}
          <tr style={{ backgroundColor: '#E8EDF0' }} className="font-bold">
            <td className="px-3 py-1.5" colSpan={4} style={{ border: '1px solid #D6DDE2' }}>TOTAL FEES</td>
            <td className="px-3 py-1.5 text-right" style={{ border: '1px solid #D6DDE2', fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(totals.totalFees)}</td>
          </tr>
        </tbody>
      </table>

      {/* Scholarship line */}
      <div className="flex justify-between text-sm mb-1 px-1">
        <span>Less: Scholarship Discount</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>(₱0.00)</span>
      </div>
      <hr style={{ borderColor: '#D6DDE2' }} className="mb-1" />
      <div className="flex justify-between text-sm font-bold mb-4 px-1" style={{ color: '#1E3A44' }}>
        <span>NET ASSESSED FEES</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(totals.totalFees)}</span>
      </div>

      {/* Payment History */}
      <h3 className="font-bold text-sm mb-2 uppercase tracking-wider" style={{ color: '#2C5F6E' }}>Payment History</h3>
      <table className="w-full mb-6 text-sm" style={{ border: '1px solid #D6DDE2' }}>
        <thead>
          <tr style={{ backgroundColor: '#2C5F6E', color: 'white' }}>
            <th className="px-3 py-1.5 text-left" style={{ border: '1px solid #2C5F6E' }}>Date</th>
            <th className="px-3 py-1.5 text-left" style={{ border: '1px solid #2C5F6E' }}>Receipt</th>
            <th className="px-3 py-1.5 text-left" style={{ border: '1px solid #2C5F6E' }}>Method</th>
            <th className="px-3 py-1.5 text-right" style={{ border: '1px solid #2C5F6E' }}>Amount (₱)</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p, i) => (
            <tr key={i}>
              <td className="px-3 py-1" style={{ border: '1px solid #D6DDE2' }}>{formatDate(p.date)}</td>
              <td className="px-3 py-1" style={{ border: '1px solid #D6DDE2', fontFamily: "'JetBrains Mono', monospace" }}>{p.receipt_no}</td>
              <td className="px-3 py-1" style={{ border: '1px solid #D6DDE2' }}>{p.method}</td>
              <td className="px-3 py-1 text-right" style={{ border: '1px solid #D6DDE2', fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(p.amount)}</td>
            </tr>
          ))}
          {payments.length === 0 && (
            <tr><td colSpan={4} className="px-3 py-2 text-center" style={{ border: '1px solid #D6DDE2', color: '#8A9EA8' }}>No payments recorded</td></tr>
          )}
          <tr style={{ backgroundColor: '#E8EDF0' }} className="font-bold">
            <td className="px-3 py-1.5" colSpan={3} style={{ border: '1px solid #D6DDE2' }}>TOTAL PAYMENTS</td>
            <td className="px-3 py-1.5 text-right" style={{ border: '1px solid #D6DDE2', fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(totals.totalPaid)}</td>
          </tr>
        </tbody>
      </table>

      {/* Summary */}
      <div className="soa-summary-box rounded p-4 mb-6" style={{ border: '2px solid #2C5F6E', backgroundColor: '#F4F6F8' }}>
        <div className="grid grid-cols-2 gap-2 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <span className="font-bold" style={{ color: '#1E3A44' }}>TOTAL FEES:</span><span className="text-right">{formatCurrency(totals.totalFees)}</span>
          <span className="font-bold" style={{ color: '#1E3A44' }}>TOTAL PAID:</span><span className="text-right" style={{ color: '#2E8B6A' }}>{formatCurrency(totals.totalPaid)}</span>
          <span className="font-bold" style={{ color: '#1E3A44' }}>REMAINING BALANCE:</span><span className="text-right font-bold" style={{ color: '#C0504D' }}>{formatCurrency(totals.balance)}</span>
          <span className="font-bold" style={{ color: '#1E3A44' }}>STATUS:</span><span className="text-right font-bold">{totals.status}</span>
        </div>
      </div>

      {/* Note */}
      <p className="text-xs italic mb-8" style={{ color: '#8A9EA8' }}>
        Note: Please settle remaining balance before the due date to avoid penalties.
      </p>

      {/* Signatures */}
      <div className="soa-signatures grid grid-cols-2 gap-8 text-sm mt-12">
        <div>
          <div className="mb-1 pt-8" style={{ borderBottom: '1px solid #1E3A44' }} />
          <p>Prepared by</p>
        </div>
        <div>
          <div className="mb-1 pt-8" style={{ borderBottom: '1px solid #1E3A44' }} />
          <p>Registrar: {schoolInfo.registrar_name || '_______________'}</p>
        </div>
      </div>

      <p className="text-center text-xs mt-8" style={{ color: '#8A9EA8' }}>— This is a system-generated document —</p>
    </div>
  );
}
