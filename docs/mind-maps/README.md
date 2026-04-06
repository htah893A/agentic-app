# Agentic App — Mind Maps Index

6 focused mind maps covering the full architecture of the `agentic-app` monorepo.

## Maps

| # | Map | Focus | Key Concepts |
|---|---|---|---|
| 1 | [Monorepo Structure](./01-monorepo-structure.md) | Package layout & dependency graph | pnpm workspaces, Turborepo, `types → core → lambda-chat → infra`, Next.js frontend, Python agent tree |
| 2 | [AWS Infrastructure](./02-aws-infrastructure.md) | CDK stacks & AWS resources | 12 stacks across 6 layers, VPC, Aurora pgvector, Cognito, API Gateway, AgentCore Runtime + Memory |
| 3 | [Request Flow](./03-request-flow.md) | Runtime data paths | Next.js → API Gateway → Lambda → AgentCore Runtime → Orchestrator → Sub-Agents → Tools → KB/DynamoDB/Polly/Transcribe |
| 4 | [Agent Architecture](./04-agent-architecture.md) | Multi-agent system internals | Orchestrator pattern, AgentRegistry, 5 Strands agents, 11 tools, sub-agent delegation, SM-2 spaced repetition, voice (Polly/Transcribe), Memory |
| 5 | [Authentication Flow](./05-authentication-flow.md) | Auth & security | NextAuth v5 + Cognito OAuth, JWT refresh, middleware route protection, IAM/SigV4 for AgentCore |
| 6 | [Deployment Pipeline](./06-deployment-pipeline.md) | Build & deploy | CDK deploy order, Turborepo pipeline, Next.js standalone build, Amplify CI/CD, quality gates |

## Cross-Map References

Concepts that appear across multiple maps — link between them in Miro:

| Concept | Appears In |
|---|---|
| Next.js Frontend (`apps/web`) | Maps 1, 3, 5, 6 |
| NextAuth v5 + Cognito OAuth | Maps 3, 5, 6 |
| Server Actions (`apiFetch`) | Maps 3, 5 |
| Chat Lambda (`packages/lambdas/chat`) | Maps 1, 2, 3, 6 |
| AgentCore Runtime (multi-agent container) | Maps 2, 3, 4, 5 |
| Orchestrator Agent | Maps 3, 4 |
| Sub-Agents (grammar, vocabulary, conversation, content) | Maps 1, 3, 4 |
| Agent Registry (singleton pattern) | Maps 4 |
| Strands SDK (`@tool`, `Agent`) | Maps 1, 4 |
| Cognito User Pool | Maps 2, 3, 5 |
| API Gateway | Maps 2, 3, 5 |
| Aurora pgvector | Maps 2, 3, 4 |
| Bedrock Knowledge Base | Maps 2, 3, 4 |
| AgentCore Memory | Maps 2, 4 |
| DynamoDB (Sessions, ChatHistory) | Maps 2, 3, 4 |
| DynamoDB (LearnerProgress, LearnerReviews) | Maps 2, 3, 4 |
| SM-2 Spaced Repetition | Maps 3, 4 |
| Amazon Polly (TTS) | Maps 3, 4 |
| Amazon Transcribe (STT) | Maps 3, 4 |
| SSM Parameter Store | Maps 2, 4, 6 |
| Lambda Layer | Maps 2, 6 |
| Turborepo | Maps 1, 6 |

## Related Documentation

- [Agentic Architecture (detailed)](../AGENTIC_ARCHITECTURE.md) — comprehensive implementation guide covering the multi-agent system, tool system, memory architecture, and end-to-end request flow

## Suggested Miro Color Coding

| Color | Domain |
|---|---|
| 🔵 Blue | AWS infrastructure |
| 🟣 Purple | AgentCore (Runtime, Memory) |
| 🟢 Green | Frontend / user-facing (Next.js, NextAuth) + Agent code (Python) |
| 🟡 Yellow | Shared packages / data stores (DynamoDB, Aurora) |
| 🟠 Orange | Auth / security / Lambda functions / AWS AI services (Polly, Transcribe) |
| 🔴 Red | Security controls |
| ⚪ Gray | Config / tooling |
