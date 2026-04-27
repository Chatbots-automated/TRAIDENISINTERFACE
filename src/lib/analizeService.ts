/**
 * ============================================================================
 * ANALIZĖ SERVICE — Directus CRUD for Parsed Documents & Chat
 * ============================================================================
 *
 * Collections:
 *   parsed_documents  — stores parsed document metadata + content
 *   document_chats    — stores chat messages per document
 * ============================================================================
 */

import { db } from './database';
import type { ParsedDocument, DocumentChatMessage, ParseTier, ParseStatus } from '../types';

// ============================================================================
// Parsed Documents
// ============================================================================

export interface CreateParsedDocumentInput {
  user_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  tier: ParseTier;
  job_id: string;
  status: ParseStatus;
  parsed_markdown?: string;
  parsed_text?: string;
  parsed_json?: any;
  page_count?: number;
  images_metadata?: any;
  user_prompt?: string;
}

export async function saveParsedDocument(input: CreateParsedDocumentInput): Promise<ParsedDocument> {
  const { data, error } = await db
    .from('parsed_documents')
    .insert([{
      ...input,
      parsed_markdown: input.parsed_markdown || '',
      parsed_text: input.parsed_text || '',
      parsed_json: input.parsed_json || null,
      page_count: input.page_count || 0,
      images_metadata: input.images_metadata || null,
    }])
    .select()
    .single();

  if (error) {
    console.error('Error saving parsed document:', error);
    throw error;
  }

  return data as ParsedDocument;
}

export async function updateParsedDocument(
  id: string,
  updates: Partial<Pick<ParsedDocument, 'status' | 'job_id' | 'parsed_markdown' | 'parsed_text' | 'parsed_json' | 'page_count' | 'images_metadata'>>
): Promise<void> {
  const { error } = await db
    .from('parsed_documents')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating parsed document:', error);
    throw error;
  }
}

export async function fetchParsedDocuments(userId: string): Promise<ParsedDocument[]> {
  const { data, error } = await db
    .from('parsed_documents')
    .select('id, user_id, file_name, file_type, file_size, tier, job_id, status, page_count, user_prompt, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(-1);

  if (error) {
    console.error('Error fetching parsed documents:', error);
    throw error;
  }

  return (data || []) as ParsedDocument[];
}

export async function getParsedDocument(id: string): Promise<ParsedDocument> {
  const { data, error } = await db
    .from('parsed_documents')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error getting parsed document:', error);
    throw error;
  }

  return data as ParsedDocument;
}

export async function deleteParsedDocument(id: string): Promise<void> {
  // Delete associated chats first
  try {
    await db.from('document_chats').delete().eq('document_id', id);
  } catch {
    // Chats might not exist, ok to proceed
  }

  const { error } = await db
    .from('parsed_documents')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting parsed document:', error);
    throw error;
  }
}

// ============================================================================
// Document Chat Messages
// ============================================================================

export async function fetchDocumentChats(documentId: string): Promise<DocumentChatMessage[]> {
  const { data, error } = await db
    .from('document_chats')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching document chats:', error);
    throw error;
  }

  return (data || []) as DocumentChatMessage[];
}

export async function saveDocumentChat(
  documentId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<DocumentChatMessage> {
  const { data, error } = await db
    .from('document_chats')
    .insert([{
      document_id: documentId,
      role,
      content,
    }])
    .select()
    .single();

  if (error) {
    console.error('Error saving document chat:', error);
    throw error;
  }

  return data as DocumentChatMessage;
}

export async function deleteDocumentChats(documentId: string): Promise<void> {
  const { error } = await db
    .from('document_chats')
    .delete()
    .eq('document_id', documentId);

  if (error) {
    console.error('Error deleting document chats:', error);
    throw error;
  }
}
