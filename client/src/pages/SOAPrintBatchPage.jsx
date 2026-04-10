import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SOADocument from '../components/SOADocument';
import { api } from '../utils/api';
import { getCurrentSchoolYear } from '../utils/schoolYear';

export default function SOAPrintBatchPage() {
  const [searchParams] = useSearchParams();
  const schoolYear = searchParams.get('sy') || getCurrentSchoolYear();
  const [soaList, setSoaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getBatchSOA(schoolYear)
      .then(data => { setSoaList(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [schoolYear]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#8A9EA8' }}>Loading statements...</div>;
  }

  if (error) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#C0504D' }}>Error: {error}</div>;
  }

  if (soaList.length === 0) {
    return (
      <>
        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '12px 20px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
          <button onClick={() => window.history.back()} style={{ padding: '6px 16px', fontSize: '14px', cursor: 'pointer', background: 'white', border: '1px solid #D6DDE2', borderRadius: '6px', color: '#1E3A44' }}>← Back</button>
        </div>
        <div style={{ padding: '4rem', textAlign: 'center', color: '#8A9EA8' }}>
          No students with outstanding balance for S.Y. {schoolYear}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '12px 20px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '14px', color: '#1E3A44' }}>
          <strong>{soaList.length}</strong> statement{soaList.length !== 1 ? 's' : ''} for S.Y. {schoolYear}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => window.history.back()} style={{ padding: '6px 16px', fontSize: '14px', cursor: 'pointer', background: 'white', border: '1px solid #D6DDE2', borderRadius: '6px', color: '#1E3A44' }}>← Back</button>
          <button onClick={() => window.print()} style={{ padding: '6px 16px', fontSize: '14px', cursor: 'pointer', background: '#2C5F6E', color: 'white', border: 'none', borderRadius: '6px' }}>Print All</button>
        </div>
      </div>
      {soaList.map((data, idx) => (
        <div key={data.student.student_id} style={{ pageBreakAfter: idx < soaList.length - 1 ? 'always' : 'auto' }}>
          <SOADocument data={data} />
        </div>
      ))}
    </>
  );
}
