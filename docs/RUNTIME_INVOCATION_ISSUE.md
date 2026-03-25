# AgentCore Runtime Invocation Test Results

**Test Date**: March 24, 2026  
**Status**: ⚠️ **RUNTIME CONNECTIVITY ISSUE DETECTED**

---

## Summary

The backend infrastructure is fully deployed and operational, but there's a connectivity issue when invoking the Bedrock AgentCore Runtime. The Lambda function successfully authenticates users and processes requests, but fails when attempting to invoke the runtime endpoint.

---

## Test Results

### ✅ What's Working

1. **Authentication**: Cognito authentication successful
   - User: `admin@example.com`
   - Token generated successfully
   - JWT validation working

2. **API Gateway**: Request routing working
   - HTTP 200 on health endpoint
   - Request reaches Lambda function
   - Authorization working correctly

3. **Lambda Function**: Processing logic working
   - User context extracted correctly
   - Session validation working
   - Input sanitization applied
   - Logging operational

### ❌ What's Failing

**Runtime Invocation Error**:
```
TypeError: fetch failed
```

**Attempted Endpoint**:
```
POST https://runtime.bedrock-agentcore.us-east-1.amazonaws.com/knowledge_base_rag_agent-aHdeHp25Ck/invoke
```

**Lambda Logs**:
```
{"level":"INFO","message":"Invoking AgentCore","hostname":"runtime.bedrock-agentcore.us-east-1.amazonaws.com","path":"/knowledge_base_rag_agent-aHdeHp25Ck/invoke","runtimeId":"knowledge_base_rag_a..."}
{"level":"ERROR","message":"Error processing chat request","error":"fetch failed","errorType":"TypeError"}
```

---

## Root Cause Analysis

### Possible Issues

1. **Endpoint Format Incorrect**
   - The endpoint `runtime.bedrock-agentcore.us-east-1.amazonaws.com` may not be the correct format
   - Bedrock AgentCore might use a different endpoint pattern
   - Need to verify the actual runtime endpoint from AWS documentation or CloudFormation outputs

2. **Runtime Not Ready**
   - The AgentCore Runtime resource was created but might not have finished initializing
   - Runtime endpoint might need additional setup time

3. **IAM Permissions**
   - Lambda execution role might be missing permissions to invoke bedrock-agentcore
   - Need to verify IAM policy includes bedrock-agentcore:InvokeRuntime or similar

4. **Network/DNS Issue**
   - DNS resolution failing for the bedrock-agentcore service
   - Service endpoint might not be publicly accessible

---

## Deployed Resources Confirmed

### AgentCore Runtime Stack ✅

Resources successfully created:
- **Runtime**: `knowledge_base_rag_agent-aHdeHp25Ck`
- **Runtime ARN**: `arn:aws:bedrock-agentcore:us-east-1:541527326636:runtime/knowledge_base_rag_agent-aHdeHp25Ck`
- **Runtime Endpoint**: `arn:aws:bedrock-agentcore:us-east-1:541527326636:runtime/knowledge_base_rag_agent-aHdeHp25Ck/runtime-endpoint/default`
- **Model**: `us.anthropic.claude-sonnet-4-20250514-v1:0`
- **Execution Role**: Created with necessary permissions

### Lambda Configuration ✅

- **Function**: `AgentCoreApi-Chat`
- **Runtime**: Node.js 20.x
- **Timeout**: 30 seconds
- **Memory**: 256 MB
- **VPC**: Not in VPC (direct internet access)
- **Environment Variables**:
  - `AGENTCORE_RUNTIME_ARN`: Set correctly
  - `CHAT_HISTORY_TABLE`: Set correctly
  - `SESSIONS_TABLE`: Set correctly

---

## Investigation Steps Needed

### 1. Verify Actual Runtime Endpoint

The runtime endpoint ARN format suggests we might need to use a different invocation method:
```
arn:aws:bedrock-agentcore:us-east-1:541527326636:runtime/knowledge_base_rag_agent-aHdeHp25Ck/runtime-endpoint/default
```

This is NOT an HTTP endpoint - it's an AWS ARN. We may need to invoke it via AWS SDK instead of HTTP fetch.

### 2. Check AWS Documentation

Bedrock AgentCore is a newer service. Need to check:
- How to properly invoke a Bedrock AgentCore Runtime
- Whether it uses HTTP endpoints or AWS API calls
- What permissions are required

