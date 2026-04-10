import { formatCurrency, formatDate } from '../utils/format';

export default function SOADocument({ data }) {
  if (!data) return null;

  const { student, obligations, payments, totals, schoolInfo, payment_term, school_year, arrears } = data;
  const today = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  // Uniform name format: LAST NAME, FIRST NAME MIDDLE NAME — uppercase
  const fullName = `${student.last_name}, ${student.first_name}${student.middle_name ? ' ' + student.middle_name : ''}`.toUpperCase().trim();

  // Monospace font style for numbers
  const mono = { fontFamily: "'JetBrains Mono', monospace" };

  // Table cell styles — comfortable padding, readable sizes
  const th = {
    border: '1px solid #2C5F6E',
    padding: '4px 10px',
    fontSize: '8.5pt',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  };
  const thR = { ...th, textAlign: 'right' };
  const thC = { ...th, textAlign: 'center' };
  const td = {
    border: '1px solid #D6DDE2',
    padding: '2px 10px',
    fontSize: '9.5pt',
  };
  const tdR = { ...td, textAlign: 'right', ...mono };
  const tdC = { ...td, textAlign: 'center' };
  const thArr = {
    border: '1px solid #C0504D',
    padding: '4px 10px',
    fontSize: '8.5pt',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  };

  // Status colors
  const statusColor =
    totals.status === 'FULLY PAID' ? '#2E8B6A'
    : totals.status === 'NO OUTSTANDING BALANCE' ? '#2C5F6E'
    : '#C0504D';

  return (
    <div
      className="soa-document bg-white text-black mx-auto shadow-xl rounded-lg"
      style={{
        fontFamily: "'Inter', sans-serif",
        width: '8.5in',
        minHeight: '11in',
        padding: '0.4in',
        fontSize: '9.5pt',
        lineHeight: 1.45,
        color: '#1E3A44',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header — school branding */}
      <div
        className="text-center"
        style={{ borderBottom: '2.5px solid #2C5F6E', paddingBottom: '8px', marginBottom: '8px' }}
      >
        <img
          src="/apex-logo.png"
          alt="Apex Learning Academy"
          className="mx-auto rounded-full object-cover"
          style={{ width: '52px', height: '52px', marginBottom: '5px' }}
        />
        <h1 className="font-bold uppercase" style={{ color: '#2C5F6E', fontSize: '15pt', letterSpacing: '0.5px', marginBottom: '2px' }}>
          {schoolInfo.school_name || 'Apex Learning Academy Incorporated'}
        </h1>
        <p style={{ fontSize: '9pt', color: '#4B5563', lineHeight: 1.3, marginBottom: '1px' }}>
          {schoolInfo.school_address || 'School Address'}
        </p>
        <p style={{ fontSize: '8.5pt', color: '#6B7280', lineHeight: 1.3 }}>
          {schoolInfo.school_contact} &nbsp;|&nbsp; {schoolInfo.school_email} &nbsp;|&nbsp; {schoolInfo.school_website}
        </p>
      </div>

      {/* Title */}
      <h2
        className="text-center font-bold uppercase"
        style={{
          color: '#1E3A44',
          fontSize: '13pt',
          letterSpacing: '2px',
          margin: '0 0 6px',
          paddingBottom: '6px',
          borderBottom: '1px solid #D6DDE2',
        }}
      >
        Statement of Account
      </h2>

      {/* Student Info — generous spacing, two-column grid */}
      <div
        className="soa-student-info flex rounded"
        style={{
          border: '1px solid #D6DDE2',
          backgroundColor: '#F4F6F8',
          padding: '9px 14px',
          margin: '6px 0 8px',
          fontSize: '9.5pt',
          lineHeight: 1.45,
          gap: '14px',
        }}
      >
        {student.photo_url && (
          <img
            src={student.photo_url}
            alt=""
            className="rounded object-cover flex-shrink-0"
            style={{ width: '64px', height: '64px', border: '1px solid #D6DDE2' }}
          />
        )}
        <div className="grid grid-cols-2 flex-1" style={{ gap: '1px 28px' }}>
          <div className="col-span-2" style={{ marginBottom: '1px' }}>
            <span className="font-semibold" style={{ color: '#2C5F6E' }}>Student Name:&nbsp;</span>
            <strong style={{ fontSize: '10.5pt' }}>{fullName}</strong>
          </div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Student ID:&nbsp;</span><span style={mono}>{student.student_id}</span></div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>LRN:&nbsp;</span><span style={mono}>{student.lrn || '—'}</span></div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Grade/Year:&nbsp;</span>{student.grade_level}</div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Section:&nbsp;</span>{student.section || '—'}</div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Payment Term:&nbsp;</span>{payment_term || student?.payment_term || '—'}</div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>S.Y.:&nbsp;</span>{school_year}</div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Status:&nbsp;</span>{student.status}</div>
          <div><span className="font-semibold" style={{ color: '#2C5F6E' }}>Date Issued:&nbsp;</span>{today}</div>
        </div>
      </div>

      {/* Previous Arrears */}
      {arrears && arrears.length > 0 && (
        <div className="soa-section" style={{ pageBreakInside: 'avoid', marginBottom: '8px' }}>
          <h3 className="font-bold uppercase" style={{ color: '#C0504D', fontSize: '10pt', letterSpacing: '0.4px', margin: '0 0 4px' }}>
            Previous Arrears (Prior Year Fees)
          </h3>
          <table className="w-full" style={{ border: '1px solid #D6DDE2', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#C0504D', color: 'white' }}>
                <th style={{ ...thArr, textAlign: 'left' }}>School Year</th>
                <th style={{ ...thArr, textAlign: 'right' }}>Amount (₱)</th>
              </tr>
            </thead>
            <tbody>
              {arrears.map((a, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#FBFAF9' }}>
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
      <div className="soa-section" style={{ pageBreakInside: 'avoid', marginBottom: '8px' }}>
        <h3 className="font-bold uppercase" style={{ color: '#2C5F6E', fontSize: '10pt', letterSpacing: '0.4px', margin: '0 0 4px' }}>
          Assessed Fees
        </h3>
        <table className="w-full" style={{ border: '1px solid #D6DDE2', borderCollapse: 'collapse' }}>
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
              <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#FBFAF9' }}>
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
      <div className="soa-section" style={{ marginBottom: '8px' }}>
        <h3 className="font-bold uppercase" style={{ color: '#2C5F6E', fontSize: '10pt', letterSpacing: '0.4px', margin: '0 0 4px' }}>
          Payment History
        </h3>
        <table className="w-full" style={{ border: '1px solid #D6DDE2', borderCollapse: 'collapse' }}>
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
              <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#FBFAF9' }}>
                <td style={td}>{formatDate(p.date)}</td>
                <td style={{ ...td, ...mono }}>{p.receipt_no}</td>
                <td style={td}>{p.method}</td>
                <td style={tdR}>{formatCurrency(p.amount)}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={4} style={{ ...tdC, color: '#8A9EA8', padding: '18px' }}>No payments recorded</td></tr>
            )}
            <tr style={{ backgroundColor: '#E8EDF0', fontWeight: 'bold' }}>
              <td style={td} colSpan={3}>TOTAL PAYMENTS</td>
              <td style={tdR}>{formatCurrency(totals.totalPaid)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bottom block — pushed to bottom of page via flex, signatures always sit near page bottom */}
      <div style={{ marginTop: 'auto', pageBreakInside: 'avoid' }}>
        {/* Summary */}
        <div
          className="soa-summary-box rounded"
          style={{
            border: '2px solid #2C5F6E',
            backgroundColor: '#F4F6F8',
            padding: '10px 18px',
            margin: '0 auto 10px',
            width: '66%',
          }}
        >
          <div className="grid grid-cols-2" style={{ gap: '2px 16px', fontSize: '10pt', lineHeight: 1.6, ...mono }}>
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
            <span className="text-right font-bold" style={{ color: '#C0504D', fontSize: '12pt' }}>{formatCurrency(totals.remainingBalance || totals.balance)}</span>
            <span className="font-bold" style={{ color: '#1E3A44' }}>STATUS:</span>
            <span className="text-right font-bold" style={{ color: statusColor, fontSize: '12pt' }}>{totals.status}</span>
          </div>
        </div>

        {/* Note */}
        <p className="italic text-center" style={{ color: '#8A9EA8', fontSize: '8.5pt', marginTop: '8px', marginBottom: '4px' }}>
          Note: Please settle remaining balance before the due date to avoid penalties.
        </p>

        {/* Signatures — spread with flexbox space-between, wide underscored lines */}
        <div
          className="soa-signatures flex justify-between"
          style={{ fontSize: '9pt', marginTop: '18px', gap: '40px' }}
        >
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #1E3A44', width: '220px', paddingTop: '22px', margin: '0 auto 3px' }} />
            <p style={{ color: '#4B5563', fontWeight: 500 }}>Prepared by</p>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #1E3A44', width: '220px', paddingTop: '22px', margin: '0 auto 3px' }} />
            <p style={{ color: '#4B5563', fontWeight: 500 }}>Registrar: {schoolInfo.registrar_name || '_______________'}</p>
          </div>
        </div>

        <p className="text-center" style={{ color: '#8A9EA8', fontSize: '8pt', marginTop: '10px' }}>
          — This is a system-generated document —
        </p>
      </div>
    </div>
  );
}
