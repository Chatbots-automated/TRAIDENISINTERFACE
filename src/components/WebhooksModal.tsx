import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Zap,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
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
import { colors } from '../lib/designSystem';

interface WebhooksModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser;
}

type WebhookCategory = 'nestandartiniai' | 'sdk_tools' | 'all';

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
    description: 'EML įkėlimo ir projektų valdymo webhook\'ai',
    webhookKeys: [
      'n8n_upload_new',
      'n8n_find_similar',
      'n8n_upload_solution'
    ]
  },
  {
    category: 'sdk_tools',
    label: 'SDK įrankiai',
    icon: <Settings className="w-4 h-4" />,
    description: 'SDK pokalbių įrankių webhook\'ai ir komercinių pasiūlymų generavimas',
    webhookKeys: [
      'n8n_get_products',
      'n8n_get_prices',
      'n8n_get_multiplier',
      'n8n_commercial_offer'
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

  const getStatusBadgeClass = (status: number) => {
    if (status >= 200 && status < 300) return 'badge badge-soft badge-success text-xs';
    if (status >= 400 || status === 0) return 'badge badge-soft badge-error text-xs';
    return 'badge badge-soft text-xs';
  };

  const getStatusText = (status: number) => {
    if (status === 0) return 'Ryšio klaida';
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
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center p-4 pt-12 overflow-y-auto"
      style={{ background: 'rgba(0, 0, 0, 0.3)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-lg w-full max-w-4xl my-8"
        style={{ border: `1px solid ${colors.border.light}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b" style={{ borderColor: colors.border.light, background: colors.bg.secondary }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: colors.icon.default }}>
                <Zap className="w-5 h-5" style={{ color: colors.interactive.accent }} />
              </div>
              <div>
                <h2 className="text-xl font-semibold" style={{ color: colors.text.primary }}>
                  Webhook konfigūracija
                </h2>
                <p className="text-sm mt-0.5" style={{ color: colors.text.secondary }}>
                  Tvarkykite n8n webhook galinio taško nuorodas
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" style={{ color: colors.text.tertiary }} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-4 pb-2 border-b" style={{ borderColor: colors.border.default }}>
          <div className="flex gap-2">
            {WEBHOOK_GROUPS.map((group) => (
              <button
                key={group.category}
                onClick={() => setActiveTab(group.category)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: activeTab === group.category ? colors.interactive.accent : colors.bg.secondary,
                  color: activeTab === group.category ? '#ffffff' : colors.text.secondary,
                  border: `1px solid ${activeTab === group.category ? colors.interactive.accent : colors.border.default}`
                }}
              >
                {group.icon}
                <span>{group.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="alert alert-soft alert-error mx-6 mt-4 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="alert alert-soft alert-success mx-6 mt-4 text-sm">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Tab Description */}
        {WEBHOOK_GROUPS.find(g => g.category === activeTab) && (
          <div className="px-6 pt-4">
            <p className="text-sm" style={{ color: colors.text.secondary }}>
              {WEBHOOK_GROUPS.find(g => g.category === activeTab)?.description}
            </p>
          </div>
        )}

        {/* Modal Body */}
        <div className="px-6 py-5 min-h-[300px]">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 rounded-lg animate-pulse" style={{ background: colors.bg.secondary }} />
              ))}
            </div>
          ) : filteredWebhooks.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: colors.icon.default }}>
                <Zap className="w-8 h-8" style={{ color: colors.text.tertiary }} />
              </div>
              <h3 className="text-base font-semibold mb-2" style={{ color: colors.text.primary }}>
                Webhook'ų nerasta
              </h3>
              <p className="text-sm" style={{ color: colors.text.secondary }}>
                Šioje kategorijoje nėra sukonfigūruotų webhook'ų
              </p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto rounded-lg border border-base-content/10 bg-base-100">
              <table className="table-striped table">
                <thead>
                  <tr>
                    <th>Pavadinimas</th>
                    <th>URL</th>
                    <th>Būsena</th>
                    <th>Veiksmai</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWebhooks.map((webhook) => (
                    <React.Fragment key={webhook.id}>
                      {editingId === webhook.id ? (
                        <tr>
                          <td colSpan={4}>
                            <div className="space-y-2 py-1">
                              <div className="text-sm font-medium mb-1">{webhook.webhook_name}</div>
                              <input
                                type="text"
                                value={editUrl}
                                onChange={(e) => setEditUrl(e.target.value)}
                                className="input input-sm w-full font-mono text-xs"
                                placeholder="https://your-n8n-instance.com/webhook/..."
                                autoFocus
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={handleCancelEdit} className="btn btn-soft btn-sm btn-xs">
                                  Atšaukti
                                </button>
                                <button
                                  onClick={() => handleSave(webhook)}
                                  disabled={saving || !editUrl.trim() || editUrl === webhook.url}
                                  className="btn btn-primary btn-sm btn-xs"
                                >
                                  {saving ? (
                                    <><Loader2 className="w-3 h-3 animate-spin" /><span>Išsaugoma...</span></>
                                  ) : (
                                    <><Save className="w-3 h-3" /><span>Išsaugoti</span></>
                                  )}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr>
                          <td className="font-medium text-sm whitespace-nowrap">{webhook.webhook_name}</td>
                          <td className="max-w-xs">
                            <code className="text-xs font-mono text-base-content/60 truncate block">
                              {webhook.url || 'Nesukonfigūruota'}
                            </code>
                          </td>
                          <td className="whitespace-nowrap">
                            {testResults[webhook.id] ? (
                              <span className={getStatusBadgeClass(testResults[webhook.id].status)}>
                                {getStatusText(testResults[webhook.id].status)}
                              </span>
                            ) : webhook.last_test_status ? (
                              <span className={getStatusBadgeClass(webhook.last_test_status)}>
                                {getStatusText(webhook.last_test_status)}
                              </span>
                            ) : (
                              <span className="text-xs text-base-content/40">—</span>
                            )}
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleEdit(webhook)} className="btn btn-soft btn-sm btn-xs">
                                Redaguoti
                              </button>
                              <button
                                onClick={() => handleTest(webhook)}
                                disabled={testing === webhook.id}
                                className="btn btn-primary btn-sm btn-xs"
                              >
                                {testing === webhook.id ? (
                                  <><Loader2 className="w-3 h-3 animate-spin" /><span>Testas</span></>
                                ) : (
                                  <><Zap className="w-3 h-3" /><span>Testas</span></>
                                )}
                              </button>
                              <a
                                href={webhook.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-circle btn-text btn-sm btn-xs"
                                title="Atidaryti naršyklėje"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
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
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t rounded-b-xl" style={{
          borderColor: colors.border.light,
          background: colors.bg.secondary
        }}>
          <div className="flex items-center justify-between text-xs" style={{ color: colors.text.secondary }}>
            <div className="flex items-center space-x-2">
              <Database className="w-3.5 h-3.5" />
              <span>
                {filteredWebhooks.length} webhook'{filteredWebhooks.length !== 1 ? 'ų' : 'as'} šioje kategorijoje
              </span>
            </div>
            <button
              onClick={onClose}
              className="font-medium transition-colors"
              style={{ color: colors.text.secondary }}
              onMouseEnter={(e) => e.currentTarget.style.color = colors.text.primary}
              onMouseLeave={(e) => e.currentTarget.style.color = colors.text.secondary}
            >
              Uždaryti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
