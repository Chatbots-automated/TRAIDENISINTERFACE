export interface Document {
  id: string;
  content?: string;
  metadata: Record<string, any>;
  embedding?: number[];
}

export interface User {
  id: string;
  email: string;
  display_name?: string;
  is_admin?: boolean;
  created_at?: string;
}

export interface AppUser {
  id: string;
  email: string;
  display_name?: string;
  is_admin: boolean;
  created_at: string;
  full_name?: string;
  phone?: string;
  kodas?: string;
  role?: string;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: string;
  created_at: string;
}

export type ChatItemType = 'thread' | 'message';
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatThread {
  id: string;
  project_id: string;
  title: string;
  message_count: number;
  last_message_at: string;
  participants: string[];
  author_ref: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  parent_id: string;
  role: ChatRole;
  content: string;
  chat_history?: any;
  author_ref: string;
  created_at: string;
}

// ============================================================================
// Parsed Documents (LlamaParse / Analizė)
// ============================================================================

export type ParseTier = 'cost_effective' | 'agentic' | 'agentic_plus' | 'fast';
export type ParseStatus = 'PENDING' | 'SUCCESS' | 'ERROR';

export interface ParsedDocument {
  id: string;
  user_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  tier: ParseTier;
  job_id: string;
  status: ParseStatus;
  parsed_markdown: string;
  parsed_text: string;
  parsed_json: any;
  page_count: number;
  images_metadata: any;
  user_prompt?: string;
  created_at: string;
}

export interface DocumentChatMessage {
  id: string;
  document_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatItem {
  id: string;
  type: ChatItemType;
  project_id?: string;
  parent_id?: string;
  title?: string;
  content?: string;
  role?: ChatRole;
  author_ref?: string;
  participants?: string[];
  message_count?: number;
  last_message_at?: string;
  status: string;
  created_at: string;
  updated_at: string;
}