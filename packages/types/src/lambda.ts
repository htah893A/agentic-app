import { z } from 'zod';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export type LambdaHandler = (
  event: APIGatewayProxyEvent
) => Promise<APIGatewayProxyResult>;

export interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export const LambdaEnvironmentSchema = z.object({
  AGENT_ID: z.string().optional(),
  AGENT_ALIAS_ID: z.string().optional(),
  KNOWLEDGE_BASE_ID: z.string().optional(),
  TABLE_NAME: z.string().optional(),
  REGION: z.string().optional(),
  CLUSTER_ARN: z.string().optional(),
  SECRET_ARN: z.string().optional(),
  DATABASE_NAME: z.string().optional(),
});

export type LambdaEnvironment = z.infer<typeof LambdaEnvironmentSchema>;
