# Agentic App — Architecture & Production Readiness Guide

## Table of Contents

1. [Project Overview](#project-overview)
2. [Monorepo Structure](#monorepo-structure)
3. [Technology Stack](#technology-stack)
4. [Vector Store: pgvector on Aurora Serverless](#vector-store-pgvector-on-aurora-serverless)
5. [CDK Infrastructure](#cdk-infrastructure)
6. [Lambda Functions](#lambda-functions)
7. [Shared Packages](#shared-packages)
8. [Production Readiness Checklist](#production-readiness-checklist)
9. [Remaining Work](#remaining-work)

---

## Project Overview

A Bedrock Agent with Knowledge Base RAG, deployed via AWS CDK with a
Next.js frontend. The monorepo is managed by Turborepo with pnpm
workspaces.

**Key AWS Services:**

- Amazon Bedrock (Agent + Knowledge Base)
- Aurora Serverless v2 (PostgreSQL + pgvector)
- Amazon Cognito (authentication)
- API Gateway (REST API)
- CloudFront (frontend CDN)
- S3 (document storage + frontend hosting)
- DynamoDB (sessions + chat history)
- Lambda (compute)

---

## Monorepo Structure

```
agentic-app/
├── apps/
│   ├── infra/                    # AWS CDK infrastructure
│   │   ├── bin/                  # CDK app entry point
│   │   ├── lib/
│   │   │   ├── constructs/       # CDK constructs (TODO)
│   │   │   └── utils/
│   │   │       └── nag-suppressions.ts
│   │   ├── agent/                # Bedrock agent (Python)
│   │   └── test/
│   └── web/                      # Next.js frontend (TODO)
├── packages/
│   ├── config-eslint/            # Shared ESLint flat configs
│   ├── config-ts/                # Shared TypeScript configs
│   ├── core/                     # Shared utilities (errors, responses, DynamoDB, AgentCore)
│   ├── types/                    # Shared TypeScript interfaces
│   └── lambdas/
│       ├── chat/                 # Chat handler (TypeScript)
│       ├── create-initial-user/  # Cognito user seeder (JS)
│       ├── vector-index/         # pgvector table setup (JS)
│       └── layers/
│           └── common/nodejs/    # Shared Lambda layer
├── docs/
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

**Workspace globs** (`pnpm-workspace.yaml`):

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "packages/lambdas/*"
```

> Note: `packages/lambdas/layers/` is intentionally outside workspace
> globs. Layer dependencies are installed via `npm install --production`
> during the infra prebuild step, not through pnpm workspaces.

---

## Technology Stack

| Layer          | Technology                          |
| -------------- | ----------------------------------- |
| Monorepo       | Turborepo + pnpm                    |
| Infrastructure | AWS CDK (TypeScript)                |
| Backend        | Lambda (TypeScript + JS)            |
| Frontend       | Next.js (TODO)                      |
| Vector Store   | Aurora Serverless v2 + pgvector     |
| Auth           | Amazon Cognito                      |
| AI/ML          | Amazon Bedrock (Agent + KB)         |
| Session Store  | DynamoDB                            |
| Linting        | ESLint 9 flat config                |
| Formatting     | Prettier                            |
| Testing        | Jest                                |
| Security       | cdk-nag (AwsSolutions pack)         |
| Node Version   | 24.8.0 (`.nvmrc`)                   |

---

## Vector Store: pgvector on Aurora Serverless

### Why pgvector over OpenSearch Serverless

| Criteria              | pgvector + Aurora Serverless v2       | OpenSearch Serverless              |
| --------------------- | ------------------------------------- | ---------------------------------- |
| **Minimum cost**      | ~$0 at idle (scales to 0 ACU)         | ~$350/month (2 OCU minimum)        |
| **Complexity**        | Standard SQL, no SigV4 signing        | Custom query DSL, SigV4 required   |
| **Bedrock KB support**| Native integration                    | Native integration                 |
| **Index management**  | HNSW — no retraining needed           | Managed, but collection policies   |
| **Best for**          | < 1M vectors, SQL-friendly teams      | Massive scale, hybrid search       |

### Vector Index Configuration

The `vector-index` Lambda (CloudFormation custom resource) provisions
the pgvector schema at deploy time via the RDS Data API:

```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table
CREATE TABLE IF NOT EXISTS <table_name> (
  id TEXT PRIMARY KEY,
  embedding vector(<dimension>),  -- default: 1024 (Titan Embed v2)
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index (no retraining needed as data grows)
CREATE INDEX IF NOT EXISTS <table>_embedding_idx
  ON <table> USING hnsw (embedding vector_l2_ops)
  WITH (m = 16, ef_construction = 128);

-- Time-based index for partitioning/queries
CREATE INDEX IF NOT EXISTS <table>_created_at_idx
  ON <table> (created_at);
```

**HNSW parameters:**

- `m = 16` — Max connections per node. Higher = better recall, more
  memory. 16 is a good production default.
- `ef_construction = 128` — Build-time search depth. Higher = better
  index quality, slower builds. 128 balances quality and build time.

At query time, set `ef_search` (default 40) higher for better recall:

```sql
SET ivfflat.probes = 10;  -- only for IVFFlat
SET hnsw.ef_search = 100; -- for HNSW, increase for better recall
```

---

## CDK Infrastructure

### Build Pipeline

The infra package has a `prebuild` step that installs Lambda layer
dependencies before CDK synthesis:

```json
{
  "prebuild": "cd ../../packages/lambdas/layers/common/nodejs && npm install --production",
  "build": "tsc"
}
```

Turborepo's `build` task has `dependsOn: ["^build"]`, so shared
packages (`types`, `core`) build before `infra`.

### cdk-nag Suppressions

Suppressions are organized by AWS service in
`apps/infra/lib/utils/nag-suppressions.ts`:

| Function                       | Rules Suppressed                    |
| ------------------------------ | ----------------------------------- |
| `applyNagSuppressions`         | IAM4, IAM5, L1                      |
| `suppressS3Warnings`           | S1 (access logging)                 |
| `suppressCognitoWarnings`      | COG2, COG3, SMG4                    |
| `suppressApiGatewayWarnings`   | APIG2, APIG3, APIG4, COG4          |
| `suppressCloudFrontWarnings`   | CFR1, CFR2, CFR3, CFR4              |
| `suppressVpcWarnings`          | VPC7                                |
| `suppressSnsWarnings`          | SNS3                                |

> **Production note:** Review each suppression before deploying to
> production. Many of these (WAF, MFA, access logging, VPC flow logs)
> should be enabled in a production environment.

---

## Lambda Functions

### chat (`packages/lambdas/chat/`)

TypeScript Lambda handling chat requests via Bedrock AgentCore Runtime.

- Cognito JWT authentication with IDOR prevention
- Input sanitization (PII masking for SSN, email, credit cards)
- Session ownership validation via DynamoDB
- Structured logging with `@aws-lambda-powertools/logger`
- CORS with origin whitelisting

### vector-index (`packages/lambdas/vector-index/`)

JavaScript CloudFormation custom resource that provisions the pgvector
schema in Aurora Serverless via the RDS Data API.

**Resource properties:**

| Property          | Required | Default | Description                        |
| ----------------- | -------- | ------- | ---------------------------------- |
| `ClusterArn`      | Yes      | —       | Aurora cluster ARN                 |
| `SecretArn`       | Yes      | —       | Secrets Manager ARN for DB creds   |
| `DatabaseName`    | Yes      | —       | PostgreSQL database name           |
| `TableName`       | Yes      | —       | Table name for vector storage      |
| `VectorDimension` | No       | 1024    | Embedding dimension                |

### create-initial-user (`packages/lambdas/create-initial-user/`)

JavaScript CloudFormation custom resource that seeds a Cognito user
pool with an initial admin user. Password is retrieved from Secrets
Manager (never hardcoded or logged).

### Common Layer (`packages/lambdas/layers/common/nodejs/`)

Shared runtime dependencies for Lambda functions. Currently includes:

- `@aws-crypto/sha256-js`
- `uuid`

AWS SDK v3 clients are **not** bundled — they're available in the
Lambda Node.js 20+ runtime.

---

## Shared Packages

### @agentic-app/types

Shared TypeScript interfaces used across infra, lambdas, and frontend:

- `ChatRequest`, `ChatResponse` — API contracts
- `AuthContext` — Cognito JWT claims
- `SessionInfo` — DynamoDB session records
- `LambdaEnvironment` — Environment variable typing (includes Aurora
  vars: `CLUSTER_ARN`, `SECRET_ARN`, `DATABASE_NAME`)
- `AgentConfig`, `KnowledgeBaseDocument` — Bedrock configuration

### @agentic-app/core

Shared utilities:

- **Error classes:** `AuthorizationError`, `ValidationError`,
  `MissingEnvironmentVariable`, `InvalidJsonError`, etc.
- **Gateway responses:** `createSuccessJsonResponse`,
  `createErrorJsonResponse` with security headers (CORS, CSP, XSS
  protection)
- **AgentCore:** Bedrock AgentCore Runtime invocation wrapper
- **Tables:** DynamoDB abstraction for sessions and chat history

### @agentic-app/config-ts

Shared TypeScript configurations:

- `base.json` — CDK/Lambda (CommonJS, ES2020)
- `nextjs.json` — Next.js (ESNext, bundler resolution, JSX preserve)
- `react.json` — Generic React (ESNext, bundler resolution, JSX
  react-jsx)

### @agentic-app/config-eslint

Shared ESLint 9 flat configs:

- `base` — JavaScript (recommended rules)
- `typescript` — TypeScript (typescript-eslint recommended)

---

## Production Readiness Checklist

### Completed

- [x] pgvector with HNSW indexing (no retraining needed)
- [x] `created_at` column with index for time-based queries
- [x] Input sanitization and PII masking in chat Lambda
- [x] Cognito JWT auth with IDOR prevention
- [x] Secrets Manager for sensitive values (no hardcoded credentials)
- [x] Structured logging with Lambda Powertools
- [x] cdk-nag security scanning
- [x] Security headers on API responses (CORS, X-Frame-Options, etc.)
- [x] Origin whitelisting for CORS

### Remaining — Must Do

#### 1. Aurora Serverless v2: Set Minimum ACU

Do not scale to 0 in production. Cold starts from 0 ACU add several
seconds to the first query.

```typescript
// In your Aurora CDK construct
const cluster = new rds.DatabaseCluster(this, "VectorDb", {
  engine: rds.DatabaseClusterEngine.auroraPostgres({
    version: rds.AuroraPostgresEngineVersion.VER_16_6,
  }),
  serverlessV2MinCapacity: 0.5, // Keep warm — prevents cold starts
  serverlessV2MaxCapacity: 8, // Scale up under load
  writer: rds.ClusterInstance.serverlessV2("writer"),
  vpc,
  defaultDatabaseName: "vectordb",
  enableDataApi: true, // Required for vector-index custom resource
});
```

#### 2. RDS Proxy for Chat Lambda

The Data API is fine for the `vector-index` custom resource (runs once
at deploy), but the chat Lambda's hot path should use a direct
connection via RDS Proxy for lower latency and connection pooling.

```typescript
const proxy = new rds.DatabaseProxy(this, "VectorDbProxy", {
  proxyTarget: rds.ProxyTarget.fromCluster(cluster),
  secrets: [cluster.secret!],
  vpc,
  requireTLS: true,
  idleClientTimeout: cdk.Duration.minutes(5),
});

// Grant the chat Lambda access
proxy.grantConnect(chatLambda, "admin");

// Chat Lambda needs VPC access
const chatLambda = new lambda.Function(this, "ChatHandler", {
  vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  environment: {
    DB_PROXY_ENDPOINT: proxy.endpoint,
    DATABASE_NAME: "vectordb",
  },
});
```

> **Important:** When using RDS Proxy, the chat Lambda must be in a
> VPC. Ensure you have NAT Gateways or VPC endpoints for any external
> AWS services the Lambda calls (Bedrock, DynamoDB, Secrets Manager).

#### 3. Enable cdk-nag Rules Currently Suppressed

Review and enable these for production:

| Rule  | Action                                                    |
| ----- | --------------------------------------------------------- |
| COG2  | Enable MFA on Cognito User Pool                           |
| APIG3 | Attach AWS WAF to API Gateway                             |
| CFR2  | Attach AWS WAF to CloudFront                              |
| S1    | Enable S3 access logging                                  |
| CFR3  | Enable CloudFront access logging                          |
| VPC7  | Enable VPC Flow Logs                                      |
| SMG4  | Enable Secrets Manager automatic rotation                 |

#### 4. VPC Endpoints

With the chat Lambda in a VPC, add interface/gateway endpoints to
avoid NAT Gateway costs and improve latency:

```typescript
// Gateway endpoint (free)
vpc.addGatewayEndpoint("S3Endpoint", {
  service: ec2.GatewayVpcEndpointAwsService.S3,
});
vpc.addGatewayEndpoint("DynamoEndpoint", {
  service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
});

// Interface endpoints (cost per hour + data)
vpc.addInterfaceEndpoint("BedrockEndpoint", {
  service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
});
vpc.addInterfaceEndpoint("SecretsManagerEndpoint", {
  service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
});
```

#### 5. Next.js Frontend (`apps/web/`)

Not yet scaffolded. Needs:

- Next.js app with Cognito auth (Amplify UI or next-auth)
- Chat interface consuming the API Gateway endpoint
- SSR/ISR for public pages, CSR for authenticated chat
- CloudFront distribution in CDK

#### 6. CDK Constructs (`apps/infra/lib/constructs/`)

Currently empty. Build out:

- `AuroraConstruct` — Cluster, proxy, security groups, vector-index
  custom resource
- `ApiConstruct` — API Gateway, Cognito authorizer, Lambda
  integrations
- `FrontendConstruct` — S3 bucket, CloudFront, OAC
- `BedrockConstruct` — Agent, Knowledge Base, S3 data source
- `MonitoringConstruct` — CloudWatch dashboards, alarms, SNS alerts

#### 7. Monitoring & Observability

- CloudWatch dashboards for Lambda errors, API latency, Aurora
  connections
- CloudWatch alarms on error rates and p99 latency
- X-Ray tracing on Lambda and API Gateway
- Aurora Performance Insights enabled

#### 8. CI/CD Pipeline

- GitHub Actions or CodePipeline
- Run `pnpm quality:check` (lint + format + type-check)
- Run `pnpm test`
- `cdk diff` on PRs
- `cdk deploy` on merge to main
- Separate staging and production stacks/accounts

---

## Remaining Work

| Priority | Task                                    | Location                          |
| -------- | --------------------------------------- | --------------------------------- |
| P0       | Aurora CDK construct (min ACU, proxy)   | `apps/infra/lib/constructs/`      |
| P0       | API Gateway + Cognito construct         | `apps/infra/lib/constructs/`      |
| P0       | Bedrock Agent + KB construct            | `apps/infra/lib/constructs/`      |
| P0       | CDK app entry point (`bin/app.ts`)      | `apps/infra/bin/`                 |
| P1       | Next.js frontend scaffold              | `apps/web/`                       |
| P1       | CloudFront + S3 construct              | `apps/infra/lib/constructs/`      |
| P1       | VPC + endpoints construct              | `apps/infra/lib/constructs/`      |
| P1       | Enable WAF, MFA, logging               | `apps/infra/lib/constructs/`      |
| P2       | Monitoring construct                   | `apps/infra/lib/constructs/`      |
| P2       | CI/CD pipeline                         | `.github/workflows/` or pipeline  |
| P2       | E2E tests                              | `apps/infra/test/`                |
| P2       | Load testing for Aurora scaling         | —                                 |
