import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { Logger } from '@aws-lambda-powertools/logger';
import { randomBytes } from 'crypto';

import { ChatRequest, ChatResponse, AuthContext } from '@agentic-app/types';
import {
  AuthorizationError,
  ValidationError,
  MissingEnvironmentVariable,
  Tables,
  createSuccessJsonResponse,
  createErrorJsonResponse,
  AgentCore,
} from '@agentic-app/core';

const { SESSIONS_TABLE, CHAT_HISTORY_TABLE, AGENTCORE_RUNTIME_ARN } = process.env;

if (!SESSIONS_TABLE) {
  throw new MissingEnvironmentVariable('SESSIONS_TABLE');
}

if (!CHAT_HISTORY_TABLE) {
  throw new MissingEnvironmentVariable('CHAT_HISTORY_TABLE');
}

if (!AGENTCORE_RUNTIME_ARN) {
  throw new MissingEnvironmentVariable('AGENTCORE_RUNTIME_ARN');
}

// Initialize logger for security audit trails
const logger = new Logger({ serviceName: 'chat-service' });

// Intilize DynamoDB tables helper/abstraction layer to encapsulate dynamodb logic and reduce boilerplate in the handler
const tables = new Tables({
  sessionTable: SESSIONS_TABLE,
  chatHistoryTable: CHAT_HISTORY_TABLE,
  logger,
});

/**
 * Extract and validate user context from Cognito JWT claims
 * This prevents IDOR attacks by ensuring users can only access their own data
 */
function extractUserContext(event: APIGatewayProxyEvent): AuthContext {
  const userId = event.requestContext.authorizer?.claims?.sub;
  const email = event.requestContext.authorizer?.claims?.email;

  if (!userId) {
    logger.error('Missing user ID in JWT claims', {
      requestId: event.requestContext.requestId,
      claims: event.requestContext.authorizer?.claims,
    });
    throw new AuthorizationError('Invalid authentication token - missing user ID');
  }

  logger.info('User authenticated', {
    userId: userId.substring(0, 8) + '...',
    email: email ? email.replace(/(.{2}).*(@.*)/, '$1***$2') : undefined,
    requestId: event.requestContext.requestId,
  });

  return { userId, email };
}

//Get allowed origin for CORS based on request headers, default to '*' if not present or not in allowed list
const getOrigin = (event: APIGatewayProxyEvent): string | undefined => {
  return event.headers?.origin || event.headers?.Origin;
};

/**
 * Sanitize input to prevent injection attacks and log exposure
 */
function sanitizeInput(input: string): string {
  // Remove control characters, mask PII patterns
  return input
    .replace(/[\u0000-\u001F\u007F]/g, '') // Control characters
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
      const sessionId = event.queryStringParameters?.sessionId;

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

    const body: ChatRequest = JSON.parse(event.body || '{}');
    const { message, sessionId } = body;

    if (!message || typeof message !== 'string') {
      throw new ValidationError('Message is required and must be a string');
    }

    if (message.length > 4000) {
      throw new ValidationError('Message too long (max 4000 characters)');
    }

    const sanitizedMessage = sanitizeInput(message);

    logger.info('Processing chat request', {
      userId: userContext.userId.substring(0, 8) + '...',
      messageLength: sanitizedMessage.length,
      sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'new',
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
      // Use cryptographically secure random bytes for session ID generation
      currentSessionId = `${userContext.userId}-${Date.now()}-${randomBytes(8).toString('hex')}`;
    }

    logger.info('Invoking AgentCore Runtime', {
      userId: userContext.userId.substring(0, 8) + '...',
      sessionId: currentSessionId.substring(0, 8) + '...',
      requestId,
    });

    const runtimeArn = AGENTCORE_RUNTIME_ARN!;

    // Runtime uses IAM/SigV4 authentication (no Cognito token needed)
    const agentCore = new AgentCore({
      runtimeArn: runtimeArn,
      sessionId: currentSessionId,
      message: sanitizedMessage,
      userId: userContext.userId,
      logger: logger,
      // cognitoToken not needed for IAM auth
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
