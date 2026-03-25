#!/bin/bash

API_ENDPOINT=$(aws cloudformation describe-stacks --stack-name AgentCoreApiStack --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint4F160690`].OutputValue' --output text)
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name AgentCoreCognitoStack --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text)
CLIENT_ID=$(aws cloudformation describe-stacks --stack-name AgentCoreCognitoStack --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text)
PASSWORD_SECRET=$(aws cloudformation describe-stacks --stack-name AgentCoreCognitoStack --query 'Stacks[0].Outputs[?OutputKey==`InitialUserPasswordSecretArn`].OutputValue' --output text)
PASSWORD=$(aws secretsmanager get-secret-value --secret-id "$PASSWORD_SECRET" --query 'SecretString' --output text | jq -r '.password')

echo "API Endpoint: $API_ENDPOINT"
echo "Authenticating..."

AUTH_RESPONSE=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" \
  --auth-parameters "USERNAME=admin@example.com,PASSWORD=$PASSWORD" \
  --region us-east-1 2>&1)

ID_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.AuthenticationResult.IdToken // empty')

if [ -z "$ID_TOKEN" ]; then
  echo "Authentication failed:"
  echo "$AUTH_RESPONSE"
  exit 1
fi

echo "Authenticated successfully!"
echo ""
echo "Testing chat endpoint (should invoke AgentCore Runtime with IAM auth)..."

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${API_ENDPOINT}chat" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is AWS Lambda?"}')

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')

echo "HTTP Status: $HTTP_STATUS"
echo "Response:"
echo "$BODY" | jq -C '.' 2>/dev/null || echo "$BODY"

if [ "$HTTP_STATUS" = "200" ]; then
  echo ""
  echo "✅ SUCCESS! Runtime invocation with IAM auth works!"
else
  echo ""
  echo "❌ Error: HTTP $HTTP_STATUS"
fi
