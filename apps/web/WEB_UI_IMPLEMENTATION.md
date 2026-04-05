# Web UI implementation summary

This document describes the Claude-style chat interface, chat history page, and supporting backend changes added for the Agentic app. The Next.js layer follows the same patterns as the reference project **nextjs-dashboard-aws-cdk-dynamodb** (Next.js App Router, Tailwind, NextAuth v5 with Cognito, server-side API calls with the Cognito ID token).

---

## 1. Goals

- A **Claude-like chat UI**: prompts, assistant replies, suggestions on empty state, typing indicator while waiting, Shift+Enter for newline.
- A **previous chats** page listing past conversations (sessions).
- **Stack alignment** with the dashboard reference: `apiFetch`-style client, Cognito auth, protected routes.

---

## 2. Backend changes

### 2.1 `packages/core` — `dynamoDBClient.ts`

- **Unmarshall DynamoDB items** for chat history using `@aws-sdk/util-dynamodb` `unmarshall`, so API responses are plain JSON objects instead of raw DynamoDB attribute maps.
- **`listUserSessions(userId)`** — queries the **sessions** table via the **`UserIdIndex`** GSI (`userId` partition key, `timestamp` sort key), newest first, limit 50. Returns an array of unmarshalled records.

### 2.2 `packages/core` — `package.json`

- Added explicit dependency: **`@aws-sdk/util-dynamodb`**.

### 2.3 `packages/lambdas/chat` — `index.ts`

- Extended **`GET`** handling:
  - If query parameter **`list=sessions`**, returns **`{ sessions }`** from `tables.listUserSessions(userContext.userId)`.
  - Otherwise behavior unchanged: **`GET`** with optional **`sessionId`** returns **`{ history }`** from `getChatHistory`.

Existing API Gateway routes (from CDK) remain:

- `POST .../api/chat/invoke` — chat message.
- `GET .../api/chat/history` — history or, with `?list=sessions`, session list.

---

## 3. Frontend — new package `apps/web`

New Next.js application **`@agentic-app/web`** under `agentic-app/apps/web`.

### 3.1 Tooling

- **Next.js 15**, **React 19**, **TypeScript**, **Tailwind CSS 3**, **PostCSS**, **`@tailwindcss/forms`**, **`clsx`**, **`@heroicons/react`**, **`next-auth` 5 beta**, **`zod`**.
- **`next.config.ts`**: `output: 'standalone'` (same idea as the reference for containerized deploys).

### 3.2 Authentication (`auth.ts`)

- **Cognito** provider (issuer, OAuth token endpoint, refresh flow) aligned with the dashboard reference.
- **`callbacks.authorized`**: paths under **`/chat`** require a signed-in session (middleware integration).
- Session exposes **`idToken`** for API Gateway (Cognito authorizer).

### 3.3 Middleware (`middleware.ts`)

- **`export { auth as middleware }`** from `auth`.
- **`matcher`**: `['/chat/:path*']` so auth runs on chat routes.

### 3.4 API integration

- **`app/lib/api-client.ts`** — **`apiFetch<T>(path)`**:
  - Reads session via **`auth()`**; redirects to **`/login`** if missing or refresh error.
  - **`fetch(`${API_ENDPOINT}${path}`)** with **`Authorization: session.idToken`** and **`Content-Type: application/json`**.
  - **`cache: 'no-store'`** by default.

- **`app/lib/actions/chat.ts`** (server actions):
  - **`sendChatMessage(message, sessionId?)`** → `POST` **`chat/invoke`** with body `{ message, sessionId }`.
  - **`fetchChatHistory(sessionId?)`** → `GET` **`chat/history`** with optional `?sessionId=`.
  - **`fetchSessionList()`** → `GET` **`chat/history?list=sessions`**.

Paths are relative to **`API_ENDPOINT`**, which must include the API stage and **`/api/`** segment (see Environment variables).

### 3.5 Auth actions (`app/lib/actions/auth.ts`)

- **`handleSignIn`** — Cognito sign-in, redirect to **`/chat`**.
- **`handleSignOut`** — sign out, redirect to **`/`**.

### 3.6 Routes

| Route | Description |
|--------|-------------|
| **`/`** | Landing: sign-in CTA and link to chat. |
| **`/login`** | Login page; shows NextAuth error codes when present. |
| **`/chat`** | New chat; **`AgentChat`** with no initial session. |
| **`/chat/[sessionId]`** | Existing thread; **`AgentChat`** loads history (or falls back to last turn from session list). |
| **`/chat/history`** | Server-rendered list of sessions via **`apiFetch('chat/history?list=sessions')`**; links to **`/chat/[sessionId]`**. |
| **`/api/auth/[...nextauth]`** | NextAuth route handlers. |

### 3.7 Layout and UI

- **`app/chat/layout.tsx`** — Sidebar + main content; **`dynamic = 'force-dynamic'`**.
- **`app/ui/chat/sidenav.tsx`** — Client nav: Chat, History, Sign out; active state via **`usePathname`**.
- **`app/ui/chat/agent-chat.tsx`** — Port of the guide **`AgentChat.jsx`**:
  - Message bubbles (user / agent), empty state with suggestion chips, typing dots while loading, textarea + send, Clear.
  - Uses **server actions** (no direct Anthropic API from the browser).
  - After first reply in a new chat, **`router.replace(`/chat/${sessionId}`)** so the URL reflects the session.
  - Loading a session: **`fetchChatHistory(sessionId)`**; if no rows, **`fetchSessionList()`** and match **`sessionId`** to show **`lastMessage`** / **`lastResponse`** as a minimal thread.

