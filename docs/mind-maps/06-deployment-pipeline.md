# Mind Map 6: Deployment Pipeline

> **Center Node:** Deployment

---

## Branch 1: Infrastructure Deployment (CDK)

### Command: `pnpm cdk:deploy` → `pnpm --filter @agentic-app/infra cdk deploy`

```
Pre-build
  └── cd packages/lambdas/layers/common/nodejs && npm install --production
      (installs Lambda layer dependencies)

Build
  └── tsc (compile TypeScript → JavaScript)

CDK Deploy (--all, dependency order)
  │
  ├── Layer 0: AgentCoreSharedResourcesStack
  │   └── Lambda Layer, IAM Policies
  │
  ├── Layer 1 (parallel):
  │   ├── AgentCoreNetworkStack → VPC, Security Groups
  │   └── AgentCoreStorageStack → KMS, S3
  │
  ├── Layer 2:
  │   ├── AgentCoreCognitoStack → User Pool, Identity Pool, Initial User
  │   ├── AgentCoreDatabaseStack → DynamoDB tables: ChatHistory, Sessions, LearnerProgress, LearnerReviews (depends: Network)
  │   └── AgentCoreAuroraPgVectorStack → Aurora, KB (depends: Network, Shared)
  │
  ├── Layer 3:
  │   ├── AgentCoreMemoryStack → AgentCore Memory (depends: Storage)
  │   └── AgentCoreRuntimeStack → AgentCore Runtime (depends: Aurora, Memory, Database)
  │       └── Docker build: agent/ → ARM64 container → AgentCore
  │           (multi-agent: orchestrator + grammar + vocabulary + conversation + content)
  │
  ├── Layer 4:
  │   └── AgentCoreApiStack → API Gateway, Chat Lambda (depends: Network, Cognito, Shared, Runtime)
  │       └── esbuild bundles: packages/lambdas/chat/src/index.ts
  │
  └── Layer 5:
      ├── AgentCoreMonitoringStack → Dashboard, Alarms, SNS (depends: Api)
      └── AgentCoreAmplifyHostingStack (optional, depends: Api, Cognito)
```

### Key Build Steps
- Lambda Layer: `npm install --production` in `packages/lambdas/layers/common/nodejs/`
- Chat Lambda: esbuild via `NodejsFunction` (minified, source maps)
- Agent Runtime: Docker build from `apps/infra/agent/` (Python, ARM64)
- pgvector init: Custom Resource Lambda runs after Aurora cluster creation
- Initial user: Custom Resource Lambda creates Cognito user after User Pool

---

## Branch 2: Frontend Deployment

### Option A: Local Development
```
pnpm web:dev  (or pnpm --filter @agentic-app/web dev)
  │
  ├── Reads apps/web/.env.local for:
  │   ├── COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, COGNITO_CLIENT_SECRET
  │   ├── COGNITO_DOMAIN_PREFIX
  │   ├── AUTH_SECRET, AUTH_URL (http://localhost:3000)
  │   └── API_ENDPOINT (API Gateway URL including /v1/api/)
  │
  └── Next.js dev server on http://localhost:3000
      ├── Hot reload
      ├── NextAuth routes at /api/auth/*
      └── Cognito OAuth callback at /api/auth/callback/cognito
```

### Option B: Amplify Hosting (when `DEPLOY_FRONTEND=true`)
```
GitHub Push (main branch)
  │
  ▼
Amplify CI/CD Pipeline
  │
  ├── Pre-build:
  │   ├── npm install -g pnpm@9.15.4
  │   └── pnpm install --frozen-lockfile
  │
  ├── Build:
  │   ├── pnpm --filter @agentic-app/types build
  │   ├── pnpm --filter @agentic-app/core build
  │   └── cd apps/web && pnpm build
  │       └── Next.js output: 'standalone' (self-contained Node.js server)
  │
  ├── Artifacts: apps/web/.next/**
  │
  └── Deploy:
      ├── Amplify managed hosting
      ├── Environment variables injected by CDK:
      │   ├── COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, COGNITO_CLIENT_SECRET
      │   ├── AUTH_SECRET
      │   ├── API_ENDPOINT (API Gateway URL)
      │   └── AWS_REGION
      ├── Security headers injected (HSTS, X-Frame, etc.)
      └── SSR routing (standalone mode, not static export)
```

### Option C: Standalone Container Deploy
```
pnpm web:build
  │
  └── Next.js builds to .next/ with output: 'standalone'
      ├── Self-contained Node.js server (no node_modules needed)
      ├── Can be containerized (Docker) or deployed to ECS/Fargate/App Runner
      └── Requires same environment variables as .env.local
```

---

## Branch 3: Turborepo Build Pipeline

```
turbo run build
  │
  ├── @agentic-app/types        (no deps → builds first)
  ├── @agentic-app/config-ts    (no deps → builds first)
  ├── @agentic-app/config-eslint (no deps → builds first)
  │
  ├── @agentic-app/core         (depends on types → builds second)
  │
  ├── @agentic-app/lambda-chat  (depends on core, types → builds third)
  │
  ├── @agentic-app/web          (depends on config-ts → builds in parallel with lambda-chat)
  │   └── Next.js build → .next/** (standalone output)
  │
  └── @agentic-app/infra        (depends on core, lambda-chat, types → builds last)
```

