// Database: Directus API (see ./directus.ts). NOT Supabase.
import { dbAdmin } from './database';
import { appLogger } from './appLogger';

export interface Webhook {
  id: string;
  webhook_key: string;
  webhook_name: string;
  description: string | null;
  category: string | null;
  url: string;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_status: number | null;
  created_at: string;
  updated_at: string;
}

export async function callWebhook<T = unknown>(webhookKey: string, payload: unknown): Promise<T> {
  const response = await fetch(`/api/webhooks/${encodeURIComponent(webhookKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json,text/plain,*/*' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Webhook "${webhookKey}" failed (${response.status}): ${errorText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  return response.text() as Promise<T>;
}

/**
 * Update a webhook URL
 */
export async function updateWebhook(
  webhookKey: string,
  url: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await dbAdmin
      .from('webhooks')
      .update({
        url,
        updated_at: new Date().toISOString()
      })
      .eq('webhook_key', webhookKey);

    if (error) {
      throw error;
    }

    await appLogger.logAPI({
      action: 'webhook_updated',
      endpoint: webhookKey,
      method: 'UPDATE',
      metadata: { webhook_key: webhookKey, url }
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error updating webhook:', error);
    await appLogger.logError({
      action: 'webhook_update_failed',
      error,
      metadata: { webhook_key: webhookKey, url }
    });
    return { success: false, error: error.message };
  }
}

/**
 * Update a webhook's category
 */
export async function updateWebhookCategory(
  webhookKey: string,
  category: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await dbAdmin
      .from('webhooks')
      .update({
        category,
        updated_at: new Date().toISOString()
      })
      .eq('webhook_key', webhookKey);

    if (error) throw error;
    await appLogger.logAPI({
      action: 'webhook_category_updated',
      endpoint: webhookKey,
      method: 'UPDATE',
      metadata: { webhook_key: webhookKey, category }
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error updating webhook category:', error);
    await appLogger.logError({
      action: 'webhook_category_update_failed',
      error,
      metadata: { webhook_key: webhookKey, category }
    });
    return { success: false, error: error.message };
  }
}

/**
 * Toggle webhook active status
 */
export async function toggleWebhookActive(
  webhookKey: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await dbAdmin
      .from('webhooks')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString()
      })
      .eq('webhook_key', webhookKey);

    if (error) {
      throw error;
    }

    await appLogger.logAPI({
      action: 'webhook_toggled',
      endpoint: webhookKey,
      method: 'UPDATE',
      metadata: { webhook_key: webhookKey, is_active: isActive }
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error toggling webhook:', error);
    await appLogger.logError({
      action: 'webhook_toggle_failed',
      error,
      metadata: { webhook_key: webhookKey, is_active: isActive }
    });
    return { success: false, error: error.message };
  }
}

/**
 * Test a webhook endpoint
 */
export async function testWebhook(
  webhookKey: string,
  url: string
): Promise<{ success: boolean; status: number; error?: string }> {
  try {
    const startedAt = Date.now();
    const testPayload = {
      test: true,
      timestamp: new Date().toISOString(),
      webhook_key: webhookKey,
      message: 'Test request from Traidenis admin panel'
    };

    const response = await fetch('/api/webhooks/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json,text/plain,*/*' },
      body: JSON.stringify({ url, payload: testPayload })
    });

    // Update last test info in database
    await dbAdmin
      .from('webhooks')
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: response.status
      })
      .eq('webhook_key', webhookKey);

    await appLogger.logAPI({
      action: 'webhook_test',
      endpoint: url,
      method: 'POST',
      statusCode: response.status,
      responseTimeMs: Date.now() - startedAt,
      metadata: { webhook_key: webhookKey }
    });

    return {
      success: response.ok,
      status: response.status
    };
  } catch (error: any) {
    console.error('Error testing webhook:', error);
    await appLogger.logError({
      action: 'webhook_test_failed',
      error,
      metadata: { webhook_key: webhookKey, url }
    });

    // Update test status as failed
    await dbAdmin
      .from('webhooks')
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: 0
      })
      .eq('webhook_key', webhookKey);

    return {
      success: false,
      status: 0,
      error: error.message || 'Network error'
    };
  }
}
