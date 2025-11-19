import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Shield,
  Database,
  ChevronLeft,
  Settings as SettingsIcon,
  Users as UsersIcon,
  Activity,
} from 'lucide-react';
import type { AppUser } from '../types';
import LogsViewer from './LogsViewer';
import UsersDataViewer from './UsersDataViewer';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser;
}

type SettingsView = 'home' | 'adminMenu' | 'logs' | 'users';

export default function SettingsModal({ isOpen, onClose, user }: SettingsModalProps) {
  const [view, setView] = useState<SettingsView>('home');

  useEffect(() => {
    if (isOpen) {
      setView('home');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setView('home');
    onClose();
  };

  const title = useMemo(() => {
    switch (view) {
      case 'adminMenu':
        return 'Admin';
      case 'logs':
        return 'Log Explorer';
      case 'users':
        return 'User Directory';
      default:
        return 'Settings';
    }
  }, [view]);

  const handleBack = () => {
    if (view === 'adminMenu') {
      setView('home');
      return;
    }

    if (view === 'logs' || view === 'users') {
      setView('adminMenu');
    }
  };

  const renderContent = () => {
    if (view === 'logs') {
      return (
        <LogsViewer
          embed
          isOpen
          onClose={() => setView('adminMenu')}
          user={user}
        />
      );
    }

    if (view === 'users') {
      return <UsersDataViewer />;
    }

    if (view === 'adminMenu') {
      return (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-100 rounded-2xl p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Administrative tools</h3>
            <p className="text-sm text-gray-600">
              Review system activity, investigate issues, and inspect user accounts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setView('logs')}
              className="h-full text-left p-5 rounded-2xl border border-gray-200 hover:border-green-300 hover:shadow-lg transition-all bg-white flex flex-col space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="p-3 rounded-xl bg-green-50 text-green-600">
                  <Database className="w-5 h-5" />
                </div>
                <Activity className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">Logs</p>
                <p className="text-sm text-gray-600">
                  Browse data from Supabase tables and filter by log source.
                </p>
              </div>
            </button>

            <button
              onClick={() => setView('users')}
              className="h-full text-left p-5 rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all bg-white flex flex-col space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
                  <UsersIcon className="w-5 h-5" />
                </div>
                <Shield className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">Users</p>
                <p className="text-sm text-gray-600">
                  Inspect the current user base, roles, and onboarding history.
                </p>
              </div>
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="mb-8">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Account
          </h3>
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Email</span>
              <span className="text-sm font-medium text-gray-900">{user.email}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Display Name</span>
              <span className="text-sm font-medium text-gray-900">
                {user.display_name || 'Not set'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Role</span>
              <span className="text-sm font-medium text-gray-900">
                {user.is_admin ? 'Administrator' : 'User'}
              </span>
            </div>
          </div>
        </div>

        {user.is_admin && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              Administration
            </h3>
            <button
              onClick={() => setView('adminMenu')}
              className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-blue-50 hover:from-green-100 hover:to-blue-100 rounded-xl transition-all group"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white rounded-lg shadow-sm group-hover:shadow transition-shadow">
                  <SettingsIcon className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900">Admin Tools</p>
                  <p className="text-sm text-gray-600">Explore logs, manage users, and audit data</p>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-gray-400 group-hover:text-green-600 transition-colors rotate-180" />
            </button>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            {view !== 'home' && (
              <button
                onClick={handleBack}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-500" />
              </button>
            )}
            <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-white">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
