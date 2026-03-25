import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from '@aws-sdk/client-bedrock-agentcore';
import { Logger } from '@aws-lambda-powertools/logger';

export class AgentCore {
  runtimeArn: string;
  sessionId: string;
  message: string;
  userId: string;
  logger: Logger;

  constructor({
    runtimeArn,
    sessionId,
    message,
    userId,
    logger,
  }: {
    runtimeArn: string;
    sessionId: string;
    message: string;
    userId: string;
    logger: Logger;
  }) {
    this.runtimeArn = runtimeArn;
    this.sessionId = sessionId;
    this.message = message;
    this.userId = userId;
    this.logger = logger;
  }

  /**
   * Invoke AgentCore Runtime using AWS SDK with IAM/SigV4 authentication
   * The runtime uses the default IAM authentication (no Cognito token needed)
   */
  async invokeAgentCoreRuntime(): Promise<string> {
    const region = process.env.AWS_REGION || 'us-east-1';

    // Create BedrockAgentCore client
    const client = new BedrockAgentCoreClient({ region });

    // Payload format expected by the agent (see agent/src/main.py)
    const payload = {
      prompt: this.message,
      session_id: this.sessionId,
      user_id: this.userId,
    };

    this.logger.info('Invoking AgentCore Runtime', {
      runtimeArn: this.runtimeArn.substring(0, 50) + '...',
      userId: this.userId.substring(0, 8) + '...',
      sessionId: this.sessionId.substring(0, 8) + '...',
    });

    try {
      const commandInput: any = {
        agentRuntimeArn: this.runtimeArn,
        payload: new TextEncoder().encode(JSON.stringify(payload)),
        runtimeUserId: this.userId, // User ID for session management
        contentType: 'application/json',
        accept: 'application/json',
      };

      // SDK will automatically use IAM/SigV4 authentication from Lambda execution role
      const command = new InvokeAgentRuntimeCommand(commandInput);
      const result = await client.send(command);

      // Read the streaming response
      if (!result.response) {
        throw new Error('No response from AgentCore Runtime');
      }

      // The response is a streaming blob - collect all chunks
      const chunks: Uint8Array[] = [];
      
      // Handle different possible response types
      const response = result.response as any;
      
      if (response instanceof Uint8Array) {
        // Direct Uint8Array
        chunks.push(response);
      } else if (typeof response[Symbol.asyncIterator] === 'function') {
        // Async iterable stream
        for await (const chunk of response) {
          if (chunk instanceof Uint8Array) {
            chunks.push(chunk);
          }
        }
      } else if (typeof response === 'string') {
        // Already a string
        const responseData = JSON.parse(response);
        return responseData.response || responseData.text || 'No response from agent';
      }

      // Combine all chunks
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      
      const responseText = new TextDecoder().decode(combined);
      const responseData = JSON.parse(responseText);

      this.logger.info('AgentCore response received', {
        responseLength: responseText.length,
      });

      return responseData.response || responseData.text || 'No response from agent';
    } catch (error) {
      this.logger.error('AgentCore invocation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        runtimeArn: this.runtimeArn,
      });
      throw error;
    }
  }
}