- **`app/ui/global.css`** — Chat CSS variables (light/dark), scrollbar styling, **`chat-dot-pulse`** animation for typing indicator.
- **`app/ui/fonts.ts`** — **Inter** + **JetBrains Mono** (mono for labels).

### 3.8 Environment template

- **`apps/web/.env.example`** — documents **`AWS_REGION`**, Cognito IDs, **`AUTH_SECRET`**, **`AUTH_URL`**, and **`API_ENDPOINT`** with an example including **`/v1/api/`**.

---

## 4. Monorepo wiring

- **`pnpm-workspace.yaml`** already included **`apps/*`**; **`apps/web`** is picked up automatically.
- Root **`package.json`** scripts **`web:dev`** / **`web:build`** target **`@agentic-app/web`**.
- **`pnpm-lock.yaml`** was updated when **`apps/web`** was added (install with **`pnpm install --no-frozen-lockfile`** if the lockfile was out of date).

---

## 5. How to run

1. Copy **`apps/web/.env.example`** to **`apps/web/.env.local`** and fill in real values.
2. **`API_ENDPOINT`** must match the deployed API (include stage, e.g. **`v1`**, and the **`/api/`** prefix used by CDK).
3. From repo root: **`pnpm web:dev`** or **`pnpm --filter @agentic-app/web dev`**.

---

## 6. Reference comparison (dashboard app)

| Concept | Reference (`nextjs-dashboard-aws-cdk-dynamodb`) | Agentic `apps/web` |
|--------|--------------------------------------------------|---------------------|
| Session token for API | `apiFetch` + `Authorization: session.idToken` | Same |
| Auth | NextAuth + Cognito | Same |
| Protected area | Middleware matcher on `/dashboard` | Matcher on `/chat` |
| Styling | Tailwind | Tailwind + chat-specific tokens |

---

## 7. Files touched or added (checklist)

**Modified**

- `packages/core/package.json`
- `packages/core/src/dynamoDBClient.ts`
- `packages/lambdas/chat/src/index.ts`

**Added (`apps/web`)**

- `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `next-env.d.ts`
- `auth.ts`, `middleware.ts`
- `app/layout.tsx`, `app/page.tsx`, `app/login/page.tsx`, `app/ui/global.css`, `app/ui/fonts.ts`
- `app/api/auth/[...nextauth]/route.ts`
- `app/lib/api-client.ts`, `app/lib/actions/auth.ts`, `app/lib/actions/chat.ts`
- `app/chat/layout.tsx`, `app/chat/page.tsx`, `app/chat/[sessionId]/page.tsx`, `app/chat/history/page.tsx`
- `app/ui/chat/sidenav.tsx`, `app/ui/chat/agent-chat.tsx`
- `.env.example`
- This doc: `docs/WEB_UI_IMPLEMENTATION.md`

---

## 8. Notes and limitations

- Chat responses are **non-streaming** from API Gateway/Lambda; the UI shows a **typing indicator** until the full reply arrives (unlike direct Anthropic streaming in the original **`AgentChat.jsx`**).
- **Chat history table** rows may be sparse if the Lambda only persists **sessions** (`storeSessionInfo`); the UI falls back to **last message/response** on the session when per-message history is empty.
- Reference **`AgentChat.jsx`** in the workspace root was used as the **UX guide**; the implementation lives under **`apps/web/app/ui/chat/agent-chat.tsx`**.

---

*Generated to record the implementation session; adjust paths or env names if your deployment differs.*
