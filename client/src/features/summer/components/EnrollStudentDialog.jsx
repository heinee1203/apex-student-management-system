import { useState } from 'react';
import Modal from '../../../components/Modal';
import { useToast } from '../../../components/Toast';
import { summerApi } from '../utils/summerApi';

const GRADES = ['Nursery 1', 'Nursery 2', 'Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];

export default function EnrollStudentDialog({ isOpen, onClose, classId, onSuccess }) {
  const [tab, setTab] = useState('internal'); // 'internal' | 'external'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searching, setSearching] = useState(false);
  const [extForm, setExtForm] = useState({
    external_full_name: '', external_grade_level: 'Grade 1',
    external_parent_name: '', external_parent_contact: '',
  });
  const [discount, setDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const addToast = useToast();

  const handleSearch = async (q) => {
    setSearchQuery(q);
    setSelectedStudent(null);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await summerApi.searchStudents(q);
      setSearchResults(results);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = {
        summer_class_id: classId,
        discount: parseFloat(discount) || 0,
        discount_reason: discountReason || undefined,
      };
      if (tab === 'internal') {
        if (!selectedStudent) { addToast('Select a student', 'error'); setSubmitting(false); return; }
        data.student_id = selectedStudent.id;
        data.is_external = false;
      } else {
        data.is_external = true;
        data.external_full_name = extForm.external_full_name;
        data.external_grade_level = extForm.external_grade_level;
        data.external_parent_name = extForm.external_parent_name;
        data.external_parent_contact = extForm.external_parent_contact;
      }
      const result = await summerApi.createEnrollment(data);
      addToast(`Enrolled successfully — Fee: ₱${result.total_due}`);
      // Reset
      setSearchQuery(''); setSearchResults([]); setSelectedStudent(null);
      setExtForm({ external_full_name: '', external_grade_level: 'Grade 1', external_parent_name: '', external_parent_contact: '' });
      setDiscount(''); setDiscountReason('');
      onSuccess?.();
    } catch (err) { addToast(err.message, 'error'); }
    finally { setSubmitting(false); }
  };

  const inputCls = "w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Enroll Student" wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tab toggle */}
        <div className="flex border-b border-brand-border mb-2">
          <button type="button" onClick={() => setTab('internal')}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'internal' ? 'border-brand-steel text-brand-teal' : 'border-transparent text-brand-slate'}`}>
            Existing Apex Student
          </button>
          <button type="button" onClick={() => setTab('external')}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'external' ? 'border-brand-steel text-brand-teal' : 'border-transparent text-brand-slate'}`}>
            External Student
          </button>
        </div>

        {tab === 'internal' && (
          <div>
            <label className="block text-xs text-brand-slate mb-1">Search by name or Student ID</label>
            <input type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)} placeholder="Type at least 2 characters…" className={inputCls} />
            {searching && <p className="text-xs text-brand-slate mt-1">Searching…</p>}
            {searchResults.length > 0 && (
              <div className="mt-2 border border-brand-border rounded-lg max-h-40 overflow-y-auto">
                {searchResults.map(s => (
                  <button key={s.id} type="button"
                    onClick={() => { setSelectedStudent(s); setSearchResults([]); setSearchQuery(`${s.last_name}, ${s.first_name}`); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-brand-light/50 border-b border-brand-border/30 ${selectedStudent?.id === s.id ? 'bg-brand-steel/10' : ''}`}>
                    <span className="font-medium text-brand-navy">{s.last_name}, {s.first_name}</span>
                    <span className="text-brand-slate text-xs ml-2">{s.grade_level} · {s.student_id}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedStudent && (
              <div className="mt-2 bg-status-success/5 border border-status-success/20 rounded-lg px-3 py-2 text-sm">
                Selected: <strong>{selectedStudent.last_name}, {selectedStudent.first_name}</strong> — {selectedStudent.grade_level} ({selectedStudent.student_id})
              </div>
            )}
          </div>
        )}

        {tab === 'external' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Full Name *</label>
              <input type="text" value={extForm.external_full_name} onChange={e => setExtForm(f => ({ ...f, external_full_name: e.target.value }))} required={tab === 'external'} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">Grade Level *</label>
              <select value={extForm.external_grade_level} onChange={e => setExtForm(f => ({ ...f, external_grade_level: e.target.value }))} className={inputCls}>
                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-brand-slate mb-1">Parent Name</label>
                <input type="text" value={extForm.external_parent_name} onChange={e => setExtForm(f => ({ ...f, external_parent_name: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-brand-slate mb-1">Parent Contact</label>
                <input type="text" value={extForm.external_parent_contact} onChange={e => setExtForm(f => ({ ...f, external_parent_contact: e.target.value }))} placeholder="09XX-XXX-XXXX" className={inputCls} />
              </div>
            </div>
          </div>
        )}

        {/* Discount (optional) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-brand-slate mb-1">Discount (₱)</label>
            <input type="number" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0.00" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-brand-slate mb-1">Discount Reason</label>
            <input type="text" value={discountReason} onChange={e => setDiscountReason(e.target.value)} placeholder="e.g. Sibling, early bird" className={inputCls} />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">Cancel</button>
          <button type="submit" disabled={submitting || (tab === 'internal' && !selectedStudent)} className="px-4 py-2 text-sm text-white bg-status-success hover:bg-status-success/90 rounded-lg disabled:opacity-50">
            {submitting ? 'Enrolling…' : 'Enroll Student'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
