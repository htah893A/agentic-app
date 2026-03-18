export interface ChatRequest {
  message: string;
  sessionId?: string;
  userId?: string;
}

export interface ChatResponse {
  response: string;
  sessionId: string;
  conversationId: string;
  timestamp: string;
  sources?: DocumentSource[];
}

export interface DocumentSource {
  title: string;
  content: string;
  score?: number;
  metadata?: Record<string, any>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

export interface User {
  id: string;
  email: string;
  username: string;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  lastActivityAt: string;
}

export interface AgentConfig {
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface AuthContext {
  userId: string;
  email?: string;
}

export interface KnowledgeBaseDocument {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface SessionInfo {
  sessionId: string;
  userId: string;
  lastMessage: string;
  lastResponse: string;
  timestamp: number;
  email?: string;
}

export * from './lambda';
