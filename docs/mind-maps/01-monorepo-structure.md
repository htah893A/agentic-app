# Mind Map 1: Monorepo Structure & Dependencies

> **Center Node:** `agentic-app` (pnpm + Turborepo monorepo)

---

## Branch 1: `apps/`

### `apps/infra/` → `@agentic-app/infra`
- CDK infrastructure (TypeScript)
- `bin/app.ts` — CDK entry point
- `lib/stacks/` — 12 CDK stacks
- `lib/constructs/` — reusable CDK constructs
- `lib/utils/` — constants, nag suppressions
- `agent/` — Python multi-agent system (Strands SDK + BedrockAgentCoreApp)
  - `src/main.py` — entry point, `@app.entrypoint invoke()`
  - `src/agent.py` — backward-compatible wrapper
  - `src/memory.py` — `MemoryManager` (AgentCore Memory create_event)
  - `src/agents/` — agent definitions (registry pattern)
    - `registry.py` — `AgentRegistry` singleton, `create_bedrock_model()`
    - `orchestrator.py` — central teacher agent (delegates to sub-agents)
    - `grammar.py` — grammar specialist sub-agent
    - `vocabulary.py` — vocabulary specialist sub-agent
    - `conversation.py` — conversation practice sub-agent
    - `content.py` — content generation sub-agent
  - `src/tools/` — `@tool`-decorated functions
    - `sub_agents.py` — wrappers that invoke sub-agents as tools
    - `knowledge_base.py` — Bedrock KB Retrieve API search
    - `progress.py` — learner profile CRUD (DynamoDB)
    - `review.py` — SM-2 spaced repetition (DynamoDB)
    - `voice.py` — Polly TTS + Transcribe STT
  - `Dockerfile` — Python 3.13, ARM64, non-root user
  - `requirements.txt` — bedrock-agentcore, strands-agents, boto3
- `test/` — Jest tests for stacks and Lambda functions

### `apps/web/` → `@agentic-app/web`
- Next.js 15 frontend (React 19, TypeScript, Tailwind CSS 3)
- `next.config.ts` — `output: 'standalone'` for containerized deploys
- `auth.ts` — NextAuth v5 (beta) with Cognito provider, JWT refresh flow
- `middleware.ts` — protects `/chat/*` routes via NextAuth
- `app/` — App Router pages and components:
  - `page.tsx` — landing page (sign-in CTA)
  - `login/page.tsx` — login page with error handling
  - `chat/page.tsx` — new chat (AgentChat component)
  - `chat/[sessionId]/page.tsx` — existing conversation thread
  - `chat/history/page.tsx` — server-rendered session list
  - `chat/layout.tsx` — sidebar + main content (`force-dynamic`)
  - `chat/error.tsx` — error boundary
  - `chat/loading.tsx` — loading state
  - `api/auth/[...nextauth]/route.ts` — NextAuth route handlers
- `app/ui/` — UI components:
  - `chat/agent-chat.tsx` — Claude-style chat interface (client component)
  - `chat/sidenav.tsx` — sidebar navigation (Chat, History, Sign out)
  - `fonts.ts` — Inter + JetBrains Mono
  - `global.css` — chat CSS variables (light/dark), scrollbar, typing animation
- `app/lib/` — shared utilities:
  - `api-client.ts` — `apiFetch<T>()` with Cognito ID token auth
  - `env.ts` — Zod-validated environment variables
  - `actions/auth.ts` — server actions: `handleSignIn`, `handleSignOut`
  - `actions/chat.ts` — server actions: `sendChatMessage`, `fetchChatHistory`, `fetchSessionList`
- Dependencies: Next.js 15, React 19, NextAuth 5 beta, Tailwind, `@heroicons/react`, `clsx`, `zod`
- Dev dependencies: `@agentic-app/config-ts`, `autoprefixer`, `postcss`

---

## Branch 2: `packages/`

