import * as dynamodb from '@aws-sdk/client-dynamodb';
import { PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { AuthorizationError } from './appException';
import { SessionInfo } from '@agentic-app/types';

export class Tables {
  dynamodbClient: dynamodb.DynamoDBClient;
  sessionTable: string;
  chatHistoryTable: string;
  logger: Logger;

  constructor({
    sessionTable,
    chatHistoryTable,
    logger,
  }: {
    sessionTable: string;
    chatHistoryTable: string;
    logger: Logger;
  }) {
    this.sessionTable = sessionTable;
    this.chatHistoryTable = chatHistoryTable;
    this.logger = logger;
    this.dynamodbClient = new dynamodb.DynamoDBClient({});
  }

  /**
   * Validate that a session belongs to the authenticated user
   */

  async validateSessionOwnership(
    sessionId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const result = await this.dynamodbClient.send(
        new QueryCommand({
          TableName: this.sessionTable,
          KeyConditionExpression: 'sessionId = :sessionId',
          FilterExpression: 'userId = :userId',
          ExpressionAttributeValues: {
            ':sessionId': { S: sessionId },
            ':userId': { S: userId },
          },
          Limit: 1,
        })
      );

      return !!(result.Items && result.Items.length > 0);
    } catch (error) {
      this.logger.error('Error validating session ownership', {
        sessionId: sessionId.substring(0, 8) + '...',
        userId: userId.substring(0, 8) + '...',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get chat history for the authenticated user
   */

  async getChatHistory(userId: string, sessionId?: string): Promise<unknown[]> {
    try {
      let queryParams;

      if (sessionId) {
        const isValidSession = await this.validateSessionOwnership(sessionId, userId);
        if (!isValidSession) {
          throw new AuthorizationError('Access denied - session not found or unauthorized');
        }

        queryParams = {
          TableName: this.chatHistoryTable || 'AgentCore-ChatHistory',
          KeyConditionExpression: 'sessionId = :sessionId',
          ExpressionAttributeValues: {
            ':sessionId': { S: sessionId },
          },
          ScanIndexForward: true,
          Limit: 50,
        };
      } else {
        queryParams = {
          TableName: this.chatHistoryTable || 'AgentCore-ChatHistory',
          IndexName: 'UserIdIndex',
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: {
            ':userId': { S: userId },
          },
          ScanIndexForward: false,
          Limit: 20,
        };
      }

      const result = await this.dynamodbClient.send(new QueryCommand(queryParams));
      return result.Items || [];
    } catch (error) {
      this.logger.error('Error retrieving chat history', {
        userId: userId.substring(0, 8) + '...',
        sessionId: sessionId ? sessionId.substring(0, 8) + '...' : undefined,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Store session information in DynamoDB
  async storeSessionInfo({ sessionId, userId, lastMessage, lastResponse, email }: SessionInfo) {
    await this.dynamodbClient.send(
      new PutItemCommand({
        TableName: this.sessionTable,
        Item: {
          sessionId: { S: sessionId },
          userId: { S: userId },
          lastMessage: { S: lastMessage },
          lastResponse: { S: lastResponse },
          timestamp: { N: Date.now().toString() },
          email: email ? { S: email } : { NULL: true },
        },
      })
    );
  }
}
