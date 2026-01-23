import React, { useState, useEffect } from 'react';
import { Users, Plus, CreditCard as Edit3, Trash2, Shield, User as UserIcon, Save, X, AlertCircle, Check } from 'lucide-react';
import { createUserByAdmin, getAllUsers, updateUserByAdmin, deleteUserByAdmin } from '../lib/supabase';
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
}

export default function AdminUsersInterface({ user }: AdminUsersInterfaceProps) {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [newUserData, setNewUserData] = useState({
    email: '',
    password: '',
    displayName: '',
    isAdmin: false
  });

  useEffect(() => {
    loadUsers();
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

  const handleCreateUser = async () => {
    if (!newUserData.email.trim() || !newUserData.password.trim()) {
      setError('Email and password are required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error } = await createUserByAdmin(
        newUserData.email,
        newUserData.password,
        newUserData.displayName,
        newUserData.isAdmin
      );
      
      if (error) throw error;

      setNewUserData({ email: '', password: '', displayName: '', isAdmin: false });
      setShowCreateForm(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await loadUsers();
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
          <button
            onClick={() => setShowCreateForm(true)}
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

      {/* Create User Form */}
      {showCreateForm && (
        <div className="p-6 border-b" style={{
          background: colors.interactive.accentLight,
          borderColor: colors.interactive.accent + '33' // 20% opacity
        }}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold" style={{ color: colors.text.primary }}>Create New User</h3>
              <button
                onClick={() => setShowCreateForm(false)}
                className="p-2 rounded-lg transition-colors"
                style={{ color: colors.text.tertiary }}
                onMouseEnter={(e) => e.currentTarget.style.background = colors.bg.secondary}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: colors.text.secondary }}>Email *</label>
                <input
                  type="email"
                  value={newUserData.email}
                  onChange={(e) => setNewUserData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none"
                  style={{
                    borderColor: colors.border.default,
                    background: colors.bg.white,
                    color: colors.text.primary
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = colors.interactive.accent}
                  onBlur={(e) => e.currentTarget.style.borderColor = colors.border.default}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: colors.text.secondary }}>Password *</label>
                <input
                  type="password"
                  value={newUserData.password}
                  onChange={(e) => setNewUserData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Enter password"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none"
                  style={{
                    borderColor: colors.border.default,
                    background: colors.bg.white,
                    color: colors.text.primary
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = colors.interactive.accent}
                  onBlur={(e) => e.currentTarget.style.borderColor = colors.border.default}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: colors.text.secondary }}>Display Name</label>
                <input
                  type="text"
                  value={newUserData.displayName}
                  onChange={(e) => setNewUserData(prev => ({ ...prev, displayName: e.target.value }))}
                  placeholder="Full Name"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none"
                  style={{
                    borderColor: colors.border.default,
                    background: colors.bg.white,
                    color: colors.text.primary
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = colors.interactive.accent}
                  onBlur={(e) => e.currentTarget.style.borderColor = colors.border.default}
                />
              </div>

              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="isAdmin"
                  checked={newUserData.isAdmin}
                  onChange={(e) => setNewUserData(prev => ({ ...prev, isAdmin: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="isAdmin" className="text-sm font-medium" style={{ color: colors.text.secondary }}>
                  Admin privileges
                </label>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleCreateUser}
                disabled={saving || !newUserData.email.trim() || !newUserData.password.trim()}
                className="px-6 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                style={{
                  background: colors.interactive.accent,
                  color: '#ffffff'
                }}
                onMouseEnter={(e) => !saving && (e.currentTarget.style.background = colors.interactive.accentHover)}
                onMouseLeave={(e) => !saving && (e.currentTarget.style.background = colors.interactive.accent)}
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Create User</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="mx-6 mt-4 flex items-center space-x-2 p-3 rounded-lg" style={{
          background: colors.status.error,
          color: colors.status.errorText,
          border: `1px solid ${colors.status.errorBorder}`
        }}>
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 flex items-center space-x-2 p-3 rounded-lg" style={{
          background: colors.status.success,
          color: colors.status.successText,
          border: `1px solid ${colors.status.successBorder}`
        }}>
          <Check className="w-5 h-5" />
          <span className="text-sm">Operation completed successfully!</span>
        </div>
      )}

      {/* Users List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 rounded-lg animate-pulse" style={{ background: colors.bg.secondary }} />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 mx-auto mb-4" style={{ color: colors.text.tertiary }} />
            <h3 className="text-lg font-medium mb-2" style={{ color: colors.text.primary }}>No users yet</h3>
            <p className="mb-6" style={{ color: colors.text.secondary }}>Create your first user to get started</p>
            <button
              onClick={() => setShowCreateForm(true)}
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
          </div>
        ) : (
          <div className="grid gap-4">
            {users.map((userData) => (
              <div
                key={userData.id}
                className="rounded-lg p-4 border transition-all"
                style={{
                  background: colors.bg.white,
                  borderColor: colors.border.default
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px 0 rgba(0, 0, 0, 0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
              >
                {editingUser?.id === userData.id ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: colors.text.secondary }}>Display Name</label>
                        <input
                          type="text"
                          value={editingUser.display_name || ''}
                          onChange={(e) => setEditingUser({...editingUser, display_name: e.target.value})}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none"
                          style={{
                            borderColor: colors.border.default,
                            background: colors.bg.white,
                            color: colors.text.primary
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = colors.interactive.accent}
                          onBlur={(e) => e.currentTarget.style.borderColor = colors.border.default}
                        />
                      </div>
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id={`editAdmin-${userData.id}`}
                          checked={editingUser.is_admin}
                          onChange={(e) => setEditingUser({...editingUser, is_admin: e.target.checked})}
                          className="w-4 h-4 rounded"
                        />
                        <label htmlFor={`editAdmin-${userData.id}`} className="text-sm font-medium" style={{ color: colors.text.secondary }}>
                          Admin privileges
                        </label>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleUpdateUser}
                        disabled={saving}
                        className="px-4 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
                        style={{
                          background: colors.interactive.accent,
                          color: '#ffffff'
                        }}
                        onMouseEnter={(e) => !saving && (e.currentTarget.style.background = colors.interactive.accentHover)}
                        onMouseLeave={(e) => !saving && (e.currentTarget.style.background = colors.interactive.accent)}
                      >
                        {saving ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        <span>Save</span>
                      </button>
                      <button
                        onClick={() => setEditingUser(null)}
                        className="px-4 py-2 border rounded-lg transition-colors"
                        style={{
                          borderColor: colors.border.default,
                          color: colors.text.secondary,
                          background: 'transparent'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = colors.bg.secondary}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{
                        background: userData.is_admin ? colors.interactive.accentLight : colors.icon.default
                      }}>
                        {userData.is_admin ? (
                          <Shield className="w-6 h-6" style={{ color: colors.interactive.accent }} />
                        ) : (
                          <UserIcon className="w-6 h-6" style={{ color: colors.text.secondary }} />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h3 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                            {userData.display_name || userData.email}
                          </h3>
                          {userData.is_admin && (
                            <span className="px-2 py-1 text-xs rounded-full" style={{
                              background: colors.interactive.accentLight,
                              color: colors.interactive.accent
                            }}>
                              Admin
                            </span>
                          )}
                        </div>
                        <p className="text-sm" style={{ color: colors.text.secondary }}>{userData.email}</p>
                        <p className="text-xs" style={{ color: colors.text.tertiary }}>
                          Created: {new Date(userData.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setEditingUser(userData)}
                        className="p-2 rounded-lg transition-colors"
                        style={{ color: colors.text.tertiary }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = colors.text.secondary;
                          e.currentTarget.style.background = colors.bg.secondary;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = colors.text.tertiary;
                          e.currentTarget.style.background = 'transparent';
                        }}
                        title="Edit user"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(userData.id)}
                        className="p-2 rounded-lg transition-colors"
                        style={{ color: colors.status.errorText }}
                        onMouseEnter={(e) => e.currentTarget.style.background = colors.status.error}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        title="Delete user"
                        disabled={userData.id === user.id} // Prevent self-deletion
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}