# Agentic Architecture — Implementation Guide

## Table of Contents

1. [Overview](#overview)
2. [Multi-Agent System Design](#multi-agent-system-design)
3. [Agent Runtime (Python / Strands SDK)](#agent-runtime-python--strands-sdk)
4. [Orchestrator Pattern](#orchestrator-pattern)
5. [Sub-Agent Delegation](#sub-agent-delegation)
6. [Tool System](#tool-system)
7. [Memory Architecture](#memory-architecture)
8. [Knowledge Base RAG](#knowledge-base-rag)
9. [Request Flow (End-to-End)](#request-flow-end-to-end)
10. [Infrastructure Mapping](#infrastructure-mapping)
11. [Data Model](#data-model)

---

## Overview

This project implements a **multi-agent orchestrator pattern** for a
language learning application. A central orchestrator agent acts as the
user's personal teacher and delegates specialized tasks to sub-agents
(grammar, vocabulary, conversation, content). The system runs on
**Amazon Bedrock AgentCore**, using the **Strands Agents SDK** for
agent definition and the **BedrockAgentCoreApp** runtime wrapper for
deployment.

```
User ──► Next.js ──► API Gateway ──► Chat Lambda ──► AgentCore Runtime
                                                          │
                                                    Orchestrator Agent
                                                    ┌─────┼─────┐
                                                    │     │     │
                                                Grammar  Vocab  Conversation  Content
                                                Agent   Agent   Agent         Agent
                                                    │     │     │             │
                                              ┌─────┴─────┴─────┴─────────────┘
                                              │
                                        Shared Tools
                                   (KB Search, Polly, Transcribe,
                                    DynamoDB Progress, SM-2 Reviews,
                                    AgentCore Memory)
```

---

## Multi-Agent System Design

The system uses a **registry pattern** to manage agents. Each agent is
a `strands.Agent` instance with its own system prompt, model config,
and tool set.

### Agent Registry (`apps/infra/agent/src/agents/registry.py`)

```
AgentRegistry
├── register(name, factory)   # Register a lazy factory function
├── get(name) → Agent         # Get or create a singleton instance
└── available_agents          # List registered names
```

Agents are registered at startup via `_register_all_agents()`:

| Name             | Factory                       | Role                                    |
| ---------------- | ----------------------------- | --------------------------------------- |
| `orchestrator`   | `create_orchestrator_agent()` | Central teacher, delegates to others    |
| `grammar`        | `create_grammar_agent()`      | Grammar rules, exercises, corrections   |
| `vocabulary`     | `create_vocabulary_agent()`   | Vocabulary building, spaced repetition  |
| `conversation`   | `create_conversation_agent()` | Free-form conversation practice         |
| `content`        | `create_content_agent()`      | Reading passages, cultural notes        |

All agents share a common `BedrockModel` configuration:

```python
BedrockModel(
    model_id="us.anthropic.claude-sonnet-4-20250514-v1:0",  # configurable via MODEL_ID env var
    region_name="us-east-1",
)
```

---

## Agent Runtime (Python / Strands SDK)

### Entry Point (`apps/infra/agent/src/main.py`)

The agent runs inside a Docker container managed by AgentCore Runtime.
The `BedrockAgentCoreApp` wrapper handles HTTP lifecycle, health
checks, and payload routing.

```python
app = BedrockAgentCoreApp()

@app.entrypoint
def invoke(payload: dict) -> dict:
    agent = get_agent()           # Singleton orchestrator from registry
    memory = get_memory_manager() # Singleton memory manager

    # 1. Build context-enriched prompt (user ID, session, voice mode, language)
    # 2. Invoke the orchestrator agent
    # 3. Store interaction in AgentCore Memory
    # 4. Return response
```

**Payload contract:**

| Field          | Type   | Required | Description                          |
| -------------- | ------ | -------- | ------------------------------------ |
| `prompt`       | string | Yes*     | User's text message                  |
| `session_id`   | string | No       | Session continuity identifier        |
| `user_id`      | string | No       | User identifier for personalization  |
| `mode`         | string | No       | `"text"` or `"voice"`                |
| `audio_base64` | string | No       | Base64 audio for voice mode          |
| `language`     | string | No       | Target language for voice processing |

*Either `prompt` or `audio_base64` must be provided.

### Container (`apps/infra/agent/Dockerfile`)

- Base: `python:3.13-slim`
- Non-root user (`appuser`)
- Health check on port 8080
- Dependencies: `bedrock-agentcore`, `strands-agents`, `boto3`

---

## Orchestrator Pattern

The orchestrator (`apps/infra/agent/src/agents/orchestrator.py`) is
the only agent the runtime invokes directly. It has access to all
sub-agents as tools and all shared tools.

### System Prompt Design

The orchestrator's system prompt defines:

1. **Role**: Personal language teacher that tracks level, goals, progress
2. **Sub-agent tools**: `teach_grammar`, `teach_vocabulary`, `practice_conversation`, `generate_content`
3. **Direct tools**: `get_learner_profile`, `update_learner_progress`, `text_to_speech`, `get_due_reviews`, `add_review_items`, `record_review_result`, `search_knowledge_base`
4. **Session flow**: Profile check → greet → teach/review → save progress
5. **Teaching rules**: Respond in student's native language for explanations, use target language progressively

### Decision Flow

```
User message arrives
        │
        ▼
Orchestrator reads learner profile (DynamoDB)
        │
        ├── New student? → Ask target language, level, goals
        │
        ├── Grammar question? → teach_grammar (delegates to Grammar Agent)
        │
        ├── Vocabulary request? → teach_vocabulary (delegates to Vocabulary Agent)
        │
        ├── Conversation practice? → practice_conversation (delegates to Conversation Agent)
        │
        ├── Content request? → generate_content (delegates to Content Agent)
        │
        ├── Review due? → get_due_reviews → test student → record_review_result
        │
        └── General teaching → Orchestrator handles directly
        │
        ▼
Update learner progress (DynamoDB)
```

---

## Sub-Agent Delegation

Sub-agents are exposed to the orchestrator as `@tool`-decorated
functions in `apps/infra/agent/src/tools/sub_agents.py`.

### How It Works

```python
@tool
def teach_grammar(request: str) -> str:
    """Delegate to the grammar specialist agent..."""
    return _invoke_sub_agent("grammar", request)

def _invoke_sub_agent(agent_name: str, prompt: str) -> str:
    agent = get_agent_registry().get(agent_name)  # Lazy singleton
    response = agent(prompt)                       # Strands Agent.__call__
    return _extract_text(response)
```

When the orchestrator's LLM decides to call `teach_grammar`, Strands
executes the tool function, which:

1. Retrieves the grammar agent from the registry (creates it on first use)
2. Invokes it with the request string as the prompt
3. Extracts the text response and returns it to the orchestrator

The orchestrator then incorporates the sub-agent's response into its
own reply to the user.

### Sub-Agent Tool Sets

| Agent          | Tools Available                                                        |
| -------------- | ---------------------------------------------------------------------- |
| Grammar        | `search_knowledge_base`, `add_review_items`, `get_due_reviews`, `record_review_result` |
| Vocabulary     | `search_knowledge_base`, `text_to_speech`, `add_review_items`, `get_due_reviews`, `record_review_result` |
| Conversation   | `text_to_speech`, `speech_to_text`                                     |
| Content        | `search_knowledge_base`                                                |

---

## Tool System

All tools use the `@tool` decorator from `strands.tools`, making them
callable by any agent that includes them.

### Progress Tools (`apps/infra/agent/src/tools/progress.py`)

| Tool                      | DynamoDB Table              | Purpose                                |
| ------------------------- | --------------------------- | -------------------------------------- |
| `get_learner_profile`     | `AgentCoreLearnerProgress`  | Read user's level, language, history   |
| `update_learner_progress` | `AgentCoreLearnerProgress`  | Save session results and teacher notes |

### Spaced Repetition Tools (`apps/infra/agent/src/tools/review.py`)

Implements a simplified **SM-2 algorithm** for scheduling reviews.

| Tool                   | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `add_review_items`     | Schedule new vocabulary/grammar for future review    |
| `get_due_reviews`      | Query items due for review (sorted by urgency)       |
| `record_review_result` | Update next review date based on recall quality (0-5)|

**SM-2 intervals**: `[0, 1, 3, 7, 14, 30, 60, 120]` days, scaled by
ease factor on subsequent repetitions.

### Voice Tools (`apps/infra/agent/src/tools/voice.py`)

| Tool              | AWS Service        | Purpose                              |
| ----------------- | ------------------ | ------------------------------------ |
| `text_to_speech`  | Amazon Polly       | Generate native-speaker audio (10 languages, neural voices) |
| `speech_to_text`  | Amazon Transcribe  | Transcribe student audio for pronunciation evaluation |

### Knowledge Base Tool (`apps/infra/agent/src/tools/knowledge_base.py`)

| Tool                    | AWS Service                  | Purpose                          |
| ----------------------- | ---------------------------- | -------------------------------- |
| `search_knowledge_base` | Bedrock KB Retrieve API      | Semantic search over uploaded documents |

Uses the Bedrock `retrieve()` API with vector search configuration.
Results include content, relevance score, and S3 source URI.

---

## Memory Architecture

### Short-Term Memory — AgentCore Memory Service

The `MemoryManager` (`apps/infra/agent/src/memory.py`) stores every
conversation turn in AgentCore Memory via the `create_event` API.

```python
client.create_event(
    memoryId=self.memory_id,
    actorId=user_id,
    sessionId=session_id,
    eventTimestamp=timestamp,
    payload=[
        {"conversational": {"content": {"text": user_message}, "role": "USER"}},
        {"conversational": {"content": {"text": assistant_message}, "role": "ASSISTANT"}},
    ],
)
```

AgentCore automatically processes these events into long-term memories
using three configured extraction strategies:

| Strategy           | What It Extracts                                    |
| ------------------ | --------------------------------------------------- |
| **Semantic**       | Facts and concepts from conversations               |
| **User Preference**| User preferences for personalization                |
| **Summarization**  | Compressed conversation summaries                   |

Short-term memory expires after **90 days**. Long-term memories
persist and are available to the Runtime automatically.

### Infrastructure (`apps/infra/lib/stacks/agentcore-memory-stack.ts`)

```typescript
new agentcore.Memory(this, 'AgentMemory', {
    memoryStrategies: [
        agentcore.MemoryStrategy.usingBuiltInSemantic(),
        agentcore.MemoryStrategy.usingBuiltInUserPreference(),
        agentcore.MemoryStrategy.usingBuiltInSummarization(),
    ],
    expirationDuration: cdk.Duration.days(90),
    kmsKey: encryptionKey,
});
```

### Session State — DynamoDB

Separate from AgentCore Memory, DynamoDB stores structured session
data for the API layer:

| Table                              | Key Schema                    | Purpose                        |
| ---------------------------------- | ----------------------------- | ------------------------------ |
| `AgentCore-Sessions`               | PK: `sessionId`              | Session ownership, last message|
| `AgentCore-ChatHistory`            | PK: `sessionId`, SK: `messageId` | Full conversation log      |
| `AgentCoreTemplate-LearnerProgress`| PK: `userId`                 | Language, level, teacher notes |
| `AgentCoreTemplate-LearnerReviews` | PK: `userId`, SK: `itemKey`  | SM-2 review schedule           |

---

## Knowledge Base RAG

### Vector Store: Aurora Serverless v2 + pgvector

Documents uploaded to S3 are ingested by Bedrock Knowledge Base,
embedded using **Amazon Titan Embed Text v2** (1024 dimensions), and
stored in Aurora PostgreSQL with the pgvector extension.

```
S3 (documents) ──► Bedrock KB Ingestion ──► Titan Embed v2 ──► Aurora pgvector
                                                                    │
Agent tool call: search_knowledge_base(query) ──► Bedrock Retrieve API ──┘
```

### Schema

```sql
CREATE TABLE bedrock_integration (
    id TEXT PRIMARY KEY,
    embedding vector(1024),
    chunks TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ... USING hnsw (embedding vector_l2_ops) WITH (m=16, ef_construction=128);
```

### Chunking Configuration

- Strategy: Fixed-size
- Max tokens per chunk: 512
- Overlap: 20%

---

## Request Flow (End-to-End)

```
1. User types message in Next.js UI (apps/web/app/ui/chat/agent-chat.tsx)
       │
2. Server Action calls API Gateway (apps/web/app/lib/actions/chat.ts)
       │
3. API Gateway validates Cognito JWT, applies rate limiting (100 req/s, 10K/day)
       │
4. Chat Lambda (packages/lambdas/chat/src/index.ts):
   a. Extract & validate user context from JWT claims
   b. Sanitize input (mask SSN, email, credit card patterns)
   c. Validate session ownership (DynamoDB)
   d. Create AgentCore client, invoke Runtime
       │
5. AgentCore Runtime (apps/infra/agent/src/main.py):
   a. Build context-enriched prompt (user ID, session, language, voice mode)
   b. Invoke orchestrator agent
       │
6. Orchestrator Agent (Strands SDK + Claude):
   a. Calls get_learner_profile tool → DynamoDB
   b. Decides action based on message + profile
   c. May delegate to sub-agent (e.g., teach_grammar → Grammar Agent)
   d. Sub-agent may call its own tools (search_knowledge_base, add_review_items)
   e. Orchestrator synthesizes final response
       │
7. AgentCore Runtime:
   a. Stores interaction in AgentCore Memory (create_event)
   b. Returns response to Chat Lambda
       │
8. Chat Lambda:
   a. Stores session info in DynamoDB
   b. Returns response through API Gateway
       │
9. Next.js UI renders response
```

---

## Infrastructure Mapping

### CDK Stack Dependency Graph

```
SharedResourcesStack ─────────────────────────────┐
NetworkStack ──────────────────────────────────────┤
StorageStack ──────────────────────────────────────┤
                                                   │
CognitoStack ─────────────────────────────────┐    │
DatabaseStack (depends: Network) ─────────────┤    │
AuroraPgVectorStack (depends: Network, Shared)┤    │
                                              │    │
AgentCoreMemoryStack (depends: Storage) ──────┤    │
                                              │    │
AgentCoreRuntimeStack (depends: Aurora,       │    │
    Memory, Database) ────────────────────────┤    │
                                              │    │
ApiStack (depends: Network, Cognito,          │    │
    Shared, Runtime) ─────────────────────────┤    │
                                              │    │
MonitoringStack (depends: Api) ───────────────┘    │
AmplifyHostingStack (depends: Api, Cognito) ───────┘
```

### AgentCore Runtime Stack — What Gets Deployed

The `AgentCoreRuntimeStack` creates:

1. **AgentCore Runtime** — Containerized agent (Docker image from `apps/infra/agent/`)
2. **Default Endpoint** — HTTP endpoint for invocation
3. **S3 Audio Bucket** — Temporary storage for Transcribe input (1-day lifecycle)
4. **IAM Permissions** — Bedrock models, RDS Data API, Secrets Manager, Knowledge Base, AgentCore Memory, DynamoDB (progress + reviews), Polly, Transcribe, S3, KMS
5. **SSM Parameters** — Runtime ARN, ID, endpoint name, model ID, audio bucket

### Environment Variables Passed to Agent Container

| Variable                    | Source                          |
| --------------------------- | ------------------------------- |
| `MODEL_ID`                  | CDK config                      |
| `AGENT_TYPE`                | `"orchestrator"` (default)      |
| `AURORA_CLUSTER_ENDPOINT`   | SSM (from Aurora stack)         |
| `AURORA_DATABASE_NAME`      | SSM (from Aurora stack)         |
| `AURORA_VECTOR_TABLE_NAME`  | SSM (from Aurora stack)         |
| `AURORA_SECRET_ARN`         | SSM (from Aurora stack)         |
| `KNOWLEDGE_BASE_ID`         | SSM (from Aurora stack)         |
| `MEMORY_ID`                 | SSM (from Memory stack)         |
| `PROGRESS_TABLE`            | Hardcoded table name            |
| `REVIEW_TABLE`              | Hardcoded table name            |
| `AUDIO_BUCKET`              | Created in Runtime stack        |

---

## Data Model

### Agent Communication

```
                    ┌──────────────────────────────────────┐
                    │         AgentCore Runtime             │
                    │                                      │
  JSON payload ───► │  main.py (entrypoint)                │
                    │    │                                  │
                    │    ▼                                  │
                    │  Orchestrator Agent                   │
                    │    │                                  │
                    │    ├── tool call ──► Sub-Agent ──┐    │
                    │    │                             │    │
                    │    ◄── tool result ◄─────────────┘    │
                    │    │                                  │
                    │    ├── tool call ──► DynamoDB         │
                    │    ├── tool call ──► KB Retrieve      │
                    │    ├── tool call ──► Polly            │
                    │    ├── tool call ──► Transcribe       │
                    │    │                                  │
                    │    ▼                                  │
                    │  Final response text                  │
                    │    │                                  │
                    │  MemoryManager.store_interaction()    │
                    │    │                                  │
                    └────┼──────────────────────────────────┘
                         │
                    JSON response ───► Chat Lambda ───► API Gateway ───► Client
```

### Type Safety Across Layers

The `@agentic-app/types` package provides Zod schemas shared between
the TypeScript Lambda layer and the CDK infrastructure:

- `ChatRequestSchema` / `ChatResponseSchema` — API contract
- `AgentCoreConfigSchema` — Runtime ARN, session, message, user ID
- `AgentCoreResponseSchema` — Response parsing from Runtime
- `ChatLambdaEnvSchema` — Environment variable validation
- `SessionInfoSchema` — DynamoDB session records
- `AuthContextSchema` — Cognito JWT claims

The Python agent layer uses its own validation within tool functions
(JSON parsing, type checks) but does not share the Zod schemas.

### Security Boundaries

| Boundary                  | Mechanism                                          |
| ------------------------- | -------------------------------------------------- |
| User → API                | Cognito JWT + API Gateway authorizer               |
| API → Agent               | IAM (bedrock-agentcore:InvokeAgentRuntime)         |
| Agent → AWS Services      | IAM role attached to AgentCore Runtime              |
| Session isolation          | DynamoDB session ownership validation (IDOR prevention) |
| Input sanitization        | PII masking in Chat Lambda (SSN, email, credit card) |
| Rate limiting             | API Gateway usage plan (100 req/s, 10K/day)        |
| Memory encryption         | KMS key via AgentCore Memory configuration         |
| Database credentials      | Secrets Manager (never hardcoded or logged)         |
