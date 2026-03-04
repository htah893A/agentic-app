import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export type LambdaHandler = (
  event: APIGatewayProxyEvent
) => Promise<APIGatewayProxyResult>;

export interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export interface LambdaEnvironment {
  AGENT_ID?: string;
  AGENT_ALIAS_ID?: string;
  KNOWLEDGE_BASE_ID?: string;
  TABLE_NAME?: string;
  REGION?: string;
}
