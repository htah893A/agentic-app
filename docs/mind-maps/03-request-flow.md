# Mind Map 3: Request Flow (Runtime Architecture)

> **Center Node:** API Gateway (`/api/*`)

---

## Path 1: Chat Request (User → AI Response)

```
User (Browser — Next.js frontend at apps/web)
  │
  ├── AgentChat component (client component)
  │   └── Calls server action: sendChatMessage(text, sessionId?)
  │
  ▼
Next.js Server Action (app/lib/actions/chat.ts)
  ├── apiFetch<ChatInvokeResult>('chat/invoke', { method: 'POST', body })
  ├── auth() → reads NextAuth session → extracts Cognito ID token
  ├── If no session or refresh error → redirect('/login')
  │
  ▼
API Gateway (v1 stage)
  ├── Rate limiting: 100 req/s, 200 burst, 10K/day
  ├── Request validation
  │
  ▼
Cognito Authorizer
  ├── Validates JWT (ID token from NextAuth session)
  ├── Extracts claims: sub (userId), email
  │
  ▼
POST /api/chat/invoke
  │
  ▼
Chat Lambda (packages/lambdas/chat)
  ├── Extract user context from JWT claims (IDOR prevention)
  ├── Validate & sanitize input (PII masking: SSN, email, card)
  ├── Session management:
  │   ├── Existing session → validate ownership (DynamoDB query)
  │   └── New session → generate cryptographic session ID
  │
  ▼
AgentCore class (packages/core/agentCore.ts)
  ├── BedrockAgentCoreClient (IAM/SigV4 auth from Lambda role)
  ├── InvokeAgentRuntimeCommand
  ├── Payload: { prompt, session_id, user_id }
  │
  ▼
AgentCore Runtime (Python container on Bedrock AgentCore)
  ├── main.py → @app.entrypoint invoke()
  ├── Memory retrieval:
  │   ├── MemoryManager.get_conversation_history()
  │   └── MemoryManager.retrieve_memories()
  ├── Context building (last 5 turns + 5 relevant memories)
  │
  ▼
Strands Agent (agent.py)
  ├── Model: Claude Sonnet 4 (cross-region inference)
  ├── System prompt: RAG-first behavior
  ├── Tool: search_knowledge_base
  │   │
  │   ▼
  │   Bedrock KB Retrieve API
  │   ├── Knowledge Base (Aurora pgvector storage)
  │   ├── Embedding: Titan Text v2 (1024-dim)
  │   ├── Vector search → top-k results
  │   └── Returns: content + source citations + relevance scores
  │
  ▼
Response flows back:
  AgentCore Runtime → Chat Lambda
  │
  ├── Store session info → DynamoDB (AgentCore-Sessions)
  ├── Memory store → AgentCore Memory (create_event)
  │   └── Auto-processed by strategies: semantic, user preference, summarization
  │
  ▼
API Gateway → Next.js server action → AgentChat component
  └── { response, sessionId, conversationId, timestamp }
      │
      ├── AgentChat appends assistant message to state
      └── If new chat: window.history.replaceState → /chat/{sessionId}
```

---

## Path 2: Chat History Retrieval

```
User (Browser)
  │
  ├── AgentChat component loads existing session
  │   └── Calls server action: fetchChatHistory(sessionId)
  │
  ▼
Next.js Server Action (app/lib/actions/chat.ts)
  ├── apiFetch('chat/history?sessionId=xxx')
  │
  ▼
API Gateway → Cognito Authorizer
  │
  ▼
GET /api/chat/history?sessionId=xxx
  │
  ▼
Chat Lambda
  ├── Extract user context (JWT)
  ├── If sessionId provided:
  │   ├── Validate session ownership
  │   └── Query ChatHistory table (PK: sessionId, limit 50)
  ├── If no sessionId:
  │   └── Query ChatHistory table (GSI: UserIdIndex, limit 20)
  │
  ▼
DynamoDB (AgentCore-ChatHistory)
  │
  ▼
Next.js server action → AgentChat component
  └── { history: [...] }
      │
      └── If history empty, falls back to fetchSessionList()
          to show lastMessage/lastResponse from session record
```

---

## Path 3: Session List (History Page)

```
User navigates to /chat/history
  │
  ▼
Next.js Server Component (app/chat/history/page.tsx)
  ├── Calls server action: fetchSessionList()
  │
  ▼
Next.js Server Action (app/lib/actions/chat.ts)
  ├── apiFetch('chat/history?list=sessions')
  │
  ▼
API Gateway → Cognito Authorizer
  │
  ▼
GET /api/chat/history?list=sessions
  │
  ▼
Chat Lambda
  ├── Extract user context (JWT)
  ├── tables.listUserSessions(userId)
  │   └── Query Sessions table (GSI: UserIdIndex, newest first, limit 50)
  │
  ▼
DynamoDB (AgentCore-Sessions)
  │
  ▼
Next.js server component renders session list
  └── Each session links to /chat/{sessionId}
```

---

## Path 4: Knowledge Base Query

```
User
  │
  ▼
Next.js Server Action → API Gateway → Cognito Authorizer
  │
  ▼
POST /api/knowledge-base/query
  │
  ▼
Chat Lambda → AgentCore Runtime → Bedrock KB Retrieve API
  │
  ▼
Aurora Serverless v2 (pgvector)
  ├── RDS Data API
  ├── Vector similarity search
  └── Returns matching document chunks
```

---

## Path 5: Health Check (Unauthenticated)

```
User / Load Balancer / Monitor
  │
  ▼
GET /api/health (no auth)
  │
  ▼
HealthCheck Lambda (inline code)
  └── { status: "healthy", timestamp, message }
```

---

## Cross-Cutting: Security Layers

```
┌─────────────────────────────────────────────────┐
│ Next.js Middleware (middleware.ts)                │
│  ├── NextAuth session check on /chat/* routes    │
│  ├── Redirects unauthenticated → /login          │
│  └── Server actions validate session before API  │
├─────────────────────────────────────────────────┤
│ API Gateway                                      │
│  ├── Rate limiting (Usage Plan)                  │
│  ├── Request validation                          │
│  └── CloudWatch access logging                   │
├─────────────────────────────────────────────────┤
│ Cognito Authorizer                               │
│  ├── JWT validation (ID token from NextAuth)     │
│  ├── Short-lived tokens (1hr)                    │
│  └── Token revocation support                    │
├─────────────────────────────────────────────────┤
│ Chat Lambda                                      │
│  ├── User context extraction (anti-IDOR)         │
│  ├── Session ownership validation                │
│  ├── Input sanitization (PII masking)            │
│  ├── Message length limit (4000 chars)           │
│  └── Security headers (X-Frame, X-XSS, etc.)    │
├─────────────────────────────────────────────────┤
│ AgentCore Runtime                                │
│  ├── IAM/SigV4 authentication                    │
│  └── Scoped IAM role permissions                 │
├─────────────────────────────────────────────────┤
│ Data Layer                                       │
│  ├── DynamoDB encryption (AWS managed)           │
│  ├── Aurora encryption at rest                   │
│  ├── S3 KMS encryption                           │
│  └── AgentCore Memory KMS encryption             │
└─────────────────────────────────────────────────┘
```

---

## Color Coding (for Miro)
- 🟢 Green: User-facing path (Next.js frontend + server actions)
- 🔵 Blue: AWS service interactions
- 🟣 Purple: AgentCore (Runtime + Memory)
- 🟠 Orange: Authentication/security layers
- 🟡 Yellow: Data stores (DynamoDB, Aurora, S3)
