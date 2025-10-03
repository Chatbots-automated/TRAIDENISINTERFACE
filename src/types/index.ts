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