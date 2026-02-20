import { db, dbAdmin } from './database';

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
    .maybeSingle();

  if (error) {
    console.error(`[getWebhookUrl] DB error for "${webhookKey}":`, error);
    return null;
  }

  if (!data) {
    console.warn(`[getWebhookUrl] No row found for key "${webhookKey}" — insert it into the webhooks table`);
    return null;
  }

  if (!data.is_active) {
    console.warn(`[getWebhookUrl] Webhook "${webhookKey}" exists but is_active=false`);
    return null;
  }

  // Update cache
  webhookCache.set(webhookKey, { url: data.url, timestamp: Date.now() });

  return data.url;
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

    return { success: true };
  } catch (error: any) {
    console.error('Error updating webhook:', error);
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
    return { success: true };
  } catch (error: any) {
    console.error('Error updating webhook category:', error);
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

    return { success: true };
  } catch (error: any) {
    console.error('Error toggling webhook:', error);
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

    return {
      success: response.ok,
      status: response.status
    };
  } catch (error: any) {
    console.error('Error testing webhook:', error);

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
