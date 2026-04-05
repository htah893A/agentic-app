# Frontend Implementation — `apps/web`

> Next.js 15 (App Router) + NextAuth v5 beta + Cognito OAuth + Tailwind CSS
>
> This document covers the architecture, every file's purpose, the
> Cognito setup required for local development, and every issue that
> was discovered and resolved to get the frontend working end-to-end
> with the deployed CDK backend.

---

## 1. Architecture Overview

```
apps/web/
├── app/
│   ├── api/auth/[...nextauth]/route.ts   NextAuth route handler
│   ├── chat/
│   │   ├── [sessionId]/page.tsx          Resume an existing conversation
│   │   ├── history/
│   │   │   ├── page.tsx                  List previous sessions
│   │   │   └── relative-time.tsx         Client-side date formatter
│   │   ├── error.tsx                     Error boundary
│   │   ├── loading.tsx                   Loading skeleton
│   │   ├── layout.tsx                    Sidebar + content shell
│   │   └── page.tsx                      New chat
│   ├── lib/
│   │   ├── actions/
│   │   │   ├── auth.ts                   Server actions: signIn / signOut
│   │   │   └── chat.ts                   Server actions: send, history, sessions
│   │   ├── api-client.ts                 Authenticated fetch wrapper
│   │   └── env.ts                        Zod-validated environment variables
│   ├── login/page.tsx                    Public login page
│   ├── ui/
│   │   ├── chat/
│   │   │   ├── agent-chat.tsx            Main chat client component
│   │   │   └── sidenav.tsx               Sidebar navigation
│   │   ├── fonts.ts                      Inter + JetBrains Mono
│   │   └── global.css                    CSS variables, dark mode, animations
│   ├── layout.tsx                        Root layout
│   └── page.tsx                          Landing / sign-in page
├── auth.ts                               NextAuth v5 config (Cognito provider)
├── middleware.ts                          Protects /chat/* routes
├── next.config.ts                        standalone output
├── tsconfig.json                         Extends monorepo shared config
├── tailwind.config.ts                    Custom chat theme tokens
├── .env.example                          Template for required env vars
└── .env.local                            Actual secrets (git-ignored)
```

### Data flow

```
Browser ──► Next.js middleware (auth check)
               │
               ▼
         Server Action (chat.ts)
               │
               ▼
         apiFetch (api-client.ts)
           ├── auth() → gets idToken from session
           └── fetch() → API Gateway → Lambda → AgentCore Runtime
               │
               ▼
         DynamoDB (Sessions table, ChatHistory table)
```

---

## 2. Authentication

### NextAuth v5 beta + Cognito

The app uses `next-auth@5.0.0-beta.25` with the Cognito OIDC provider.

**Key file: `auth.ts`**

- Constructs the Cognito issuer URL from `COGNITO_USER_POOL_ID`
- Constructs the OAuth token endpoint from `COGNITO_DOMAIN_PREFIX`
- Implements token refresh via the Cognito `/oauth2/token` endpoint
- Augments the `Session` type to carry `idToken` and `error`
- Augments the `JWT` type (via `@auth/core/jwt`) to carry `idToken`,
  `refreshToken`, `expiresAt`, and `error`

**Middleware: `middleware.ts`**

- Exports `auth` as middleware
- Matcher: `/chat/:path*` — all chat routes require authentication
- Unauthenticated users are redirected to `/login`

### Cognito Setup Required

The deployed CDK stack creates a **public** app client (no secret) for
API Gateway authorization. The Next.js frontend needs a **confidential**
app client (with a secret) for the server-side OAuth code flow.

What was created:

1. **Cognito domain** — `agentic-app-326636.auth.us-east-1.amazoncognito.com`
   (required for the hosted UI OAuth endpoints)
2. **Confidential app client** — with `GenerateSecret`, OAuth code flow,
   scopes `openid email profile`, and callback URL
   `http://localhost:3000/api/auth/callback/cognito`

---

## 3. Environment Variables

