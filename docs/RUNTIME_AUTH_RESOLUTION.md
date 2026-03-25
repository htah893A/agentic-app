# AgentCore Runtime Authorization Resolution

**Date:** March 24, 2026  
**Status:** ✅ RESOLVED

## Critical Discovery

After extensive investigation and research, we discovered the root cause of the authorization issues:

**YOU CANNOT USE THE AWS SDK (boto3/TypeScript) TO INVOKE COGNITO-AUTHORIZED AGENTCORE RUNTIMES!**

### Source Documentation

From AWS re:Post (official AWS response):
> "When using Amazon Bedrock AgentCore with JWT authentication, you cannot use the AWS SDK (boto3) to call `invoke_agent_runtime` directly with JWT tokens. According to the documentation, if you're integrating your agent with OAuth, you need to make an HTTPS request to `InvokeAgentRuntime` instead of using the boto3 client."

**Reference:** https://www.repost.aws/questions/QUGswea74qRomvjzINN1KT1A/how-to-pass-jwt-token-to-invoke-agent-runtime-using-boto3-bedrock-agentcore-client

## The Problem

The `@aws-sdk/client-bedrock-agentcore` TypeScript SDK (and boto3 Python equivalent) does **NOT** support passing custom authorization headers like `Authorization: Bearer <JWT>`. The SDK's `InvokeAgentRuntimeCommand` only accepts these parameters:

- `contentType`
- `accept`
- `mcpSessionId`
- `runtimeSessionId`
- `mcpProtocolVersion`
- `runtimeUserId`
- `traceId`
- `traceParent`
- `traceState`
- `baggage`
- `agentRuntimeArn`
- `qualifier`
- `payload`

**There is NO `headers` parameter!**

## The Solution

We switched the AgentCore Runtime from Cognito authorization to IAM authorization.

### What Changed

#### 1. Runtime Stack Configuration

**Before (Cognito Auth):**
```typescript
this.runtime = new agentcore.Runtime(this, 'AgentRuntime', {
  runtimeName: 'knowledge_base_rag_agent',
  authorizerConfiguration: agentcore.RuntimeAuthorizerConfiguration.usingCognito(
    props.userPool,
    [props.userPoolClient]
  ),
  // ...
});
```

**After (IAM Auth):**
```typescript
this.runtime = new agentcore.Runtime(this, 'AgentRuntime', {
  runtimeName: 'knowledge_base_rag_agent',
  // No authorizerConfiguration = IAM/SigV4 authentication (default)
  // ...
});
```

#### 2. AgentCore Class Simplification

Removed all Cognito token handling:
- Removed `cognitoToken` parameter from constructor
- Removed middleware for injecting Authorization headers
- SDK now uses Lambda execution role's IAM credentials automatically

#### 3. Lambda Function Code

Removed JWT token extraction:
```typescript
// Before: Extract and pass Cognito token
const authHeader = event.headers?.Authorization || event.headers?.authorization || '';
const cognitoToken = authHeader.replace(/^Bearer\s+/i, '');
const agentCore = new AgentCore({ ..., cognitoToken });

// After: No token needed
const agentCore = new AgentCore({ ... });
// SDK automatically uses IAM/SigV4 auth from Lambda execution role
```

## Architecture

The final authentication flow:

```
User → API Gateway (Cognito JWT) → Lambda (IAM Role) → AgentCore Runtime (IAM/SigV4)
     [JWT Token]                    [Execution Role]     [Automatic SigV4]
```

### Key Points:

1. **User to API Gateway**: Still uses Cognito for user authentication
2. **Lambda to AgentCore Runtime**: Uses Lambda's IAM execution role with SigV4 signing (automatic)
3. **No JWT Token Needed**: The AWS SDK handles IAM authentication automatically

## IAM Permissions Required

The Lambda function needs these permissions (already configured):

```typescript
chatFunction.addToRolePolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      'bedrock-agentcore:InvokeAgentRuntime',
      'bedrock-agentcore:InvokeAgentRuntimeForUser',
    ],
    resources: [
      `arn:aws:bedrock-agentcore:${region}:${account}:runtime/*`,
    ],
  })
);
```

## Files Modified

1. **`apps/infra/lib/stacks/agentcore-runtime-stack.ts`**
   - Removed `userPool` and `userPoolClient` from props
   - Removed `authorizerConfiguration` from Runtime construct
   - Added comments explaining IAM/SigV4 authentication

2. **`apps/infra/bin/app.ts`**
   - Removed Cognito props from `AgentCoreRuntimeStack` instantiation
   - Removed Cognito dependency from runtime stack
   - Updated stack description

3. **`packages/core/src/agentCore.ts`**
   - Removed `cognitoToken` parameter
   - Removed middleware for Authorization header injection
   - Simplified to use IAM authentication only
   - Updated comments

4. **`packages/lambdas/chat/src/index.ts`**
   - Removed JWT token extraction logic
   - Simplified AgentCore instantiation
   - Added comment about IAM auth

## Deployment

```bash
# Build the project
npm run build

# Deploy the runtime stack
npx cdk deploy AgentCoreRuntimeStack --require-approval never

# Deploy the API stack to update Lambda code
npx cdk deploy AgentCoreApiStack --require-approval never
```

## Alternative: Direct HTTPS Requests with Cognito

If you **must** use Cognito authorization for the runtime (not recommended), you cannot use the AWS SDK. Instead, you must:

1. Make direct HTTPS POST requests to the AgentCore endpoint
2. Include the Cognito JWT in the `Authorization: Bearer <token>` header
3. Sign the request with AWS SigV4 (in addition to the Bearer token)

This approach is complex and not supported by the SDKs.

## Lessons Learned

1. **Documentation Gap**: The TypeScript SDK documentation doesn't clearly state that Cognito auth is not supported
2. **Python Documentation**: The Python/boto3 documentation is more explicit about this limitation
3. **IAM is Default**: IAM/SigV4 authentication is the default and recommended approach
4. **SDK Limitations**: Not all AWS service features are available through SDKs

## Status

✅ **RESOLVED**: Runtime now uses IAM authentication, which works perfectly with the AWS SDK's automatic SigV4 signing via the Lambda execution role.

## Next Steps

1. ✅ Test the runtime invocation through the chat API
2. ✅ Verify the Lambda logs show successful AgentCore invocation
3. ✅ Update all documentation
4. ✅ Close the issue

## References

- AWS re:Post: [How to pass JWT token to invoke_agent_runtime using boto3](https://www.repost.aws/questions/QUGswea74qRomvjzINN1KT1A/how-to-pass-jwt-token-to-invoke-agent-runtime-using-boto3-bedrock-agentcore-client)
- AWS Docs: [Build your first authenticated agent](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/identity-getting-started-cognito.html)
- AWS SDK: `@aws-sdk/client-bedrock-agentcore` v3.x
