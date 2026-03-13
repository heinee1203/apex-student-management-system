import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { useToast } from '../components/Toast';
import { api } from '../utils/api';
import { getCurrentSchoolYear } from '../utils/schoolYear';

export default function StatementOfAccount({ onMenuClick }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(searchParams.get('student') || '');
  const schoolYear = getCurrentSchoolYear();
  const addToast = useToast();

  useEffect(() => {
    api.getStudents().then(setStudents).catch(console.error);
  }, []);

  useEffect(() => {
    if (searchParams.get('student')) {
      setSelectedStudent(searchParams.get('student'));
    }
  }, [searchParams]);

  const generateSOA = () => {
    if (!selectedStudent) { addToast('Please select a student', 'error'); return; }
    navigate(`/soa/print/${selectedStudent}?sy=${schoolYear}`);
  };

  return (
    <div>
      <TopBar title="Statement of Account" onMenuClick={onMenuClick} />
      <div className="p-6">
        <div className="bg-white border border-brand-border rounded-xl p-6 max-w-lg mx-auto">
          <h3 className="text-lg font-semibold text-brand-navy mb-6">Generate Statement of Account</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Select Student *</label>
              <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
                <option value="">Search by name or ID...</option>
                {students.map(s => <option key={s.student_id} value={s.student_id}>{s.last_name}, {s.first_name} — {s.student_id}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-brand-slate">School Year:</span>
              <span className="font-semibold text-brand-navy">{schoolYear}</span>
            </div>
            <button onClick={generateSOA} className="w-full bg-brand-steel hover:bg-brand-teal text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
              Generate SOA
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
