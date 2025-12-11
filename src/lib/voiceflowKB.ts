// Voiceflow Knowledge Base API Service
// Handles fetching and managing documents in Voiceflow Knowledge Base

const VOICEFLOW_API_KEY = import.meta.env.VITE_VOICEFLOW_API_KEY;
const VOICEFLOW_KB_BASE = 'https://api.voiceflow.com/v1/knowledge-base';

export interface VoiceflowDocument {
  documentID: string;
  name?: string;
  data?: {
    name?: string;
    type?: string;
    url?: string;
  };
  integrationMetadata?: {
    uploaded_by?: string;
    user_id?: string;
    project_id?: string;
    upload_date?: string;
    UserDocs?: string;
    [key: string]: any;
  };
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  status?: {
    type?: string;
    data?: any;
  };
}

// Fetch all documents from Voiceflow Knowledge Base
export async function fetchVoiceflowDocuments(): Promise<VoiceflowDocument[]> {
  if (!VOICEFLOW_API_KEY) {
    console.error('Voiceflow API key not configured');
    throw new Error('Voiceflow API not configured');
  }

  console.log('[Voiceflow KB] Fetching documents...');

  try {
    const response = await fetch(`${VOICEFLOW_KB_BASE}/docs`, {
      method: 'GET',
      headers: {
        'Authorization': VOICEFLOW_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    console.log('[Voiceflow KB] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Voiceflow KB] Failed to fetch documents:', response.status, errorText);
      throw new Error(`Failed to fetch documents: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Voiceflow KB] Received documents:', data);

    // The API might return { data: [...] } or just [...]
    const documents = Array.isArray(data) ? data : (data.data || []);
    console.log('[Voiceflow KB] Number of documents:', documents.length);

    return documents;
  } catch (error) {
    console.error('[Voiceflow KB] Error fetching documents:', error);
    throw error;
  }
}

// Delete a document from Voiceflow Knowledge Base
export async function deleteVoiceflowDocument(documentID: string): Promise<void> {
  if (!VOICEFLOW_API_KEY) {
    throw new Error('Voiceflow API not configured');
  }

  console.log('[Voiceflow KB] Deleting document:', documentID);

  const response = await fetch(`${VOICEFLOW_KB_BASE}/docs/${documentID}`, {
    method: 'DELETE',
    headers: {
      'Authorization': VOICEFLOW_API_KEY,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Voiceflow KB] Failed to delete document:', response.status, errorText);
    throw new Error(`Failed to delete document: ${response.status}`);
  }

  console.log('[Voiceflow KB] Document deleted successfully');
}

// Get document title/name
export function getDocumentTitle(doc: VoiceflowDocument): string {
  // Try various sources for the document name
  if (doc.data?.name) return doc.data.name;
  if (doc.name) return doc.name;
  if (doc.integrationMetadata?.filename) return doc.integrationMetadata.filename;
  if (doc.integrationMetadata?.title) return doc.integrationMetadata.title;
  return `Document ${doc.documentID.substring(0, 8)}`;
}

// Calculate how many days ago a date was
export function getDaysAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 60) return '1 month ago';
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  if (diffDays < 730) return '1 year ago';
  return `${Math.floor(diffDays / 365)} years ago`;
}

// Format metadata for display
export function formatDocumentMetadata(doc: VoiceflowDocument): Record<string, any> {
  const metadata: Record<string, any> = {};

  // Add integration metadata
  if (doc.integrationMetadata) {
    Object.entries(doc.integrationMetadata).forEach(([key, value]) => {
      metadata[key] = value;
    });
  }

  // Add document metadata
  if (doc.data?.type) metadata['File Type'] = doc.data.type;
  if (doc.data?.url) metadata['URL'] = doc.data.url;
  if (doc.status) metadata['Status'] = doc.status.type || JSON.stringify(doc.status);
  if (doc.createdAt) metadata['Created At'] = new Date(doc.createdAt).toLocaleString('lt-LT');
  if (doc.updatedAt) metadata['Updated At'] = new Date(doc.updatedAt).toLocaleString('lt-LT');
  if (doc.tags && doc.tags.length > 0) metadata['Tags'] = doc.tags.join(', ');

  return metadata;
}