### `packages/types/` → `@agentic-app/types`
- Shared TypeScript interfaces
- `ChatRequest`, `ChatResponse`, `AuthContext`, `SessionInfo`, etc.
- `AgentCoreConfigSchema`, `AgentCoreResponseSchema`, `ChatLambdaEnvSchema`
- `LearnerProfileSchema`, `ReviewItemSchema`, `ProgressResponseSchema`
- `SupportedLanguageSchema` (10 languages)
- `LambdaHandler`, `LambdaEnvironment` types
- All schemas use Zod for runtime validation
- **No dependencies** on other workspace packages

### `packages/core/` → `@agentic-app/core`
- Shared AWS utilities
- `AgentCore` — Bedrock AgentCore Runtime SDK client
  - `invokeAgentCoreRuntime()` — sends payload, handles streaming response
  - Validates config with `AgentCoreConfigSchema`
  - Supports text and voice mode (audioBase64, language)
- `Tables` — DynamoDB abstraction (sessions, chat history)
  - `validateSessionOwnership(sessionId, userId)` — IDOR prevention
  - `getChatHistory(userId, sessionId?)` — query by session or user
  - `getUserSessions(userId)` — queries Sessions table via `UserIdIndex` GSI
  - `storeSessionInfo(input)` — validated via `SessionInfoSchema`
- `gatewayResponse` — API Gateway response helpers
- `appException` — custom error classes
- **Depends on:** `@agentic-app/types`

### `packages/lambdas/chat/` → `@agentic-app/lambda-chat`
- Chat Lambda handler (API Gateway → AgentCore Runtime)
- Input validation, PII sanitization, session management
- Extended `GET` handling:
  - `?list=sessions` → returns `{ sessions }` from `listUserSessions`
  - Default → returns `{ history }` from `getChatHistory`
- **Depends on:** `@agentic-app/core`, `@agentic-app/types`

### `packages/lambdas/` (non-TypeScript Lambdas)
- `api-proxy/` — API proxy (plain JS)
- `create-initial-user/` — Cognito user setup (plain JS)
- `init-pgvector/` — Aurora pgvector initialization (plain JS)
- `vector-index/` — Vector indexing (plain JS)
- `layers/common/` — shared Lambda layer (AWS SDK clients)

### `packages/config-eslint/` → `@agentic-app/config-eslint`
- Shared ESLint configs (`base.js`, `typescript.js`)

### `packages/config-ts/` → `@agentic-app/config-ts`
- Shared TypeScript configs (`base.json`, `nextjs.json`, `react.json`)

---

## Branch 3: Dependency Graph

```
@agentic-app/types          (leaf — no workspace deps)
       ↑
@agentic-app/core           (depends on types)
       ↑
@agentic-app/lambda-chat    (depends on core + types)
       ↑
@agentic-app/infra          (depends on core + lambda-chat + types)

@agentic-app/config-ts      (leaf — used by web as devDependency)
       ↑
@agentic-app/web            (depends on config-ts; calls API at runtime)
```

---

## Branch 4: Turborepo Orchestration

- `turbo.json` defines task pipeline:
  - `build` → `dependsOn: ["^build"]` (builds deps first)
  - `test` → `dependsOn: ["build"]`
  - `test:e2e` → `dependsOn: ["build"]`, no cache
  - `lint` / `lint:check` / `type-check` → `dependsOn: ["^build"]`
  - `dev` → no cache, persistent
  - `clean` → no cache
- `pnpm-workspace.yaml` scopes: `apps/*`, `packages/*`, `packages/lambdas/*`
- Root scripts delegate via `turbo run` or `pnpm --filter`:
  - `pnpm dev` — runs all dev servers (infra + web)
  - `pnpm web:dev` — `pnpm --filter @agentic-app/web dev`
  - `pnpm web:build` — `pnpm --filter @agentic-app/web build`
  - `pnpm cdk:deploy` — `pnpm --filter @agentic-app/infra cdk deploy`

---

## Color Coding (for Miro)
- 🔵 Blue: Infrastructure (`apps/infra`)
- 🟢 Green: Frontend (`apps/web`)
- 🟡 Yellow: Shared packages (`packages/core`, `packages/types`)
- 🟠 Orange: Lambda functions (`packages/lambdas/*`)
- ⚪ Gray: Config packages (`config-eslint`, `config-ts`)
