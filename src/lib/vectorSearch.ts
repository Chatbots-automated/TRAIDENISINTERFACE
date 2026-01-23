import { appLogger } from './appLogger';
import { supabase, supabaseAdmin } from './supabase';

export interface SearchResult {
  id: string;
  content: string;
  metadata: any;
  similarity: number;
}

export async function searchDocumentsClient(
  query: string,
  opts?: {
    metadata?: Record<string, unknown>;
    match_count?: number;
    min_similarity?: number;
  }
): Promise<SearchResult[]> {
  const webhookUrl = 'https://209f05431d92.ngrok-free.app/webhook-test/8a667605-f58f-42e0-a8f1-5ce633954009';
  const startTime = Date.now();

  try {
    console.log('Calling vector search with query:', query);

    const requestBody = {
      query,
      match_count: opts?.match_count ?? 10,
      min_similarity: opts?.min_similarity ?? 0.1,
      ...(opts?.metadata && { metadata: opts.metadata })
    };

    console.log('Request body:', requestBody);

    // Get current user for logging
    const { data: { user } } = await supabase.auth.getUser();

    // Call webhook directly
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify(requestBody)
    });

    const responseStatus = response.status;
    const result = {
      success: response.ok,
      status: response.status,
      error: response.ok ? undefined : await response.text()
    };

    let responseData;
    if (response.ok) {
      responseData = await response.json();
    }

    const responseTimeMs = Date.now() - startTime;

    if (!result.success) {
      const errorText = result.error || 'Unknown error';
      console.error('Vector search HTTP error:', responseStatus, errorText);

      await appLogger.logDocument({
        action: 'search',
        userId: user?.id,
        userEmail: user?.email,
        level: 'error',
        metadata: {
          query,
          error: `${responseStatus}: ${errorText}`,
          match_count: opts?.match_count ?? 10
        }
      });

      await appLogger.logAPI({
        action: 'webhook_call',
        userId: user?.id,
        userEmail: user?.email,
        endpoint: webhookUrl,
        method: 'POST',
        statusCode: responseStatus,
        responseTimeMs,
        level: 'error',
        metadata: { query, error: errorText }
      });

      throw new Error(`HTTP ${responseStatus}: ${errorText}`);
    }

    const data = responseData;
    console.log('Vector search results:', data);

    await appLogger.logDocument({
      action: 'search',
      userId: user?.id,
      userEmail: user?.email,
      metadata: {
        query,
        result_count: Array.isArray(data) ? data.length : 0,
        match_count: opts?.match_count ?? 10
      }
    });

    await appLogger.logAPI({
      action: 'webhook_call',
      userId: user?.id,
      userEmail: user?.email,
      endpoint: webhookUrl,
      method: 'POST',
      statusCode: responseStatus,
      responseTimeMs,
      metadata: {
        query,
        result_count: Array.isArray(data) ? data.length : 0
      }
    });

    return data as SearchResult[];
  } catch (error: any) {
    console.error('Error calling vector search function:', error);

    const { data: { user } } = await supabase.auth.getUser();

    await appLogger.logError({
      action: 'vector_search_failed',
      error,
      userId: user?.id,
      userEmail: user?.email,
      metadata: {
        query,
        webhook_url: webhookUrl,
        options: opts
      }
    });

    throw error;
  }
}