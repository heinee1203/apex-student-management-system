import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useToast } from '../components/Toast';
import TopBar from '../components/TopBar';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';

export default function Users({ onMenuClick }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', fullName: '', role: 'Viewer' });
  const [resetPassword, setResetPassword] = useState('');
  const addToast = useToast();
  const { user: currentUser } = useAuth();

  const load = () => {
    api.getUsers().then(setUsers).catch(err => addToast(err.message, 'error')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ username: '', password: '', fullName: '', role: 'Viewer' });
    setModalOpen(true);
  };

  const openEdit = (u) => {
    setEditing(u.id);
    setForm({ username: u.username, password: '', fullName: u.full_name, role: u.role, isActive: u.is_active });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.updateUser(editing, {
          username: form.username,
          fullName: form.fullName,
          role: form.role,
          isActive: form.isActive,
        });
        addToast('User updated');
      } else {
        await api.createUser({
          username: form.username,
          password: form.password,
          fullName: form.fullName,
          role: form.role,
        });
        addToast('User created');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleResetPassword = async () => {
    try {
      await api.resetUserPassword(resetTarget.id, { newPassword: resetPassword });
      addToast('Password reset successfully');
      setResetTarget(null);
      setResetPassword('');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteUser(deleteTarget.id);
      addToast('User deleted');
      setDeleteTarget(null);
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const roleBadge = (role) => {
    const colors = {
      Admin: 'bg-[#8A6DB5]/15 text-[#6B4D8A]',
      Registrar: 'bg-brand-steel/15 text-brand-teal',
      Treasurer: 'bg-status-success/15 text-status-success',
      Viewer: 'bg-brand-light text-brand-slate',
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[role] || colors.Viewer}`}>{role}</span>;
  };

  const statusBadge = (isActive) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isActive ? 'bg-status-success/15 text-status-success' : 'bg-status-danger/15 text-status-danger'}`}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );

  if (loading) return (
    <div>
      <TopBar title="User Management" onMenuClick={onMenuClick} />
      <div className="flex items-center justify-center h-64 text-brand-slate">
        <svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
        Loading...
      </div>
    </div>
  );

  return (
    <div>
      <TopBar title="User Management" onMenuClick={onMenuClick}>
        <button onClick={openAdd} className="bg-brand-steel hover:bg-brand-teal text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
          + Add User
        </button>
      </TopBar>

      <div className="p-6">
        <div className="bg-white rounded-xl border border-brand-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-brand-slate border-b border-brand-border bg-brand-light">
                  <th className="px-4 py-3 text-left">Username</th>
                  <th className="px-4 py-3 text-left">Full Name</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Last Login</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-brand-border/50 hover:bg-brand-light/50">
                    <td className="px-4 py-2 font-medium text-brand-navy">{u.username}</td>
                    <td className="px-4 py-2 text-brand-navy">{u.full_name}</td>
                    <td className="px-4 py-2">{roleBadge(u.role)}</td>
                    <td className="px-4 py-2">{statusBadge(u.is_active)}</td>
                    <td className="px-4 py-2 text-brand-slate text-xs">{u.last_login || 'Never'}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(u)} title="Edit" className="text-brand-slate hover:text-status-warning p-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => { setResetTarget(u); setResetPassword(''); }} title="Reset Password" className="text-brand-slate hover:text-status-warning p-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                        </button>
                        {u.id !== currentUser?.id && (
                          <button onClick={() => setDeleteTarget(u)} title="Delete" className="text-brand-slate hover:text-status-danger p-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-brand-slate">
                    <svg className="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    No users found
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit User' : 'Add User'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-brand-slate mb-1">Username</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm text-brand-navy focus:outline-none focus:border-brand-steel"
              required
            />
          </div>
          {!editing && (
            <div>
              <label className="block text-xs text-brand-slate mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm text-brand-navy focus:outline-none focus:border-brand-steel"
                required
                minLength={6}
                placeholder="Minimum 6 characters"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-brand-slate mb-1">Full Name</label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm text-brand-navy focus:outline-none focus:border-brand-steel"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-brand-slate mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm text-brand-navy focus:outline-none focus:border-brand-steel"
            >
              <option value="Admin">Admin</option>
              <option value="Registrar">Registrar</option>
              <option value="Treasurer">Treasurer</option>
              <option value="Viewer">Viewer</option>
            </select>
          </div>
          {editing && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive === 1}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked ? 1 : 0 })}
                className="rounded border-brand-border text-brand-steel focus:ring-brand-steel"
              />
              <label htmlFor="isActive" className="text-sm text-brand-navy">Active</label>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm text-white bg-brand-steel hover:bg-brand-teal rounded-lg">{editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal isOpen={!!resetTarget} onClose={() => setResetTarget(null)} title={`Reset Password — ${resetTarget?.username}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-brand-slate mb-1">New Password</label>
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm text-brand-navy focus:outline-none focus:border-brand-steel"
              minLength={6}
              placeholder="Minimum 6 characters"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setResetTarget(null)} className="px-4 py-2 text-sm text-brand-navy bg-brand-light hover:bg-brand-border rounded-lg">Cancel</button>
            <button onClick={handleResetPassword} disabled={resetPassword.length < 6} className="px-4 py-2 text-sm bg-status-warning text-white rounded-lg hover:bg-status-warning/90 disabled:opacity-40">Reset Password</button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete User"
        message={`Are you sure you want to delete "${deleteTarget?.username}"? This action cannot be undone.`}
      />
    </div>
  );
}
