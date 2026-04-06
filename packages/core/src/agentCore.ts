import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from '@aws-sdk/client-bedrock-agentcore';
import { Logger } from '@aws-lambda-powertools/logger';
import { AgentCoreConfigSchema, AgentCoreResponseSchema } from '@agentic-app/types';

export class AgentCore {
  runtimeArn: string;
  sessionId: string;
  message: string;
  userId: string;
  audioBase64?: string;
  language?: string;
  mode: string;
  logger: Logger;

  constructor(config: {
    runtimeArn: string;
    sessionId: string;
    message: string;
    userId: string;
    audioBase64?: string;
    language?: string;
    mode?: string;
    logger: Logger;
  }) {
    const parsed = AgentCoreConfigSchema.parse(config);
    this.runtimeArn = parsed.runtimeArn;
    this.sessionId = parsed.sessionId;
    this.message = parsed.message;
    this.userId = parsed.userId;
    this.audioBase64 = config.audioBase64;
    this.language = config.language;
    this.mode = config.mode || 'text';
    this.logger = config.logger;
  }

  async invokeAgentCoreRuntime(): Promise<string> {
    const region = process.env.AWS_REGION || 'us-east-1';
    const client = new BedrockAgentCoreClient({ region });

    const payload: Record<string, unknown> = {
      prompt: this.message,
      session_id: this.sessionId,
      user_id: this.userId,
      mode: this.mode,
    };

    if (this.audioBase64) payload.audio_base64 = this.audioBase64;
    if (this.language) payload.language = this.language;

    this.logger.info('Invoking AgentCore Runtime', {
      runtimeArn: this.runtimeArn.substring(0, 50) + '...',
      userId: this.userId.substring(0, 8) + '...',
      sessionId: this.sessionId.substring(0, 8) + '...',
      mode: this.mode,
    });

    try {
      const commandInput: any = {
        agentRuntimeArn: this.runtimeArn,
        payload: new TextEncoder().encode(JSON.stringify(payload)),
        runtimeUserId: this.userId,
        contentType: 'application/json',
        accept: 'application/json',
      };

      const command = new InvokeAgentRuntimeCommand(commandInput);
      const result = await client.send(command);

      if (!result.response) {
        throw new Error('No response from AgentCore Runtime');
      }

      const chunks: Uint8Array[] = [];
      const response = result.response as any;

      if (response instanceof Uint8Array) {
        chunks.push(response);
      } else if (typeof response[Symbol.asyncIterator] === 'function') {
        for await (const chunk of response) {
          if (chunk instanceof Uint8Array) {
            chunks.push(chunk);
          }
        }
      } else if (typeof response === 'string') {
        const responseData = AgentCoreResponseSchema.parse(JSON.parse(response));
        return responseData.response || responseData.text || 'No response from agent';
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      const responseText = new TextDecoder().decode(combined);
      const responseData = AgentCoreResponseSchema.parse(JSON.parse(responseText));

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
