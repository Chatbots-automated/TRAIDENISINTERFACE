import { supabase, supabaseAdmin } from './supabase';

export interface Webhook {
  id: string;
  webhook_key: string;
  webhook_name: string;
  description: string | null;
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
  const { data, error } = await supabaseAdmin
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

  const { data, error } = await supabaseAdmin
    .from('webhooks')
    .select('url, is_active')
    .eq('webhook_key', webhookKey)
    .single();

  if (error || !data) {
    console.error('Error fetching webhook URL:', error);
    return null;
  }

  if (!data.is_active) {
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
    const { error } = await supabaseAdmin
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
 * Toggle webhook active status
 */
export async function toggleWebhookActive(
  webhookKey: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin
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
 * Test a webhook endpoint (uses proxy for HTTPS webhooks with self-signed certs)
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

    // Use proxy for HTTPS URLs (handles self-signed certificates)
    // Use direct fetch for HTTP URLs
    let result;
    if (url.startsWith('https://')) {
      result = await callWebhookViaProxy(url, testPayload);
    } else {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testPayload)
      });

      result = {
        success: response.ok,
        status: response.status,
        error: response.ok ? undefined : `HTTP ${response.status}`
      };
    }

    // Update last test info in database
    await supabaseAdmin
      .from('webhooks')
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: result.status
      })
      .eq('webhook_key', webhookKey);

    return {
      success: result.success,
      status: result.status,
      error: result.error
    };
  } catch (error: any) {
    console.error('Error testing webhook:', error);

    // Update test status as failed
    await supabaseAdmin
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

/**
 * Call a webhook through the Netlify proxy function (bypasses SSL certificate issues)
 *
 * This function routes webhook calls through a Netlify serverless function
 * which can bypass self-signed SSL certificate verification.
 *
 * @param webhookUrl - The full HTTPS URL of the webhook endpoint
 * @param data - The payload to send to the webhook
 * @returns Promise with the webhook response
 */
export async function callWebhookViaProxy(
  webhookUrl: string,
  data: any
): Promise<{ success: boolean; status: number; data?: any; error?: string }> {
  try {
    const proxyUrl = '/.netlify/functions/n8n-proxy';

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhookUrl,
        data
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: result.error || result.message || 'Proxy request failed'
      };
    }

    return {
      success: result.success,
      status: result.status,
      data: result.data
    };
  } catch (error: any) {
    console.error('Error calling webhook via proxy:', error);
    return {
      success: false,
      status: 0,
      error: error.message || 'Network error'
    };
  }
}
