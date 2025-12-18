// Voiceflow Knowledge Base API Service
// Handles fetching and managing documents in Voiceflow Knowledge Base
// API Docs: https://docs.voiceflow.com/reference/knowledge-overview

const VOICEFLOW_API_KEY = import.meta.env.VITE_VOICEFLOW_API_KEY;
const VOICEFLOW_KB_BASE = 'https://api.voiceflow.com/v1/knowledge-base';

export interface VoiceflowDocument {
  documentID: string;
  name?: string;
  data?: {
    name?: string;
    type?: string;
    url?: string;
    schema?: any;
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
  chunkCount?: number;
  chunkStrategy?: {
    type?: string;
    maxChunkSize?: number;
  };
}

export interface FetchDocumentsOptions {
  documentType?: 'file' | 'url' | 'table';
  includeAllStatuses?: boolean;
}

// Fetch all documents from Voiceflow Knowledge Base with pagination
// API: GET /v1/knowledge-base/docs
export async function fetchVoiceflowDocuments(options?: FetchDocumentsOptions): Promise<VoiceflowDocument[]> {
  if (!VOICEFLOW_API_KEY) {
    console.error('Voiceflow API key not configured');
    throw new Error('Voiceflow API not configured');
  }

  console.log('[Voiceflow KB] Fetching all documents with pagination...');

  const allDocuments: VoiceflowDocument[] = [];
  const pageSize = 100; // Request up to 100 docs per page
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    // Build query params - Voiceflow KB API uses page-based pagination
    const queryParams = new URLSearchParams();
    queryParams.append('limit', pageSize.toString());
    queryParams.append('page', page.toString());

    if (options?.documentType) {
      queryParams.append('documentType', options.documentType);
    }

    const url = `${VOICEFLOW_KB_BASE}/docs?${queryParams.toString()}`;
    console.log(`[Voiceflow KB] Fetching page ${page}...`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': VOICEFLOW_API_KEY,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Voiceflow KB] Failed to fetch documents:', response.status, errorText);
        throw new Error(`Failed to fetch documents: ${response.status}`);
      }

      const data = await response.json();

      // Handle multiple response formats
      let documents: VoiceflowDocument[];
      let totalDocs: number | undefined;

      if (Array.isArray(data)) {
        documents = data;
      } else if (data.data && Array.isArray(data.data)) {
        documents = data.data;
        totalDocs = data.total || data.totalCount;
      } else if (data.documents && Array.isArray(data.documents)) {
        documents = data.documents;
        totalDocs = data.total;
      } else {
        documents = [];
      }

      if (documents.length === 0) {
        hasMore = false;
        console.log('[Voiceflow KB] No more documents to fetch');
      } else {
        allDocuments.push(...documents);
        console.log(`[Voiceflow KB] Fetched ${documents.length} documents, total: ${allDocuments.length}`);

        // Check if we've fetched all documents
        if (totalDocs && allDocuments.length >= totalDocs) {
          hasMore = false;
        } else if (documents.length < pageSize) {
          hasMore = false;
        } else {
          page++;
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      console.error('[Voiceflow KB] Error fetching documents page:', error);
      throw error;
    }
  }

  console.log(`[Voiceflow KB] Total documents fetched: ${allDocuments.length}`);
  return allDocuments;
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

// Upload options for document upload
export interface UploadDocumentOptions {
  file: File;
  metadata?: Record<string, any>;
  // Chunking strategy options - per Voiceflow API docs
  maxChunkSize?: number;         // Max size of chunks in characters (default: 1000)
  llmBasedChunks?: boolean;      // Use LLM-based semantic chunking
  llmPrependContext?: boolean;   // Prepend context from LLM to each chunk
  llmGeneratedQ?: boolean;       // Generate example questions for each chunk
  markdownConversion?: boolean;  // Convert PDF/DOCX to markdown before chunking
  overwrite?: boolean;           // Overwrite existing document with same name
}

export interface UploadDocumentResult {
  success: boolean;
  documentID?: string;
  status?: string;
  error?: string;
  data?: any;
}

// Upload a document to Voiceflow Knowledge Base
// API: POST /v1/knowledge-base/docs/upload
// Supports: pdf, txt, docx files (max 10MB per file)
export async function uploadVoiceflowDocument(options: UploadDocumentOptions): Promise<UploadDocumentResult> {
  if (!VOICEFLOW_API_KEY) {
    throw new Error('Voiceflow API not configured');
  }

  const { file, metadata, maxChunkSize, llmBasedChunks, llmPrependContext, llmGeneratedQ, markdownConversion, overwrite } = options;

  // Validate file
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new Error('File size exceeds 10MB limit');
  }

  const allowedTypes = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/markdown'];
  const allowedExtensions = ['.pdf', '.txt', '.docx', '.md', '.doc'];
  const fileExtension = '.' + (file.name.split('.').pop()?.toLowerCase() || '');

  if (!allowedExtensions.includes(fileExtension)) {
    throw new Error(`Unsupported file type: ${fileExtension}. Supported: pdf, txt, docx, md`);
  }

