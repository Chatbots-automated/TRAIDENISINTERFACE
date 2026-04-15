// Database: Directus API (see ./directus.ts). NOT Supabase.
import { db, dbAdmin } from './database';
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

// Cache for webhook URLs to avoid repeated database calls
const webhookCache: Map<string, { url: string; timestamp: number }> = new Map();
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Get all webhooks (uses admin client to bypass RLS - UI already restricts to admins)
 */
export async function getWebhooks(): Promise<Webhook[]> {
  const { data, error } = await dbAdmin
    .from('webhooks')
    .select('*')
    .order('webhook_name', { ascending: true });

  if (error) {
    console.error('Error fetching webhooks:', error);
    await appLogger.logError({
      action: 'webhooks_fetch_failed',
      error
    });
    throw error;
  }

  return data || [];
}

/**
 * Get a webhook URL by key (with caching)
 */
export async function getWebhookUrl(webhookKey: string): Promise<string | null> {
  // Check cache first
  const cached = webhookCache.get(webhookKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.url;
  }

  const { data, error } = await dbAdmin
    .from('webhooks')
    .select('url, is_active')
    .eq('webhook_key', webhookKey)
    .limit(1);

  if (error) {
    console.error(`[getWebhookUrl] DB error for "${webhookKey}":`, error);
    await appLogger.logError({
      action: 'webhook_url_fetch_failed',
      error,
      metadata: { webhook_key: webhookKey }
    });
    return null;
  }

  const row = data?.[0];

  if (!row) {
    console.warn(`[getWebhookUrl] No row found for key "${webhookKey}" — insert it into the webhooks table`);
    await appLogger.logSystem({
      action: 'webhook_url_missing',
      level: 'warn',
      message: `Webhook row not found for key: ${webhookKey}`,
      metadata: { webhook_key: webhookKey }
    });
    return null;
  }

  if (!row.is_active) {
    console.warn(`[getWebhookUrl] Webhook "${webhookKey}" exists but is_active=false`);
    await appLogger.logSystem({
      action: 'webhook_inactive',
      level: 'warn',
      message: `Webhook inactive for key: ${webhookKey}`,
      metadata: { webhook_key: webhookKey }
    });
    return null;
  }

  // Update cache
  webhookCache.set(webhookKey, { url: row.url, timestamp: Date.now() });

  return row.url;
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

    // Clear cache for this webhook
    webhookCache.delete(webhookKey);

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

    // Clear cache for this webhook
    webhookCache.delete(webhookKey);

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

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
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

/**
 * Clear webhook cache (useful when webhooks are updated)
 */
export function clearWebhookCache(): void {
  webhookCache.clear();
}