### Turbo Task Configuration
| Task | Depends On | Outputs | Cache |
|---|---|---|---|
| `build` | `^build` | `.next/**, !.next/cache/**, cdk.out/**, dist/**, build/**` | ✅ |
| `dev` | — | — | ❌ (persistent) |
| `test` | `build` | `coverage/**` | ✅ |
| `test:e2e` | `build` | — | ❌ |
| `lint` | `^build` | — | ✅ |
| `lint:check` | `^build` | — | ✅ |
| `type-check` | `^build` | — | ✅ |
| `clean` | — | — | ❌ |

---

## Branch 4: Quality Gates

### Pre-deployment checks
```
pnpm quality:check
  ├── pnpm lint:check    (ESLint)
  ├── pnpm format:check  (Prettier)
  └── pnpm type-check    (TypeScript --noEmit)
```

### CDK-specific validation
```
pnpm --filter @agentic-app/infra validate
  ├── lint:check
  ├── format:check
  ├── type-check
  ├── test (Jest)
  └── security:scan
      ├── cdk synth
      └── cfn_nag_scan (CloudFormation security scanning)
```

### CDK-Nag (when `CDK_NAG_ENABLED=true`)
- `AwsSolutionsChecks` applied to all stacks
- Suppressions per stack type:
  - S3 warnings (StorageStack)
  - Cognito warnings (CognitoStack)
  - API Gateway warnings (ApiStack)
  - VPC warnings (NetworkStack)
  - SNS warnings (MonitoringStack)

---

## Branch 5: Environment Configuration

### Required Environment Variables (Infrastructure)
| Variable | Purpose | Default |
|---|---|---|
| `AWS_REGION` | Deployment region | `us-east-1` |
| `CDK_DEFAULT_ACCOUNT` | AWS account ID | — |
| `AGENTCORE_MODEL_ID` | Bedrock model | `us.anthropic.claude-sonnet-4-20250514-v1:0` |
| `VPC_CIDR` | VPC CIDR block | `10.0.0.0/18` |
| `ALERT_EMAIL` | Monitoring alerts | `admin@example.com` |
| `AURORA_DATABASE_NAME` | Vector DB name | `vectordb` |
| `CORS_ENABLED` | Enable CORS | `false` |
| `DEPLOY_FRONTEND` | Deploy Amplify | `false` |
| `CDK_NAG_ENABLED` | Security checks | `false` |
| `GITHUB_REPOSITORY` | Amplify source | — |
| `GITHUB_TOKEN_SECRET_NAME` | GitHub token | `github-token` |

### Required Environment Variables (Frontend — `apps/web/.env.local`)
| Variable | Purpose | Required |
|---|---|---|
| `COGNITO_USER_POOL_ID` | Cognito issuer derivation | ✅ |
| `COGNITO_CLIENT_ID` | OAuth client ID | ✅ |
| `COGNITO_CLIENT_SECRET` | OAuth client secret | ✅ |
| `AUTH_SECRET` | NextAuth encryption key | ✅ |
| `API_ENDPOINT` | API Gateway URL (e.g. `https://xxx.execute-api.us-east-1.amazonaws.com/v1/api/`) | ✅ |
| `AUTH_URL` | NextAuth base URL | Optional |
| `AWS_REGION` | AWS region | `us-east-1` |
| `COGNITO_DOMAIN_PREFIX` | Cognito domain prefix | Optional |
| `COGNITO_OAUTH_DOMAIN` | Explicit OAuth domain | Optional |

### SSM Parameter Store (`/AgentCoreTemplate/*`)
- All inter-stack references stored in SSM
- Pattern: stack creates resource → stores ARN/ID in SSM → dependent stack reads from SSM
- ~30+ parameters covering: VPC, Security Groups, Lambda Layer, Policies, Tables, Aurora, Cognito, API, AgentCore, Monitoring

---

## Branch 6: Useful Commands

| Command | Purpose |
|---|---|
| `pnpm build` | Build all packages (Turborepo) |
| `pnpm dev` | Run all dev servers (infra + web) |
| `pnpm web:dev` | Run Next.js dev server only |
| `pnpm web:build` | Build Next.js frontend only |
| `pnpm cdk:synth` | Synthesize CloudFormation templates |
| `pnpm cdk:diff` | Preview infrastructure changes |
| `pnpm cdk:deploy` | Deploy all stacks |
| `pnpm cdk:destroy` | Tear down all stacks |
| `pnpm quality:check` | Lint + format + type-check |
| `pnpm test` | Run all tests |
| `pnpm clean` | Remove all build artifacts + node_modules |

---

## Color Coding (for Miro)
- 🔵 Blue: Infrastructure deployment (CDK)
- 🟢 Green: Frontend deployment (Next.js / Amplify)
- 🟡 Yellow: Build pipeline (Turborepo)
- 🟠 Orange: Quality gates
- ⚪ Gray: Configuration
