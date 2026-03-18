import type { APIGatewayProxyResult } from 'aws-lambda';

/**
 * Get allowed origin from environment or request origin
 * Only allows whitelisted origins for security
 */

const getAllowedOrigin = (requestOrigin?: string): string => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .filter(Boolean);

  // If no origin in request, return first allowed origin
  if (!requestOrigin) {
    return allowedOrigins[0] || '';
  }

  // Check if request origin is in allowed list
  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  // Allow localhost in development only
  if (
    process.env.NODE_ENV === 'development' &&
    requestOrigin.includes('localhost')
  ) {
    return requestOrigin;
  }

  // Default to first allowed origin
  return allowedOrigins[0] || '';
};

const createGatewayResponse = ({
  statusCode,
  body,
  origin,
}: {
  statusCode: number;
  body: string;
  origin?: string;
}): APIGatewayProxyResult => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': getAllowedOrigin(origin),
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Credentials': 'true',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
    },
    body,
  };
};

export const createSuccessJsonResponse = (body: object, origin?: string) => {
  return createGatewayResponse({
    statusCode: 200,
    body: JSON.stringify(body),
    origin,
  });
};

export const createErrorJsonResponse = (
  error: Error | string,
  statusCode = 500,
  origin?: string,
) => {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorBody: any = {
    error: errorMessage,
    statusCode,
  };

  // Only include stack trace in development
  if (
    process.env.NODE_ENV !== 'production' &&
    typeof error !== 'string' &&
    error.stack
  ) {
    errorBody.stack = error.stack;
  }

  return createGatewayResponse({
    statusCode,
    body: JSON.stringify(errorBody),
    origin,
  });
};