Validated at startup by `app/lib/env.ts` using Zod:

| Variable | Required | Purpose |
|---|---|---|
| `AUTH_SECRET` | ✅ | NextAuth encryption key |
| `COGNITO_USER_POOL_ID` | ✅ | e.g. `us-east-1_rcfI6ZCZB` |
| `COGNITO_CLIENT_ID` | ✅ | Confidential app client ID |
| `COGNITO_CLIENT_SECRET` | ✅ | Confidential app client secret |
| `API_ENDPOINT` | ✅ | API Gateway URL with trailing slash |
| `AWS_REGION` | — | Defaults to `us-east-1` |
| `COGNITO_DOMAIN_PREFIX` | — | e.g. `agentic-app-326636` |
| `AUTH_URL` | — | e.g. `http://localhost:3000` |

If any required variable is missing, the app throws a clear error at
startup listing exactly which variables are invalid.

---

## 4. API Integration

### `app/lib/api-client.ts` — Authenticated Fetch

- Calls `auth()` to get the current session
- Attaches the Cognito `idToken` as the `Authorization` header
- Throws `AuthError` (not `redirect()`) on auth failures — this is
  critical for server actions called from client components (see Issue #1)

### `app/lib/actions/chat.ts` — Server Actions

Three server actions, all marked `'use server'`:

| Action | Backend Endpoint | Purpose |
|---|---|---|
| `sendChatMessage(message, sessionId?)` | `POST /chat/invoke` | Send a message to the agent |
| `fetchChatHistory(sessionId?)` | `GET /chat/history?sessionId=X` | Get messages for a session |
| `fetchSessionList()` | `GET /chat/history?list=sessions` | List all user sessions |

Each action catches `AuthError` and calls `redirect('/login')` at the
action level (not inside `apiFetch`).

### DynamoDB Attribute Unwrapping

The backend uses the low-level DynamoDB client, so responses contain
marshalled attributes like `{ S: "value" }` instead of plain strings.
Both `chat.ts` and `agent-chat.tsx` include a `ddb()` / `unwrapDdb()`
helper that handles:

- Plain strings/numbers (pass-through)
- `{ S: "..." }` → string
- `{ N: "..." }` → string
- `{ BOOL: true }` → string
- `{ NULL: true }` → empty string

---

## 5. UI Components

### `app/ui/chat/agent-chat.tsx` — Main Chat Component

Client component (`'use client'`) that manages:

- Message list with stable IDs (not array indices)
- Optimistic UI: user message appears immediately, typing indicator
  shows while waiting for the agent response
- URL updates via `window.history.replaceState()` (not `router.replace`)
- Auto-scroll to bottom on new messages
- Textarea auto-resize up to 160px
- Enter to send, Shift+Enter for newline
- Clear button resets state and URL
- Loading state when resuming an existing session (`initialSessionId`)
- Fallback to session summary if ChatHistory table is empty

### `app/ui/chat/sidenav.tsx` — Sidebar Navigation

- Links: Chat (new), History
- Active state detection for nested routes
- Sign out form (server action)

### `app/chat/history/page.tsx` — Session List

Server component that:

- Calls `fetchSessionList()` to get sessions from the Sessions table
- Renders each session as a clickable card with last message preview
- Delegates date formatting to `RelativeTime` client component to
  avoid hydration mismatch

### `app/chat/history/relative-time.tsx` — Date Formatter

Client component that calls `toLocaleString()` on the browser side,
with `suppressHydrationWarning` since the server can't know the
user's locale/timezone.

### Error & Loading Boundaries

- `app/chat/error.tsx` — Catches runtime errors with a retry button
- `app/chat/loading.tsx` — Shows a pulsing "Loading…" during navigation

---

## 6. Styling

### Tailwind + CSS Custom Properties

The theme uses CSS custom properties for chat-specific colors, defined
in `global.css` with automatic dark mode via `prefers-color-scheme`:

| Token | Light | Dark |
|---|---|---|
| `--chat-bg` | `#faf9f5` | `#1a1a1a` |
| `--chat-surface` | `#f0eee8` | `#262626` |
| `--chat-border` | `#e5e2dc` | `#3f3f3f` |
| `--chat-user-bg` | `#1a1a18` | `#3b82f6` |
| `--chat-agent-bg` | `#ebe8e2` | `#2d2d2d` |
| `--chat-accent` | `#c15f3c` | `#e07a5a` |

These are mapped to Tailwind utilities via `tailwind.config.ts`
(e.g. `bg-chat-surface`, `border-chat-border`).

### Animations

- `fadeSlideIn` — messages slide up and fade in
- `chat-dot-pulse` — typing indicator dots with staggered delays

---

## 7. Monorepo Integration

### `tsconfig.json`

Extends `@agentic-app/config-ts/nextjs.json` (the shared monorepo
TypeScript config) instead of duplicating compiler options. Only
adds the `@/*` path alias and Next.js-specific includes.

### `package.json`

- `@agentic-app/config-ts` added as a devDependency
- Scripts: `dev`, `build`, `start`, `lint`, `type-check`
- `next build` produces a `standalone` output for containerized deployment

### Turborepo

The root `turbo.json` already handles `apps/web` via the `build` task
with `.next/**` outputs. The `web:dev` and `web:build` scripts in the
root `package.json` target this package.

---

## 8. Issues Resolved

### Issue 1: Client-Side Crash — `redirect()` in Server Actions

**Symptom:** After sending a chat message, the browser showed
"Application error: a client-side exception has occurred."

**Root cause:** `apiFetch` (called by server actions) used
`redirect('/login')` from `next/navigation` when the session was
missing or expired. In Next.js, `redirect()` works by throwing a
special `NEXT_REDIRECT` error. When a server action is called from a
client component, this error gets serialized and re-thrown on the
client side as an unhandled exception, crashing the app.

**Fix:** `apiFetch` now throws a custom `AuthError` instead of calling
`redirect()`. Each server action (`sendChatMessage`, `fetchChatHistory`,
`fetchSessionList`) catches `AuthError` and calls `redirect('/login')`
at the action level, where Next.js can handle it properly.

```
BEFORE:  apiFetch → redirect('/login')  → CRASH (client component)
AFTER:   apiFetch → throw AuthError     → server action catches → redirect('/login')
```

---

### Issue 2: Page Reload After First Message

**Symptom:** After the agent responded to the first message, the page
reloaded and the conversation was lost.

**Root cause:** After receiving the first response, the code called
`router.replace(/chat/${sessionId})` to update the URL. This triggered
a full Next.js navigation to the `[sessionId]/page.tsx` server
component, which re-rendered `AgentChat` with `initialSessionId`,
which called `loadThread()` to re-fetch from the API — losing all
in-memory messages.

**Fix:** Replaced `router.replace()` with
`window.history.replaceState()`, which updates the browser URL bar
without triggering any React/Next.js navigation or re-render. The
same approach is used for the "Clear" button.

```
BEFORE:  router.replace(`/chat/${sid}`)  → server navigation → re-render → lost state
AFTER:   window.history.replaceState(null, '', `/chat/${sid}`)  → URL only
```

---

### Issue 3: Empty Chat History — Missing Backend Endpoint

**Symptom:** The History page always showed "No conversations yet"
despite sessions existing in DynamoDB.

**Root cause:** The frontend called `GET /chat/history?list=sessions`
expecting `{ sessions: [...] }`. But the Lambda handler had no
`?list=sessions` branch — it only handled `?sessionId=X` (specific
session history) and the default case (all chat history by userId).
The default case queried the **ChatHistory** table, which was empty
because the agent runtime manages conversation memory internally.
Sessions were stored in the **Sessions** table, but never queried.

**Fix (backend):**

1. Added `getUserSessions(userId)` method to `packages/core/src/dynamoDBClient.ts`
   that queries the Sessions table via the `UserIdIndex` GSI
   (partition key: `userId`, sort key: `timestamp`, descending)
2. Added `?list=sessions` branch to the Lambda GET handler in
   `packages/lambdas/chat/src/index.ts` that calls `getUserSessions()`
   and returns `{ sessions: [...] }`
3. Redeployed `AgentCoreApiStack`

**Fix (frontend):**

`fetchSessionList()` in `chat.ts` calls `?list=sessions` and maps
the DynamoDB-marshalled response items to plain objects using the
`ddb()` unwrapper.

---

### Issue 4: DynamoDB Marshalled Attributes

**Symptom:** Even after fixing the endpoint, field values showed as
`[object Object]` instead of actual strings.

**Root cause:** The backend uses the low-level `@aws-sdk/client-dynamodb`
(not the Document Client), so all values are returned in DynamoDB's
attribute value format: `{ S: "hello" }`, `{ N: "123" }`, etc.

**Fix:** Added `ddb()` unwrapper functions in both:
- `app/lib/actions/chat.ts` — for `fetchSessionList()` response mapping
- `app/ui/chat/agent-chat.tsx` — for `recordsToMessages()` when loading
  thread history

---

### Issue 5: TypeScript Errors — `next-auth/jwt` Module Augmentation

**Symptom:** `tsc --noEmit` reported 5 errors:
- `TS2664: Invalid module name in augmentation, module 'next-auth/jwt' cannot be found`
- `TS2362: The left-hand side of an arithmetic operation must be of type 'any', 'number'...`
- `TS2345: Argument of type '{}' is not assignable to parameter of type 'string'`
- `TS2322: Type 'unknown' is not assignable to type 'string | undefined'` (×2)

**Root cause:** In next-auth v5 beta, the JWT interface lives in
`@auth/core/jwt`, not `next-auth/jwt`. Without the correct module
augmentation, the custom fields (`idToken`, `refreshToken`, `expiresAt`,
`error`) weren't recognized, so TypeScript treated them as `unknown`
from the `Record<string, unknown>` base type.

**Fix:** Changed `declare module 'next-auth/jwt'` to
`declare module '@auth/core/jwt'`. Changed the `jwt` callback to
mutate `token` directly (e.g. `token.idToken = account.id_token`)
instead of spreading, so the augmented types apply.

---

### Issue 6: TypeScript Error — `TS2742` Non-Portable Inferred Type

**Symptom:** `tsc --noEmit` reported:
- `TS2742: The inferred type of 'auth' cannot be named without a reference to '@/node_modules/next-auth/lib'`

**Root cause:** The `@/*` path alias maps to `./*` which includes
`node_modules/`. When TypeScript inferred the return type of
`NextAuth()`, it resolved internal next-auth types through the `@/`
alias (e.g. `@/node_modules/next-auth/lib/types`), which isn't
portable.

**Fix:** Split the `NextAuth()` call from the exports and added
explicit type annotations using `NextAuthResult`:

```typescript
const nextAuth: NextAuthResult = NextAuth({ ... });

export const handlers: NextAuthResult['handlers'] = nextAuth.handlers;
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn;
export const signOut: NextAuthResult['signOut'] = nextAuth.signOut;
export const auth: NextAuthResult['auth'] = nextAuth.auth;
```

---

### Issue 7: Standalone `tsconfig.json`

**Symptom:** The web app's `tsconfig.json` duplicated all compiler
options instead of extending the monorepo's shared config.

**Fix:** Changed to `"extends": "@agentic-app/config-ts/nextjs.json"`
and added `@agentic-app/config-ts` as a devDependency. Only the
`baseUrl`, `paths`, `include`, and `exclude` fields remain as
web-specific overrides.

---

### Issue 8: Non-Null Assertions on Environment Variables

**Symptom:** `process.env.API_ENDPOINT!`, `process.env.COGNITO_CLIENT_ID!`
etc. would silently produce `undefined` at runtime if missing.

**Fix:** Created `app/lib/env.ts` with a Zod schema that validates all
required environment variables at first access. The `env()` function
caches the result and throws a descriptive error listing all missing
variables. The `zod` dependency was already in `package.json`.

---

### Issue 9: Cognito Infrastructure Gap

**Symptom:** The deployed CDK stack only created a public Cognito app
client (no secret) and no Cognito domain. NextAuth's server-side OAuth
code flow requires both.

**Fix:** Created via AWS CLI:

1. Cognito hosted UI domain: `agentic-app-326636`
2. Confidential app client with:
   - `GenerateSecret` enabled
   - OAuth code flow
   - Scopes: `openid`, `email`, `profile`
   - Callback URL: `http://localhost:3000/api/auth/callback/cognito`
   - Logout URL: `http://localhost:3000`

These values were placed in `.env.local` (git-ignored).

---

### Issue 10: Hydration Mismatch on Dates

**Symptom:** `toLocaleString()` in the History page ran on the server
(server's locale), producing different output than the client (user's
locale), causing a React hydration mismatch.

**Fix:** Extracted date formatting into a `RelativeTime` client
component (`'use client'`) with `suppressHydrationWarning`. The
`<time>` element uses `dateTime={date.toISOString()}` for machine
readability and `toLocaleString()` for display.

---

### Issue 11: Missing Error/Loading Boundaries

**Symptom:** Navigation to chat routes showed a blank screen during
loading, and API errors crashed the page.

**Fix:** Added:
- `app/chat/loading.tsx` — pulsing "Loading…" text
- `app/chat/error.tsx` — error message with "Try again" button that
  calls `reset()` to retry the failed server component render

---

### Issue 12: Accessibility Gaps

**Symptom:** Interactive elements lacked accessible labels; typing
indicator had no screen reader announcement.

**Fix:**
- Typing dots: `role="status"`, `aria-label="Agent is typing"`,
  `<span className="sr-only">Agent is typing</span>`
- Send button: `aria-label="Send message"`
- Clear button: `aria-label="Clear conversation"`
- Suggestion buttons: `aria-label="Use suggestion: ..."`
- Suggestion group: `role="group"`, `aria-label="Suggested prompts"`
- Message container: `aria-live="polite"`
- Decorative SVGs: `aria-hidden="true"`

---

### Issue 13: Array Index as React Key

**Symptom:** Messages used `key={i}` (array index), which could cause
rendering issues if messages were ever reordered or deleted.

**Fix:** Each message now has a stable `id` field generated by
`nextMsgId()` (`msg-{timestamp}-{counter}`), used as the React key.

---

## 9. Running Locally

```bash
# 1. Install dependencies (from monorepo root)
pnpm install

# 2. Copy and fill environment variables
cp apps/web/.env.example apps/web/.env.local
# Edit .env.local with real values from your deployed CDK stacks

# 3. Start the dev server
pnpm web:dev
# or: cd apps/web && npx next dev --port 3000

# 4. Open http://localhost:3000
```

### Getting Environment Values from Deployed Stacks

```bash
# User Pool ID and Client ID
aws ssm get-parameter --name /AgentCoreTemplate/UserPoolId --query Parameter.Value --output text
aws ssm get-parameter --name /AgentCoreTemplate/UserPoolClientId --query Parameter.Value --output text

# API Endpoint
aws ssm get-parameter --name /AgentCoreTemplate/ApiEndpoint --query Parameter.Value --output text

# Generate AUTH_SECRET
openssl rand -base64 32
```

Note: You need a **confidential** Cognito app client (with a secret)
for NextAuth. The CDK-created client is public. See Issue #9 above
for how to create one.

---

## 10. Building for Production

```bash
# Build (from monorepo root — Turborepo handles dependency order)
pnpm build

# Or build just the web app
pnpm web:build

# The standalone output is in apps/web/.next/standalone/
# To run it:
cd apps/web/.next/standalone
node server.js
```

The `output: 'standalone'` setting in `next.config.ts` produces a
self-contained build suitable for Docker containers or Amplify Hosting.
