import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
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
   * Invoke AgentCore Runtime using SigV4-signed HTTP request
   * The runtime is deployed as a container and exposes an HTTP endpoint
   */

  async invokeAgentCoreRuntime(): Promise<string> {
    const region = process.env.AWS_REGION || 'us-east-1';
    const runtimeId = this.runtimeArn.split('/').pop();

    if (!runtimeId) {
      throw new Error('Invalid runtime ARN');
    }

    // AgentCore Runtime endpoint format
    const hostname = `runtime.bedrock-agentcore.${region}.amazonaws.com`;
    const path = `/${runtimeId}/invoke`;

    // Payload format expected by the agent (see agent/src/main.py)
    const payload = JSON.stringify({
      prompt: this.message,
      session_id: this.sessionId,
      user_id: this.userId,
    });

    const request = new HttpRequest({
      hostname: hostname,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: hostname,
      },
      body: payload,
    });

    const signer = new SignatureV4({
      service: 'bedrock-agentcore',
      region: region,
      credentials: defaultProvider(),
      sha256: Sha256,
    });

    const signedRequest = await signer.sign(request);

    this.logger.info('Invoking AgentCore', {
      hostname,
      path,
      runtimeId: runtimeId.substring(0, 20) + '...',
    });

    const response = await fetch(`https://${hostname}${path}`, {
      method: signedRequest.method,
      headers: signedRequest.headers as Record<string, string>,
      body: signedRequest.body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error('AgentCore invocation failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        hostname,
        path,
      });
      throw new Error(`AgentCore invocation failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as Record<string, string>;
    return data.response || data.text || 'No response from agent';
  }
}
