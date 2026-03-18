import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

export class DynamoClient {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(tableName: string, region?: string) {
    const client = new DynamoDBClient({
      region: region || process.env.AWS_REGION || 'us-east-1',
    });
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = tableName;
  }

  async put(item: Record<string, any>) {
    const command = new PutCommand({
      TableName: this.tableName,
      Item: item,
    });
    return await this.docClient.send(command);
  }

  async get(key: Record<string, any>) {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: key,
    });
    const response = await this.docClient.send(command);
    return response.Item;
  }

  async query(params: {
    keyConditionExpression: string;
    expressionAttributeValues: Record<string, any>;
    expressionAttributeNames?: Record<string, string>;
    limit?: number;
  }) {
    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: params.keyConditionExpression,
      ExpressionAttributeValues: params.expressionAttributeValues,
      ExpressionAttributeNames: params.expressionAttributeNames,
      Limit: params.limit,
    });
    const response = await this.docClient.send(command);
    return response.Items || [];
  }

  async delete(key: Record<string, any>) {
    const command = new DeleteCommand({
      TableName: this.tableName,
      Key: key,
    });
    return await this.docClient.send(command);
  }
}
