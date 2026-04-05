# Mind Map 5: Authentication Flow

> **Center Node:** Amazon Cognito + NextAuth v5

---

## Branch 1: Cognito User Pool (`AgentCore-Users-{account}`)

### Configuration
- Self-signup enabled
- Sign-in: email only (case-insensitive)
- Auto-verify email
- Password policy: 12+ chars, upper + lower + digits + symbols
- Account recovery: email only
- Temp password validity: 7 days

### User Pool Client (`WebClient`)
- Auth flows: USER_PASSWORD_AUTH, USER_SRP_AUTH, REFRESH_TOKEN_AUTH
- Prevent user existence errors (anti-enumeration)
- Token validity:
  - Access token: 1 hour
  - ID token: 1 hour
  - Refresh token: 30 days
- Token revocation: enabled
- OAuth:
  - Authorization code grant (implicit disabled)
  - Scopes: email, openid, profile
  - Callback URLs: `localhost:3000/api/auth/callback/cognito`, production domain `/api/auth/callback/cognito`
  - Logout URLs: `localhost:3000/`, production domain `/`

---

## Branch 2: Identity Pool (`AgentCoreTemplate`)

- Unauthenticated identities: disabled
- Cognito Identity Provider: User Pool + WebClient
- IAM Roles:
  - `AgentCoreTemplate-Auth` — federated principal (authenticated)
  - `AgentCoreTemplate-Unauth` — federated principal (unauthenticated)

---

## Branch 3: Initial User Setup

```
CDK Deploy
  │
  ▼
Custom Resource (CloudFormation)
  │
  ▼
create-initial-user Lambda
  ├── Reads password from Secrets Manager
  │   └── Secret: KnowledgeBaseRagAgent/InitialUserPassword
  │       (auto-generated: 16 chars, all complexity types)
  ├── AdminCreateUser (Cognito)
  ├── AdminSetUserPassword (permanent)
  └── User: admin@example.com
```

---

## Branch 4: NextAuth v5 Authentication Flow (Frontend)

```
User visits / or /login
  │
  ├── 1. Click "Sign in with Cognito" → server action handleSignIn()
  │   └── signIn('cognito', { redirectTo: '/chat' })
  │
  ▼
NextAuth initiates OAuth Authorization Code flow
  ├── Redirects to Cognito Hosted UI
  ├── User authenticates (email + password)
  ├── Cognito redirects to /api/auth/callback/cognito
  │   └── NextAuth route handler (app/api/auth/[...nextauth]/route.ts)
  │
  ▼
NextAuth JWT callback (auth.ts)
  ├── On initial sign-in (account present):
  │   ├── Stores id_token, refresh_token, expires_at in JWT
  │   └── Clears any previous error
  ├── On subsequent requests:
  │   ├── If token not expired (with 60s buffer) → return as-is
  │   ├── If expired → refreshAccessToken(refreshToken)
  │   │   ├── POST to Cognito OAuth token endpoint
  │   │   ├── grant_type=refresh_token
  │   │   ├── client_id + client_secret (client_secret_post method)
  │   │   └── Returns new id_token + expires_at
  │   └── If refresh fails → token.error = 'RefreshTokenError'
  │
  ▼
NextAuth Session callback
  └── Exposes idToken and error on session object
```

---

## Branch 5: Next.js Middleware & Route Protection

```
Request to /chat/* routes
  │
  ▼
middleware.ts
  └── export { auth as middleware } from '@/auth'
      ├── matcher: ['/chat/:path*']
      ├── callbacks.authorized({ auth, request })
      │   ├── /chat/* → requires !!auth (signed-in session)
      │   └── All other routes → allowed
      └── Unauthenticated → redirected to /login
```

---

## Branch 6: API Call Authentication (Server Actions → API Gateway)

