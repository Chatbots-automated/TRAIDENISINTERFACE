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
  try {
    console.log('Calling vector search with query:', query);
    
    const requestBody = {
      query,
      match_count: opts?.match_count ?? 10,
      min_similarity: opts?.min_similarity ?? 0.1,
      ...(opts?.metadata && { metadata: opts.metadata })
    };

    console.log('Request body:', requestBody);

    const response = await fetch('https://209f05431d92.ngrok-free.app/webhook-test/8a667605-f58f-42e0-a8f1-5ce633954009', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vector search HTTP error:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('Vector search results:', data);

    return data as SearchResult[];
  } catch (error) {
    console.error('Error calling vector search function:', error);
    throw error;
  }
}