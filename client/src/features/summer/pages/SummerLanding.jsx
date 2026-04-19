import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TopBar from '../../../components/TopBar';
import Modal from '../../../components/Modal';
import { useToast } from '../../../components/Toast';
import { useAuth } from '../../../context/AuthContext';
import { summerApi } from '../utils/summerApi';
import { formatCurrency } from '../../../utils/format';

export default function SummerLanding({ onMenuClick }) {
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', school_year: '2025-2026', start_date: '', end_date: '' });
  const addToast = useToast();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('Admin');

  const load = () => {
    setLoading(true);
    summerApi.getPrograms().then(setPrograms).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const created = await summerApi.createProgram(form);
      addToast(`Program "${created.name}" created`);
      setFormOpen(false);
      setForm({ name: '', school_year: '2025-2026', start_date: '', end_date: '' });
      load();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await summerApi.updateProgram(id, { status: newStatus });
      addToast(`Program ${newStatus}`);
      load();
    } catch (err) { addToast(err.message, 'error'); }
  };

  if (loading) return (
    <div>
      <TopBar title="Apex Summer Program" onMenuClick={onMenuClick} />
      <div className="p-6 text-brand-slate">Loading…</div>
    </div>
  );

  const active = programs.filter(p => p.status === 'active');
  const others = programs.filter(p => p.status !== 'active');

  return (
    <div>
      <TopBar title="Apex Summer Program" onMenuClick={onMenuClick}>
        {isAdmin && (
          <button onClick={() => setFormOpen(true)} className="bg-brand-steel hover:bg-brand-teal text-white px-4 py-1.5 rounded-lg text-sm font-medium">
            + New Program
          </button>
        )}
      </TopBar>

      <div className="p-6 space-y-6">
        {programs.length === 0 && (
          <div className="bg-white border border-brand-border rounded-xl p-8 text-center">
            <svg className="w-12 h-12 mx-auto mb-3 text-brand-slate/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-brand-navy mb-1">No Summer Programs Yet</h3>
            <p className="text-sm text-brand-slate mb-4">Create a summer program to start managing classes, enrollments, and payments.</p>
            {isAdmin && (
              <button onClick={() => setFormOpen(true)} className="bg-brand-steel hover:bg-brand-teal text-white px-5 py-2 rounded-lg text-sm font-medium">
                Create First Program
              </button>
            )}
          </div>
        )}

        {/* Active programs — prominent cards */}
        {active.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-brand-teal uppercase tracking-wider mb-3">Active Programs</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {active.map(p => (
                <div key={p.id} className="bg-white border-2 border-status-success/30 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-brand-navy">{p.name}</h3>
                      <p className="text-xs text-brand-slate">S.Y. {p.school_year} · {p.start_date} — {p.end_date}</p>
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-status-success/15 text-status-success border border-status-success/30">
                      Active
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                    <div className="bg-brand-light rounded-lg p-2">
                      <div className="text-lg font-bold text-brand-navy">{p.class_count || 0}</div>
                      <div className="text-[10px] text-brand-slate uppercase">Classes</div>
                    </div>
                    <div className="bg-brand-light rounded-lg p-2">
                      <div className="text-lg font-bold text-brand-navy">{p.enrollment_count || 0}</div>
                      <div className="text-[10px] text-brand-slate uppercase">Enrolled</div>
                    </div>
                    <div className="bg-brand-light rounded-lg p-2">
                      <div className="text-lg font-bold text-brand-navy">—</div>
                      <div className="text-[10px] text-brand-slate uppercase">Revenue</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/summer/programs/${p.id}`} className="flex-1 text-center bg-brand-steel hover:bg-brand-teal text-white py-2 rounded-lg text-sm font-medium">
                      Manage
                    </Link>
                    {isAdmin && (
                      <button onClick={() => handleStatusChange(p.id, 'closed')} className="px-3 py-2 text-xs text-brand-slate border border-brand-border hover:bg-brand-light rounded-lg">
                        Close
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Other programs — compact list */}
        {others.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-brand-slate uppercase tracking-wider mb-3">
              {active.length > 0 ? 'Other Programs' : 'Programs'}
            </h2>
            <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">School Year</th>
                    <th className="px-4 py-3 text-left">Dates</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Classes</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {others.map(p => (
                    <tr key={p.id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                      <td className="px-4 py-2 font-medium text-brand-navy">{p.name}</td>
                      <td className="px-4 py-2 text-brand-slate font-mono text-xs">{p.school_year}</td>
                      <td className="px-4 py-2 text-brand-slate text-xs">{p.start_date} — {p.end_date}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
                          p.status === 'draft' ? 'bg-brand-steel/10 text-brand-steel border-brand-steel/30'
                          : 'bg-brand-slate/10 text-brand-slate border-brand-slate/30'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-brand-navy">{p.class_count || 0}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1 justify-center">
                          <Link to={`/summer/programs/${p.id}`} className="text-brand-steel hover:text-brand-teal text-xs underline">
                            View
                          </Link>
                          {isAdmin && p.status === 'draft' && (
                            <button onClick={() => handleStatusChange(p.id, 'active')} className="text-status-success hover:text-status-success/80 text-xs underline ml-2">
                              Activate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create program modal */}
      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title="New Summer Program">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs text-brand-slate mb-1">Program Name *</label>
            <input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} required placeholder='e.g. "Summer 2026"' className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
          </div>
          <div>
            <label className="block text-xs text-brand-slate mb-1">School Year *</label>
            <input type="text" value={form.school_year} onChange={e => setForm(prev => ({ ...prev, school_year: e.target.value }))} required placeholder="2025-2026" className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Start Date *</label>
              <input type="date" value={form.start_date} onChange={e => setForm(prev => ({ ...prev, start_date: e.target.value }))} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">End Date *</label>
              <input type="date" value={form.end_date} onChange={e => setForm(prev => ({ ...prev, end_date: e.target.value }))} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm text-white bg-brand-steel hover:bg-brand-teal rounded-lg">Create Program</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
