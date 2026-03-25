# API Testing with REST Client

This directory contains a `api-tests.http` file for testing the AgentCore Runtime API using the REST Client extension.

## Setup

### 1. Install REST Client Extension

**VS Code / Cursor:**
- Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac)
- Search for "REST Client" by Huachao Mao
- Click Install
- Extension ID: `humao.rest-client`

**Or install via command line:**
```bash
code --install-extension humao.rest-client
```

### 2. Get Your Password

Run the helper script to retrieve your Cognito password:

```bash
bash get-api-password.sh
```

This will:
1. Retrieve your password from AWS Secrets Manager
2. Display it for manual copy-paste
3. Optionally update `api-tests.http` automatically

**Manual method:**
```bash
aws secretsmanager get-secret-value \
  --secret-id $(aws cloudformation describe-stacks \
    --stack-name AgentCoreCognitoStack \
    --query 'Stacks[0].Outputs[?OutputKey==`InitialUserPasswordSecretArn`].OutputValue' \
    --output text) \
  --query 'SecretString' --output text | jq -r '.password'
```

### 3. Update api-tests.http

Open `api-tests.http` and replace:
```
@password = YOUR_PASSWORD_HERE
```

With your actual password:
```
@password = YourActualPasswordHere123!
```

## Usage

### Basic Workflow

1. **Authenticate First**: 
   - Open `api-tests.http`
   - Find the "### 1. Authenticate with Cognito" request
   - Click **"Send Request"** above it
   - The JWT token will be automatically extracted and stored

2. **Test Any Endpoint**:
   - Scroll to any request you want to test
   - Click **"Send Request"** above it
   - View the response in the right panel

### Example Session

```http
# Step 1: Authenticate
### 1. Authenticate with Cognito (Get JWT Token)
POST https://cognito-idp.us-east-1.amazonaws.com/
...
# Response: 200 OK, token automatically saved to @authToken

# Step 2: Test Chat
### 3. Chat - Invoke AgentCore Runtime
POST {{apiEndpoint}}/api/chat/invoke
Authorization: Bearer {{authToken}}
...
# Response: 200 OK with AI response

# Step 3: Continue Conversation
### 5. Chat - Continue Conversation
POST {{apiEndpoint}}/api/chat/invoke
{
  "sessionId": "abc-123-def-456",  # From previous response
  "message": "Tell me more"
}
```

## Available Endpoints

### Public (No Auth)
- `GET /api/health` - Health check

### Authenticated (Cognito JWT Required)
- `POST /api/chat/invoke` - Chat with the agent (main endpoint)
- `GET /api/chat/history` - Get conversation history
- `POST /api/knowledge-base/query` - Query the knowledge base directly
- `GET /api/knowledge-base/documents` - List KB documents
- `GET /api/agent/status` - Agent runtime status
- `GET /api/agent/config` - Agent configuration

## Features

### 1. Variable Substitution
Variables are defined at the top and automatically substituted:
```http
@apiEndpoint = https://obeqvq3joj.execute-api.us-east-1.amazonaws.com/v1
@authToken = {{auth.response.body.AuthenticationResult.IdToken}}

GET {{apiEndpoint}}/api/health
Authorization: Bearer {{authToken}}
```

### 2. Response Reference
Extract values from previous responses:
```http
# @name auth
POST .../authenticate

# Use token from auth response
@authToken = {{auth.response.body.AuthenticationResult.IdToken}}
```

### 3. Multiple Environments
You can create multiple `.http` files for different environments:
- `api-tests-dev.http`
- `api-tests-staging.http`
- `api-tests-prod.http`

## Testing Scenarios

The file includes pre-built test scenarios:

### Test 1: Quick Response Test
```http
POST {{apiEndpoint}}/api/chat/invoke
{
  "message": "Hello! Can you hear me?"
}
```

### Test 2: Complex Query
```http
POST {{apiEndpoint}}/api/chat/invoke
{
  "message": "What are the main differences between AWS Lambda and traditional server-based computing?"
}
```

### Test 3: Multi-turn Conversation
```http
# First message
POST {{apiEndpoint}}/api/chat/invoke
{
  "message": "I want to build a serverless API"
}

# Continue conversation (copy sessionId from response)
POST {{apiEndpoint}}/api/chat/invoke
{
  "message": "Tell me more about that",
  "sessionId": "PASTE_SESSION_ID_HERE"
}
```

### Test 4: RAG Query
```http
POST {{apiEndpoint}}/api/chat/invoke
{
  "message": "Search the knowledge base for information about vector databases"
}
```

## Troubleshooting

### 401 Unauthorized
- **Cause**: Token expired or invalid
- **Fix**: Re-run the authentication request (#1)
- JWT tokens expire after 1 hour

### 403 Forbidden
- **Cause**: Token format incorrect or Cognito authorization failed
- **Fix**: 
  1. Verify you're using the correct endpoint path
  2. Check that the Authorization header is formatted correctly
  3. Re-authenticate to get a fresh token

### 500 Internal Server Error
- **Cause**: Lambda function error or AgentCore runtime issue
- **Fix**: Check CloudWatch logs:
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/AgentCoreApiStack-ChatFunction* \
  --start-time $(($(date +%s) - 300))000
```

### Request Timeout
- **Cause**: Agent taking too long to respond
- **Fix**: 
  1. Simplify your query
  2. Check Lambda timeout settings (default: 30s)
  3. Monitor AgentCore runtime performance

## REST Client Tips

### Keyboard Shortcuts
- `Ctrl+Alt+R` (or `Cmd+Alt+R`): Send request
- `Ctrl+Alt+C` (or `Cmd+Alt+C`): Cancel request
- `Ctrl+Alt+K` (or `Cmd+Alt+K`): Clear cookies
- `Ctrl+Alt+E` (or `Cmd+Alt+E`): Switch environment

### Settings
Add to your VS Code/Cursor settings.json:
```json
{
  "rest-client.timeoutinmilliseconds": 30000,
  "rest-client.showHeaders": true,
  "rest-client.previewOption": "body",
  "rest-client.followredirect": true
}
```

### Response History
REST Client saves response history. Access it via:
- Click the clock icon in the response panel
- View previous responses and compare

## API Limits

- **Rate Limit**: 100 requests/second per user
- **Burst Limit**: 200 requests
- **Daily Quota**: 10,000 requests
- **JWT Expiry**: 1 hour
- **Lambda Timeout**: 30 seconds

## Security Notes

⚠️ **Important**:
- Never commit `api-tests.http` with your password to Git
- The `.gitignore` file should exclude `*.http` or at least exclude files with credentials
- Use environment variables for production testing
- Rotate passwords regularly

Add to `.gitignore`:
```
# REST Client files with credentials
api-tests.http
*.local.http
```

## Alternative: Using curl

If you prefer command-line testing, see `test-runtime-final.sh` for bash/curl examples.

## Resources

- [REST Client Documentation](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)
- [API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)
- [Cognito Authentication](https://docs.aws.amazon.com/cognito/)
- [AgentCore Runtime API](https://docs.aws.amazon.com/bedrock-agentcore/)

## Support

For issues or questions:
1. Check CloudWatch logs for detailed error messages
2. Verify your IAM permissions
3. Ensure the AgentCore Runtime stack is deployed
4. Review `docs/FINAL_STATUS.md` for system status
