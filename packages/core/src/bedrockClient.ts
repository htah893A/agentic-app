import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

export class BedrockClient {
  private client: BedrockAgentRuntimeClient;

  constructor(region?: string) {
    this.client = new BedrockAgentRuntimeClient({
      region: region || process.env.AWS_REGION || 'us-east-1',
    });
  }

  async invokeAgent(params: {
    agentId: string;
    agentAliasId: string;
    sessionId: string;
    inputText: string;
  }) {
    const command = new InvokeAgentCommand({
      agentId: params.agentId,
      agentAliasId: params.agentAliasId,
      sessionId: params.sessionId,
      inputText: params.inputText,
    });

    const response = await this.client.send(command);
    return response;
  }
}