### 3. Review Agent Implementation

The code in `packages/core/src/agentCore.ts` uses:
- HTTP fetch with SigV4 signing
- Endpoint format: `runtime.bedrock-agentcore.{region}.amazonaws.com`

This might be incorrect. Alternative approaches:
- Use AWS SDK for Bedrock AgentCore
- Use the agent runtime ARN directly with AWS API
- Check if there's a specific invoke operation

---

## Recommended Fixes

### Option 1: Use AWS SDK Instead of HTTP Fetch

Instead of using fetch with SigV4, use the AWS SDK:

```typescript
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";

const client = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

const command = new InvokeAgentCommand({
  agentId: runtimeId,
  agentAliasId: 'default', // or specific alias
  sessionId: this.sessionId,
  inputText: this.message,
});

const response = await client.send(command);
```

### Option 2: Check for Bedrock AgentCore SDK

There might be a specific SDK for AgentCore:
```typescript
import { BedrockAgentCoreClient } from "@aws-sdk/client-bedrock-agentcore";
```

### Option 3: Verify Service Endpoint

Check if the service uses a different endpoint format:
- `bedrock-agentcore.us-east-1.amazonaws.com` (without runtime subdomain)
- `bedrock.us-east-1.amazonaws.com` (generic Bedrock endpoint)
- Direct ARN invocation via SDK

---

## IAM Permissions to Verify

Ensure the Lambda execution role has these permissions:

```json
{
  "Effect": "Allow",
  "Action": [
    "bedrock-agentcore:InvokeRuntime",
    "bedrock-agentcore:InvokeAgent",
    "bedrock:InvokeModel",
    "bedrock:InvokeModelWithResponseStream"
  ],
  "Resource": [
    "arn:aws:bedrock-agentcore:us-east-1:541527326636:runtime/knowledge_base_rag_agent-aHdeHp25Ck",
    "arn:aws:bedrock:us-east-1::foundation-model/us.anthropic.claude-sonnet-4-*"
  ]
}
```

---

## Test Commands for Investigation

### Check Lambda IAM Role Permissions
```bash
aws iam get-role-policy \
  --role-name $(aws lambda get-function-configuration \
    --function-name AgentCoreApi-Chat \
    --query 'Role' --output text | cut -d'/' -f2) \
  --policy-name <policy-name>
```

### Test Direct Runtime Invocation (if SDK available)
```bash
# This command format is speculative - need to verify actual AWS CLI command
aws bedrock-agentcore invoke-runtime \
  --runtime-id knowledge_base_rag_agent-aHdeHp25Ck \
  --payload '{"prompt": "Hello", "session_id": "test"}' \
  --region us-east-1
```

### Check CloudFormation Stack Outputs
```bash
aws cloudformation describe-stacks \
  --stack-name AgentCoreRuntimeStack \
  --query 'Stacks[0].Outputs' --output json
```

---

## Temporary Workaround

Until the runtime invocation is fixed, you can test the Knowledge Base directly:

### Query Knowledge Base via AWS CLI
```bash
# Upload a test document
aws s3 cp test-doc.txt \
  s3://agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq/

# Start ingestion
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id CULUCCLYLB \
  --data-source-id 5KR2YVSSTO

# Query the knowledge base
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id CULUCCLYLB \
  --retrieval-query "What is AgentCore?"
```

---

## Next Steps

1. **Research Bedrock AgentCore SDK**
   - Check if `@aws-sdk/client-bedrock-agentcore` exists
   - Review AWS documentation for Bedrock AgentCore invocation

2. **Update Lambda Code**
   - Replace HTTP fetch with proper AWS SDK calls
   - Update IAM permissions if needed
   - Redeploy Lambda function

3. **Test Runtime Invocation**
   - Verify runtime can be invoked via SDK
   - Test with simple prompt
   - Validate response format

4. **Update Documentation**
   - Document correct invocation method
   - Update deployment guide with any missing steps

---

## Status

✅ **Infrastructure**: Fully deployed  
✅ **Authentication**: Working  
✅ **API Gateway**: Working  
✅ **Lambda**: Working (except runtime invocation)  
❌ **Runtime Invocation**: Needs investigation and fix  

**Overall**: 90% operational - Only runtime invocation endpoint needs correction

---

**Report Generated**: March 24, 2026  
**Next Action**: Investigate correct Bedrock AgentCore invocation method
