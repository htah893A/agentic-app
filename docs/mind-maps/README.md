# Agentic App — Mind Maps Index

6 focused mind maps covering the full architecture of the `agentic-app` monorepo.

## Maps

| # | Map | Focus | Key Concepts |
|---|---|---|---|
| 1 | [Monorepo Structure](./01-monorepo-structure.md) | Package layout & dependency graph | pnpm workspaces, Turborepo, `types → core → lambda-chat → infra`, Next.js frontend |
| 2 | [AWS Infrastructure](./02-aws-infrastructure.md) | CDK stacks & AWS resources | 12 stacks across 6 layers, VPC, Aurora pgvector, Cognito, API Gateway, AgentCore |
| 3 | [Request Flow](./03-request-flow.md) | Runtime data paths | Next.js Server Actions → API Gateway → Lambda → AgentCore Runtime → Strands Agent → KB → Aurora |
| 4 | [Agent Architecture](./04-agent-architecture.md) | Python agent internals | Strands Agent, BedrockAgentCoreApp, Memory, Knowledge Base tool |
| 5 | [Authentication Flow](./05-authentication-flow.md) | Auth & security | NextAuth v5 + Cognito OAuth, JWT refresh, middleware route protection, IAM/SigV4 for AgentCore |
| 6 | [Deployment Pipeline](./06-deployment-pipeline.md) | Build & deploy | CDK deploy order, Turborepo pipeline, Next.js standalone build, Amplify CI/CD, quality gates |

## Cross-Map References

Concepts that appear across multiple maps — link between them in Miro:

| Concept | Appears In |
|---|---|
| Next.js Frontend (`apps/web`) | Maps 1, 3, 4, 5, 6 |
| NextAuth v5 + Cognito OAuth | Maps 3, 5, 6 |
| Server Actions (`apiFetch`) | Maps 3, 5 |
| Chat Lambda (`packages/lambdas/chat`) | Maps 1, 2, 3, 6 |
| AgentCore Runtime | Maps 2, 3, 4, 5 |
| Cognito User Pool | Maps 2, 3, 5 |
| API Gateway | Maps 2, 3, 5 |
| Aurora pgvector | Maps 2, 3, 4 |
| Bedrock Knowledge Base | Maps 2, 3, 4 |
| AgentCore Memory | Maps 2, 4 |
| SSM Parameter Store | Maps 2, 6 |
| Lambda Layer | Maps 2, 6 |
| Turborepo | Maps 1, 6 |

## Suggested Miro Color Coding

| Color | Domain |
|---|---|
| 🔵 Blue | AWS infrastructure |
| 🟣 Purple | AgentCore (Runtime, Memory) |
| 🟢 Green | Frontend / user-facing (Next.js, NextAuth) |
| 🟡 Yellow | Shared packages / data stores |
| 🟠 Orange | Auth / security / Lambda functions |
| 🔴 Red | Security controls |
| ⚪ Gray | Config / tooling |
