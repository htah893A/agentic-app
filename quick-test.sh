#!/bin/bash

# Simple Backend Testing Script
echo "========================================="
echo "AgentCore Backend Quick Test"
echo "========================================="
echo ""

# Test 1: API Health
echo "1. Testing API Gateway Health..."
HEALTH=$(curl -s https://obeqvq3joj.execute-api.us-east-1.amazonaws.com/v1/api/health)
if echo "$HEALTH" | grep -q "healthy"; then
    echo "   ✅ API Gateway is healthy"
    echo "   Response: $HEALTH"
else
    echo "   ❌ API Gateway check failed"
fi
echo ""

# Test 2: Aurora Status
echo "2. Testing Aurora Cluster..."
AURORA_STATUS=$(aws rds describe-db-clusters \
    --db-cluster-identifier agentcoreaurorapgvectorstack-auroracluster23d869c0-pvcgd3srnprs \
    --query 'DBClusters[0].Status' --output text 2>/dev/null)

if [ "$AURORA_STATUS" = "available" ]; then
    echo "   ✅ Aurora cluster is available"
else
    echo "   ❌ Aurora status: $AURORA_STATUS"
fi
echo ""

# Test 3: DynamoDB Tables
echo "3. Testing DynamoDB Tables..."
for table in "AgentCore-ChatHistory" "AgentCore-Sessions"; do
    STATUS=$(aws dynamodb describe-table --table-name "$table" \
        --query 'Table.TableStatus' --output text 2>/dev/null)
    if [ "$STATUS" = "ACTIVE" ]; then
        echo "   ✅ $table: ACTIVE"
    else
        echo "   ❌ $table: $STATUS"
    fi
done
echo ""

# Test 4: S3 Buckets
echo "4. Testing S3 Buckets..."
for bucket in "agentcorestoragestack-databuckete3889a50-juyonmb9pehu" \
              "agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq"; do
    if aws s3 ls "s3://$bucket" >/dev/null 2>&1; then
        echo "   ✅ $bucket: Accessible"
    else
        echo "   ❌ $bucket: Not accessible"
    fi
done
echo ""

# Test 5: Bedrock Knowledge Base
echo "5. Testing Bedrock Knowledge Base..."
KB_STATUS=$(aws bedrock-agent get-knowledge-base \
    --knowledge-base-id CULUCCLYLB \
    --query 'knowledgeBase.status' --output text 2>/dev/null)

if [ "$KB_STATUS" = "ACTIVE" ]; then
    echo "   ✅ Knowledge Base (CULUCCLYLB): ACTIVE"
else
    echo "   ❌ Knowledge Base status: $KB_STATUS"
fi
echo ""

# Test 6: Bedrock Runtime
echo "6. Testing Bedrock AgentCore Runtime..."
RUNTIME_STATUS=$(aws bedrock-agentcore get-runtime \
    --runtime-id knowledge_base_rag_agent-aHdeHp25Ck \
    --query 'runtime.status' --output text 2>/dev/null)

if [ "$RUNTIME_STATUS" = "ACTIVE" ]; then
    echo "   ✅ Runtime (knowledge_base_rag_agent-aHdeHp25Ck): ACTIVE"
    MODEL=$(aws bedrock-agentcore get-runtime \
        --runtime-id knowledge_base_rag_agent-aHdeHp25Ck \
        --query 'runtime.modelId' --output text 2>/dev/null)
    echo "   Model: $MODEL"
else
    echo "   ❌ Runtime status: $RUNTIME_STATUS"
fi
echo ""

# Test 7: CloudFormation Stacks
echo "7. Testing CloudFormation Stacks..."
STACK_COUNT=$(aws cloudformation list-stacks \
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
    --query 'StackSummaries[?starts_with(StackName, `AgentCore`)]' \
    --output json | jq '. | length')

if [ "$STACK_COUNT" -eq 10 ]; then
    echo "   ✅ All 10 stacks deployed"
else
    echo "   ⚠️  Found $STACK_COUNT stacks (expected 10)"
fi
echo ""

# Test 8: Get Admin Credentials
echo "8. Retrieving Admin Credentials..."
ADMIN_CREDS=$(aws secretsmanager get-secret-value \
    --secret-id arn:aws:secretsmanager:us-east-1:541527326636:secret:KnowledgeBaseRagAgent/InitialUserPassword-7XNbay \
    --query SecretString --output text 2>/dev/null)

if [ -n "$ADMIN_CREDS" ]; then
    echo "   ✅ Admin credentials retrieved"
    USERNAME=$(echo "$ADMIN_CREDS" | jq -r '.username')
    PASSWORD=$(echo "$ADMIN_CREDS" | jq -r '.password')
    echo "   Username: $USERNAME"
    echo "   Password: $PASSWORD"
else
    echo "   ❌ Could not retrieve admin credentials"
fi
echo ""

echo "========================================="
echo "Testing Complete!"
echo "========================================="
