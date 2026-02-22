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
    const sorted = [...cats].filter(c => c !== UNCATEGORIZED).sort((a, b) => a.localeCompare(b, 'lt'));
    if (cats.has(UNCATEGORIZED)) sorted.push(UNCATEGORIZED);
    return sorted;
  }, [webhooks]);

  const [activeTab, setActiveTab] = useState<string>('');

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
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 flex items-center justify-center z-[9999] p-6"
        style={{ background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
        onClick={onClose}
      >
        {/* Modal — fixed size matching PaklausimoKortele */}
        <div
          className="w-full flex flex-col bg-white rounded-macos-xl overflow-hidden"
          style={{ maxWidth: '960px', height: 'min(90vh, 860px)', boxShadow: '0 32px 64px rgba(0,0,0,0.14), 0 12px 24px rgba(0,0,0,0.06)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Accent strip */}
          <div className="h-1.5 shrink-0" style={{ background: 'linear-gradient(90deg, #5AC8FA 0%, #007AFF 50%, #AF52DE 100%)' }} />

          {/* Header */}
          <div className="px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid #f0ede8' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#f0ede8' }}>
                  <Zap className="w-4.5 h-4.5" style={{ color: '#3b82f6' }} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold" style={{ color: '#3d3935' }}>
                    Webhook konfigūracija
                  </h2>
                  <p className="text-sm" style={{ color: '#8a857f' }}>
                    Tvarkykite n8n webhook galinio taško nuorodas
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full transition-colors hover:bg-macos-gray-100"
              >
                <X className="w-4 h-4" style={{ color: '#8a857f' }} />
              </button>
            </div>
          </div>

          {/* Body: sidebar + content */}
          <div className="flex flex-1 min-h-0">
            {/* Sidebar tabs */}
            <div
              className="w-[160px] shrink-0 py-3 px-2 overflow-y-auto"
              style={{ borderRight: '1px solid #f0ede8', background: '#faf9f7' }}
            >
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all mb-0.5"
                  style={activeTab === cat
                    ? { background: '#fff', color: '#007AFF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }
                    : { color: '#5a5550' }
                  }
                  onMouseEnter={e => { if (activeTab !== cat) e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
                  onMouseLeave={e => { if (activeTab !== cat) e.currentTarget.style.background = ''; }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Content area — scrollable */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-20 rounded-lg animate-pulse" style={{ background: '#faf9f7' }} />
                  ))}
                </div>
              ) : filteredWebhooks.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: '#f0ede8' }}>
                    <Zap className="w-7 h-7" style={{ color: '#8a857f' }} />
                  </div>
                  <h3 className="text-sm font-semibold mb-1" style={{ color: '#3d3935' }}>
                    Webhook'ų nerasta
                  </h3>
                  <p className="text-xs" style={{ color: '#8a857f' }}>
                    Šioje kategorijoje nėra sukonfigūruotų webhook'ų
                  </p>
                </div>
              ) : (
                <div className="w-full overflow-x-auto rounded-lg" style={{ border: '0.5px solid rgba(0,0,0,0.08)' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f0ede8' }}>
                        <th className="px-3 py-2.5 text-left">
                          <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Pavadinimas</span>
                        </th>
                        <th className="px-3 py-2.5 text-left">
                          <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Kategorija</span>
                        </th>
                        <th className="px-3 py-2.5 text-left">
                          <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>URL</span>
                        </th>
                        <th className="px-3 py-2.5 text-left">
                          <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Būsena</span>
                        </th>
                        <th className="px-3 py-2.5 text-right">
                          <span className="text-xs font-semibold" style={{ color: '#8a857f' }}>Veiksmai</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWebhooks.map((webhook) => (
                        <React.Fragment key={webhook.id}>
                          {editingId === webhook.id ? (
                            <tr style={{ borderBottom: '1px solid #f8f6f3' }}>
                              <td colSpan={5} className="px-3 py-3">
                                <div className="space-y-2">
                                  <div className="text-sm font-medium" style={{ color: '#3d3935' }}>{webhook.webhook_name}</div>
                                  <input
                                    type="text"
                                    value={editUrl}
                                    onChange={(e) => setEditUrl(e.target.value)}
                                    className="w-full px-3 py-1.5 rounded-lg font-mono text-xs"
                                    style={{ border: '1px solid #e8e5e0', outline: 'none', color: '#3d3935' }}
                                    placeholder="https://your-n8n-instance.com/webhook/..."
                                    autoFocus
                                    onFocus={e => e.currentTarget.style.borderColor = '#007AFF'}
                                    onBlur={e => e.currentTarget.style.borderColor = '#e8e5e0'}
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={handleCancelEdit}
                                      className="px-3 py-1 rounded-lg text-xs font-medium transition-colors hover:bg-black/5"
                                      style={{ color: '#5a5550' }}
                                    >
                                      Atšaukti
                                    </button>
                                    <button
                                      onClick={() => handleSave(webhook)}
                                      disabled={saving || !editUrl.trim() || editUrl === webhook.url}
                                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium text-white transition-all"
                                      style={{ background: saving || !editUrl.trim() || editUrl === webhook.url ? '#9ca3af' : '#007AFF' }}
                                    >
                                      {saving ? (
                                        <><Loader2 className="w-3 h-3 animate-spin" /> Išsaugoma...</>
                                      ) : (
                                        <><Save className="w-3 h-3" /> Išsaugoti</>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr style={{ borderBottom: '1px solid #f8f6f3' }}>
                              <td className="px-3 py-2.5">
                                <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: '#3d3935' }}>
                                  {webhook.webhook_name}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
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
                                      className="w-24 px-2 py-0.5 rounded text-xs"
                                      style={{ border: '1px solid #007AFF', outline: 'none' }}
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => handleSaveCategory(webhook)}
                                      disabled={!editCategory.trim()}
                                      className="p-0.5 rounded transition-colors hover:bg-black/5"
                                    >
                                      <Save className="w-3 h-3" style={{ color: '#007AFF' }} />
                                    </button>
                                    <button
                                      onClick={() => setEditingCategoryId(null)}
                                      className="p-0.5 rounded transition-colors hover:bg-black/5"
                                    >
                                      <X className="w-3 h-3" style={{ color: '#8a857f' }} />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleEditCategory(webhook)}
                                    className="text-xs px-2 py-0.5 rounded-md transition-colors hover:bg-black/5"
                                    style={{ color: '#8a857f' }}
                                    title="Spustelėkite norėdami redaguoti kategoriją"
                                  >
                                    {webhook.category || UNCATEGORIZED}
                                  </button>
                                )}
                              </td>
                              <td className="px-3 py-2.5 max-w-[240px]">
                                <code className="text-xs font-mono truncate block" style={{ color: '#8a857f' }}>
                                  {webhook.url || 'Nesukonfigūruota'}
                                </code>
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {testResults[webhook.id] ? (
                                  <span className={getStatusBadgeClass(testResults[webhook.id].status)}>
                                    {getStatusText(testResults[webhook.id].status)}
                                  </span>
                                ) : webhook.last_test_status ? (
                                  <span className={getStatusBadgeClass(webhook.last_test_status)}>
                                    {getStatusText(webhook.last_test_status)}
                                  </span>
                                ) : (
                                  <span className="text-xs" style={{ color: '#d4cfc8' }}>—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => handleEdit(webhook)}
                                    className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors hover:bg-black/5"
                                    style={{ color: '#5a5550' }}
                                  >
                                    Redaguoti
                                  </button>
                                  <button
                                    onClick={() => handleTest(webhook)}
                                    disabled={testing === webhook.id}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white transition-all hover:brightness-95"
                                    style={{ background: '#007AFF' }}
                                  >
                                    {testing === webhook.id ? (
                                      <><Loader2 className="w-3 h-3 animate-spin" /> Testas</>
                                    ) : (
                                      <><Zap className="w-3 h-3" /> Testas</>
                                    )}
                                  </button>
                                  <a
                                    href={webhook.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded-md transition-colors hover:bg-black/5"
                                    title="Atidaryti naršyklėje"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" style={{ color: '#8a857f' }} />
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
          </div>

          {/* Footer */}
          <div className="px-6 py-3 shrink-0" style={{ borderTop: '1px solid #f0ede8', background: '#faf9f7' }}>
            <div className="flex items-center justify-between text-xs" style={{ color: '#8a857f' }}>
              <div className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                <span>
                  {filteredWebhooks.length} webhook'{filteredWebhooks.length !== 1 ? 'ų' : 'as'} šioje kategorijoje
                </span>
              </div>
              <button
                onClick={onClose}
                className="font-medium transition-colors"
                style={{ color: '#8a857f' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#3d3935'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#8a857f'}
              >
                Uždaryti
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Global toast notifications */}
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
    </>
  );
}
