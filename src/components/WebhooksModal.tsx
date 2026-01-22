import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Zap,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  FileText,
  Package,
  Database,
  Settings
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

type WebhookCategory = 'nestandartiniai' | 'documents' | 'general' | 'all';

interface WebhookGroup {
  category: WebhookCategory;
  label: string;
  icon: React.ReactNode;
  description: string;
  webhookKeys: string[];
}

const WEBHOOK_GROUPS: WebhookGroup[] = [
  {
    category: 'nestandartiniai',
    label: 'Nestandartiniai Gaminiai',
    icon: <Package className="w-4 h-4" />,
    description: 'EML upload and project management webhooks',
    webhookKeys: [
      'n8n_upload_new',
      'n8n_find_similar',
      'n8n_upload_solution'
    ]
  },
  {
    category: 'documents',
    label: 'Documents',
    icon: <FileText className="w-4 h-4" />,
    description: 'Document processing webhooks',
    webhookKeys: [
      'document_upload',
      'document_process'
    ]
  },
  {
    category: 'general',
    label: 'General',
    icon: <Settings className="w-4 h-4" />,
    description: 'General system webhooks',
    webhookKeys: [
      'general_webhook'
    ]
  }
];

export default function WebhooksModal({ isOpen, onClose, user }: WebhooksModalProps) {
  const [activeTab, setActiveTab] = useState<WebhookCategory>('nestandartiniai');
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
        setSuccess('Webhook atnaujintas sėkmingai');
        setTimeout(() => setSuccess(null), 3000);
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

      if (result.success) {
        setSuccess(`Webhook testas sėkmingas: ${result.status} OK`);
        setTimeout(() => setSuccess(null), 3000);
      }

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
    if (status >= 200 && status < 300) return 'bg-macos-green/10 text-macos-green border-macos-green/20';
    if (status >= 400 && status < 500) return 'bg-macos-orange/10 text-macos-orange border-macos-orange/20';
    if (status >= 500) return 'bg-macos-red/10 text-macos-red border-macos-red/20';
    if (status === 0) return 'bg-macos-red/10 text-macos-red border-macos-red/20';
    return 'bg-macos-gray-100 text-macos-gray-600 border-macos-gray-200';
  };

  const getStatusText = (status: number) => {
    if (status === 0) return 'Connection Error';
    if (status >= 200 && status < 300) return `${status} OK`;
    return `${status} Error`;
  };

  const getFilteredWebhooks = () => {
    const activeGroup = WEBHOOK_GROUPS.find(g => g.category === activeTab);
    if (!activeGroup) return [];

    return webhooks.filter(webhook =>
      activeGroup.webhookKeys.some(key =>
        webhook.webhook_key.toLowerCase().includes(key.toLowerCase())
      )
    );
  };

  const filteredWebhooks = getFilteredWebhooks();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto">
      <div className="macos-animate-spring bg-white/95 backdrop-blur-macos rounded-macos-xl shadow-macos-window w-full max-w-4xl border-[0.5px] border-black/10 my-8">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-black/5 bg-macos-gray-50/50 rounded-t-macos-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-macos-purple/10 rounded-macos flex items-center justify-center">
                <Zap className="w-4 h-4 text-macos-purple" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-macos-gray-900 tracking-macos-tight">
                  Webhook Configuration
                </h2>
                <p className="text-xs text-macos-gray-500 mt-0.5">
                  Manage your n8n webhook endpoints
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-macos-gray-400 hover:text-macos-gray-600 hover:bg-black/5 rounded-macos transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-4 border-b border-black/5">
          <div className="flex space-x-1 bg-macos-gray-100 rounded-macos p-1">
            {WEBHOOK_GROUPS.map((group) => (
              <button
                key={group.category}
                onClick={() => setActiveTab(group.category)}
                className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-macos text-sm font-medium transition-all ${
                  activeTab === group.category
                    ? 'bg-white text-macos-gray-900 shadow-sm'
                    : 'text-macos-gray-600 hover:text-macos-gray-900'
                }`}
              >
                {group.icon}
                <span>{group.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-6 mt-4 flex items-center space-x-2 text-macos-red bg-macos-red/10 p-3 rounded-macos border-[0.5px] border-macos-red/20 macos-animate-slide-down">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-macos-red/60 hover:text-macos-red"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="mx-6 mt-4 flex items-center space-x-2 text-macos-green bg-macos-green/10 p-3 rounded-macos border-[0.5px] border-macos-green/20 macos-animate-slide-down">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{success}</span>
          </div>
        )}

        {/* Tab Description */}
        {WEBHOOK_GROUPS.find(g => g.category === activeTab) && (
          <div className="px-6 pt-4">
            <p className="text-sm text-macos-gray-600">
              {WEBHOOK_GROUPS.find(g => g.category === activeTab)?.description}
            </p>
          </div>
        )}

        {/* Modal Body */}
        <div className="px-6 py-5 min-h-[300px]">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-macos-gray-100 rounded-macos-lg animate-pulse" />
              ))}
            </div>
          ) : filteredWebhooks.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 bg-macos-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-macos-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-macos-gray-900 mb-2">
                Webhook'ų nerasta
              </h3>
              <p className="text-sm text-macos-gray-500">
                Šioje kategorijoje nėra sukonfigūruotų webhook'ų
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredWebhooks.map((webhook) => (
                <div
                  key={webhook.id}
                  className="macos-card p-5 border-[0.5px] border-black/10 hover:border-black/15 transition-all"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-1">
                        <h3 className="text-sm font-semibold text-macos-gray-900">
                          {webhook.webhook_name}
                        </h3>
                        {testResults[webhook.id] && (
                          <span className={`px-2 py-0.5 text-xs font-medium rounded border-[0.5px] ${getStatusColor(testResults[webhook.id].status)}`}>
                            {getStatusText(testResults[webhook.id].status)}
                          </span>
                        )}
                      </div>
                      {webhook.description && (
                        <p className="text-xs text-macos-gray-500">
                          {webhook.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* URL Display/Edit */}
                  {editingId === webhook.id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-macos-gray-700 mb-2">
                          Webhook URL
                        </label>
                        <input
                          type="text"
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          className="macos-input w-full px-3 py-2.5 text-sm rounded-macos-lg"
                          placeholder="https://your-n8n-instance.com/webhook/..."
                          autoFocus
                        />
                      </div>
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={handleCancelEdit}
                          className="macos-btn macos-btn-secondary px-4 py-2 rounded-macos-lg text-sm font-medium"
                        >
                          Atšaukti
                        </button>
                        <button
                          onClick={() => handleSave(webhook)}
                          disabled={saving || !editUrl.trim() || editUrl === webhook.url}
                          className="macos-btn macos-btn-primary px-4 py-2 rounded-macos-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                        >
                          {saving ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Išsaugoma...</span>
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              <span>Išsaugoti</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-macos-gray-600 mb-2">
                          Current URL
                        </label>
                        <div className="flex items-center space-x-2">
                          <code className="flex-1 text-xs bg-macos-gray-100 text-macos-gray-800 px-3 py-2.5 rounded-macos border-[0.5px] border-black/5 font-mono truncate">
                            {webhook.url}
                          </code>
                          <a
                            href={webhook.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 text-macos-gray-400 hover:text-macos-blue hover:bg-macos-blue/10 rounded-macos transition-colors flex-shrink-0"
                            title="Open in browser"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>

                      {/* Last Test Info */}
                      {webhook.last_tested_at && (
                        <div className="mb-4 pb-4 border-b border-black/5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-macos-gray-500">Last tested:</span>
                            <div className="flex items-center space-x-2">
                              <span className="text-macos-gray-600">
                                {new Date(webhook.last_tested_at).toLocaleString('lt-LT')}
                              </span>
                              {webhook.last_test_status && (
                                <span className={`px-2 py-0.5 text-xs font-medium rounded border-[0.5px] ${getStatusColor(webhook.last_test_status)}`}>
                                  {getStatusText(webhook.last_test_status)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => handleEdit(webhook)}
                          className="macos-btn macos-btn-secondary px-4 py-2 rounded-macos-lg text-sm font-medium"
                        >
                          Redaguoti URL
                        </button>
                        <button
                          onClick={() => handleTest(webhook)}
                          disabled={testing === webhook.id}
                          className="macos-btn px-4 py-2 rounded-macos-lg text-sm font-medium disabled:opacity-50 transition-colors flex items-center space-x-2 bg-macos-purple text-white hover:bg-macos-purple/90"
                        >
                          {testing === webhook.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Testuojama...</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-4 h-4" />
                              <span>Test Endpoint</span>
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/5 bg-macos-gray-50/30 rounded-b-macos-xl">
          <div className="flex items-center justify-between text-xs text-macos-gray-500">
            <div className="flex items-center space-x-2">
              <Database className="w-3.5 h-3.5" />
              <span>
                {filteredWebhooks.length} webhook{filteredWebhooks.length !== 1 ? 's' : ''} in this category
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-macos-gray-600 hover:text-macos-gray-900 font-medium"
            >
              Uždaryti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
