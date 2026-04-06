# Mind Map 2: AWS Infrastructure (CDK Stacks)

> **Center Node:** `app.ts` (CDK entry point — `apps/infra/bin/app.ts`)

---

## Deployment Layers (ordered)

### Layer 0: Shared Resources — `SharedResourcesStack`
- Common Lambda Layer (`NodeJS 20.x` — AWS SDK clients)
- IAM Managed Policies:
  - `BedrockAccessPolicy` — InvokeModel, Knowledge Base, Agent operations
  - `SSMParameterAccessPolicy` — read SSM params under `/AgentCoreTemplate/*`
- All ARNs stored in SSM Parameter Store
- **Dependencies:** none (deployed first)

### Layer 1: Foundation — No dependencies between each other

#### `NetworkStack`
- VPC (`10.0.0.0/18`, 2 AZs)
  - Public subnets (`/24`)
  - Private subnets with egress (`/24`)
  - Isolated subnets (`/24`)
- 1 NAT Gateway (cost optimization)
- VPC Flow Logs → CloudWatch
- Security Groups: `api`, `database`, `service`
  - `api` → `service` (port 80)
  - `service` → `database` (port 5432)
- **Dependencies:** none

#### `StorageStack`
- KMS Key (auto-rotation, S3 + CloudFront access)
- S3 Data Bucket (KMS encrypted, versioned, SSL enforced, lifecycle rules)
- S3 Access Logs Bucket (S3-managed encryption)
- **Dependencies:** none

### Layer 2: Core Infrastructure

#### `CognitoStack`
- Cognito User Pool (`AgentCore-Users-{account}`)
  - Enhanced password policy (12+ chars, all complexity)
  - Email-only account recovery
  - Self-signup enabled
- User Pool Client (`WebClient`)
  - Short-lived tokens (1hr access/ID, 30d refresh)
  - Token revocation enabled
  - OAuth: authorization code grant, email/openid/profile scopes
  - Callback URLs include `localhost:3000` (Next.js dev) and production domain
  - Prevent user existence errors
- Identity Pool + IAM roles (authenticated/unauthenticated)
- Initial user creation via Custom Resource (Lambda)
- Password stored in Secrets Manager
- **Dependencies:** `SharedResourcesStack` (for Lambda layer)

#### `DatabaseStack`
- DynamoDB Tables (PAY_PER_REQUEST, encrypted, PITR):
  - `AgentCore-ChatHistory` (PK: sessionId, SK: messageId, GSI: UserIdIndex)
  - `AgentCore-Sessions` (PK: sessionId, GSI: UserIdIndex)
  - `AgentCoreTemplate-LearnerProgress` (PK: userId) — language, level, teacher notes
  - `AgentCoreTemplate-LearnerReviews` (PK: userId, SK: itemKey) — SM-2 spaced repetition
- **Dependencies:** `NetworkStack`

#### `AuroraPgVectorStack`
- Aurora Serverless v2 PostgreSQL 15 (pgvector)
  - 0.5–2 ACU capacity
  - Isolated subnets, Data API enabled
  - IAM authentication
- Custom Resource: `init-pgvector` Lambda (creates extension + vector table)
- Bedrock Knowledge Base (VECTOR type)
  - Embedding: `amazon.titan-embed-text-v2:0` (1024-dim)
  - Storage: RDS (Aurora pgvector)
  - Field mapping: id, embedding, chunks, metadata
- S3 Data Source (fixed-size chunking: 512 tokens, 20% overlap)
- S3 Knowledge Base Bucket
- IAM Role for Bedrock → Aurora + S3 + KMS access
- **Dependencies:** `NetworkStack`, `SharedResourcesStack`

### Layer 3: AgentCore

#### `AgentCoreMemoryStack`
- AgentCore Memory (`knowledge_base_rag_agent_memory`)
  - 90-day expiration
  - KMS encryption (key from StorageStack)
  - Strategies: Semantic, User Preference, Summarization
- **Dependencies:** `StorageStack`

#### `AgentCoreRuntimeStack`
- AgentCore Runtime (`language_learning_agent`)
  - Docker image from `agent/` directory (Python 3.13, ARM64)
  - Model: `us.anthropic.claude-sonnet-4-20250514-v1:0`
  - IAM/SigV4 authentication (not Cognito)
  - Lifecycle: 15min idle timeout, 8hr max lifetime
  - Multi-agent system: orchestrator + 4 sub-agents (grammar, vocabulary, conversation, content)