```
Next.js Server Action (e.g. sendChatMessage)
  │
  ▼
apiFetch<T>(path, init?) — app/lib/api-client.ts
  ├── auth() → reads NextAuth session (server-side)
  ├── Checks session.idToken exists
  │   └── If missing → throw AuthError('Not authenticated')
  ├── Checks session.error
  │   └── If 'RefreshTokenError' or 'RefreshTokenMissing' → throw AuthError('Session expired')
  ├── fetch(API_ENDPOINT + path, {
  │     Authorization: session.idToken,   ← Cognito ID token
  │     Content-Type: application/json,
  │     cache: 'no-store'
  │   })
  │
  ▼
API Gateway
  │
  ▼
Cognito User Pool Authorizer
  ├── Validates JWT signature (ID token)
  ├── Checks token expiration
  ├── Extracts claims:
  │   ├── sub → userId
  │   ├── email → user email
  │   └── cognito:groups → (if any)
  │
  ▼
Lambda Function
  ├── extractUserContext(event)
  │   ├── event.requestContext.authorizer.claims.sub
  │   └── event.requestContext.authorizer.claims.email
  ├── Validates userId exists (throws AuthorizationError if not)
  └── Uses userId for all data access (anti-IDOR)
```

---

## Branch 7: AgentCore Runtime Authentication (separate path)

```
Chat Lambda
  │
  ├── Lambda execution role has IAM permissions:
  │   ├── bedrock-agentcore:InvokeAgentRuntime
  │   └── bedrock-agentcore:InvokeAgentRuntimeForUser
  │
  ▼
AgentCore Runtime (IAM/SigV4 — NOT Cognito)
  ├── SDK auto-signs with Lambda role credentials
  ├── No Cognito token passed to Runtime
  └── User identity passed as runtimeUserId in payload
```

---

## Branch 8: Protected vs Unprotected Endpoints

### Next.js Middleware Protected (requires NextAuth session)
- `/chat` — new chat
- `/chat/[sessionId]` — existing conversation
- `/chat/history` — session list

### Cognito Auth Required (API Gateway)
- `POST /api/chat/invoke` — chat
- `GET /api/chat/history` — history / session list
- `POST /api/knowledge-base/query` — KB query
- `GET /api/agent/status` — agent status
- `GET /api/auth-health` — auth test

### No Auth (Public)
- `/` — landing page
- `/login` — login page
- `GET /api/health` — health check (for monitoring/load balancers)

---

## Branch 9: Frontend Environment Variables (auth-related)

| Variable | Purpose |
|---|---|
| `COGNITO_USER_POOL_ID` | Cognito issuer derivation |
| `COGNITO_CLIENT_ID` | OAuth client ID |
| `COGNITO_CLIENT_SECRET` | OAuth client secret (server-side only) |
| `COGNITO_DOMAIN_PREFIX` | OAuth token endpoint derivation |
| `COGNITO_OAUTH_DOMAIN` | Explicit OAuth domain override |
| `AUTH_SECRET` | NextAuth encryption secret |
| `AUTH_URL` | NextAuth base URL |
| `API_ENDPOINT` | API Gateway URL (including `/v1/api/`) |

---

## Branch 10: Security Hardening Summary

| Layer | Protection |
|---|---|
| Password Policy | 12+ chars, all complexity types |
| Token Lifetime | 1hr access/ID (short-lived) |
| Token Refresh | Automatic via NextAuth JWT callback (60s buffer) |
| Token Revocation | Enabled |
| User Enumeration | preventUserExistenceErrors = true |
| Account Recovery | Email only |
| OAuth Flow | Authorization code grant (no implicit) |
| Client Auth | client_secret_post method |
| Rate Limiting | 100 req/s, 200 burst, 10K/day |
| Route Protection | Next.js middleware on /chat/* |
| Server-Side Auth | apiFetch validates session before every API call |
| IDOR Prevention | Session ownership validation in Lambda |
| PII Protection | Input sanitization (SSN, email, card) |
| CORS | Configurable allowed origins |
| Security Headers | X-Frame-Options, X-XSS, X-Content-Type, HSTS |

---

## Color Coding (for Miro)
- 🟠 Orange: Authentication components (Cognito, NextAuth)
- 🔴 Red: Security controls
- 🔵 Blue: AWS services
- 🟢 Green: Client/user flow (Next.js frontend)
