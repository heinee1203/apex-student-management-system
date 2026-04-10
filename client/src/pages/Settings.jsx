import { useState, useEffect } from 'react';
import TopBar from '../components/TopBar';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { api } from '../utils/api';
import { formatCurrency } from '../utils/format';

const settingFields = [
  { key: 'school_name', label: 'School Name' },
  { key: 'school_address', label: 'School Address' },
  { key: 'school_contact', label: 'Contact Number' },
  { key: 'school_email', label: 'Email Address' },
  { key: 'school_website', label: 'Website' },
  { key: 'registrar_name', label: 'Registrar Name' },
];

const GRADE_LEVELS = [
  'Nursery 1',
  'Nursery 2',
  'Kinder',
  'Grade 1',
  'Grade 2',
  'Grade 3',
  'Grade 4',
  'Grade 5',
  'Grade 6',
];

export default function Settings({ onMenuClick }) {
  const addToast = useToast();
  const [activeTab, setActiveTab] = useState('school');
  const [loading, setLoading] = useState(true);

  // Tab 1: School Information
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);

  // Tab 2: Tuition Fee Schedule
  const [schoolYears, setSchoolYears] = useState([]);
  const [scheduleYear, setScheduleYear] = useState('');
  const [schedule, setSchedule] = useState([]);
  const [editingCell, setEditingCell] = useState(null); // { grade, field }
  const [editValue, setEditValue] = useState('');
  const [showAddYearModal, setShowAddYearModal] = useState(false);
  const [copyFromYear, setCopyFromYear] = useState('');
  const [newYear, setNewYear] = useState('');
  const [addingYear, setAddingYear] = useState(false);

  // Tab 3: Fee Types
  const [feeTypes, setFeeTypes] = useState([]);
  const [editingFeeId, setEditingFeeId] = useState(null);
  const [editFeeName, setEditFeeName] = useState('');
  const [newFeeName, setNewFeeName] = useState('');
  const [deleteFeeTarget, setDeleteFeeTarget] = useState(null);

  // Tab 4: Default Fees
  const [defaultFees, setDefaultFees] = useState([]);
  const [dfYear, setDfYear] = useState('');
  const [dfYears, setDfYears] = useState([]);
  const [dfModalOpen, setDfModalOpen] = useState(false);
  const [dfEditing, setDfEditing] = useState(null);
  const [dfForm, setDfForm] = useState({ grade_level: 'ALL', fee_type: '', amount: '', description: '' });
  const [dfDeleteTarget, setDfDeleteTarget] = useState(null);

  // Tab 5: School Year Management
  const [endYearConfirm, setEndYearConfirm] = useState('');
  const [promoteStudents, setPromoteStudents] = useState(true);
  const [clearSectionsFlag, setClearSectionsFlag] = useState(true);
  const [lockYearFlag, setLockYearFlag] = useState(true);
  const [endingYear, setEndingYear] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [endYearResult, setEndYearResult] = useState(null);

  // Tab 6: Audit Log
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Load school years when tuition tab is active
  useEffect(() => {
    if (activeTab === 'tuition') {
      loadSchoolYears();
    }
  }, [activeTab]);

  const loadSchoolYears = async () => {
    try {
      const years = await api.getTuitionSchoolYears();
      setSchoolYears(years || []);
      if (!scheduleYear && years.length > 0) {
        setScheduleYear(years[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Load tuition schedule when school year changes
  useEffect(() => {
    if (activeTab === 'tuition' && scheduleYear) {
      api.getTuitionSchedule(scheduleYear)
        .then(data => setSchedule(data || []))
        .catch(console.error);
    }
  }, [activeTab, scheduleYear]);

  // Load fee types when tab is active
  useEffect(() => {
    if (activeTab === 'feeTypes') {
      loadFeeTypes();
    }
  }, [activeTab]);

  const loadFeeTypes = async () => {
    try {
      const data = await api.getFeeTypes();
      setFeeTypes(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  // --- Tab 1 handlers ---
  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.updateSettings(settings);
      setSettings(updated);
      addToast('Settings saved successfully');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- Tab 2 handlers ---
  const getEntry = (gradeLevel) => {
    return schedule.find(s => s.grade_level === gradeLevel) || { annual_rate: 0, monthly_rate: 0, quarterly_rate: 0 };
  };

  const handleCellClick = (gradeLevel, field) => {
    const entry = getEntry(gradeLevel);
    setEditingCell({ grade: gradeLevel, field });
    setEditValue(String(parseFloat(entry[field]) || 0));
  };

  const handleCellSave = (gradeLevel, field) => {
    const newVal = parseFloat(editValue) || 0;
    setSchedule(prev => {
      const exists = prev.some(s => s.grade_level === gradeLevel);
      const base = exists ? prev.find(s => s.grade_level === gradeLevel) : { grade_level: gradeLevel, annual_rate: 0, monthly_rate: 0, quarterly_rate: 0 };
      const updated = { ...base, [field]: newVal };

      // Auto-fill monthly and quarterly when annual changes, but only if they still match the old computed values
      if (field === 'annual_rate') {
        const oldAnnual = parseFloat(base.annual_rate) || 0;
        const oldAutoMonthly = Math.round((oldAnnual / 10) * 100) / 100;
        const oldAutoQuarterly = Math.round((oldAnnual / 4) * 100) / 100;
        if (parseFloat(base.monthly_rate) === 0 || parseFloat(base.monthly_rate) === oldAutoMonthly) {
          updated.monthly_rate = Math.round((newVal / 10) * 100) / 100;
        }
        if (parseFloat(base.quarterly_rate) === 0 || parseFloat(base.quarterly_rate) === oldAutoQuarterly) {
          updated.quarterly_rate = Math.round((newVal / 4) * 100) / 100;
        }
      }

      if (exists) {
        return prev.map(s => s.grade_level === gradeLevel ? updated : s);
      }
      return [...prev, updated];
    });
    setEditingCell(null);
  };

  const handleScheduleSave = async () => {
    try {
      const finalRates = GRADE_LEVELS.map(gl => {
        const entry = getEntry(gl);
        return {
          grade_level: gl,
          annual_rate: parseFloat(entry.annual_rate) || 0,
          monthly_rate: parseFloat(entry.monthly_rate) || 0,
          quarterly_rate: parseFloat(entry.quarterly_rate) || 0,
        };
      });

      await api.updateTuitionSchedule({ school_year: scheduleYear, rates: finalRates });
      addToast('Tuition schedule saved successfully');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const getNextSchoolYear = () => {
    if (schoolYears.length === 0) return '2025-2026';
    const latest = schoolYears[0]; // sorted DESC
    const match = latest.match(/^(\d{4})-(\d{4})$/);
    if (!match) return '';
    return `${parseInt(match[1]) + 1}-${parseInt(match[2]) + 1}`;
  };

  const openAddYearModal = () => {
    const next = getNextSchoolYear();
    setNewYear(next);
    setCopyFromYear(schoolYears.length > 0 ? schoolYears[0] : '');
    setShowAddYearModal(true);
  };

  const handleAddSchoolYear = async () => {
    if (!newYear.trim()) return;
    setAddingYear(true);
    try {
      if (copyFromYear) {
        await api.copyTuitionSchedule({ from_school_year: copyFromYear, to_school_year: newYear });
        addToast(`Created ${newYear} with rates copied from ${copyFromYear}`);
      } else {
        // Create empty rates for all grade levels
        const emptyRates = GRADE_LEVELS.map(gl => ({ grade_level: gl, annual_rate: 0, monthly_rate: 0, quarterly_rate: 0 }));
        await api.updateTuitionSchedule({ school_year: newYear, rates: emptyRates });
        addToast(`Created ${newYear} with blank rates`);
      }
      setShowAddYearModal(false);
      await loadSchoolYears();
      setScheduleYear(newYear);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setAddingYear(false);
    }
  };

  // --- Tab 3 handlers ---
  const handleFeeTypeEdit = (ft) => {
    setEditingFeeId(ft.id);
    setEditFeeName(ft.name);
  };

  const handleFeeTypeEditSave = async (id) => {
    try {
      await api.updateFeeType(id, { name: editFeeName });
      setEditingFeeId(null);
      addToast('Fee type updated');
      loadFeeTypes();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleFeeTypeDelete = async () => {
    if (!deleteFeeTarget) return;
    try {
      await api.deleteFeeType(deleteFeeTarget.id);
      addToast('Fee type deleted');
      setDeleteFeeTarget(null);
      loadFeeTypes();
    } catch (err) {
      addToast(err.message || 'Cannot delete fee type — it may be in use', 'error');
      setDeleteFeeTarget(null);
    }
  };

  const handleAddFeeType = async (e) => {
    e.preventDefault();
    if (!newFeeName.trim()) return;
    try {
      await api.createFeeType({ name: newFeeName.trim() });
      setNewFeeName('');
      addToast('Fee type added');
      loadFeeTypes();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // --- Tab 4: Default Fees ---
  useEffect(() => {
    if (activeTab === 'defaultFees') {
      loadDfYears();
    }
  }, [activeTab]);

  const loadDfYears = async () => {
    try {
      const years = await api.getTuitionSchoolYears();
      setDfYears(years || []);
      if (!dfYear && years.length > 0) setDfYear(years[0]);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (activeTab === 'defaultFees' && dfYear) {
      loadDefaultFees();
    }
  }, [activeTab, dfYear]);

  const loadDefaultFees = async () => {
    try {
      const data = await api.getDefaultFees(dfYear);
      setDefaultFees(data || []);
    } catch (err) { console.error(err); }
  };

  const openDfAdd = () => {
    setDfEditing(null);
    setDfForm({ grade_level: 'ALL', fee_type: feeTypes.length > 0 ? feeTypes.filter(ft => !ft.is_system)[0]?.name || '' : '', amount: '', description: '' });
    setDfModalOpen(true);
  };

  const openDfEdit = (df) => {
    setDfEditing(df.id);
    setDfForm({ grade_level: df.grade_level, fee_type: df.fee_type, amount: df.amount, description: df.description || '' });
    setDfModalOpen(true);
  };

  const handleDfSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...dfForm, amount: parseFloat(dfForm.amount), school_year: dfYear };
      if (dfEditing) {
        await api.updateDefaultFee(dfEditing, data);
        addToast('Default fee updated');
      } else {
        await api.createDefaultFee(data);
        addToast('Default fee added');
      }
      setDfModalOpen(false);
      loadDefaultFees();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDfDelete = async () => {
    if (!dfDeleteTarget) return;
    try {
      await api.deleteDefaultFee(dfDeleteTarget);
      addToast('Default fee deleted');
      setDfDeleteTarget(null);
      loadDefaultFees();
    } catch (err) { addToast(err.message, 'error'); setDfDeleteTarget(null); }
  };

  // Load fee types whenever default fees tab is active (needed for the dropdown)
  useEffect(() => {
    if (activeTab === 'defaultFees' && feeTypes.length === 0) {
      loadFeeTypes();
    }
  }, [activeTab]);

  const handleOpenPreview = async () => {
    try {
      setPreviewLoading(true);
      const data = await api.endSchoolYearPreview();
      setPreview(data);
      setEndYearConfirm('');
      setPreviewModalOpen(true);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleEndSchoolYear = async () => {
    if (endYearConfirm !== 'CONFIRM') return;
    try {
      setEndingYear(true);
      const result = await api.endSchoolYear({
        confirm: 'CONFIRM',
        promote: promoteStudents,
        clearSections: clearSectionsFlag,
        lockYear: lockYearFlag,
      });
      setPreviewModalOpen(false);
      setEndYearResult(result);
      setEndYearConfirm('');
      addToast('School year ended successfully');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setEndingYear(false);
    }
  };

  const loadAuditLog = async () => {
    try {
      setAuditLoading(true);
      const data = await api.getAuditLog();
      setAuditEntries(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'auditLog') loadAuditLog();
  }, [activeTab]);

  if (loading) return <div className="flex items-center justify-center h-64 text-brand-slate"><svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>Loading...</div>;

  const tabs = [
    { id: 'school', label: 'School Information' },
    { id: 'tuition', label: 'Tuition Fee Schedule' },
    { id: 'feeTypes', label: 'Fee Types' },
    { id: 'defaultFees', label: 'Default Fees' },
    { id: 'schoolYear', label: 'School Year' },
    { id: 'auditLog', label: 'Audit Log' },
  ];

  return (
    <div>
      <TopBar title="Settings" onMenuClick={onMenuClick} />
      <div className="p-6">
        {/* Tab Navigation */}
        <div className="flex border-b border-brand-border mb-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-steel text-brand-teal font-semibold'
                  : 'border-transparent text-brand-slate hover:text-brand-navy'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: School Information */}
        {activeTab === 'school' && (
          <div className="bg-white border border-brand-border rounded-xl p-6 max-w-2xl mx-auto">
            <h3 className="text-lg font-semibold text-brand-navy mb-2">School Information</h3>
            <p className="text-sm text-brand-slate mb-6">These details appear on the Statement of Account document.</p>
            <div className="space-y-4">
              {settingFields.map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-brand-slate mb-1">{f.label}</label>
                  <input
                    type="text"
                    value={settings[f.key] || ''}
                    onChange={e => setSettings(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel"
                  />
                </div>
              ))}
              <div className="pt-4">
                <button onClick={handleSave} disabled={saving} className="bg-brand-steel hover:bg-brand-teal disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Tuition Fee Schedule */}
        {activeTab === 'tuition' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-4">
              <label className="text-sm font-medium text-brand-navy">School Year</label>
              <select
                value={scheduleYear}
                onChange={e => setScheduleYear(e.target.value)}
                className="bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel w-40"
              >
                {schoolYears.map(sy => (
                  <option key={sy} value={sy}>{sy}</option>
                ))}
              </select>
              <button
                onClick={openAddYearModal}
                className="text-brand-steel hover:text-brand-teal text-sm font-medium transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add School Year
              </button>
            </div>
            <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-brand-light text-xs text-brand-slate border-b border-brand-border">
                    <th className="px-4 py-3 text-left font-medium">Grade Level</th>
                    <th className="px-4 py-3 text-right font-medium">Annual Rate (&#8369;)</th>
                    <th className="px-4 py-3 text-right font-medium">Quarterly Rate (&#8369;)</th>
                    <th className="px-4 py-3 text-right font-medium">Monthly Rate (&#8369;)</th>
                  </tr>
                </thead>
                <tbody>
                  {GRADE_LEVELS.map(gl => {
                    const entry = getEntry(gl);
                    const renderCell = (field) => {
                      const isEditing = editingCell && editingCell.grade === gl && editingCell.field === field;
                      const val = parseFloat(entry[field]) || 0;
                      if (isEditing) {
                        return (
                          <input
                            type="number"
                            step="0.01"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => handleCellSave(gl, field)}
                            onKeyDown={e => { if (e.key === 'Enter') handleCellSave(gl, field); }}
                            autoFocus
                            className="w-32 bg-white border border-brand-border rounded-lg px-3 py-1 text-sm text-brand-navy text-right focus:outline-none focus:border-brand-steel"
                          />
                        );
                      }
                      return (
                        <button
                          onClick={() => handleCellClick(gl, field)}
                          className="font-mono text-brand-navy hover:text-brand-teal hover:bg-brand-light px-2 py-1 rounded transition-colors cursor-pointer"
                          title="Click to edit"
                        >
                          {formatCurrency(val)}
                        </button>
                      );
                    };
                    return (
                      <tr key={gl} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                        <td className="px-4 py-3 text-brand-navy font-medium">{gl}</td>
                        <td className="px-4 py-3 text-right">{renderCell('annual_rate')}</td>
                        <td className="px-4 py-3 text-right">{renderCell('quarterly_rate')}</td>
                        <td className="px-4 py-3 text-right">{renderCell('monthly_rate')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <button onClick={handleScheduleSave} className="bg-brand-steel hover:bg-brand-teal text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
                Save Schedule
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Fee Types */}
        {activeTab === 'feeTypes' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-brand-border">
                <h3 className="text-sm font-semibold text-brand-teal">Manage Fee Types</h3>
              </div>
              <div className="divide-y divide-brand-border/50">
                {feeTypes.map(ft => (
                  <div key={ft.id} className="px-4 py-3 flex items-center justify-between hover:bg-brand-light/50">
                    {editingFeeId === ft.id ? (
                      <input
                        type="text"
                        value={editFeeName}
                        onChange={e => setEditFeeName(e.target.value)}
                        onBlur={() => handleFeeTypeEditSave(ft.id)}
                        onKeyDown={e => { if (e.key === 'Enter') handleFeeTypeEditSave(ft.id); }}
                        autoFocus
                        className="flex-1 bg-white border border-brand-border rounded-lg px-3 py-1 text-sm text-brand-navy focus:outline-none focus:border-brand-steel mr-3"
                      />
                    ) : (
                      <span className="text-sm text-brand-navy">{ft.name}</span>
                    )}
                    <div className="flex items-center gap-1">
                      {ft.is_system ? (
                        <span className="text-brand-slate p-1" title="System fee type">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleFeeTypeEdit(ft)}
                            className="text-brand-slate hover:text-status-warning p-1"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteFeeTarget(ft)}
                            className="text-brand-slate hover:text-status-danger p-1"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {feeTypes.length === 0 && (
                  <div className="px-4 py-6 text-center text-brand-slate text-sm">No fee types found</div>
                )}
              </div>
              {/* Add new fee type */}
              <div className="px-4 py-3 border-t border-brand-border bg-brand-light/30">
                <form onSubmit={handleAddFeeType} className="flex items-center gap-3">
                  <input
                    type="text"
                    value={newFeeName}
                    onChange={e => setNewFeeName(e.target.value)}
                    placeholder="New fee type name"
                    className="flex-1 bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel"
                  />
                  <button
                    type="submit"
                    className="bg-brand-steel hover:bg-brand-teal text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Add
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
        {/* Tab 4: Default Fees */}
        {activeTab === 'defaultFees' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-brand-navy">School Year</label>
                <select
                  value={dfYear}
                  onChange={e => setDfYear(e.target.value)}
                  className="bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel w-40"
                >
                  {dfYears.map(sy => (
                    <option key={sy} value={sy}>{sy}</option>
                  ))}
                </select>
              </div>
              <button onClick={openDfAdd} className="bg-brand-steel hover:bg-brand-teal text-white px-4 py-1.5 rounded-lg text-sm font-medium">+ Add Default Fee</button>
            </div>
            <p className="text-xs text-brand-slate mb-4">These fees are automatically added as obligations when a new student is enrolled. Use "ALL" to apply a fee to every grade level.</p>
            <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-brand-light text-xs text-brand-slate border-b border-brand-border">
                    <th className="px-4 py-3 text-left font-medium">Grade Level</th>
                    <th className="px-4 py-3 text-left font-medium">Fee Type</th>
                    <th className="px-4 py-3 text-right font-medium">Amount (&#8369;)</th>
                    <th className="px-4 py-3 text-left font-medium">Description</th>
                    <th className="px-4 py-3 text-center font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {defaultFees.map(df => (
                    <tr key={df.id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                      <td className="px-4 py-2 text-brand-navy font-medium">{df.grade_level}</td>
                      <td className="px-4 py-2 text-brand-navy">{df.fee_type}</td>
                      <td className="px-4 py-2 text-right font-mono text-brand-navy">{formatCurrency(df.amount)}</td>
                      <td className="px-4 py-2 text-brand-slate">{df.description || '—'}</td>
                      <td className="px-4 py-2">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => openDfEdit(df)} className="text-brand-slate hover:text-status-warning p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => setDfDeleteTarget(df.id)} className="text-brand-slate hover:text-status-danger p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {defaultFees.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-brand-slate">No default fees configured for this school year</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* Tab 5: School Year */}
        {activeTab === 'schoolYear' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white border border-brand-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-brand-navy mb-2">End of School Year</h3>
              <p className="text-sm text-brand-slate mb-6">Review the impact before transitioning to the next school year. Arrears will be snapshotted, the year will be locked, and students will be promoted.</p>

              <div className="bg-brand-light rounded-lg p-4 mb-6 space-y-2">
                <h4 className="text-sm font-semibold text-brand-navy">What this will do:</h4>
                <ul className="text-sm text-brand-slate space-y-1 list-disc list-inside">
                  <li>Snapshot every student's arrears for the current school year</li>
                  <li>Promote <strong>Enrolled</strong> students to the next grade level and set to <strong>Not Enrolled</strong></li>
                  <li>Grade 6 students will be marked as <strong>Graduated</strong></li>
                  <li>LOA students → Not Enrolled (no grade change)</li>
                  <li>Clear sections on promoted students</li>
                  <li>Lock the current school year from further edits (Admin override)</li>
                  <li>Update the current school year in settings</li>
                  <li>Write an entry to the audit log</li>
                </ul>
              </div>

              <button
                onClick={handleOpenPreview}
                disabled={previewLoading}
                className="bg-brand-steel hover:bg-brand-teal disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {previewLoading ? 'Loading preview...' : 'Preview Impact'}
              </button>
            </div>
          </div>
        )}

        {/* Tab 6: Audit Log */}
        {activeTab === 'auditLog' && (
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-brand-border">
              <h3 className="text-sm font-semibold text-brand-teal">Audit Log (Last 100 entries)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                    <th className="px-4 py-3 text-left">Timestamp</th>
                    <th className="px-4 py-3 text-left">Action</th>
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left">School Year</th>
                    <th className="px-4 py-3 text-left">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLoading && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-brand-slate">Loading...</td></tr>
                  )}
                  {!auditLoading && auditEntries.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-brand-slate">
                      <svg className="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                      No audit entries
                    </td></tr>
                  )}
                  {auditEntries.map(entry => (
                    <tr key={entry.id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                      <td className="px-4 py-2 text-xs text-brand-slate font-mono whitespace-nowrap">{entry.created_at}</td>
                      <td className="px-4 py-2 text-brand-navy font-medium">{entry.action}</td>
                      <td className="px-4 py-2 text-brand-navy">{entry.performed_by}</td>
                      <td className="px-4 py-2 text-brand-slate font-mono text-xs">{entry.school_year || '—'}</td>
                      <td className="px-4 py-2 text-xs text-brand-slate font-mono max-w-md truncate" title={typeof entry.details === 'object' ? JSON.stringify(entry.details) : entry.details}>
                        {entry.details && typeof entry.details === 'object'
                          ? Object.entries(entry.details).map(([k, v]) => `${k}: ${v}`).join(', ')
                          : entry.details || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* End of Year Preview Modal */}
      <Modal isOpen={previewModalOpen} onClose={() => setPreviewModalOpen(false)} title={`End of School Year — S.Y. ${preview?.currentSchoolYear || ''}`} wide>
        {preview && (
          <div className="space-y-4">
            <div className="bg-brand-light rounded-lg p-4">
              <h4 className="text-sm font-semibold text-brand-navy mb-2">Student Impact</h4>
              <div className="grid grid-cols-2 gap-y-1 text-sm">
                <div className="text-brand-slate">Enrolled → Not Enrolled + Promoted:</div>
                <div className="font-semibold text-brand-navy text-right">{preview.promoting}</div>
                <div className="text-brand-slate">Grade 6 → Graduated:</div>
                <div className="font-semibold text-brand-navy text-right">{preview.graduating}</div>
                <div className="text-brand-slate">LOA → Not Enrolled (no promotion):</div>
                <div className="font-semibold text-brand-navy text-right">{preview.loa}</div>
                <div className="text-brand-slate">Dropped (no change):</div>
                <div className="font-semibold text-brand-navy text-right">{preview.dropped}</div>
                <div className="text-brand-slate">Registered (no change):</div>
                <div className="font-semibold text-brand-navy text-right">{preview.registered}</div>
                <div className="text-brand-slate">Not Enrolled (no change):</div>
                <div className="font-semibold text-brand-navy text-right">{preview.notEnrolled}</div>
              </div>
            </div>

            <div className="bg-status-danger/5 border border-status-danger/20 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-status-danger mb-2">⚠ Outstanding Balances</h4>
              <div className="text-sm mb-3">
                <span className="text-brand-slate">Students with arrears: </span>
                <span className="font-semibold text-brand-navy">{preview.arrearsStudents.length}</span>
                <span className="text-brand-slate ml-4">Total outstanding: </span>
                <span className="font-semibold text-status-danger font-mono">{formatCurrency(preview.arrearsTotal)}</span>
              </div>
              {preview.arrearsStudents.length > 0 && (
                <div className="max-h-48 overflow-y-auto bg-white rounded border border-brand-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-brand-light">
                      <tr className="text-brand-slate border-b border-brand-border">
                        <th className="px-3 py-2 text-left">Student</th>
                        <th className="px-3 py-2 text-left">Grade</th>
                        <th className="px-3 py-2 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.arrearsStudents.map(s => (
                        <tr key={s.student_id} className="border-b border-brand-border/40">
                          <td className="px-3 py-1.5 text-brand-navy">{s.name}</td>
                          <td className="px-3 py-1.5 text-brand-slate">{s.grade_level}</td>
                          <td className="px-3 py-1.5 text-right text-status-danger font-mono">{formatCurrency(s.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className={`rounded-lg p-4 border ${preview.nextYearTuitionExists ? 'bg-status-success/5 border-status-success/20' : 'bg-status-warning/5 border-status-warning/20'}`}>
              <h4 className="text-sm font-semibold text-brand-navy mb-1">Tuition Schedule Check</h4>
              {preview.nextYearTuitionExists ? (
                <p className="text-sm text-status-success">✓ Tuition rates for S.Y. {preview.nextSchoolYear} exist</p>
              ) : (
                <p className="text-sm text-status-warning">⚠ No tuition rates for S.Y. {preview.nextSchoolYear}. Set them up in Settings → Tuition Fee Schedule before re-enrolling students.</p>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-brand-border">
              <label className="flex items-center gap-3 text-sm text-brand-navy">
                <input type="checkbox" checked={promoteStudents} onChange={e => setPromoteStudents(e.target.checked)} className="rounded" />
                Promote students to next grade level
              </label>
              <label className="flex items-center gap-3 text-sm text-brand-navy">
                <input type="checkbox" checked={clearSectionsFlag} onChange={e => setClearSectionsFlag(e.target.checked)} className="rounded" />
                Clear section assignments
              </label>
              <label className="flex items-center gap-3 text-sm text-brand-navy">
                <input type="checkbox" checked={lockYearFlag} onChange={e => setLockYearFlag(e.target.checked)} className="rounded" />
                Lock S.Y. {preview.currentSchoolYear} from further edits
              </label>
            </div>

            <div>
              <label className="block text-xs text-brand-slate mb-1">Type "CONFIRM" to proceed</label>
              <input
                type="text"
                value={endYearConfirm}
                onChange={e => setEndYearConfirm(e.target.value)}
                placeholder="CONFIRM"
                className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleEndSchoolYear}
                disabled={endYearConfirm !== 'CONFIRM' || endingYear}
                className="px-6 py-2 text-sm text-white bg-status-danger hover:bg-status-danger/90 rounded-lg disabled:opacity-40"
              >
                {endingYear ? 'Processing...' : 'End School Year'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* End of Year Success Modal */}
      <Modal isOpen={!!endYearResult} onClose={() => setEndYearResult(null)} title="School Year Ended">
        {endYearResult && (
          <div className="space-y-4">
            <div className="bg-status-success/5 border border-status-success/20 rounded-lg p-4">
              <p className="text-sm font-semibold text-status-success mb-2">✓ {endYearResult.message}</p>
              <p className="text-xs text-brand-slate">Active school year is now <strong className="text-brand-navy">{endYearResult.nextSchoolYear}</strong></p>
            </div>
            <div className="bg-brand-light rounded-lg p-4 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-brand-slate">Promoted:</span><span className="font-semibold text-brand-navy">{endYearResult.promoted}</span></div>
              <div className="flex justify-between"><span className="text-brand-slate">Graduated:</span><span className="font-semibold text-brand-navy">{endYearResult.graduated}</span></div>
              <div className="flex justify-between"><span className="text-brand-slate">LOA reset:</span><span className="font-semibold text-brand-navy">{endYearResult.loaReset}</span></div>
              <div className="flex justify-between"><span className="text-brand-slate">Arrears snapshotted:</span><span className="font-semibold text-brand-navy">{endYearResult.arrearsSnapshotted}</span></div>
              <div className="flex justify-between"><span className="text-brand-slate">Total arrears:</span><span className="font-semibold text-status-danger font-mono">{formatCurrency(endYearResult.arrearsTotal)}</span></div>
              <div className="flex justify-between"><span className="text-brand-slate">Year locked:</span><span className="font-semibold text-brand-navy">{endYearResult.yearLocked ? 'Yes' : 'No'}</span></div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setEndYearResult(null)} className="px-4 py-2 text-sm text-white bg-brand-steel hover:bg-brand-teal rounded-lg">Close</button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteFeeTarget}
        onClose={() => setDeleteFeeTarget(null)}
        onConfirm={handleFeeTypeDelete}
      />

      <ConfirmDialog
        isOpen={!!dfDeleteTarget}
        onClose={() => setDfDeleteTarget(null)}
        onConfirm={handleDfDelete}
      />

      <Modal isOpen={dfModalOpen} onClose={() => setDfModalOpen(false)} title={dfEditing ? 'Edit Default Fee' : 'Add Default Fee'}>
        <form onSubmit={handleDfSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-brand-slate mb-1">Grade Level *</label>
            <select value={dfForm.grade_level} onChange={e => setDfForm(p => ({...p, grade_level: e.target.value}))} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
              <option value="ALL">ALL (applies to every grade)</option>
              {GRADE_LEVELS.map(gl => <option key={gl} value={gl}>{gl}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-brand-slate mb-1">Fee Type *</label>
            <select value={dfForm.fee_type} onChange={e => setDfForm(p => ({...p, fee_type: e.target.value}))} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel">
              <option value="">Select fee type...</option>
              {feeTypes.filter(ft => !ft.is_system).map(ft => <option key={ft.id} value={ft.name}>{ft.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-brand-slate mb-1">Amount (&#8369;) *</label>
              <input type="number" step="0.01" value={dfForm.amount} onChange={e => setDfForm(p => ({...p, amount: e.target.value}))} required className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
            </div>
            <div>
              <label className="block text-xs text-brand-slate mb-1">School Year</label>
              <div className="w-full bg-brand-light border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy font-semibold">{dfYear}</div>
            </div>
          </div>
          <div>
            <label className="block text-xs text-brand-slate mb-1">Description</label>
            <input type="text" value={dfForm.description} onChange={e => setDfForm(p => ({...p, description: e.target.value}))} className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setDfModalOpen(false)} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm text-white bg-brand-steel hover:bg-brand-teal rounded-lg">{dfEditing ? 'Update' : 'Add'}</button>
          </div>
        </form>
      </Modal>

      {/* Add School Year Modal */}
      {showAddYearModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-brand-navy mb-4">Add School Year</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-brand-slate mb-1">New School Year</label>
                <input
                  type="text"
                  value={newYear}
                  onChange={e => setNewYear(e.target.value)}
                  placeholder="2025-2026"
                  className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel"
                />
              </div>
              <div>
                <label className="block text-xs text-brand-slate mb-1">Copy rates from</label>
                <select
                  value={copyFromYear}
                  onChange={e => setCopyFromYear(e.target.value)}
                  className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-navy focus:outline-none focus:border-brand-steel"
                >
                  <option value="">Start with blank rates</option>
                  {schoolYears.map(sy => (
                    <option key={sy} value={sy}>{sy}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddYearModal(false)}
                className="px-4 py-2 text-sm text-brand-slate hover:text-brand-navy transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSchoolYear}
                disabled={!newYear.trim() || addingYear}
                className="bg-brand-steel hover:bg-brand-teal disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {addingYear ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
