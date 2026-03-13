import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import SOADocument from '../components/SOADocument';
import { api } from '../utils/api';
import { getCurrentSchoolYear } from '../utils/schoolYear';

export default function SOAPrintPage() {
  const { studentId } = useParams();
  const [searchParams] = useSearchParams();
  const schoolYear = searchParams.get('sy') || getCurrentSchoolYear();
  const [soaData, setSoaData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getSOA(studentId, { school_year: schoolYear })
      .then(data => { setSoaData(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [studentId, schoolYear]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#8A9EA8' }}>Loading Statement of Account...</div>;
  }

  if (error) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#C0504D' }}>Error: {error}</div>;
  }

  return (
    <>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '12px 20px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
        <button onClick={() => window.history.back()} style={{ padding: '6px 16px', fontSize: '14px', cursor: 'pointer', background: 'white', border: '1px solid #D6DDE2', borderRadius: '6px', color: '#1E3A44' }}>
          ← Back
        </button>
        <button onClick={() => window.print()} style={{ padding: '6px 16px', fontSize: '14px', cursor: 'pointer', background: '#2C5F6E', color: 'white', border: 'none', borderRadius: '6px' }}>
          Print
        </button>
      </div>
      <SOADocument data={soaData} />
    </>
  );
}
