// Database: Directus API (see ./directus.ts). NOT Supabase.
import { dbAdmin } from './database';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';
export type LogCategory = 'auth' | 'chat' | 'document' | 'user_management' | 'system' | 'api' | 'error';

interface LogEntry {
  level: LogLevel;
  category: LogCategory;
  action: string;
  message: string;
  sessionId?: string;
  userId?: string;
  userEmail?: string;
  metadata?: Record<string, any>;
}

class AppLogger {
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private async log(entry: LogEntry): Promise<void> {
    try {
      const { error } = await dbAdmin
        .from('application_logs')
        .insert({
          level: entry.level,
          category: entry.category,
          action: entry.action,
          message: entry.message,
          session_id: entry.sessionId || this.sessionId,
          user_id: entry.userId || null,
          user_email: entry.userEmail || null,
          metadata: entry.metadata || {},
          timestamp: new Date().toISOString(),
        });

      if (error) {
        console.error('Failed to write log:', error);
      }
    } catch (err) {
      console.error('Error writing log:', err);
    }
  }

  async logAuth(params: {
    action: 'login_success' | 'login_failed' | 'logout' | 'signup_success' | 'signup_failed' | 'password_reset';
    userId?: string;
    userEmail: string;
    level?: LogLevel;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const level = params.level || (params.action.includes('failed') ? 'warn' : 'info');
    const message = this.getAuthMessage(params.action, params.userEmail);

    await this.log({
      level,
      category: 'auth',
      action: params.action,
      message,
      userId: params.userId,
      userEmail: params.userEmail,
      metadata: params.metadata,
    });
  }

  async logChat(params: {
    action: 'thread_created' | 'message_sent' | 'response_received' | 'response_started' | 'response_failed';
    userId?: string;
    userEmail?: string;
    threadId?: string;
    messagePreview?: string;
    queryType?: string;
    responseTimeMs?: number;
    level?: LogLevel;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const level = params.level || (params.action === 'response_failed' ? 'error' : 'info');
    const message = this.getChatMessage(params.action, params.threadId);

    await this.log({
      level,
      category: 'chat',
      action: params.action,
      message,
      userId: params.userId,
      userEmail: params.userEmail,
      metadata: {
        ...params.metadata,
        thread_id: params.threadId,
        message_preview: params.messagePreview?.substring(0, 100),
        query_type: params.queryType,
        response_time_ms: params.responseTimeMs,
      },
    });
  }

  async logDocument(params: {
    action: 'upload_started' | 'upload_success' | 'upload_failed' | 'create' | 'update' | 'delete' | 'search';
    userId?: string;
    userEmail?: string;
    documentId?: string;
    filename?: string;
    fileSize?: number;
    level?: LogLevel;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const level = params.level || (params.action.includes('failed') ? 'error' : 'info');
    const message = this.getDocumentMessage(params.action, params.filename);

    await this.log({
      level,
      category: 'document',
      action: params.action,
      message,
      userId: params.userId,
      userEmail: params.userEmail,
      metadata: {
        ...params.metadata,
        document_id: params.documentId,
        filename: params.filename,
        file_size: params.fileSize,
      },
    });
  }

  async logUserManagement(params: {
    action: 'user_created' | 'user_updated' | 'user_deleted' | 'admin_action';
    userId?: string;
    userEmail?: string;
    targetUserId?: string;
    targetUserEmail?: string;
    level?: LogLevel;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const level = params.level || 'info';
    const message = this.getUserManagementMessage(params.action, params.targetUserEmail);

    await this.log({
      level,
      category: 'user_management',
      action: params.action,
      message,
      userId: params.userId,
      userEmail: params.userEmail,
      metadata: {
        ...params.metadata,
        target_user_id: params.targetUserId,
        target_user_email: params.targetUserEmail,
      },
    });
  }

  async logAPI(params: {
    action: 'webhook_call' | 'api_request' | 'api_response';
    userId?: string;
    userEmail?: string;
    endpoint: string;
    method: string;
    statusCode?: number;
    responseTimeMs?: number;
    level?: LogLevel;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const level = params.level || (params.statusCode && params.statusCode >= 400 ? 'error' : 'info');
    const message = this.getAPIMessage(params.action, params.endpoint, params.statusCode);

    await this.log({
      level,
      category: 'api',
      action: params.action,
      message,
      userId: params.userId,
      userEmail: params.userEmail,
      metadata: {
        ...params.metadata,
        endpoint: params.endpoint,
        method: params.method,
        status_code: params.statusCode,
        response_time_ms: params.responseTimeMs,
      },
    });
  }

  async logError(params: {
    action: string;
    error: Error | string;
    userId?: string;
    userEmail?: string;
    level?: LogLevel;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const level = params.level || 'error';
    const errorMessage = typeof params.error === 'string' ? params.error : params.error.message;
    const stackTrace = typeof params.error === 'string' ? undefined : params.error.stack;

    await this.log({
      level,
      category: 'error',
      action: params.action,
      message: `Error: ${errorMessage}`,
      userId: params.userId,
      userEmail: params.userEmail,
      metadata: {
        ...params.metadata,
        error_message: errorMessage,
        stack_trace: stackTrace,
      },
    });
  }

  async logSystem(params: {
    action: string;
    message: string;
    level?: LogLevel;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.log({
      level: params.level || 'info',
      category: 'system',
      action: params.action,
      message: params.message,
      metadata: params.metadata,
    });
  }

  private getAuthMessage(action: string, email: string): string {
    switch (action) {
      case 'login_success':
        return `User logged in successfully: ${email}`;
      case 'login_failed':
        return `Failed login attempt for: ${email}`;
      case 'logout':
        return `User logged out: ${email}`;
      case 'signup_success':
        return `New user registered: ${email}`;
      case 'signup_failed':
        return `Failed signup attempt for: ${email}`;
      case 'password_reset':
        return `Password reset requested for: ${email}`;
      default:
        return `Auth action: ${action} for ${email}`;
    }
  }

  private getChatMessage(action: string, threadId?: string): string {
    switch (action) {
      case 'thread_created':
        return `New chat thread created: ${threadId}`;
      case 'message_sent':
        return `User message sent in thread: ${threadId}`;
      case 'response_received':
        return `AI response received in thread: ${threadId}`;
      case 'response_started':
        return `AI response started in thread: ${threadId}`;
      case 'response_failed':
        return `AI response failed in thread: ${threadId}`;
      default:
        return `Chat action: ${action}`;
    }
  }

  private getDocumentMessage(action: string, filename?: string): string {
    switch (action) {
      case 'upload_started':
        return `File upload started: ${filename}`;
      case 'upload_success':
        return `File uploaded successfully: ${filename}`;
      case 'upload_failed':
        return `File upload failed: ${filename}`;
      case 'create':
        return `Document created: ${filename}`;
      case 'update':
        return `Document updated: ${filename}`;
      case 'delete':
        return `Document deleted: ${filename}`;
      case 'search':
        return `Document search performed`;
      default:
        return `Document action: ${action}`;
    }
  }

  private getUserManagementMessage(action: string, targetEmail?: string): string {
    switch (action) {
      case 'user_created':
        return `Admin created new user: ${targetEmail}`;
      case 'user_updated':
        return `Admin updated user: ${targetEmail}`;
      case 'user_deleted':
        return `Admin deleted user: ${targetEmail}`;
      case 'admin_action':
        return `Admin action performed`;
      default:
        return `User management action: ${action}`;
    }
  }

  private getAPIMessage(action: string, endpoint: string, statusCode?: number): string {
    const status = statusCode ? ` (${statusCode})` : '';
    switch (action) {
      case 'webhook_call':
        return `Webhook called: ${endpoint}${status}`;
      case 'api_request':
        return `API request to: ${endpoint}`;
      case 'api_response':
        return `API response from: ${endpoint}${status}`;
      default:
        return `API action: ${action}`;
    }
  }
}

export const appLogger = new AppLogger();
