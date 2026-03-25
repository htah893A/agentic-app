# AgentCore Application - Quick Reference Card

## 🚀 Deployment Status
✅ **ALL 10 STACKS DEPLOYED** - Production Ready  
📅 **Completed**: March 24, 2026 at 9:35 AM EST

---

## 🔗 Important URLs & IDs

### API Endpoint
```
https://obeqvq3joj.execute-api.us-east-1.amazonaws.com/v1/
```

### CloudWatch Dashboard
```
https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=Knowledge-Base-RAG-Agent
```

### Knowledge Base
```
Knowledge Base ID: CULUCCLYLB
Data Source ID: 5KR2YVSSTO
```

### Cognito
```
User Pool ID: us-east-1_rcfI6ZCZB
Client ID: 4r99qbs1s1l1mpnqghfh00qs3o
Identity Pool: us-east-1:14471df0-ad6e-4ebe-b7b6-5a9193d3281b
```

### Runtime
```
Runtime ID: knowledge_base_rag_agent-aHdeHp25Ck
Model: us.anthropic.claude-sonnet-4-20250514-v1:0
```

---

## 📦 S3 Buckets

### Knowledge Base Documents
```bash
s3://agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq/
```

### Application Data
```bash
s3://agentcorestoragestack-databuckete3889a50-juyonmb9pehu/
```

---

## 🗄️ Database Details

### Aurora PostgreSQL
```
Endpoint: agentcoreaurorapgvectorstack-auroracluster23d869c0-pvcgd3srnprs.cluster-czs4w8kgkmj9.us-east-1.rds.amazonaws.com
Database: vectordb
Table: bedrock_integration
Credentials: arn:aws:secretsmanager:us-east-1:541527326636:secret:AgentCoreAuroraPgVectorStack/aurora-credentials-2o8eps
```

### DynamoDB Tables
```
Chat History: AgentCore-ChatHistory
Sessions: AgentCore-Sessions
```

---

## 🔐 Security & Access

### Get Admin Password
```bash
aws secretsmanager get-secret-value \
  --secret-id arn:aws:secretsmanager:us-east-1:541527326636:secret:KnowledgeBaseRagAgent/InitialUserPassword-7XNbay \
  --query SecretString --output text
```

### Initial Admin User
```
Email: admin@example.com
Password: (Use command above)
```

---

## 🧪 Quick Tests

### Test API Health
```bash
curl https://obeqvq3joj.execute-api.us-east-1.amazonaws.com/v1/api/health
```

### Upload Document to Knowledge Base
```bash
aws s3 cp document.pdf s3://agentcoreaurorapgvectorst-knowledgebasebucketc011d-tyf7p5bg7kdq/
```

### Trigger Knowledge Base Ingestion
```bash
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id CULUCCLYLB \
  --data-source-id 5KR2YVSSTO
```

### Authenticate with Cognito
```bash
aws cognito-idp initiate-auth \
  --client-id 4r99qbs1s1l1mpnqghfh00qs3o \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=admin@example.com,PASSWORD=<your-password>
```

---

## 📊 Monitoring Commands

### Check Stack Status
```bash
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query 'StackSummaries[?starts_with(StackName, `AgentCore`)].StackName' \
  --output table
```

### View Recent Lambda Logs
```bash
aws logs tail /aws/lambda/<function-name> --follow
```

### Check Aurora Cluster Status
```bash
aws rds describe-db-clusters \
  --db-cluster-identifier agentcoreaurorapgvectorstack-auroracluster23d869c0-pvcgd3srnprs
```

### View Knowledge Base Ingestion Jobs
```bash
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id CULUCCLYLB \
  --data-source-id 5KR2YVSSTO
```

---

## 🛠️ Deployment Commands

### Deploy All Stacks
```bash
cd apps/infra
npx cdk deploy --all --require-approval never
```

### Deploy Single Stack
```bash
npx cdk deploy <StackName> --require-approval never
```

