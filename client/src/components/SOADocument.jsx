import { formatCurrency, formatDate } from '../utils/format';

export default function SOADocument({ data }) {
  if (!data) return null;

  const { student, obligations, payments, totals, schoolInfo, payment_term, school_year, arrears } = data;
  const today = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  // Uniform name format: LAST NAME, FIRST NAME MIDDLE NAME — uppercase
  const fullName = `${student.last_name}, ${student.first_name}${student.middle_name ? ' ' + student.middle_name : ''}`.toUpperCase().trim();

  // Monospace font style for numbers
  const mono = { fontFamily: "'JetBrains Mono', monospace" };

  // Cell styles — tight padding to fit on one page
  const th = { border: '1px solid #2C5F6E', padding: '3px 6px', fontSize: '9px' };
  const thR = { ...th, textAlign: 'right' };
  const thC = { ...th, textAlign: 'center' };
  const td = { border: '1px solid #D6DDE2', padding: '2px 6px', fontSize: '10px' };
  const tdR = { ...td, textAlign: 'right', ...mono };
  const tdC = { ...td, textAlign: 'center' };
  const thArr = { border: '1px solid #C0504D', padding: '3px 6px', fontSize: '9px' };

  return (
    <div
      className="soa-document bg-white text-black mx-auto shadow-xl rounded-lg"
      style={{
        fontFamily: "'Inter', sans-serif",
        width: '8.5in',
        minHeight: '11in',
        padding: '0.4in',
        fontSize: '11px',
        lineHeight: 1.3,
      }}
    >
      {/* Header — compact */}
      <div className="text-center" style={{ borderBottom: '2px solid #2C5F6E', paddingBottom: '6px', marginBottom: '8px' }}>
        <img
          src="/apex-logo.png"
          alt="Apex Learning Academy"
          className="mx-auto rounded-full object-cover"
          style={{ width: '42px', height: '42px', marginBottom: '4px' }}
        />
        <h1 className="font-bold uppercase tracking-wide" style={{ color: '#2C5F6E', fontSize: '14px', marginBottom: '1px' }}>
          {schoolInfo.school_name || 'Apex Learning Academy Incorporated'}
        </h1>
        <p style={{ fontSize: '9px', color: '#4B5563', lineHeight: 1.2 }}>{schoolInfo.school_address || 'School Address'}</p>
        <p style={{ fontSize: '9px', color: '#6B7280', lineHeight: 1.2 }}>
          {schoolInfo.school_contact} | {schoolInfo.school_email} | {schoolInfo.school_website}
        </p>
      </div>

      {/* Title */}
      <h2
        className="text-center font-bold tracking-widest uppercase"
        style={{ color: '#1E3A44', fontSize: '13px', margin: '6px 0' }}
      >
        Statement of Account
      </h2>

      {/* Student Info — compact */}
      <div
        className="soa-student-info flex gap-3 rounded"
        style={{ border: '1px solid #D6DDE2', backgroundColor: '#F4F6F8', padding: '8px 10px', marginBottom: '8px', fontSize: '10px' }}
      >
        {student.photo_url && (
          <img
            src={student.photo_url}
            alt=""
            className="rounded object-cover flex-shrink-0"
            style={{ width: '52px', height: '52px', border: '1px solid #D6DDE2' }}
          />
        )}
        <div className="grid grid-cols-2 flex-1" style={{ gap: '2px 24px' }}>
          <div className="col-span-2"><span className="font-semibold" style={{ color: '#2C5F6E' }}>Student Name:</span> <strong>{fullName}</strong></div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Student ID:</span> <span style={mono}>{student.student_id}</span></div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>LRN:</span> <span style={mono}>{student.lrn || '—'}</span></div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Grade/Year:</span> {student.grade_level}</div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Section:</span> {student.section || '—'}</div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Payment Term:</span> {payment_term || student?.payment_term || '—'}</div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>S.Y.:</span> {school_year}</div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Status:</span> {student.status}</div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Date Issued:</span> {today}</div>
        </div>
      </div>

      {/* Previous Arrears */}
      {arrears && arrears.length > 0 && (
        <div className="soa-section" style={{ pageBreakInside: 'avoid' }}>
          <h3 className="font-bold uppercase tracking-wider" style={{ color: '#C0504D', fontSize: '10px', margin: '6px 0 3px' }}>
            Previous Arrears (Prior Year Fees)
          </h3>
          <table className="w-full" style={{ border: '1px solid #D6DDE2', marginBottom: '6px' }}>
            <thead>
              <tr style={{ backgroundColor: '#C0504D', color: 'white' }}>
                <th style={{ ...thArr, textAlign: 'left' }}>School Year</th>
                <th style={{ ...thArr, textAlign: 'right' }}>Amount (₱)</th>
              </tr>
            </thead>
            <tbody>
              {arrears.map((a, i) => (
                <tr key={i}>
                  <td style={td}>{a.school_year}</td>
                  <td style={{ ...tdR, fontWeight: 'bold', color: '#C0504D' }}>{formatCurrency(a.total_fees)}</td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#E8EDF0', fontWeight: 'bold' }}>
                <td style={td}>TOTAL ARREARS</td>
                <td style={{ ...tdR, color: '#C0504D' }}>{formatCurrency(totals.arrears)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Assessed Fees */}
      <div className="soa-section" style={{ pageBreakInside: 'avoid' }}>
        <h3 className="font-bold uppercase tracking-wider" style={{ color: '#2C5F6E', fontSize: '10px', margin: '6px 0 3px' }}>
          Assessed Fees
        </h3>
        <table className="w-full" style={{ border: '1px solid #D6DDE2', marginBottom: '6px' }}>
          <thead>
            <tr style={{ backgroundColor: '#2C5F6E', color: 'white' }}>
              <th style={{ ...th, textAlign: 'left' }}>Fee Type</th>
              <th style={{ ...th, textAlign: 'left' }}>Description</th>
              <th style={{ ...th, textAlign: 'left' }}>Due Date</th>
              <th style={thC}>Installment</th>
              <th style={thR}>Amount (₱)</th>
            </tr>
          </thead>
          <tbody>
            {obligations.map((o, i) => (
              <tr key={i}>
                <td style={td}>{o.fee_type}</td>
                <td style={td}>{o.description || '—'}</td>
                <td style={td}>{o.due_date ? formatDate(o.due_date) : '—'}</td>
                <td style={tdC}>{o.installment_number || '—'}</td>
                <td style={tdR}>{formatCurrency(o.amount)}</td>
              </tr>
            ))}
            <tr style={{ backgroundColor: '#E8EDF0', fontWeight: 'bold' }}>
              <td style={td} colSpan={4}>TOTAL FEES</td>
              <td style={tdR}>{formatCurrency(totals.totalFees)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Payment History */}
      <h3 className="font-bold uppercase tracking-wider" style={{ color: '#2C5F6E', fontSize: '10px', margin: '6px 0 3px' }}>
        Payment History
      </h3>
      <table className="w-full" style={{ border: '1px solid #D6DDE2', marginBottom: '6px' }}>
        <thead>
          <tr style={{ backgroundColor: '#2C5F6E', color: 'white' }}>
            <th style={{ ...th, textAlign: 'left' }}>Date</th>
            <th style={{ ...th, textAlign: 'left' }}>Receipt</th>
            <th style={{ ...th, textAlign: 'left' }}>Method</th>
            <th style={thR}>Amount (₱)</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p, i) => (
            <tr key={i}>
              <td style={td}>{formatDate(p.date)}</td>
              <td style={{ ...td, ...mono }}>{p.receipt_no}</td>
              <td style={td}>{p.method}</td>
              <td style={tdR}>{formatCurrency(p.amount)}</td>
            </tr>
          ))}
          {payments.length === 0 && (
            <tr><td colSpan={4} style={{ ...tdC, color: '#8A9EA8', padding: '6px' }}>No payments recorded</td></tr>
          )}
          <tr style={{ backgroundColor: '#E8EDF0', fontWeight: 'bold' }}>
            <td style={td} colSpan={3}>TOTAL PAYMENTS</td>
            <td style={tdR}>{formatCurrency(totals.totalPaid)}</td>
          </tr>
        </tbody>
      </table>

      {/* Summary — keep with signatures so they stay on the same page */}
      <div style={{ pageBreakInside: 'avoid' }}>
        <div
          className="soa-summary-box rounded"
          style={{ border: '2px solid #2C5F6E', backgroundColor: '#F4F6F8', padding: '6px 10px', marginTop: '6px', marginBottom: '6px' }}
        >
          <div className="grid grid-cols-2" style={{ gap: '2px 8px', fontSize: '10px', ...mono }}>
            {totals.arrears > 0 && (
              <>
                <span className="font-bold" style={{ color: '#C0504D' }}>PRIOR YEAR FEES:</span>
                <span className="text-right" style={{ color: '#C0504D' }}>{formatCurrency(totals.arrears)}</span>
              </>
            )}
            <span className="font-bold" style={{ color: '#1E3A44' }}>CURRENT FEES:</span>
            <span className="text-right">{formatCurrency(totals.currentFees || totals.totalFees)}</span>
            {totals.arrears > 0 && (
              <>
                <span className="font-bold" style={{ color: '#1E3A44' }}>TOTAL OBLIGATIONS:</span>
                <span className="text-right">{formatCurrency(totals.totalObligations)}</span>
              </>
            )}
            <span className="font-bold" style={{ color: '#1E3A44' }}>TOTAL PAID:</span>
            <span className="text-right" style={{ color: '#2E8B6A' }}>{formatCurrency(totals.totalPaid)}</span>
            <span className="font-bold" style={{ color: '#1E3A44' }}>REMAINING BALANCE:</span>
            <span className="text-right font-bold" style={{ color: '#C0504D' }}>{formatCurrency(totals.remainingBalance || totals.balance)}</span>
            <span className="font-bold" style={{ color: '#1E3A44' }}>STATUS:</span>
            <span className="text-right font-bold" style={{ color: totals.status === 'FULLY PAID' ? '#2E8B6A' : totals.status === 'NO OUTSTANDING BALANCE' ? '#2C5F6E' : '#C0504D' }}>{totals.status}</span>
          </div>
        </div>

        {/* Note */}
        <p className="italic" style={{ color: '#8A9EA8', fontSize: '8px', margin: '4px 0 8px' }}>
          Note: Please settle remaining balance before the due date to avoid penalties.
        </p>

        {/* Signatures */}
        <div className="soa-signatures grid grid-cols-2" style={{ gap: '2rem', fontSize: '10px', marginTop: '8px' }}>
          <div>
            <div style={{ borderBottom: '1px solid #1E3A44', paddingTop: '18px', marginBottom: '2px' }} />
            <p>Prepared by</p>
          </div>
          <div>
            <div style={{ borderBottom: '1px solid #1E3A44', paddingTop: '18px', marginBottom: '2px' }} />
            <p>Registrar: {schoolInfo.registrar_name || '_______________'}</p>
          </div>
        </div>

        <p className="text-center" style={{ color: '#8A9EA8', fontSize: '8px', marginTop: '6px' }}>
          — This is a system-generated document —
        </p>
      </div>
    </div>
  );
}
