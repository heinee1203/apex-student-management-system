import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { useToast } from '../components/Toast';
import { api } from '../utils/api';
import { formatCurrency } from '../utils/format';
import { getCurrentSchoolYear } from '../utils/schoolYear';

export default function StatementOfAccount({ onMenuClick }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(searchParams.get('student') || '');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [showAllStatuses, setShowAllStatuses] = useState(true);
  const schoolYear = getCurrentSchoolYear();
  const gradeLevels = ['Nursery 1', 'Nursery 2', 'Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];
  const addToast = useToast();

  // Visible students: enrolled OR any student with outstanding balance > 0,
  // optionally narrowed by grade level and "show all statuses" toggle
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (gradeFilter !== 'all' && s.grade_level !== gradeFilter) return false;
      if (!showAllStatuses) {
        // Show only enrolled + any student still owing money
        if (s.status !== 'Enrolled' && (s.balance || 0) <= 0) return false;
      }
      return true;
    });
  }, [students, gradeFilter, showAllStatuses]);

  useEffect(() => {
    // Fetch all students regardless of status so non-enrolled students with
    // arrears (e.g. Pelausa, Calma) can still have SOAs generated for them.
    api.getStudents().then(setStudents).catch(console.error);
  }, []);

  useEffect(() => {
    if (searchParams.get('student')) {
      setSelectedStudent(searchParams.get('student'));
    }
  }, [searchParams]);

  const generateSOA = () => {
    if (!selectedStudent) { addToast('Please select a student', 'error'); return; }
    navigate(`/soa/print/${selectedStudent}?sy=${schoolYear}&t=${Date.now()}`);
  };

  const generateBatchSOA = () => {
    navigate(`/soa/print-batch?sy=${schoolYear}&t=${Date.now()}`);
  };

  return (
    <div>
      <TopBar title="Statement of Account" onMenuClick={onMenuClick} />
      <div className="p-6">
        <div className="bg-white border border-brand-border rounded-xl p-6 max-w-lg mx-auto">
          <h3 className="text-lg font-semibold text-brand-navy mb-6">Generate Statement of Account</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Grade Level</label>
              <select value={gradeFilter} onChange={e => { setGradeFilter(e.target.value); setSelectedStudent(''); }} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
                <option value="all">All Grade Levels</option>
                {gradeLevels.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="flex items-center justify-between text-xs text-brand-slate mb-1">
                <span>Select Student *</span>
                <label className="flex items-center gap-1.5 cursor-pointer font-normal">
                  <input type="checkbox" checked={showAllStatuses} onChange={e => { setShowAllStatuses(e.target.checked); setSelectedStudent(''); }} className="accent-brand-steel" />
                  <span>Show all statuses</span>
                </label>
              </label>
              <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
                <option value="">Search by name or ID...</option>
                {filteredStudents.map(s => {
                  const bal = s.balance > 0 ? ` · Bal ${formatCurrency(s.balance)}` : '';
                  const statusTag = s.status !== 'Enrolled' ? ` · ${s.status}` : '';
                  return (
                    <option key={s.student_id} value={s.student_id}>
                      {s.last_name}, {s.first_name} — {s.student_id}{statusTag}{bal}
                    </option>
                  );
                })}
              </select>
              <p className="text-xs text-brand-slate mt-1">{filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''} in list</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-brand-slate">School Year:</span>
              <span className="font-semibold text-brand-navy">{schoolYear}</span>
            </div>
            <button onClick={generateSOA} className="w-full bg-brand-steel hover:bg-brand-teal text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
              Generate SOA
            </button>
            <button onClick={generateBatchSOA} className="w-full bg-white hover:bg-brand-light text-brand-navy border border-brand-border py-2.5 rounded-lg text-sm font-medium transition-colors">
              Print All With Balance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
