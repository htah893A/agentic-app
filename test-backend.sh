#!/bin/bash

# AgentCore Backend Testing Script
# This script tests all backend components to verify the deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_ENDPOINT="https://obeqvq3joj.execute-api.us-east-1.amazonaws.com/v1"
USER_POOL_ID="us-east-1_rcfI6ZCZB"
CLIENT_ID="4r99qbs1s1l1mpnqghfh00qs3o"
ADMIN_EMAIL="admin@example.com"
KNOWLEDGE_BASE_ID="CULUCCLYLB"
DATA_SOURCE_ID="5KR2YVSSTO"
RUNTIME_ID="knowledge_base_rag_agent-aHdeHp25Ck"

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to print test status
print_test() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}TEST: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ PASSED: $1${NC}"
    ((TESTS_PASSED++))
}

print_failure() {
    echo -e "${RED}❌ FAILED: $1${NC}"
    echo -e "${RED}   Error: $2${NC}"
    ((TESTS_FAILED++))
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Function to get admin credentials
get_admin_password() {
    aws secretsmanager get-secret-value \
        --secret-id arn:aws:secretsmanager:us-east-1:541527326636:secret:KnowledgeBaseRagAgent/InitialUserPassword-7XNbay \
        --query SecretString --output text | jq -r '.password'
}

# Function to authenticate and get token
authenticate() {
    local password=$1
    aws cognito-idp initiate-auth \
        --client-id "$CLIENT_ID" \
        --auth-flow USER_PASSWORD_AUTH \
        --auth-parameters USERNAME="$ADMIN_EMAIL",PASSWORD="$password" \
        --query 'AuthenticationResult.IdToken' \
        --output text 2>/dev/null
}

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                               ║"
echo "║                    🧪 AGENTCORE BACKEND TESTING SUITE 🧪                      ║"
echo "║                                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Test 1: API Gateway Health Check (Public)
print_test "API Gateway Health Check (Public Endpoint)"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_ENDPOINT/api/health")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    STATUS=$(echo "$BODY" | jq -r '.status' 2>/dev/null)
    if [ "$STATUS" = "healthy" ]; then
        print_success "API Gateway is healthy"
        print_info "Response: $BODY"
    else
        print_failure "API Gateway health check" "Unexpected status: $STATUS"
    fi
else
    print_failure "API Gateway health check" "HTTP $HTTP_CODE - Expected 200"
fi
echo ""

# Test 2: Get Admin Credentials
print_test "Retrieve Admin Credentials from Secrets Manager"
ADMIN_PASSWORD=$(get_admin_password 2>&1)
if [ -n "$ADMIN_PASSWORD" ] && [ "$ADMIN_PASSWORD" != "null" ]; then
    print_success "Admin credentials retrieved successfully"
    print_info "Username: $ADMIN_EMAIL"
    print_info "Password: ********** (hidden)"
else
    print_failure "Admin credentials retrieval" "Could not retrieve password"
    exit 1
fi
echo ""

# Test 3: Cognito Authentication
print_test "Cognito User Authentication"
AUTH_TOKEN=$(authenticate "$ADMIN_PASSWORD" 2>&1)
if [ -n "$AUTH_TOKEN" ] && [ "$AUTH_TOKEN" != "null" ] && [[ ! "$AUTH_TOKEN" =~ "error" ]]; then
    print_success "Successfully authenticated with Cognito"
    print_info "Token received: ${AUTH_TOKEN:0:50}..."
else
    print_failure "Cognito authentication" "Failed to get auth token: $AUTH_TOKEN"
    echo ""
    echo "Note: If you see 'NotAuthorizedException', the admin user may need to complete first-time login"
    echo "You can reset the password via AWS Console or use this command:"
    echo "aws cognito-idp admin-set-user-password --user-pool-id $USER_POOL_ID --username $ADMIN_EMAIL --password 'YourNewPassword123!' --permanent"
fi
echo ""

# Test 4: Authenticated Health Check
if [ -n "$AUTH_TOKEN" ] && [ "$AUTH_TOKEN" != "null" ]; then
    print_test "Authenticated Health Check (Protected Endpoint)"
    AUTH_HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$API_ENDPOINT/api/auth-health")
    HTTP_CODE=$(echo "$AUTH_HEALTH_RESPONSE" | tail -n1)
    BODY=$(echo "$AUTH_HEALTH_RESPONSE" | head -n-1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        print_success "Authenticated endpoint accessible"
        print_info "Response: $BODY"
    else
        print_failure "Authenticated health check" "HTTP $HTTP_CODE - Expected 200"
        print_info "Response: $BODY"
    fi
    echo ""
fi

# Test 5: Aurora RDS Cluster Status
print_test "Aurora PostgreSQL Cluster Status"
CLUSTER_STATUS=$(aws rds describe-db-clusters \
    --db-cluster-identifier agentcoreaurorapgvectorstack-auroracluster23d869c0-pvcgd3srnprs \
    --query 'DBClusters[0].Status' --output text 2>/dev/null)

if [ "$CLUSTER_STATUS" = "available" ]; then
    print_success "Aurora cluster is available"
    
    # Get additional cluster info
    CLUSTER_INFO=$(aws rds describe-db-clusters \
        --db-cluster-identifier agentcoreaurorapgvectorstack-auroracluster23d869c0-pvcgd3srnprs \
        --query 'DBClusters[0].[Engine,EngineVersion,ServerlessV2ScalingConfiguration.MinCapacity,ServerlessV2ScalingConfiguration.MaxCapacity]' \
        --output text)
    print_info "Cluster info: $CLUSTER_INFO"
else
    print_failure "Aurora cluster status" "Status: $CLUSTER_STATUS (expected: available)"
fi
echo ""

# Test 6: DynamoDB Tables
print_test "DynamoDB Tables Status"
TABLES=("AgentCore-ChatHistory" "AgentCore-Sessions")
for table in "${TABLES[@]}"; do
    TABLE_STATUS=$(aws dynamodb describe-table --table-name "$table" \
        --query 'Table.TableStatus' --output text 2>/dev/null)
    if [ "$TABLE_STATUS" = "ACTIVE" ]; then
        print_success "Table $table is ACTIVE"
    else
        print_failure "Table $table status" "Status: $TABLE_STATUS (expected: ACTIVE)"
    fi
done
echo ""

# Test 7: S3 Buckets
print_test "S3 Buckets Accessibility"
BUCKETS=("agentcorestoragestack-databuckete3889a50-juyonmb9pehu" "agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq")
for bucket in "${BUCKETS[@]}"; do
    if aws s3 ls "s3://$bucket" >/dev/null 2>&1; then
        print_success "Bucket $bucket is accessible"
    else
        print_failure "Bucket $bucket accessibility" "Could not access bucket"
    fi
done
echo ""

# Test 8: Bedrock Knowledge Base
print_test "Bedrock Knowledge Base Status"
KB_STATUS=$(aws bedrock-agent get-knowledge-base \
    --knowledge-base-id "$KNOWLEDGE_BASE_ID" \
    --query 'knowledgeBase.status' --output text 2>/dev/null)

if [ "$KB_STATUS" = "ACTIVE" ]; then
    print_success "Knowledge Base is ACTIVE"
    
    # Check data source
    DS_STATUS=$(aws bedrock-agent get-data-source \
        --knowledge-base-id "$KNOWLEDGE_BASE_ID" \
        --data-source-id "$DATA_SOURCE_ID" \
        --query 'dataSource.status' --output text 2>/dev/null)
    print_info "Data Source Status: $DS_STATUS"
else
    print_failure "Knowledge Base status" "Status: $KB_STATUS (expected: ACTIVE)"
fi
echo ""

# Test 9: Bedrock AgentCore Runtime
print_test "Bedrock AgentCore Runtime Status"
RUNTIME_STATUS=$(aws bedrock-agentcore get-runtime \
    --runtime-id "$RUNTIME_ID" \
    --query 'runtime.status' --output text 2>/dev/null)

if [ "$RUNTIME_STATUS" = "ACTIVE" ]; then
    print_success "AgentCore Runtime is ACTIVE"
    
    RUNTIME_INFO=$(aws bedrock-agentcore get-runtime \
        --runtime-id "$RUNTIME_ID" \
        --query 'runtime.[modelId,type]' --output text)
    print_info "Runtime info: $RUNTIME_INFO"
else
    print_failure "AgentCore Runtime status" "Status: $RUNTIME_STATUS (expected: ACTIVE)"
fi
echo ""

# Test 10: CloudFormation Stacks
print_test "CloudFormation Stacks Status"
STACKS=$(aws cloudformation list-stacks \
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
    --query 'StackSummaries[?starts_with(StackName, `AgentCore`)].StackName' \
    --output text)

STACK_COUNT=$(echo "$STACKS" | wc -w)
if [ "$STACK_COUNT" -eq 10 ]; then
    print_success "All 10 stacks are deployed"
    print_info "Stacks: $(echo $STACKS | tr ' ' ', ')"
else
    print_failure "CloudFormation stacks" "Found $STACK_COUNT stacks, expected 10"
fi
echo ""

# Test 11: CloudWatch Logs
print_test "CloudWatch Log Groups"
LOG_GROUPS=$(aws logs describe-log-groups \
    --log-group-name-prefix "/aws/lambda/AgentCore" \
    --query 'logGroups[*].logGroupName' --output text 2>/dev/null)

if [ -n "$LOG_GROUPS" ]; then
    LOG_COUNT=$(echo "$LOG_GROUPS" | wc -w)
    print_success "Found $LOG_COUNT Lambda log groups"
else
    print_failure "CloudWatch log groups" "No log groups found"
fi
echo ""

# Summary
echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
echo "║                              TEST SUMMARY                                     ║"
echo "╚═══════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}✅ Tests Passed: $TESTS_PASSED${NC}"
echo -e "${RED}❌ Tests Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! Backend is fully functional! 🎉${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some tests failed. Review the errors above.${NC}"
    exit 1
fi
