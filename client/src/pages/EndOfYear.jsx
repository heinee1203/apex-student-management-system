import { useState, useEffect, useMemo } from 'react';
import TopBar from '../components/TopBar';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { api } from '../utils/api';
import { formatCurrency } from '../utils/format';

// End of School Year — 3-step wizard (Admin only).
//
//   Step 1 — Pre-flight summary: aggregate counts for the current year,
//            list of students with balance, warning banner. Read-only.
//   Step 2 — Dry-run preview: per-student transition table with current
//            grade / new grade, current status / new status, balance
//            that will carry forward as prior arrears.
//   Step 3 — Typed-confirmation modal: admin types "CLOSE {SY}" to
//            unlock the red execute button. Calls POST, shows result.
//
// The wizard also handles the "year already closed" case by hiding
// the wizard and showing a revert panel.

const StatCard = ({ label, value, sub, tone = 'neutral' }) => {
  const toneCls = {
    neutral: 'border-l-brand-steel',
    success: 'border-l-status-success',
    danger: 'border-l-status-danger',
    warning: 'border-l-status-warning',
  }[tone] || 'border-l-brand-steel';
  return (
    <div className={`bg-white border border-brand-border border-l-4 ${toneCls} rounded-xl p-4 shadow-sm`}>
      <div className="text-xs text-brand-slate font-medium uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-bold font-mono text-brand-navy truncate">{value}</div>
      {sub && <div className="text-xs text-brand-slate mt-1">{sub}</div>}
    </div>
  );
};

