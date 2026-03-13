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
  const { addToast } = useToast();
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
      Admin: 'bg-purple-100 text-purple-700',
      Registrar: 'bg-blue-100 text-blue-700',
      Viewer: 'bg-gray-100 text-gray-700',
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[role] || colors.Viewer}`}>{role}</span>;
  };

  const statusBadge = (isActive) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );

  return (
    <div>
      <TopBar title="User Management" onMenuClick={onMenuClick}>
        <button onClick={openAdd} className="px-4 py-2 bg-brand-teal text-white text-sm font-medium rounded-lg hover:bg-brand-teal/90 transition-colors">
          + Add User
        </button>
      </TopBar>

      <div className="p-6">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3">Username</th>
                    <th className="px-5 py-3">Full Name</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Last Login</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3 font-medium text-gray-900">{u.username}</td>
                      <td className="px-5 py-3 text-gray-600">{u.full_name}</td>
                      <td className="px-5 py-3">{roleBadge(u.role)}</td>
                      <td className="px-5 py-3">{statusBadge(u.is_active)}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{u.last_login || 'Never'}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(u)} className="text-xs text-brand-teal hover:underline">Edit</button>
                          <button onClick={() => { setResetTarget(u); setResetPassword(''); }} className="text-xs text-amber-600 hover:underline">Reset PW</button>
                          {u.id !== currentUser?.id && (
                            <button onClick={() => setDeleteTarget(u)} className="text-xs text-red-500 hover:underline">Delete</button>
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

      {/* Add/Edit User Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit User' : 'Add User'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Username</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
              required
            />
          </div>
          {!editing && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                required
                minLength={6}
                placeholder="Minimum 6 characters"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name</label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
            >
              <option value="Admin">Admin</option>
              <option value="Registrar">Registrar</option>
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
                className="rounded border-gray-300 text-brand-teal focus:ring-brand-teal"
              />
              <label htmlFor="isActive" className="text-sm text-gray-600">Active</label>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-brand-teal text-white rounded-lg hover:bg-brand-teal/90">{editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal isOpen={!!resetTarget} onClose={() => setResetTarget(null)} title={`Reset Password — ${resetTarget?.username}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">New Password</label>
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
              minLength={6}
              placeholder="Minimum 6 characters"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setResetTarget(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={handleResetPassword} disabled={resetPassword.length < 6} className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:bg-gray-300">Reset Password</button>
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
