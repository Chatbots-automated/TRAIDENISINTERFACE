import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Save,
  Zap,
  Loader2,
  ExternalLink,
  Database,
} from 'lucide-react';
import type { AppUser } from '../types';
import {
  getWebhooks,
  updateWebhook,
  updateWebhookCategory,
  testWebhook,
  Webhook
} from '../lib/webhooksService';
import NotificationContainer, { Notification } from './NotificationContainer';
import { colors } from '../lib/designSystem';

interface WebhooksModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser;
}

const UNCATEGORIZED = 'Kita';

export default function WebhooksModal({ isOpen, onClose, user }: WebhooksModalProps) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: number; success: boolean }>>({});

  // Category editing
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState('');

  // Toast notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const addNotification = (type: Notification['type'], title: string, message: string) => {
    const id = `wh-${Date.now()}-${Math.random()}`;
    setNotifications(prev => [...prev, { id, type, title, message }]);
  };
  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Build dynamic tabs from the category column
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const wh of webhooks) {
      cats.add(wh.category?.trim() || UNCATEGORIZED);
    }
    // Return sorted, but keep UNCATEGORIZED last
    const sorted = [...cats].filter(c => c !== UNCATEGORIZED).sort((a, b) => a.localeCompare(b, 'lt'));
    if (cats.has(UNCATEGORIZED)) sorted.push(UNCATEGORIZED);
    return sorted;
  }, [webhooks]);

  const [activeTab, setActiveTab] = useState<string>('');

  // Auto-select first tab when categories load
  useEffect(() => {
    if (categories.length > 0 && !categories.includes(activeTab)) {
      setActiveTab(categories[0]);
    }
  }, [categories]);

  useEffect(() => {
    if (isOpen) {
      loadWebhooks();
    }
  }, [isOpen]);

  const loadWebhooks = async () => {
    try {
      setLoading(true);
      const data = await getWebhooks();
      setWebhooks(data);
    } catch (err: any) {
      addNotification('error', 'Klaida', 'Nepavyko įkelti webhook\'ų');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredWebhooks = useMemo(() => {
    return webhooks.filter(wh => (wh.category?.trim() || UNCATEGORIZED) === activeTab);
  }, [webhooks, activeTab]);

  // ---------- Edit URL ----------
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
      const result = await updateWebhook(webhook.webhook_key, editUrl.trim());
      if (result.success) {
        addNotification('success', 'Išsaugota', 'Webhook atnaujintas sėkmingai');
        setEditingId(null);
        setEditUrl('');
        await loadWebhooks();
      } else {
        addNotification('error', 'Klaida', result.error || 'Nepavyko išsaugoti');
      }
    } catch (err: any) {
      addNotification('error', 'Klaida', err.message);
    } finally {
      setSaving(false);
    }
  };

  // ---------- Edit Category ----------
  const handleEditCategory = (webhook: Webhook) => {
    setEditingCategoryId(webhook.id);
    setEditCategory(webhook.category || '');
  };

  const handleSaveCategory = async (webhook: Webhook) => {
    const newCat = editCategory.trim();
    if (!newCat) return;
    try {
      const result = await updateWebhookCategory(webhook.webhook_key, newCat);
      if (result.success) {
        addNotification('success', 'Išsaugota', 'Kategorija atnaujinta');
        setEditingCategoryId(null);
        setEditCategory('');
        await loadWebhooks();
      } else {
        addNotification('error', 'Klaida', result.error || 'Nepavyko išsaugoti');
      }
    } catch (err: any) {
      addNotification('error', 'Klaida', err.message);
    }
  };

  // ---------- Test ----------
  const handleTest = async (webhook: Webhook) => {
    try {
      setTesting(webhook.id);
      const result = await testWebhook(webhook.webhook_key, webhook.url);

      setTestResults(prev => ({
        ...prev,
        [webhook.id]: { status: result.status, success: result.success }
      }));

      if (result.success) {
        addNotification('success', 'Testas sėkmingas', `${result.status} OK`);
      } else {
        addNotification('error', 'Testas nepavyko', `Statusas: ${result.status || 'Ryšio klaida'}`);
      }

      setTimeout(() => {
        setTestResults(prev => {
          const next = { ...prev };
          delete next[webhook.id];
          return next;
        });
      }, 5000);

      await loadWebhooks();
    } catch (err: any) {
      addNotification('error', 'Klaida', err.message);
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

        {/* Tab Navigation — built dynamically from DB categories */}
        <div className="px-6 pt-4 pb-2 border-b" style={{ borderColor: colors.border.default }}>
          <div className="flex gap-2 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: activeTab === cat ? colors.interactive.accent : colors.bg.secondary,
                  color: activeTab === cat ? '#ffffff' : colors.text.secondary,
                  border: `1px solid ${activeTab === cat ? colors.interactive.accent : colors.border.default}`
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

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
                    <th>Kategorija</th>
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
                          <td colSpan={5}>
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
                          <td className="whitespace-nowrap">
                            {editingCategoryId === webhook.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={editCategory}
                                  onChange={(e) => setEditCategory(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveCategory(webhook);
                                    if (e.key === 'Escape') setEditingCategoryId(null);
                                  }}
                                  className="input input-sm input-xs w-28 text-xs"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveCategory(webhook)}
                                  disabled={!editCategory.trim()}
                                  className="btn btn-primary btn-sm btn-xs px-1.5"
                                >
                                  <Save className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => setEditingCategoryId(null)}
                                  className="btn btn-soft btn-sm btn-xs px-1.5"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleEditCategory(webhook)}
                                className="text-xs px-2 py-0.5 rounded-md transition-colors hover:bg-black/5"
                                style={{ color: colors.text.secondary }}
                                title="Spustelėkite norėdami redaguoti kategoriją"
                              >
                                {webhook.category || UNCATEGORIZED}
                              </button>
                            )}
                          </td>
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

      {/* Global toast notifications */}
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
    </div>
  );
}