- S3 Audio Bucket (voice uploads, 1-day lifecycle on `audio-uploads/` prefix)
- Environment variables injected into container:
  - `MODEL_ID`, `AGENT_TYPE=orchestrator`
  - `AURORA_CLUSTER_ENDPOINT`, `AURORA_DATABASE_NAME`, `AURORA_VECTOR_TABLE_NAME`, `AURORA_SECRET_ARN`
  - `KNOWLEDGE_BASE_ID`, `MEMORY_ID`
  - `PROGRESS_TABLE`, `REVIEW_TABLE`, `AUDIO_BUCKET`
- IAM permissions: Bedrock models, RDS Data API, Secrets Manager, Knowledge Base, Memory, DynamoDB (progress + reviews), Polly, Transcribe, S3 (audio), KMS
- Default endpoint (version 1)
- **Dependencies:** `AuroraPgVectorStack`, `AgentCoreMemoryStack`, `DatabaseStack`

### Layer 4: API

#### `ApiStack`
- API Gateway REST API (`v1` stage)
  - CloudWatch logging (full request/response)
  - Cognito User Pool Authorizer
- Usage Plan (DoS protection):
  - 100 req/s rate, 200 burst, 10K/day quota
  - API Key for tracking
- Endpoints:
  - `POST /api/chat/invoke` — chat (Cognito auth) → Chat Lambda
  - `GET /api/chat/history` — history (Cognito auth) → Chat Lambda
    - `?list=sessions` — returns session list (used by Next.js frontend)
  - `POST /api/knowledge-base/query` — KB query (Cognito auth) → Chat Lambda
  - `GET /api/agent/status` — agent status (Cognito auth) → Chat Lambda
  - `GET /api/health` — health check (no auth) → HealthCheck Lambda
  - `GET /api/auth-health` — auth test (Cognito auth) → HealthCheck Lambda
- Chat Lambda (`NodejsFunction`, esbuild bundled):
  - Entry: `packages/lambdas/chat/src/index.ts`
  - 256MB, 30s timeout
  - Permissions: Bedrock, SSM, AgentCore Runtime invoke, DynamoDB
- **Dependencies:** `NetworkStack`, `CognitoStack`, `SharedResourcesStack`, `AgentCoreRuntimeStack`

### Layer 5: Integration

#### `MonitoringStack`
- CloudWatch Dashboard (`Knowledge-Base-RAG-Agent`)
  - API requests, latency, Lambda invocations, duration, errors
- SNS Alert Topic (KMS encrypted, email subscription)
- Alarms:
  - Chat Lambda errors (>5 in 5min)
  - Chat Lambda duration (>4min avg)
  - API 5xx errors (>5 in 5min)
- **Dependencies:** `ApiStack`

#### `AmplifyHostingStack` (conditional: `DEPLOY_FRONTEND=true`)
- Amplify App (GitHub source, CI/CD)
- Build: pnpm install → build types → build core → build web (Next.js standalone)
- Environment injection: Cognito IDs, API URL, region, `AUTH_SECRET`
- Security headers (HSTS, X-Frame-Options, etc.)
- **Dependencies:** `ApiStack`, `CognitoStack`

---

## Stack Dependency Graph

```
SharedResourcesStack ──────────────────────────────────┐
NetworkStack ──────────────────────────────────────┐    │
StorageStack ─────────────────────────────────┐    │    │
                                              │    │    │
                                              ▼    │    │
                                   AgentCoreMemoryStack │
                                              │    │    │
CognitoStack ─────────────────────────────┐   │    │    │
DatabaseStack ◄── NetworkStack            │   │    │    │
AuroraPgVectorStack ◄── NetworkStack ─────│───│────│────┘
                         SharedResources  │   │    │
                              │           │   │    │
                              ▼           │   ▼    │
                   AgentCoreRuntimeStack  │        │
                              │           │        │
                              ▼           ▼        │
                           ApiStack ◄─────┘────────┘
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
            MonitoringStack    AmplifyHostingStack (optional)
```

---

## Color Coding (for Miro)
- 🔵 Blue: All AWS infrastructure stacks
- 🟣 Purple: AgentCore-specific (Memory, Runtime)
- 🟠 Orange: API layer
- 🔴 Red: Security resources (Cognito, KMS, IAM)
