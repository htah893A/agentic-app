#!/bin/bash

# Helper script to get your Cognito password and update the api-tests.http file

echo "🔑 Retrieving Cognito password from AWS Secrets Manager..."
echo ""

PASSWORD_SECRET=$(aws cloudformation describe-stacks \
  --stack-name AgentCoreCognitoStack \
  --query 'Stacks[0].Outputs[?OutputKey==`InitialUserPasswordSecretArn`].OutputValue' \
  --output text)

PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "$PASSWORD_SECRET" \
  --query 'SecretString' \
  --output text | jq -r '.password')

echo "✅ Password retrieved!"
echo ""
echo "Copy and paste this line into your api-tests.http file:"
echo ""
echo "────────────────────────────────────────────────────────────────"
echo "@password = $PASSWORD"
echo "────────────────────────────────────────────────────────────────"
echo ""
echo "Instructions:"
echo "1. Open api-tests.http in VS Code/Cursor"
echo "2. Find the line: @password = YOUR_PASSWORD_HERE"
echo "3. Replace it with the line above"
echo "4. Save the file"
echo "5. Click 'Send Request' above the '### 1. Authenticate' line"
echo ""
echo "Alternatively, this script can update the file automatically:"
read -p "Would you like me to update api-tests.http automatically? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  sed -i "s/@password = YOUR_PASSWORD_HERE/@password = $PASSWORD/" api-tests.http
  echo "✅ Updated api-tests.http successfully!"
  echo ""
  echo "You can now use the REST Client extension to test the API:"
  echo "1. Install 'REST Client' extension in VS Code/Cursor (humao.rest-client)"
  echo "2. Open api-tests.http"
  echo "3. Click 'Send Request' above any ### separator"
else
  echo "No changes made. Copy the password line manually."
fi
