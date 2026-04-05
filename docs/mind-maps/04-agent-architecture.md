# Mind Map 4: Agent Architecture (Python AgentCore Runtime)

> **Center Node:** `apps/infra/agent/` (Python Strands Agent on Bedrock AgentCore)

---

## Branch 1: Entry Point — `src/main.py`

- `BedrockAgentCoreApp()` — wraps agent for AgentCore deployment
- `@app.entrypoint` decorator on `invoke(payload)`
- Lazy initialization of agent and memory manager
- Request flow:
  1. Extract `prompt`, `session_id`, `user_id` from payload
  2. Retrieve conversation history from memory
  3. Retrieve relevant long-term memories
  4. Build context (last 5 turns + 5 memories)
  5. Invoke Strands agent with context + prompt
  6. Store interaction in memory
  7. Return `{ response, session_id, status }`
- `_build_context()` — merges memory + history into prompt prefix
- `app.run()` — starts the AgentCore runtime server

---

## Branch 2: Agent Definition — `src/agent.py`

- `create_agent()` → returns configured `strands.Agent`
- Model: `BedrockModel`
  - Default: `us.anthropic.claude-sonnet-4-20250514-v1:0`
  - Region from `AWS_REGION` env var
- System prompt defines behavior:
  - Always search knowledge base first for factual questions
  - Cite sources from KB results
  - Maintain conversation context
  - Be helpful, harmless, honest
- Tools: `[search_knowledge_base]`

---

## Branch 3: Tools — `src/tools/knowledge_base.py`

### `@tool search_knowledge_base(query, max_results=5)`
- Uses `boto3` Bedrock Agent Runtime client (`bedrock-agent-runtime`)
- Calls `client.retrieve()` (Bedrock KB Retrieve API)
- Knowledge Base ID from `KNOWLEDGE_BASE_ID` env var
- Vector search configuration: `numberOfResults` = max_results
- Response formatting:
  - Result number + relevance score
  - Source (S3 URI)
  - Content (truncated to 800 chars)
- Error handling: ResourceNotFound, ValidationException, generic

---

## Branch 4: Memory — `src/memory.py`

### `MemoryManager` class
- Uses `boto3` AgentCore data plane client (`bedrock-agentcore`)
- Memory ID from `MEMORY_ID` env var

#### `store_interaction(actor_id, session_id, user_message, assistant_message)`
- Calls `client.create_event()` with conversational payload
- Two turns per event: USER + ASSISTANT
- AgentCore auto-processes via configured strategies:
  - **Semantic** — extracts facts and concepts
  - **User Preference** — learns personalization
  - **Summarization** — compresses conversations

#### `get_conversation_history()` → `[]`
- AgentCore manages history internally
- Returns empty (history managed by Runtime)

#### `retrieve_memories()` → `[]`
- AgentCore extraction strategies handle retrieval automatically
- Returns empty (Runtime has direct memory access)

---

## Branch 5: Container — `Dockerfile` + `requirements.txt`

- Docker image built for `linux/arm64`
- Python dependencies:
  - `strands-agents` — agent framework
  - `strands-agents-tools` — tool decorators
  - `bedrock-agentcore-runtime` — AgentCore app wrapper
  - `boto3` — AWS SDK
- Deployed as AgentCore Runtime artifact

---

## Branch 6: Environment Variables (injected by CDK)

| Variable | Source | Purpose |
|---|---|---|
| `MODEL_ID` | CDK config | Bedrock model for agent |
| `KNOWLEDGE_BASE_ID` | SSM → CDK | Bedrock KB for RAG |
| `MEMORY_ID` | SSM → CDK | AgentCore Memory store |
| `AURORA_CLUSTER_ENDPOINT` | SSM → CDK | Aurora connection |
| `AURORA_DATABASE_NAME` | SSM → CDK | Database name |
| `AURORA_VECTOR_TABLE_NAME` | SSM → CDK | Vector table |
| `AURORA_SECRET_ARN` | SSM → CDK | DB credentials |
| `AWS_REGION` | CDK env | AWS region |

---

## Data Flow Diagram

```
                    ┌──────────────────────┐
                    │  Next.js Frontend    │
                    │  (apps/web)          │
                    │  Server Actions      │
                    │  ├─ sendChatMessage   │
                    │  └─ apiFetch + JWT   │
                    └──────────┬───────────┘
                               │ HTTPS + Cognito ID token
                               ▼
                    ┌──────────────────────┐
                    │  API Gateway + Lambda │
                    │  Chat Lambda (TS)    │
                    │  InvokeAgentRuntime   │
                    └──────────┬───────────┘
                               │ IAM/SigV4
                               ▼
                    ┌──────────────────────┐
                    │  main.py (entrypoint)│
                    │  BedrockAgentCoreApp  │
                    └──────────┬───────────┘
                               │
                    ┌──────────┴───────────┐
                    │                      │
                    ▼                      ▼
          ┌─────────────────┐   ┌──────────────────┐
          │  memory.py      │   │  agent.py         │
          │  MemoryManager  │   │  Strands Agent    │
          └────────┬────────┘   └────────┬─────────┘
                   │                     │
                   ▼                     ▼
          ┌─────────────────┐   ┌──────────────────┐
          │ AgentCore Memory│   │ Claude Sonnet 4   │
          │ (create_event)  │   │ (BedrockModel)    │
          └─────────────────┘   └────────┬─────────┘
                                         │ tool call
                                         ▼
                                ┌──────────────────┐
                                │ knowledge_base.py │
                                │ search_knowledge  │
                                └────────┬─────────┘
                                         │
                                         ▼
                                ┌──────────────────┐
                                │ Bedrock KB API    │
                                │ → Aurora pgvector │
                                └──────────────────┘
```

---

## Color Coding (for Miro)
- 🟣 Purple: AgentCore services (Runtime, Memory)
- 🔵 Blue: Bedrock services (Models, Knowledge Base)
- 🟢 Green: Agent code (Python) + Next.js frontend
- 🟡 Yellow: Data stores (Aurora, DynamoDB)
