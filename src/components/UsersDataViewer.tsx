import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Search,
  Shield,
  User as UserIcon,
  Mail,
  Calendar,
  Hash,
  AlertCircle,
} from 'lucide-react';
import { getAllUsers } from '../lib/supabase';
import type { User } from '../types';

export default function UsersDataViewer() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await getAllUsers();
      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      console.error('Failed to load users:', err);
      setError(err?.message || 'Unable to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const term = search.toLowerCase();
    return users.filter((user) =>
      [user.email, user.display_name]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(term))
    );
  }, [users, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={loadUsers}
          disabled={loading}
          className="inline-flex items-center justify-center px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center space-x-2 p-3 rounded-xl bg-red-50 text-red-700 border border-red-100">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-gradient-to-r from-gray-100 to-gray-50 animate-pulse" />
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-200 rounded-2xl">
            <UserIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-base font-medium text-gray-700">No users found</p>
            <p className="text-sm text-gray-500">
              Try adjusting your search or refresh to fetch the latest data.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredUsers.map((userData) => (
              <div
                key={userData.id}
                className="p-5 border border-gray-200 rounded-2xl bg-white shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-green-50 to-blue-50 text-green-600">
                      {userData.is_admin ? (
                        <Shield className="w-6 h-6" />
                      ) : (
                        <UserIcon className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-gray-900">
                        {userData.display_name || 'No display name'}
                      </p>
                      <div className="flex items-center text-sm text-gray-500">
                        <Mail className="w-4 h-4 mr-1" />
                        {userData.email}
                      </div>
                    </div>
                  </div>
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full ${userData.is_admin ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {userData.is_admin ? 'Admin' : 'User'}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm text-gray-600">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-400">Created</p>
                      <p className="font-medium">
                        {userData.created_at
                          ? new Date(userData.created_at).toLocaleString()
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Hash className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-400">User ID</p>
                      <p className="font-mono text-xs break-all">{userData.id}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

