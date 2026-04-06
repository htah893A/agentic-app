import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { Logger } from '@aws-lambda-powertools/logger';
import { randomBytes } from 'crypto';

import { ChatRequestSchema, ChatResponse, AuthContextSchema, ChatLambdaEnvSchema } from '@agentic-app/types';
import {
  AuthorizationError,
  ValidationError,
  Tables,
  createSuccessJsonResponse,
  createErrorJsonResponse,
  AgentCore,
} from '@agentic-app/core';

const env = ChatLambdaEnvSchema.parse(process.env);
const { SESSIONS_TABLE, CHAT_HISTORY_TABLE, AGENTCORE_RUNTIME_ARN } = env;

const logger = new Logger({ serviceName: 'chat-service' });

const tables = new Tables({
  sessionTable: SESSIONS_TABLE,
  chatHistoryTable: CHAT_HISTORY_TABLE,
  logger,
});

function extractUserContext(event: APIGatewayProxyEvent) {
  const claims = event.requestContext.authorizer?.claims;
  const result = AuthContextSchema.safeParse({
    userId: claims?.sub,
    email: claims?.email,
  });

  if (!result.success) {
    logger.error('Missing user ID in JWT claims', {
      requestId: event.requestContext.requestId,
      claims,
    });
    throw new AuthorizationError('Invalid authentication token - missing user ID');
  }

  logger.info('User authenticated', {
    userId: result.data.userId.substring(0, 8) + '...',
    email: result.data.email ? result.data.email.replace(/(.{2}).*(@.*)/, '$1***$2') : undefined,
    requestId: event.requestContext.requestId,
  });

  return result.data;
}

const getOrigin = (event: APIGatewayProxyEvent): string | undefined => {
  return event.headers?.origin || event.headers?.Origin;
};

function sanitizeInput(input: string): string {
  return input
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]')
    .trim();
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  const origin = getOrigin(event);

  try {
    const userContext = extractUserContext(event);

    // Handle GET requests for chat history
    if (event.httpMethod === 'GET') {
      const listParam = event.queryStringParameters?.list;
      const sessionId = event.queryStringParameters?.sessionId;

      if (listParam === 'sessions') {
        logger.info('Retrieving user sessions', {
          userId: userContext.userId.substring(0, 8) + '...',
          requestId,
        });
        const sessions = await tables.getUserSessions(userContext.userId);
        return createSuccessJsonResponse({ sessions }, origin);
      }

      logger.info('Retrieving chat history', {
        userId: userContext.userId.substring(0, 8) + '...',
        sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'all',
        requestId,
      });

      const history = await tables.getChatHistory(userContext.userId, sessionId);
      return createSuccessJsonResponse({ history }, origin);
    }

    // Handle POST requests for chat
    if (event.httpMethod !== 'POST') {
      throw new ValidationError('Method not allowed');
    }

    const parsed = ChatRequestSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
    }
    const { message, sessionId, audioBase64, language, mode } = parsed.data;

    const sanitizedMessage = sanitizeInput(message);

    logger.info('Processing chat request', {
      userId: userContext.userId.substring(0, 8) + '...',
      messageLength: sanitizedMessage.length,
      sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'new',
      mode: mode || 'text',
      requestId,
    });

    // Generate user-scoped session ID if not provided
    let currentSessionId: string;

    if (sessionId) {
      const isValidSession = await tables.validateSessionOwnership(
        sessionId,
        userContext.userId
      );
      if (!isValidSession) {
        logger.warn('Unauthorized session access attempt', {
          userId: userContext.userId.substring(0, 8) + '...',
          sessionId: sessionId.substring(0, 8) + '...',
          requestId,
        });
        throw new AuthorizationError('Access denied - session not found or unauthorized');
      }
      currentSessionId = sessionId;
    } else {
      currentSessionId = `${userContext.userId}-${Date.now()}-${randomBytes(8).toString('hex')}`;
    }

    logger.info('Invoking AgentCore Runtime', {
      userId: userContext.userId.substring(0, 8) + '...',
      sessionId: currentSessionId.substring(0, 8) + '...',
      requestId,
    });

    const runtimeArn = AGENTCORE_RUNTIME_ARN!;

    const agentCore = new AgentCore({
      runtimeArn,
      sessionId: currentSessionId,
      message: sanitizedMessage,
      userId: userContext.userId,
      audioBase64,
      language,
      mode,
      logger,
    });

    const responseText = await agentCore.invokeAgentCoreRuntime();

    await tables.storeSessionInfo({
      sessionId: currentSessionId,
      userId: userContext.userId,
      lastMessage: sanitizedMessage,
      lastResponse: responseText,
      timestamp: Date.now(),
      email: userContext.email,
    });

    logger.info('Chat request processed successfully', {
      userId: userContext.userId.substring(0, 8) + '...',
      sessionId: currentSessionId.substring(0, 8) + '...',
      responseLength: responseText.length,
      requestId,
    });

    const finalResponse =
      responseText ||
      'I received your message but was unable to generate a response. Please try again.';

    const response: ChatResponse = {
      response: finalResponse,
      conversationId: currentSessionId,
      sessionId: currentSessionId,
      timestamp: new Date().toISOString(),
    };

    return createSuccessJsonResponse(response, origin);
  } catch (error) {
    logger.error('Error processing chat request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      requestId,
    });

    if (error instanceof AuthorizationError) {
      return createErrorJsonResponse(error, 403, origin);
    }

    if (error instanceof ValidationError) {
      return createErrorJsonResponse(error, 400, origin);
    }

    return createErrorJsonResponse(
      error instanceof Error ? error : 'Internal server error',
      500,
      origin
    );
  }
};