export default function EndOfYear({ onMenuClick }) {
  const addToast = useToast();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [revertConfirmText, setRevertConfirmText] = useState('');
  const [reverting, setReverting] = useState(false);

  const load = () => {
    setLoading(true);
    api.eoyPreview()
      .then(setPreview)
      .catch(err => addToast(err.message || 'Failed to load preview', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const expectedConfirm = useMemo(
    () => preview ? `CLOSE ${preview.currentSchoolYear}` : '',
    [preview]
  );
  const expectedRevertConfirm = useMemo(
    () => preview ? `REVERT ${preview.currentSchoolYear}` : '',
    [preview]
  );

  const executeEoy = async () => {
    if (confirmText !== expectedConfirm) return;
    setExecuting(true);
    try {
      const res = await api.eoyExecute({
        schoolYear: preview.currentSchoolYear,
        confirm: expectedConfirm,
      });
      setResult(res);
      setConfirmModalOpen(false);
      setConfirmText('');
      addToast('School year closed successfully');
    } catch (err) {
      addToast(err.message || 'EOY execution failed', 'error');
    } finally {
      setExecuting(false);
    }
  };

  const revertEoy = async () => {
    if (revertConfirmText !== expectedRevertConfirm) return;
    setReverting(true);
    try {
      const res = await api.eoyRevert({
        schoolYear: preview.currentSchoolYear,
        confirm: expectedRevertConfirm,
      });
      addToast(`Reverted ${res.restored} students from snapshot`);
      setRevertModalOpen(false);
      setRevertConfirmText('');
      load();
    } catch (err) {
      addToast(err.message || 'Revert failed', 'error');
    } finally {
      setReverting(false);
    }
  };

  if (loading) {
    return (
      <div>
        <TopBar title="End of School Year" onMenuClick={onMenuClick} />
        <div className="p-6 text-brand-slate">Loading pre-flight data…</div>
      </div>
    );
  }

  if (!preview) return null;

  // ─── After successful execution: show result card ────────────────
  if (result) {
    return (
      <div>
        <TopBar title="End of School Year" onMenuClick={onMenuClick} />
        <div className="p-6 max-w-3xl mx-auto">
          <div className="bg-status-success/5 border-2 border-status-success/30 rounded-xl p-6 mb-4">
            <h2 className="text-lg font-bold text-status-success mb-2">✓ School Year Closed Successfully</h2>
            <p className="text-sm text-brand-navy mb-4">
              S.Y. <strong>{result.previousYear}</strong> is now locked. The active school year is now <strong>{result.newYear}</strong>.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Promoted" value={result.summary.promoted} tone="success" />
              <StatCard label="Graduated" value={result.summary.graduated} tone="success" />
              <StatCard label="Unchanged" value={result.summary.unchanged} />
              <StatCard label="Arrears Carried" value={formatCurrency(result.summary.totalArrearsCarried)} tone="warning" />
            </div>
          </div>
          <button
            onClick={() => { setResult(null); load(); }}
            className="bg-brand-steel hover:bg-brand-teal text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Back to EOY Page
          </button>
        </div>
      </div>
    );
  }

  // ─── If the current year is already locked: show revert panel ────
  if (preview.alreadyLocked) {
    return (
      <div>
        <TopBar title="End of School Year" onMenuClick={onMenuClick} />
        <div className="p-6 max-w-3xl mx-auto">
          <div className="bg-brand-light border border-brand-border rounded-xl p-6 mb-4">
            <h2 className="text-lg font-bold text-brand-navy mb-2">🔒 S.Y. {preview.currentSchoolYear} is already closed</h2>
            <p className="text-sm text-brand-slate mb-4">
              The active school year is <strong>{preview.nextSchoolYear}</strong>. S.Y. {preview.currentSchoolYear} is read-only —
              no new enrollments, fees, or payments can be recorded for that year.
            </p>
            <p className="text-sm text-brand-slate mb-4">
              If this was done in error, you can restore every student to their pre-EOY state.
              The revert reads from the snapshot captured at close time, so grade levels,
              statuses, and sections are all restored.
            </p>
            <button
              onClick={() => setRevertModalOpen(true)}
              className="bg-status-danger hover:bg-status-danger/90 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              Revert End of Year
            </button>
          </div>
        </div>

        <Modal isOpen={revertModalOpen} onClose={() => setRevertModalOpen(false)} title="Revert End of Year">
          <div className="space-y-4">
            <div className="bg-status-danger/5 border border-status-danger/30 rounded-lg p-4 text-sm text-brand-navy">
              <p className="font-semibold mb-2">This will:</p>
              <ul className="list-disc list-inside space-y-1 text-brand-slate">
                <li>Restore every student to their pre-EOY grade, status, and section</li>
                <li>Unlock S.Y. {preview.currentSchoolYear}</li>
                <li>Set {preview.currentSchoolYear} back as the active school year</li>
                <li>Keep the audit trail (this revert itself is logged)</li>
              </ul>
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">
                Type <code className="font-mono bg-brand-light px-1">{expectedRevertConfirm}</code> to confirm
              </label>
              <input
                type="text"
                value={revertConfirmText}
                onChange={e => setRevertConfirmText(e.target.value)}
                placeholder={expectedRevertConfirm}
                className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm font-mono text-brand-navy focus:outline-none focus:border-brand-steel"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setRevertModalOpen(false)} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">Cancel</button>
              <button
                onClick={revertEoy}
                disabled={revertConfirmText !== expectedRevertConfirm || reverting}
                className="px-4 py-2 text-sm text-white bg-status-danger hover:bg-status-danger/90 rounded-lg disabled:opacity-40"
              >
                {reverting ? 'Reverting…' : 'Revert EOY'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // ─── Step 1: Pre-flight summary ───────────────────────────────────
  const { summary, withBalance, currentSchoolYear, nextSchoolYear, nextYearTuitionExists } = preview;

  return (
    <div>
      <TopBar title="End of School Year" onMenuClick={onMenuClick} />

      <div className="p-6 max-w-5xl mx-auto">

        {/* Step indicator */}
        <div className="flex items-center justify-between mb-6 text-xs text-brand-slate">
          {[
            { n: 1, label: 'Pre-flight Summary' },
            { n: 2, label: 'Preview Changes' },
            { n: 3, label: 'Confirm & Execute' },
          ].map(({ n, label }, i, arr) => (
            <div key={n} className="flex items-center flex-1">
              <div className={`flex items-center gap-2 ${step >= n ? 'text-brand-teal font-semibold' : ''}`}>
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border-2 ${step >= n ? 'bg-brand-steel text-white border-brand-steel' : 'border-brand-border text-brand-slate'}`}>
                  {n}
                </span>
                {label}
              </div>
              {i < arr.length - 1 && <div className="flex-1 h-px bg-brand-border mx-3" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <>
            {/* Warning banner */}
            <div className="bg-status-warning/5 border-l-4 border-status-warning rounded-lg p-4 mb-6">
              <p className="text-sm text-brand-navy">
                <strong>⚠ End-of-Year</strong> will promote enrolled students to the next grade level,
                lock the current school year from edits, and transition the system to <strong>{nextSchoolYear}</strong>.
                This action can be reverted but should only be performed when the school year has officially ended.
              </p>
            </div>

            {/* Header card */}
            <div className="bg-white border border-brand-border rounded-xl p-5 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-brand-slate uppercase tracking-wider">Current School Year</div>
                  <div className="text-2xl font-bold text-brand-navy font-mono">{currentSchoolYear}</div>
                </div>
                <div className="text-brand-slate text-2xl">→</div>
                <div className="text-right">
                  <div className="text-xs text-brand-slate uppercase tracking-wider">Will Transition To</div>
                  <div className="text-2xl font-bold text-brand-teal font-mono">{nextSchoolYear}</div>
                </div>
              </div>
              {!nextYearTuitionExists && (
                <div className="mt-3 text-xs text-status-warning">
                  ⚠ No tuition rates exist for {nextSchoolYear}. Set them up in Settings → Tuition Fee Schedule before re-enrolling students for the new year.
                </div>
              )}
            </div>

            {/* Student counts */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              <StatCard label="Total" value={summary.total} />
              <StatCard label="Enrolled" value={summary.enrolled} tone="success" />
              <StatCard label="Not Enrolled" value={summary.notEnrolled} />
              <StatCard label="Dropped" value={summary.dropped} />
              <StatCard label="LOA" value={summary.loa} />
              <StatCard label="Graduated" value={summary.graduated} />
            </div>

            {/* Money */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <StatCard label="Fully Paid (enrolled)" value={summary.fullyPaid} tone="success" />
              <StatCard label="With Outstanding Balance" value={summary.withBalance} tone="warning" />
              <StatCard label="Total Arrears Carried" value={formatCurrency(summary.totalArrearsCarried)} tone="danger" />
            </div>

            {/* Students with balance list */}
            <div className="bg-white border border-brand-border rounded-xl overflow-hidden mb-6">
              <div className="px-5 py-3 border-b border-brand-border">
                <h3 className="text-sm font-semibold text-brand-teal">Students With Balance ({withBalance.length})</h3>
                <p className="text-xs text-brand-slate">These balances will carry forward as prior-year arrears in {nextSchoolYear}.</p>
              </div>
              {withBalance.length === 0 ? (
                <div className="px-5 py-6 text-sm text-center text-brand-slate">No students with outstanding balances. 🎉</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-brand-slate bg-brand-light border-b border-brand-border">
                      <th className="px-4 py-2 text-left">Student</th>
                      <th className="px-4 py-2 text-left">Grade</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withBalance.map(s => (
                      <tr key={s.student_id} className="border-b border-brand-border/50">
                        <td className="px-4 py-2 text-brand-navy">{s.name}</td>
                        <td className="px-4 py-2 text-brand-slate">{s.grade_level}</td>
                        <td className="px-4 py-2"><StatusBadge status={s.status} /></td>
                        <td className="px-4 py-2 text-right font-mono text-status-danger">{formatCurrency(s.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setStep(2)}
                className="bg-brand-steel hover:bg-brand-teal text-white px-6 py-2.5 rounded-lg text-sm font-medium"
              >
                Continue to Preview →
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="bg-brand-light border border-brand-border rounded-lg p-4 mb-4 text-sm space-y-1 text-brand-slate">
              <p className="font-semibold text-brand-navy">Rules applied:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Enrolled students → grade promoted by 1, status becomes "Not Enrolled" in the new year (must re-enroll)</li>
                <li>Grade 6 Enrolled students → status becomes "Graduated" (grade stays)</li>
                <li>Not Enrolled / Dropped / LOA / Registered → no changes</li>
                <li>Balances carry forward automatically as prior-year arrears (per-student, not reset)</li>
                <li>S.Y. {currentSchoolYear} will be locked — no further writes allowed</li>
              </ul>
            </div>

            <div className="bg-white border border-brand-border rounded-xl overflow-hidden mb-4">
              <div className="px-5 py-3 border-b border-brand-border">
                <h3 className="text-sm font-semibold text-brand-teal">Per-Student Transitions ({preview.students.length})</h3>
              </div>
              <div className="overflow-x-auto max-h-[60vh]">
                <table className="w-full text-sm">
                  <thead className="bg-brand-light sticky top-0">
                    <tr className="text-xs text-brand-slate border-b border-brand-border">
                      <th className="px-4 py-2 text-left">Student</th>
                      <th className="px-4 py-2 text-left">Current Grade</th>
                      <th className="px-4 py-2 text-left">→ New Grade</th>
                      <th className="px-4 py-2 text-left">Current Status</th>
                      <th className="px-4 py-2 text-left">→ New Status</th>
                      <th className="px-4 py-2 text-right">Balance Carried</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.students.map(p => {
                      const changed = p.action !== 'unchanged';
                      return (
                        <tr key={p.student_id} className={`border-b border-brand-border/50 ${changed ? '' : 'opacity-70'}`}>
                          <td className="px-4 py-2 text-brand-navy">{p.name}</td>
                          <td className="px-4 py-2 text-brand-slate">{p.current_grade}</td>
                          <td className={`px-4 py-2 ${p.current_grade !== p.new_grade ? 'text-brand-teal font-semibold' : 'text-brand-slate'}`}>
                            {p.new_grade}{p.current_grade === p.new_grade && ' (no change)'}
                          </td>
                          <td className="px-4 py-2"><StatusBadge status={p.current_status} /></td>
                          <td className="px-4 py-2"><StatusBadge status={p.new_status} /></td>
                          <td className="px-4 py-2 text-right font-mono">
                            {p.balance_carried > 0
                              ? <span className="text-status-danger">{formatCurrency(p.balance_carried)}</span>
                              : <span className="text-brand-slate">₱0.00</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">
                ← Back to Summary
              </button>
              <button
                onClick={() => { setConfirmText(''); setConfirmModalOpen(true); }}
                className="bg-status-danger hover:bg-status-danger/90 text-white px-6 py-2.5 rounded-lg text-sm font-medium"
              >
                Execute End-of-Year →
              </button>
            </div>
          </>
        )}
      </div>

      {/* Confirmation modal */}
      <Modal
        isOpen={confirmModalOpen}
        onClose={() => { if (!executing) setConfirmModalOpen(false); }}
        title={`Close School Year ${currentSchoolYear}?`}
      >
        <div className="space-y-4">
          <div className="bg-status-danger/5 border border-status-danger/30 rounded-lg p-4 text-sm text-brand-navy">
            <p className="font-semibold mb-2">This will:</p>
            <ul className="list-disc list-inside space-y-1 text-brand-slate">
              <li>Promote {summary.promoting} enrolled student{summary.promoting !== 1 ? 's' : ''} to the next grade level</li>
              {summary.graduating > 0 && <li>Graduate {summary.graduating} Grade 6 student{summary.graduating !== 1 ? 's' : ''}</li>}
              <li>Lock S.Y. {currentSchoolYear} — no further writes allowed</li>
              <li>Set {nextSchoolYear} as the active school year</li>
              <li>Carry forward {formatCurrency(summary.totalArrearsCarried)} in outstanding balances as arrears</li>
            </ul>
            <p className="mt-3 text-xs text-brand-slate italic">
              A full per-student snapshot is captured before any changes, so this operation
              can be reverted from the EOY page if needed.
            </p>
          </div>
          <div>
            <label className="block text-xs text-brand-slate mb-1">
              Type <code className="font-mono bg-brand-light px-1">{expectedConfirm}</code> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={expectedConfirm}
              autoFocus
              className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm font-mono text-brand-navy focus:outline-none focus:border-brand-steel"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmModalOpen(false)} disabled={executing} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">Cancel</button>
            <button
              onClick={executeEoy}
              disabled={confirmText !== expectedConfirm || executing}
              className="px-6 py-2 text-sm text-white bg-status-danger hover:bg-status-danger/90 rounded-lg disabled:opacity-40"
            >
              {executing ? 'Closing year…' : 'Confirm End-of-Year'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
