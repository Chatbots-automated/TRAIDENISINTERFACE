import React, { useState, useEffect } from 'react';
import { Users, Plus, CreditCard as Edit3, Trash2, Shield, User as UserIcon, Save, X, AlertCircle, Check, Filter, ChevronDown, UserPlus, Hash } from 'lucide-react';
import { getAllUsers, updateUserByAdmin, deleteUserByAdmin, getVadybininkai, createVadybininkas, deleteVadybininkas } from '../lib/database';
import type { AppUser } from '../types';
import { colors } from '../lib/designSystem';

interface AdminUsersInterfaceProps {
  user: AppUser;
}

interface UserData {
  id: string;
  email: string;
  display_name?: string;
  is_admin: boolean;
  created_at: string;
  phone?: string;
  kodas?: string;
  full_name?: string;
  role?: string;
}

export default function AdminUsersInterface({ user }: AdminUsersInterfaceProps) {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('all'); // 'all' = show all, or specific role
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  const [vadybininkai, setVadybininkai] = useState<{ id: string; full_name?: string; kodas?: string; created_at: string }[]>([]);

  const [newVadybininkas, setNewVadybininkas] = useState({
    fullName: '',
    kodas: ''
  });

  useEffect(() => {
    loadUsers();
    loadVadybininkai();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await getAllUsers();
      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error loading users:', error);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const loadVadybininkai = async () => {
    try {
      const { data, error } = await getVadybininkai();
      if (error) throw error;
      setVadybininkai(data || []);
    } catch (error: any) {
      console.error('Error loading vadybininkai:', error);
    }
  };

  const generateKodas = (fullName: string): string => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length < 2) return parts[0]?.charAt(0)?.toUpperCase() || '';
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const handleCreateUser = async () => {
    if (!newVadybininkas.fullName.trim()) {
      setError('Full name is required');
      return;
    }

    if (!newVadybininkas.kodas.trim()) {
      setError('Kodas is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error } = await createVadybininkas(
        newVadybininkas.fullName.trim(),
        newVadybininkas.kodas.trim()
      );

      if (error) throw error;

      setNewVadybininkas({ fullName: '', kodas: '' });
      setShowCreateModal(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await loadVadybininkai();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    setSaving(true);
    setError(null);

    try {
      const updates: any = {
        display_name: editingUser.display_name,
        is_admin: editingUser.is_admin
      };

      const { error } = await updateUserByAdmin(editingUser.id, updates);
      if (error) throw error;

      setEditingUser(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await loadUsers();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const { error } = await deleteUserByAdmin(userId);
      if (error) throw error;
      await loadUsers();
    } catch (error: any) {
      setError(error.message);
    }
  };

  // Get unique roles from users
  const availableRoles = Array.from(new Set(users.map(u => u.role).filter(Boolean))) as string[];

  // Filter users based on role filter
  const filteredUsers = users.filter(u => {
    if (roleFilter === 'all') return true;
    return u.role?.toLowerCase() === roleFilter.toLowerCase();
  });

  if (!user.is_admin) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: colors.bg.primary }}>
        <div className="text-center">
          <Shield className="w-16 h-16 mx-auto mb-4" style={{ color: colors.status.errorText }} />
          <h3 className="text-lg font-medium mb-2" style={{ color: colors.text.primary }}>
            Access Denied
          </h3>
          <p style={{ color: colors.text.secondary }}>
            You need admin privileges to access this page
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: colors.bg.primary }}>
      {/* Header */}
      <div className="p-6 border-b" style={{
        borderColor: colors.border.light,
        background: colors.bg.white + 'CC' // 80% opacity
      }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold" style={{ color: colors.text.primary }}>User Management</h2>
            <p className="text-sm" style={{ color: colors.text.secondary }}>Create and manage user accounts</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Role Filter */}
            <div className="relative">
              <button
                onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                className="px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 border"
                style={{
                  background: colors.bg.white,
                  color: colors.text.primary,
                  borderColor: colors.border.default
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = colors.interactive.accent}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = colors.border.default}
              >
                <Filter className="w-4 h-4" />
                <span className="text-sm">
                  {roleFilter === 'all' ? 'All Roles' : roleFilter}
                </span>
                <ChevronDown className="w-4 h-4" />
              </button>

              {/* Dropdown */}
              {showRoleDropdown && (
                <div
                  className="absolute right-0 mt-2 w-56 bg-white border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto"
                  style={{ borderColor: colors.border.default }}
                >
                  <button
                    onClick={() => {
                      setRoleFilter('all');
                      setShowRoleDropdown(false);
                    }}
                    className="w-full px-4 py-2 text-sm text-left transition-colors flex items-center justify-between"
                    style={{ color: colors.text.primary }}
                    onMouseEnter={(e) => e.currentTarget.style.background = colors.bg.secondary}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <span>All Roles</span>
                    {roleFilter === 'all' && (
                      <Check className="w-4 h-4" style={{ color: colors.interactive.accent }} />
                    )}
                  </button>
                  {availableRoles.length > 0 && (
                    <>
                      <div className="border-t my-1" style={{ borderColor: colors.border.light }} />
                      {availableRoles.map((role) => (
                        <button
                          key={role}
                          onClick={() => {
                            setRoleFilter(role);
                            setShowRoleDropdown(false);
                          }}
                          className="w-full px-4 py-2 text-sm text-left transition-colors flex items-center justify-between"
                          style={{ color: colors.text.primary }}
                          onMouseEnter={(e) => e.currentTarget.style.background = colors.bg.secondary}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                        >
                          <span className="capitalize">{role}</span>
                          {roleFilter === role && (
                            <Check className="w-4 h-4" style={{ color: colors.interactive.accent }} />
                          )}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              style={{
                background: colors.interactive.accent,
                color: '#ffffff'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = colors.interactive.accentHover}
              onMouseLeave={(e) => e.currentTarget.style.background = colors.interactive.accent}
            >
              <Plus className="w-4 h-4" />
              <span>Add User</span>
            </button>
          </div>
        </div>
      </div>

      {/* Create Vadybininkas Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center p-4 pt-[10vh] overflow-y-auto"
          style={{ background: 'rgba(0, 0, 0, 0.3)' }}
          onClick={() => {
            setShowCreateModal(false);
            setNewVadybininkas({ fullName: '', kodas: '' });
            setError(null);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-lg w-full max-w-md"
            style={{ border: `1px solid ${colors.border.light}` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-5 border-b" style={{ borderColor: colors.border.light, background: colors.bg.secondary }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: colors.icon.default }}>
                    <UserPlus className="w-5 h-5" style={{ color: colors.interactive.accent }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                      Add Vadybininkas
                    </h2>
                    <p className="text-sm mt-0.5" style={{ color: colors.text.tertiary }}>
                      Kodas is auto-generated from the name
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewVadybininkas({ fullName: '', kodas: '' });
                    setError(null);
                  }}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" style={{ color: colors.text.tertiary }} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="flex items-center space-x-2 p-3 rounded-lg text-sm" style={{
                  background: colors.status.errorBg,
                  border: `1px solid ${colors.status.errorBorder}`,
                  color: colors.status.errorText
                }}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text.secondary }}>Full Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.text.tertiary }} />
                  <input
                    type="text"
                    value={newVadybininkas.fullName}
                    onChange={(e) => {
                      const name = e.target.value;
                      setNewVadybininkas(prev => ({
                        ...prev,
                        fullName: name,
                        kodas: generateKodas(name)
                      }));
                    }}
                    placeholder="Vardas Pavarde"
                    className="w-full pl-10 pr-3 py-2.5 border rounded-lg focus:outline-none transition-colors text-sm"
                    style={{
                      borderColor: colors.border.default,
                      background: colors.bg.white,
                      color: colors.text.primary
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = colors.interactive.accent}
                    onBlur={(e) => e.currentTarget.style.borderColor = colors.border.default}
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: colors.text.secondary }}>Kodas</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.text.tertiary }} />
                  <input
                    type="text"
                    value={newVadybininkas.kodas}
                    onChange={(e) => setNewVadybininkas(prev => ({ ...prev, kodas: e.target.value.toUpperCase() }))}
                    placeholder="e.g. TN"
                    className="w-full pl-10 pr-3 py-2.5 border rounded-lg focus:outline-none transition-colors text-sm"
                    style={{
                      borderColor: colors.border.default,
                      background: colors.bg.white,
                      color: colors.text.primary
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = colors.interactive.accent}
                    onBlur={(e) => e.currentTarget.style.borderColor = colors.border.default}
                  />
                </div>
                <p className="text-xs mt-1" style={{ color: colors.text.tertiary }}>
                  Auto-calculated from name. You can change it.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t rounded-b-xl flex items-center justify-end space-x-3" style={{
              borderColor: colors.border.light,
              background: colors.bg.secondary
            }}>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewVadybininkas({ fullName: '', kodas: '' });
                  setError(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: colors.text.secondary }}
                onMouseEnter={(e) => e.currentTarget.style.background = colors.bg.tertiary}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={saving || !newVadybininkas.fullName.trim() || !newVadybininkas.kodas.trim()}
                className="px-5 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 text-sm font-medium"
                style={{
                  background: colors.interactive.accent,
                  color: '#ffffff'
                }}
                onMouseEnter={(e) => !saving && (e.currentTarget.style.background = colors.interactive.accentHover)}
                onMouseLeave={(e) => !saving && (e.currentTarget.style.background = colors.interactive.accent)}
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Add</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="alert alert-soft alert-error mx-6 mt-4 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100 transition-opacity">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="alert alert-soft alert-success mx-6 mt-4 text-sm">
          <Check className="w-4 h-4 flex-shrink-0" />
          <span>Operation completed successfully!</span>
        </div>
      )}

      {/* Users List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 rounded-lg animate-pulse" style={{ background: colors.bg.secondary }} />
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 mx-auto mb-4" style={{ color: colors.text.tertiary }} />
            <h3 className="text-lg font-medium mb-2" style={{ color: colors.text.primary }}>
              {users.length === 0 ? 'No users yet' : 'No users match the filter'}
            </h3>
            <p className="mb-6" style={{ color: colors.text.secondary }}>
              {users.length === 0 ? 'Create your first user to get started' : 'Try changing the filter to see users'}
            </p>
            {users.length === 0 && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 rounded-lg transition-colors"
                style={{
                  background: colors.interactive.accent,
                  color: '#ffffff'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = colors.interactive.accentHover}
                onMouseLeave={(e) => e.currentTarget.style.background = colors.interactive.accent}
              >
                Add User
              </button>
            )}
          </div>
        ) : (
          <div className="w-full overflow-x-auto rounded-lg border border-base-content/10 bg-base-100">
            <table className="table-striped table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((userData) => (
                  <React.Fragment key={userData.id}>
                    {editingUser?.id === userData.id ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="space-y-4 py-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium mb-2" style={{ color: colors.text.secondary }}>Display Name</label>
                                <input
                                  type="text"
                                  value={editingUser.display_name || ''}
                                  onChange={(e) => setEditingUser({...editingUser, display_name: e.target.value})}
                                  className="input input-sm w-full"
                                />
                              </div>
                              <div className="flex items-center space-x-3">
                                <input
                                  type="checkbox"
                                  id={`editAdmin-${userData.id}`}
                                  checked={editingUser.is_admin}
                                  onChange={(e) => setEditingUser({...editingUser, is_admin: e.target.checked})}
                                  className="checkbox checkbox-sm checkbox-primary"
                                />
                                <label htmlFor={`editAdmin-${userData.id}`} className="text-sm font-medium" style={{ color: colors.text.secondary }}>
                                  Admin privileges
                                </label>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button onClick={handleUpdateUser} disabled={saving} className="btn btn-primary btn-sm">
                                {saving ? <span className="loading loading-spinner loading-xs"></span> : <Save className="w-4 h-4" />}
                                <span>Save</span>
                              </button>
                              <button onClick={() => setEditingUser(null)} className="btn btn-soft btn-sm">Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-medium"
                              style={{ background: `hsl(${(userData.email || '').charCodeAt(0) * 7 % 360}, 60%, 55%)` }}>
                              {(userData.display_name || userData.full_name || userData.email || '?').charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium">{userData.display_name || userData.full_name || userData.email}</span>
                          </div>
                        </td>
                        <td className="text-base-content/70">{userData.email}</td>
                        <td className="text-sm text-base-content/60">{userData.role || '—'}</td>
                        <td>
                          {userData.is_admin ? (
                            <span className="text-sm font-medium" style={{ color: colors.text.primary }}>Admin</span>
                          ) : (
                            <span className="text-sm" style={{ color: colors.text.tertiary }}>User</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap">{new Date(userData.created_at).toLocaleDateString()}</td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setExpandedUserId(expandedUserId === userData.id ? null : userData.id)}
                              className="btn btn-circle btn-text btn-sm"
                              title="View details"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingUser(userData)}
                              className="btn btn-circle btn-text btn-sm"
                              title="Edit user"
                            >
                              <UserIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(userData.id)}
                              className="btn btn-circle btn-text btn-sm text-error"
                              title="Delete user"
                              disabled={userData.id === user.id}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {expandedUserId === userData.id && editingUser?.id !== userData.id && (
                      <tr>
                        <td colSpan={6} className="bg-base-200/50">
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 py-1">
                            <div>
                              <label className="text-xs font-medium text-base-content/50">Full Name</label>
                              <p className="text-sm">{userData.full_name || '-'}</p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-base-content/50">Email</label>
                              <p className="text-sm">{userData.email}</p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-base-content/50">Phone</label>
                              <p className="text-sm">{userData.phone || '-'}</p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-base-content/50">Code (Kodas)</label>
                              <p className="text-sm">{userData.kodas || '-'}</p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-base-content/50">Role</label>
                              <p className="text-sm">{userData.role || '-'}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Vadybininkai Table */}
        {vadybininkai.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold mb-3" style={{ color: colors.text.secondary }}>Vadybininkai</h3>
            <div className="w-full overflow-x-auto rounded-lg border border-base-content/10 bg-base-100">
              <table className="table-striped table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Kodas</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vadybininkai.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-medium"
                            style={{ background: `hsl(${(v.full_name || '').charCodeAt(0) * 7 % 360}, 60%, 55%)` }}>
                            {(v.full_name || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium">{v.full_name || '—'}</span>
                        </div>
                      </td>
                      <td className="text-sm font-mono" style={{ color: colors.text.secondary }}>{v.kodas || '—'}</td>
                      <td className="whitespace-nowrap">{new Date(v.created_at).toLocaleDateString()}</td>
                      <td>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete ${v.full_name}?`)) return;
                            try {
                              const { error } = await deleteVadybininkas(v.id);
                              if (error) throw error;
                              await loadVadybininkai();
                            } catch (err: any) {
                              setError(err.message);
                            }
                          }}
                          className="btn btn-circle btn-text btn-sm text-error"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
