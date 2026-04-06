import { z } from 'zod';

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
  audioBase64: z.string().optional(),
  language: z.string().optional(),
  mode: z.enum(['text', 'voice']).optional().default('text'),
});

export const DocumentSourceSchema = z.object({
  title: z.string(),
  content: z.string(),
  score: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

export const ChatResponseSchema = z.object({
  response: z.string(),
  sessionId: z.string(),
  conversationId: z.string(),
  timestamp: z.string(),
  sources: z.array(DocumentSourceSchema).optional(),
  audioBase64: z.string().optional(),
  audioFormat: z.string().optional(),
});

export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional(),
    })
    .optional(),
});

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
  createdAt: z.string(),
});

export const SessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  createdAt: z.string(),
  lastActivityAt: z.string(),
});

export const AgentConfigSchema = z.object({
  modelId: z.string(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
});

export const AuthContextSchema = z.object({
  userId: z.string(),
  email: z.string().email().optional(),
});

export const KnowledgeBaseDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  metadata: z.record(z.any()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const SessionInfoSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  lastMessage: z.string(),
  lastResponse: z.string(),
  timestamp: z.number(),
  email: z.string().email().optional(),
});

export const AgentCoreConfigSchema = z.object({
  runtimeArn: z.string().min(1),
  sessionId: z.string().min(1),
  message: z.string().min(1),
  userId: z.string().min(1),
});

export const AgentCoreResponseSchema = z.object({
  response: z.string().optional(),
  text: z.string().optional(),
});

export const ChatLambdaEnvSchema = z.object({
  SESSIONS_TABLE: z.string().min(1),
  CHAT_HISTORY_TABLE: z.string().min(1),
  AGENTCORE_RUNTIME_ARN: z.string().min(1),
});

export type AgentCoreConfig = z.infer<typeof AgentCoreConfigSchema>;
export type AgentCoreResponse = z.infer<typeof AgentCoreResponseSchema>;
export type ChatLambdaEnv = z.infer<typeof ChatLambdaEnvSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
export type DocumentSource = z.infer<typeof DocumentSourceSchema>;
export type ApiResponse<T = any> = z.infer<typeof ApiResponseSchema> & { data?: T };
export type User = z.infer<typeof UserSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AuthContext = z.infer<typeof AuthContextSchema>;
export type KnowledgeBaseDocument = z.infer<typeof KnowledgeBaseDocumentSchema>;
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

// Language Learning specific schemas
export const LearnerProfileSchema = z.object({
  userId: z.string(),
  targetLanguage: z.string().optional(),
  currentLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  sessionsCount: z.number().optional(),
  lastSessionTopics: z.string().optional(),
  teacherNotes: z.string().optional(),
  lastSessionAt: z.string().optional(),
});

export const ReviewItemSchema = z.object({
  term: z.string(),
  translation: z.string().optional(),
  explanation: z.string().optional(),
  type: z.enum(['vocabulary', 'grammar']),
  repetition: z.number(),
  last_reviewed: z.string(),
});

export const ProgressResponseSchema = z.object({
  profile: LearnerProfileSchema,
  dueReviews: z.number(),
  streak: z.number().optional(),
});

export const SupportedLanguageSchema = z.enum([
  'Spanish', 'French', 'German', 'Italian', 'Portuguese',
  'Japanese', 'Korean', 'Mandarin Chinese', 'Arabic', 'Hindi',
]);

export type LearnerProfile = z.infer<typeof LearnerProfileSchema>;
export type ReviewItem = z.infer<typeof ReviewItemSchema>;
export type ProgressResponse = z.infer<typeof ProgressResponseSchema>;
export type SupportedLanguage = z.infer<typeof SupportedLanguageSchema>;

export * from './lambda';