### View Stack Diff
```bash
npx cdk diff <StackName>
```

### Destroy Stack (Careful!)
```bash
npx cdk destroy <StackName>
```

---

## 📈 Cost Estimates

| Service | Monthly Cost |
|---------|--------------|
| Lambda | $10-20 |
| API Gateway | $3-10 |
| Aurora Serverless v2 | $40-60 |
| DynamoDB | $5-10 |
| S3 | $2-5 |
| Bedrock | Usage-based |
| VPC (NAT Gateway) | $32 |
| CloudWatch | $5-10 |
| **TOTAL** | **~$150-200** |

---

## 🎯 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Health check (public) |
| GET | `/api/auth-health` | Authenticated health check |
| POST | `/api/chat/invoke` | Send message to agent |
| GET | `/api/chat/history` | Get chat history |
| GET | `/api/agent/status` | Get agent status |
| POST | `/api/knowledge-base/query` | Query knowledge base |

---

## 🚨 Alert Configuration

**SNS Topic**: `arn:aws:sns:us-east-1:541527326636:Knowledge-Base-RAG-Agent-Alerts`

**Monitored Metrics**:
- API 5xx errors > 5% for 5 minutes
- Lambda errors > 10% for 5 minutes  
- Lambda duration > 25 seconds (P99)

**Alert Email**: admin@example.com (⚠️ Requires confirmation)

---

## 🔄 Useful Aliases

Add these to your shell profile for quick access:

```bash
# Deployment
alias acd='cd ~/Learning/AI/novaland.ai/agentic-app/apps/infra'
alias adeploy='npx cdk deploy --require-approval never'
alias adiff='npx cdk diff'
alias alist='npx cdk list'

# Monitoring
alias alogs='aws logs tail --follow'
alias astacks='aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query "StackSummaries[?starts_with(StackName, \`AgentCore\`)].StackName" --output table'

# Quick Access
alias aapi='curl https://obeqvq3joj.execute-api.us-east-1.amazonaws.com/v1/api/health'
alias apass='aws secretsmanager get-secret-value --secret-id arn:aws:secretsmanager:us-east-1:541527326636:secret:KnowledgeBaseRagAgent/InitialUserPassword-7XNbay --query SecretString --output text'
```

---

## 📚 Documentation Links

| Document | Purpose |
|----------|---------|
| [FULL_DEPLOYMENT_SUMMARY.md](./FULL_DEPLOYMENT_SUMMARY.md) | Complete deployment details |
| [AURORA_PGVECTOR_DEPLOYMENT.md](./AURORA_PGVECTOR_DEPLOYMENT.md) | Aurora troubleshooting guide |
| [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) | This document |

---

## ⚡ Common Tasks

### Update Lambda Function
```bash
cd apps/infra
npm run build
npx cdk deploy AgentCoreApiStack
```

### View Stack Outputs
```bash
aws cloudformation describe-stacks \
  --stack-name <StackName> \
  --query 'Stacks[0].Outputs' \
  --output table
```

### Tail All Lambda Logs
```bash
aws logs tail /aws/lambda/AgentCore-ChatFunction --follow
```

### Force Knowledge Base Sync
```bash
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id CULUCCLYLB \
  --data-source-id 5KR2YVSSTO
```

---

## 🆘 Emergency Contacts

### AWS Support
- Console: https://console.aws.amazon.com/support
- Account: 541527326636
- Region: us-east-1

### Critical Resource ARNs
```
Runtime: arn:aws:bedrock-agentcore:us-east-1:541527326636:runtime/knowledge_base_rag_agent-aHdeHp25Ck
Aurora: arn:aws:rds:us-east-1:541527326636:cluster:agentcoreaurorapgvectorstack-auroracluster23d869c0-pvcgd3srnprs
API: arn:aws:apigateway:us-east-1::/restapis/obeqvq3joj
```

---

**Version**: 1.0  
**Last Updated**: March 24, 2026  
**Status**: ✅ Production Ready
