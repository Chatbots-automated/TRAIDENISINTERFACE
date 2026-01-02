import React, { useState, useEffect } from 'react';
import { Users, Plus, CreditCard as Edit3, Trash2, Shield, User as UserIcon, Save, X, AlertCircle, Check } from 'lucide-react';
import { createUserByAdmin, getAllUsers, updateUserByAdmin, deleteUserByAdmin } from '../lib/supabase';
import type { AppUser } from '../types';

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
  const [showCreateModal, setShowCreateModal] = useState(false);
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
      setShowCreateModal(false);
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
      <div className="flex-1 flex items-center justify-center bg-macos-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-macos-red/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-macos-red" />
          </div>
          <h3 className="text-lg font-semibold text-macos-gray-900 mb-2 tracking-macos-tight">
            Access Denied
          </h3>
          <p className="text-macos-gray-500 text-sm">
            You need admin privileges to access this page
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-macos-gray-50">
      {/* Header */}
      <div className="p-6 border-b border-black/5 bg-white/80 backdrop-blur-macos">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-macos-gray-900 tracking-macos-tight">User Management</h2>
            <p className="text-sm text-macos-gray-500 mt-1">Create and manage user accounts</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="macos-btn macos-btn-primary px-4 py-2.5 rounded-macos font-medium flex items-center space-x-2 shadow-macos hover:shadow-macos-lg transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="macos-animate-spring bg-white/95 backdrop-blur-macos rounded-macos-xl shadow-macos-window w-full max-w-lg border-[0.5px] border-black/10">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-black/5 bg-macos-gray-50/50 rounded-t-macos-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setNewUserData({ email: '', password: '', displayName: '', isAdmin: false });
                      setError(null);
                    }}
                    className="w-6 h-6 rounded-full bg-macos-gray-100 hover:bg-macos-gray-200 flex items-center justify-center transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-macos-gray-500" />
                  </button>
                </div>
                <div className="flex items-center space-x-2 absolute left-1/2 transform -translate-x-1/2">
                  <UserIcon className="w-4 h-4 text-macos-blue" />
                  <h3 className="text-base font-semibold text-macos-gray-900 tracking-macos-tight">Create New User</h3>
                </div>
                <div className="w-6" />
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {error && (
                <div className="flex items-center space-x-2 text-macos-red bg-macos-red/10 p-3 rounded-macos border-[0.5px] border-macos-red/20">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-macos-gray-700 mb-2">Email *</label>
                <input
                  type="email"
                  value={newUserData.email}
                  onChange={(e) => setNewUserData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="user@example.com"
                  className="w-full macos-input rounded-macos"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-macos-gray-700 mb-2">Password *</label>
                <input
                  type="password"
                  value={newUserData.password}
                  onChange={(e) => setNewUserData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Enter password"
                  className="w-full macos-input rounded-macos"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-macos-gray-700 mb-2">Display Name</label>
                <input
                  type="text"
                  value={newUserData.displayName}
                  onChange={(e) => setNewUserData(prev => ({ ...prev, displayName: e.target.value }))}
                  placeholder="Full Name"
                  className="w-full macos-input rounded-macos"
                />
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setNewUserData(prev => ({ ...prev, isAdmin: !prev.isAdmin }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    newUserData.isAdmin ? 'bg-macos-blue' : 'bg-macos-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-macos transition-transform ${
                      newUserData.isAdmin ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <label className="text-sm font-medium text-macos-gray-700">
                  Admin privileges
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 border-t border-black/5 bg-macos-gray-50/50 rounded-b-macos-xl flex items-center justify-end space-x-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewUserData({ email: '', password: '', displayName: '', isAdmin: false });
                  setError(null);
                }}
                className="macos-btn px-4 py-2 text-sm text-macos-gray-600 hover:text-macos-gray-800 rounded-macos transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={saving || !newUserData.email.trim() || !newUserData.password.trim()}
                className="macos-btn macos-btn-primary px-5 py-2 text-sm font-medium rounded-macos disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
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
      {error && !showCreateModal && (
        <div className="mx-6 mt-4 flex items-center space-x-2 text-macos-red bg-macos-red/10 p-3 rounded-macos border-[0.5px] border-macos-red/20">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-macos-red/60 hover:text-macos-red transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 flex items-center space-x-2 text-macos-green bg-macos-green/10 p-3 rounded-macos border-[0.5px] border-macos-green/20">
          <Check className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">Operation completed successfully!</span>
        </div>
      )}

      {/* Users List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-macos-gray-100 rounded-macos-lg animate-pulse" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-macos-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-macos-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-macos-gray-900 mb-2 tracking-macos-tight">No users yet</h3>
            <p className="text-macos-gray-500 mb-6 text-sm">Create your first user to get started</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="macos-btn macos-btn-primary px-6 py-2.5 rounded-macos font-medium shadow-macos hover:shadow-macos-lg transition-all"
            >
              Add User
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {users.map((userData) => (
              <div
                key={userData.id}
                className="bg-white/80 backdrop-blur-sm border-[0.5px] border-black/5 rounded-macos-lg p-4 hover:bg-white transition-colors shadow-macos-sm hover:shadow-macos"
              >
                {editingUser?.id === userData.id ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-macos-gray-700 mb-2">Display Name</label>
                        <input
                          type="text"
                          value={editingUser.display_name || ''}
                          onChange={(e) => setEditingUser({...editingUser, display_name: e.target.value})}
                          className="w-full macos-input rounded-macos"
                        />
                      </div>
                      <div className="flex items-center space-x-3 pt-6">
                        <button
                          type="button"
                          onClick={() => setEditingUser({...editingUser, is_admin: !editingUser.is_admin})}
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            editingUser.is_admin ? 'bg-macos-blue' : 'bg-macos-gray-300'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-macos transition-transform ${
                              editingUser.is_admin ? 'translate-x-[22px]' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <label className="text-sm font-medium text-macos-gray-700">
                          Admin privileges
                        </label>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleUpdateUser}
                        disabled={saving}
                        className="macos-btn macos-btn-primary px-4 py-2 rounded-macos text-sm font-medium disabled:opacity-50 flex items-center space-x-2"
                      >
                        {saving ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        <span>Save</span>
                      </button>
                      <button
                        onClick={() => setEditingUser(null)}
                        className="macos-btn px-4 py-2 rounded-macos text-sm text-macos-gray-600 hover:text-macos-gray-800 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        userData.is_admin
                          ? 'bg-gradient-to-br from-macos-purple/20 to-macos-blue/20'
                          : 'bg-macos-gray-100'
                      }`}>
                        {userData.is_admin ? (
                          <Shield className="w-6 h-6 text-macos-purple" />
                        ) : (
                          <UserIcon className="w-6 h-6 text-macos-gray-500" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h3 className="text-base font-semibold text-macos-gray-900 tracking-macos-tight">
                            {userData.display_name || userData.email}
                          </h3>
                          {userData.is_admin && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-macos-purple/10 text-macos-purple rounded-full">
                              Admin
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-macos-gray-500">{userData.email}</p>
                        <p className="text-xs text-macos-gray-400 mt-0.5">
                          Created: {new Date(userData.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => setEditingUser(userData)}
                        className="p-2.5 text-macos-gray-400 hover:text-macos-gray-600 hover:bg-macos-gray-100 rounded-macos transition-colors"
                        title="Edit user"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(userData.id)}
                        className="p-2.5 text-macos-gray-400 hover:text-macos-red hover:bg-macos-red/10 rounded-macos transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Delete user"
                        disabled={userData.id === user.id}
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
