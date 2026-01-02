import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Zap,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink
} from 'lucide-react';
import type { AppUser } from '../types';
import {
  getWebhooks,
  updateWebhook,
  testWebhook,
  Webhook
} from '../lib/webhooksService';

interface WebhooksModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser;
}

export default function WebhooksModal({ isOpen, onClose, user }: WebhooksModalProps) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: number; success: boolean }>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadWebhooks();
    }
  }, [isOpen]);

  const loadWebhooks = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getWebhooks();
      setWebhooks(data);
    } catch (err: any) {
      setError('Nepavyko įkelti webhook\'ų');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (webhook: Webhook) => {
    setEditingId(webhook.id);
    setEditUrl(webhook.url);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditUrl('');
  };

  const handleSave = async (webhook: Webhook) => {
    if (!editUrl.trim()) return;

    try {
      setSaving(true);
      setError(null);
      const result = await updateWebhook(webhook.webhook_key, editUrl.trim());

      if (result.success) {
        setSuccess('Webhook atnaujintas');
        setTimeout(() => setSuccess(null), 2000);
        setEditingId(null);
        setEditUrl('');
        await loadWebhooks();
      } else {
        setError(result.error || 'Nepavyko išsaugoti');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (webhook: Webhook) => {
    try {
      setTesting(webhook.id);
      setError(null);
      const result = await testWebhook(webhook.webhook_key, webhook.url);

      setTestResults(prev => ({
        ...prev,
        [webhook.id]: { status: result.status, success: result.success }
      }));

      // Clear result after 5 seconds
      setTimeout(() => {
        setTestResults(prev => {
          const newResults = { ...prev };
          delete newResults[webhook.id];
          return newResults;
        });
      }, 5000);

      await loadWebhooks();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTesting(null);
    }
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-macos-green bg-macos-green/10';
    if (status >= 400 && status < 500) return 'text-macos-orange bg-macos-orange/10';
    if (status >= 500) return 'text-macos-red bg-macos-red/10';
    if (status === 0) return 'text-macos-red bg-macos-red/10';
    return 'text-macos-gray-600 bg-macos-gray-100';
  };

  const getStatusText = (status: number) => {
    if (status === 0) return 'Error';
    return `${status}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-20">
      <div className="macos-animate-spring bg-white/95 backdrop-blur-macos rounded-macos-xl shadow-macos-window w-full max-w-2xl max-h-[80vh] flex flex-col border-[0.5px] border-black/10">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-black/5 bg-macos-gray-50/50 rounded-t-macos-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button
                onClick={onClose}
                className="w-6 h-6 rounded-full bg-macos-gray-100 hover:bg-macos-gray-200 flex items-center justify-center transition-colors"
              >
                <X className="w-3.5 h-3.5 text-macos-gray-500" />
              </button>
            </div>
            <div className="flex items-center space-x-2 absolute left-1/2 transform -translate-x-1/2">
              <Zap className="w-4 h-4 text-macos-orange" />
              <h2 className="text-base font-semibold text-macos-gray-900 tracking-macos-tight">
                Webhooks
              </h2>
            </div>
            <div className="w-6" />
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-5 mt-4 flex items-center space-x-2 text-macos-red bg-macos-red/10 p-3 rounded-macos border-[0.5px] border-macos-red/20">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-macos-red/60 hover:text-macos-red transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="mx-5 mt-4 flex items-center space-x-2 text-macos-green bg-macos-green/10 p-3 rounded-macos border-[0.5px] border-macos-green/20">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{success}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-macos-gray-100 rounded-macos-lg animate-pulse" />
              ))}
            </div>
          ) : webhooks.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-12 h-12 bg-macos-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Zap className="w-6 h-6 text-macos-gray-400" />
              </div>
              <p className="text-sm text-macos-gray-500">Webhook'ų nerasta</p>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map((webhook) => (
                <div
                  key={webhook.id}
                  className="bg-macos-gray-50 border-[0.5px] border-black/5 rounded-macos-lg p-4 hover:bg-macos-gray-100/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-macos-gray-900 tracking-macos-tight">
                        {webhook.webhook_name}
                      </h3>
                      {webhook.description && (
                        <p className="text-xs text-macos-gray-500 mt-0.5">
                          {webhook.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      {/* Test Result Badge */}
                      {testResults[webhook.id] && (
                        <span className={`px-2 py-1 text-xs font-medium rounded-macos ${getStatusColor(testResults[webhook.id].status)}`}>
                          {getStatusText(testResults[webhook.id].status)}
                          {testResults[webhook.id].success && ' OK'}
                        </span>
                      )}
                      {/* Last Test Status */}
                      {webhook.last_test_status && !testResults[webhook.id] && (
                        <span className={`px-2 py-1 text-xs font-medium rounded-macos ${getStatusColor(webhook.last_test_status)}`}>
                          Last: {webhook.last_test_status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* URL Display/Edit */}
                  {editingId === webhook.id ? (
                    <div className="mt-3">
                      <input
                        type="text"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        className="w-full macos-input rounded-macos text-sm"
                        placeholder="https://..."
                        autoFocus
                      />
                      <div className="flex items-center justify-end space-x-2 mt-3">
                        <button
                          onClick={handleCancelEdit}
                          className="macos-btn px-4 py-2 text-sm text-macos-gray-600 hover:text-macos-gray-800 transition-colors"
                        >
                          Atšaukti
                        </button>
                        <button
                          onClick={() => handleSave(webhook)}
                          disabled={saving || !editUrl.trim() || editUrl === webhook.url}
                          className="macos-btn macos-btn-primary px-4 py-2 text-sm font-medium rounded-macos disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                        >
                          {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          <span>Išsaugoti</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-2 flex items-center space-x-2">
                        <code className="flex-1 text-xs bg-white/80 text-macos-gray-700 px-3 py-2 rounded-macos truncate border-[0.5px] border-black/5 font-mono">
                          {webhook.url}
                        </code>
                        <a
                          href={webhook.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-macos-gray-400 hover:text-macos-gray-600 transition-colors rounded-macos hover:bg-white/50"
                          title="Atidaryti naršyklėje"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-end space-x-2 mt-3">
                        <button
                          onClick={() => handleEdit(webhook)}
                          className="macos-btn px-4 py-2 text-sm text-macos-gray-600 hover:text-macos-gray-800 rounded-macos transition-colors"
                        >
                          Redaguoti
                        </button>
                        <button
                          onClick={() => handleTest(webhook)}
                          disabled={testing === webhook.id}
                          className="px-4 py-2 bg-gradient-to-b from-macos-orange to-orange-600 text-white text-sm font-medium rounded-macos shadow-macos hover:shadow-macos-lg disabled:opacity-50 transition-all flex items-center space-x-2"
                        >
                          {testing === webhook.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Zap className="w-4 h-4" />
                          )}
                          <span>Test endpoint</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
