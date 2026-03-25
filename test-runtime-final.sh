#!/bin/bash

set -e

echo "==================================================================="
echo "AgentCore Runtime Invocation Test (IAM Authentication)"
echo "==================================================================="
echo ""

# Get stack outputs
API_ENDPOINT=$(aws cloudformation describe-stacks --stack-name AgentCoreApiStack --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint4F160690`].OutputValue' --output text)
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name AgentCoreCognitoStack --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text)
CLIENT_ID=$(aws cloudformation describe-stacks --stack-name AgentCoreCognitoStack --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text)
PASSWORD_SECRET=$(aws cloudformation describe-stacks --stack-name AgentCoreCognitoStack --query 'Stacks[0].Outputs[?OutputKey==`InitialUserPasswordSecretArn`].OutputValue' --output text)

echo "📋 Configuration:"
echo "  API Endpoint: $API_ENDPOINT"
echo "  User Pool: $USER_POOL_ID"
echo "  Client ID: $CLIENT_ID"
echo ""

# Get password
PASSWORD=$(aws secretsmanager get-secret-value --secret-id "$PASSWORD_SECRET" --query 'SecretString' --output text | jq -r '.password')

echo "🔐 Authenticating user..."
AUTH_RESPONSE=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" \
  --auth-parameters "USERNAME=admin@example.com,PASSWORD=$PASSWORD" \
  --region us-east-1 2>&1)

ID_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.AuthenticationResult.IdToken // empty')

if [ -z "$ID_TOKEN" ]; then
  echo "❌ Authentication failed:"
  echo "$AUTH_RESPONSE"
  exit 1
fi

echo "✅ Authentication successful!"
echo ""

echo "🚀 Invoking AgentCore Runtime via Chat API..."
echo "   (Runtime uses IAM/SigV4 auth from Lambda execution role)"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${API_ENDPOINT}api/chat/invoke" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is AWS Lambda? Please give me a brief answer."
  }')

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')

echo "HTTP Status: $HTTP_STATUS"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ SUCCESS! Runtime invocation with IAM authentication works!"
  echo ""
  echo "Response:"
  echo "$BODY" | jq -C '.' 2>/dev/null || echo "$BODY"
  echo ""
  echo "==================================================================="
  echo "✅ All tests passed! The AgentCore Runtime is working correctly."
  echo "   - API Gateway: Cognito authentication ✓"
  echo "   - Lambda to Runtime: IAM/SigV4 authentication ✓"
  echo "   - Agent response: Generated successfully ✓"
  echo "==================================================================="
  exit 0
else
  echo "❌ Error: HTTP $HTTP_STATUS"
  echo ""
  echo "Response body:"
  echo "$BODY" | jq -C '.' 2>/dev/null || echo "$BODY"
  echo ""
  echo "Checking Lambda logs..."
  
  # Get latest Lambda log stream
  LOG_GROUP="/aws/lambda/$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `ChatFunction`)].FunctionName' --output text | head -1)"
  if [ -n "$LOG_GROUP" ]; then
    echo "Log group: $LOG_GROUP"
    aws logs filter-log-events --log-group-name "$LOG_GROUP" --start-time $(($(date +%s) - 60))000 --max-items 5 --query 'events[*].message' --output text 2>/dev/null | tail -20
  fi
  
  exit 1
fi