  console.log(`[Voiceflow KB] Uploading document: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);

  // Build query parameters based on chunking options
  const queryParams = new URLSearchParams();

  if (maxChunkSize !== undefined) {
    queryParams.append('maxChunkSize', maxChunkSize.toString());
  }
  if (llmBasedChunks) {
    queryParams.append('llmBasedChunks', 'true');
  }
  if (llmPrependContext) {
    queryParams.append('llmPrependContext', 'true');
  }
  if (llmGeneratedQ) {
    queryParams.append('llmGeneratedQ', 'true');
  }
  if (markdownConversion) {
    queryParams.append('markdownConversion', 'true');
  }
  if (overwrite) {
    queryParams.append('overwrite', 'true');
  }

  const uploadUrl = `${VOICEFLOW_KB_BASE}/docs/upload${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  console.log(`[Voiceflow KB] Upload URL: ${uploadUrl}`);

  // Prepare multipart form data
  const formData = new FormData();
  formData.append('file', file);

  if (metadata && Object.keys(metadata).length > 0) {
    formData.append('metadata', JSON.stringify(metadata));
  }

  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': VOICEFLOW_API_KEY,
        // Don't set Content-Type for multipart/form-data - browser sets it with boundary
      },
      body: formData,
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage = responseData.message || responseData.error || `Upload failed: ${response.status}`;
      console.error('[Voiceflow KB] Upload failed:', response.status, responseData);
      return {
        success: false,
        error: errorMessage,
        data: responseData,
      };
    }

    console.log('[Voiceflow KB] Upload successful:', responseData);

    // Extract document ID from response (handle multiple formats)
    const documentID = responseData.data?.documentID || responseData.documentID || responseData.id;

    return {
      success: true,
      documentID,
      status: responseData.status?.type || 'PENDING',
      data: responseData,
    };
  } catch (error: any) {
    console.error('[Voiceflow KB] Upload error:', error);
    return {
      success: false,
      error: error.message || 'Upload failed due to network error',
    };
  }
}

// Upload a URL to Voiceflow Knowledge Base
// API: POST /v1/knowledge-base/docs/upload/url
export async function uploadVoiceflowURL(url: string, metadata?: Record<string, any>): Promise<UploadDocumentResult> {
  if (!VOICEFLOW_API_KEY) {
    throw new Error('Voiceflow API not configured');
  }

  console.log(`[Voiceflow KB] Uploading URL: ${url}`);

  try {
    const response = await fetch(`${VOICEFLOW_KB_BASE}/docs/upload/url`, {
      method: 'POST',
      headers: {
        'Authorization': VOICEFLOW_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: { url },
        ...(metadata ? { metadata } : {}),
      }),
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage = responseData.message || responseData.error || `Upload failed: ${response.status}`;
      console.error('[Voiceflow KB] URL upload failed:', response.status, responseData);
      return {
        success: false,
        error: errorMessage,
        data: responseData,
      };
    }

    console.log('[Voiceflow KB] URL upload successful:', responseData);

    const documentID = responseData.data?.documentID || responseData.documentID || responseData.id;

    return {
      success: true,
      documentID,
      status: responseData.status?.type || 'PENDING',
      data: responseData,
    };
  } catch (error: any) {
    console.error('[Voiceflow KB] URL upload error:', error);
    return {
      success: false,
      error: error.message || 'Upload failed due to network error',
    };
  }
}

// Get document status
// API: GET /v1/knowledge-base/docs/{documentID}
export async function getDocumentStatus(documentID: string): Promise<VoiceflowDocument | null> {
  if (!VOICEFLOW_API_KEY) {
    throw new Error('Voiceflow API not configured');
  }

  try {
    const response = await fetch(`${VOICEFLOW_KB_BASE}/docs/${documentID}`, {
      method: 'GET',
      headers: {
        'Authorization': VOICEFLOW_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[Voiceflow KB] Failed to get document status:', response.status);
      return null;
    }

    const data = await response.json();
    return data.data || data;
  } catch (error) {
    console.error('[Voiceflow KB] Error getting document status:', error);
    return null;
  }
}

// Resync a document by re-uploading with overwrite
// This is used when a document fails during chunking/processing
// Voiceflow doesn't have a direct resync API, so we delete and re-upload
export async function resyncVoiceflowDocument(documentID: string): Promise<UploadDocumentResult> {
  if (!VOICEFLOW_API_KEY) {
    throw new Error('Voiceflow API not configured');
  }

  console.log(`[Voiceflow KB] Resyncing document: ${documentID}`);

  try {
    // Get current document info first
    const docInfo = await getDocumentStatus(documentID);
    if (!docInfo) {
      return {
        success: false,
        error: 'Could not find document to resync',
      };
    }

    // For URL documents, we can re-upload the URL
    if (docInfo.data?.type === 'url' && docInfo.data?.url) {
      // Delete the failed document first
      await deleteVoiceflowDocument(documentID);

      // Re-upload the URL
      return await uploadVoiceflowURL(docInfo.data.url, docInfo.integrationMetadata);
    }

    // For file documents, we cannot resync without the original file
    // The user will need to re-upload the file
    return {
      success: false,
      error: 'File documents cannot be automatically resynced. Please delete and re-upload the file.',
    };
  } catch (error: any) {
    console.error('[Voiceflow KB] Resync error:', error);
    return {
      success: false,
      error: error.message || 'Resync failed',
    };
  }
}

// Filter documents to only show UserDocs (documents uploaded through our interface)
export function filterUserDocuments(documents: VoiceflowDocument[]): VoiceflowDocument[] {
  return documents.filter(doc => {
    // Check if document has UserDocs metadata (any value)
    const userDocsValue = doc.integrationMetadata?.UserDocs;
    return userDocsValue !== undefined && userDocsValue !== null && userDocsValue !== '';
  });
}

// Check if a document is a user document (has UserDocs metadata)
export function isUserDocument(doc: VoiceflowDocument): boolean {
  const userDocsValue = doc.integrationMetadata?.UserDocs;
  return userDocsValue !== undefined && userDocsValue !== null && userDocsValue !== '';
}
