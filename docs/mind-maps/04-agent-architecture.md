# Mind Map 4: Agent Architecture (Multi-Agent Orchestrator System)

> **Center Node:** `apps/infra/agent/` (Python Multi-Agent System on Bedrock AgentCore)

---

## Branch 1: Entry Point — `src/main.py`

- `BedrockAgentCoreApp()` — wraps agent for AgentCore deployment
- `@app.entrypoint` decorator on `invoke(payload)`
- Lazy initialization via module-level singletons:
  - `get_agent()` → retrieves agent from `AgentRegistry` (default: `orchestrator`)
  - `get_memory_manager()` → creates `MemoryManager` with `MEMORY_ID`
- Request flow:
  1. Extract `prompt`, `session_id`, `user_id`, `mode`, `audio_base64`, `language`
  2. Build context-enriched prompt:
     - `[User ID: ..., Session: ...]`
     - `[Voice Mode: ...]` if audio present
     - `[Target Language: ...]` if specified
  3. Invoke orchestrator agent via `agent(full_prompt)`
  4. Extract response text from Strands response object
  5. Store interaction in AgentCore Memory (`create_event`)
  6. Clean up temp env vars (voice audio)
  7. Return `{ response, session_id, status }`
- `app.run()` — starts the AgentCore runtime server on port 8080

---

## Branch 2: Agent Registry — `src/agents/registry.py`

### `AgentRegistry` class (singleton pattern)
- `_factories: Dict[str, AgentFactory]` — lazy factory functions
- `_instances: Dict[str, Agent]` — cached agent instances
- `register(name, factory)` — register a factory by name
- `get(name) → Agent` — get or create singleton instance
- `available_agents` — list registered names

### Registered Agents
| Name | Factory | Created On |
|---|---|---|
| `orchestrator` | `create_orchestrator_agent()` | First request |
| `grammar` | `create_grammar_agent()` | First grammar delegation |
| `vocabulary` | `create_vocabulary_agent()` | First vocabulary delegation |
| `conversation` | `create_conversation_agent()` | First conversation delegation |
| `content` | `create_content_agent()` | First content delegation |

### Shared Model Configuration
```python
BedrockModel(
    model_id=os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0"),
    region_name=os.environ.get("AWS_REGION", "us-east-1"),
)
```
- All agents share the same model via `create_bedrock_model()`
- Model ID configurable via `MODEL_ID` env var
- Agent type selectable via `AGENT_TYPE` env var (default: `orchestrator`)

---

## Branch 3: Orchestrator Agent — `src/agents/orchestrator.py`

### Role
- Central teacher agent — the ONLY agent invoked directly by the runtime
- Tracks student's level, goals, progress across sessions
- Delegates specialized tasks to sub-agents via tool calls
- Synthesizes sub-agent responses into cohesive teaching

### System Prompt Structure
1. **Role definition**: Personal language teacher
2. **Sub-agent tools**: `teach_grammar`, `teach_vocabulary`, `practice_conversation`, `generate_content`
3. **Direct tools**: `get_learner_profile`, `update_learner_progress`, `text_to_speech`, `get_due_reviews`, `add_review_items`, `record_review_result`, `search_knowledge_base`
4. **Supported languages**: Spanish, French, German, Italian, Portuguese, Japanese, Korean, Mandarin Chinese, Arabic, Hindi
5. **Session flow**: Profile check → greet → teach/review → save progress
6. **Teaching rules**: Native language for explanations, target language progressively

### Decision Flow
```
User message arrives
        │
        ▼
get_learner_profile(user_id) → DynamoDB
        │
        ├── New student? → Ask target language, level, goals
        │
        ├── Grammar question? → teach_grammar → Grammar Agent
        │
        ├── Vocabulary request? → teach_vocabulary → Vocabulary Agent
        │
        ├── Conversation practice? → practice_conversation → Conversation Agent
        │
        ├── Content request? → generate_content → Content Agent
        │
        ├── Review due? → get_due_reviews → test → record_review_result
        │
        ├── Pronunciation? → text_to_speech (Polly)
        │
        └── General teaching → Orchestrator handles directly
        │
        ▼
update_learner_progress(user_id, ...) → DynamoDB
```

### Tool Set (11 tools)
| Tool | Type | Target |
|---|---|---|
| `teach_grammar` | Sub-agent delegation | Grammar Agent |
| `teach_vocabulary` | Sub-agent delegation | Vocabulary Agent |
| `practice_conversation` | Sub-agent delegation | Conversation Agent |
| `generate_content` | Sub-agent delegation | Content Agent |
| `get_learner_profile` | Direct (DynamoDB) | LearnerProgress table |
| `update_learner_progress` | Direct (DynamoDB) | LearnerProgress table |
| `search_knowledge_base` | Direct (Bedrock KB) | Aurora pgvector |
| `text_to_speech` | Direct (Polly) | Amazon Polly |
| `add_review_items` | Direct (DynamoDB) | LearnerReviews table |
| `get_due_reviews` | Direct (DynamoDB) | LearnerReviews table |
| `record_review_result` | Direct (DynamoDB) | LearnerReviews table |

---

## Branch 4: Sub-Agents

### Sub-Agent Delegation Mechanism — `src/tools/sub_agents.py`

```python
@tool
def teach_grammar(request: str) -> str:
    return _invoke_sub_agent("grammar", request)

def _invoke_sub_agent(agent_name: str, prompt: str) -> str:
    agent = get_agent_registry().get(agent_name)  # Lazy singleton
    response = agent(prompt)                       # Strands Agent.__call__
    return _extract_text(response)
```

When the orchestrator's LLM calls `teach_grammar`, Strands executes the
tool function → retrieves Grammar Agent from registry → invokes it →
returns text response to orchestrator.

### Grammar Agent — `src/agents/grammar.py`
- **Role**: Grammar rules, exercises, corrections
- **System prompt**: Rule → Examples → Common Mistakes → Practice exercises
- **Tools**: `search_knowledge_base`, `add_review_items`, `get_due_reviews`, `record_review_result`
- **Levels**: Beginner (present tense, articles) → Intermediate (subjunctive, conditionals) → Advanced (literary forms)

### Vocabulary Agent — `src/agents/vocabulary.py`
- **Role**: Vocabulary building, flashcards, mnemonics, spaced repetition
- **System prompt**: Word → Pronunciation → Translation → Example → Related words
- **Tools**: `search_knowledge_base`, `text_to_speech`, `add_review_items`, `get_due_reviews`, `record_review_result`
- **Levels**: Beginner (500 common words) → Intermediate (abstract, idioms) → Advanced (slang, literary)

### Conversation Agent — `src/agents/conversation.py`
- **Role**: Free-form conversation practice in target language
- **System prompt**: Adapt complexity to level, inline corrections, suggest topics
- **Tools**: `text_to_speech`, `speech_to_text`
- **Correction format**: `[Small fix: *incorrect* → *correct* (explanation)]`

### Content Agent — `src/agents/content.py`
- **Role**: Generate reading passages, cultural notes, comprehension exercises
- **System prompt**: Include translations for beginner/intermediate, glossary for advanced
- **Tools**: `search_knowledge_base`
- **Content types**: Reading passages, cultural notes, comprehension exercises, writing prompts

---

## Branch 5: Tool System — `src/tools/`

All tools use `@tool` decorator from `strands.tools`.

### Knowledge Base — `knowledge_base.py`
- `search_knowledge_base(query, max_results=5)`
- Uses `boto3` Bedrock Agent Runtime client (`bedrock-agent-runtime`)
- Calls `client.retrieve()` (Bedrock KB Retrieve API)
- Knowledge Base ID from `KNOWLEDGE_BASE_ID` env var
- Response: result number + relevance score + S3 source URI + content (truncated 800 chars)
- Error handling: ResourceNotFound, ValidationException, generic

### Progress Tracking — `progress.py`
- `get_learner_profile(user_id)` → DynamoDB `AgentCoreLearnerProgress`
  - Returns: targetLanguage, currentLevel, sessionsCount, lastSessionTopics, teacherNotes
  - New learner: returns `{ status: "new_learner", message: "..." }`
- `update_learner_progress(user_id, target_language, level, topics_covered, notes)` → DynamoDB
  - Increments `sessionsCount`, updates `lastSessionAt`

### Spaced Repetition (SM-2) — `review.py`
- `add_review_items(user_id, language, items)` → DynamoDB `AgentCoreLearnerReviews`
  - Items: `[{ term, translation, type: "vocabulary"|"grammar" }]`
  - Composite key: `userId` + `{language}#{term}`
  - Initial ease factor: 2.5
- `get_due_reviews(user_id, language, max_items=10)` → DynamoDB query
  - Filters: `nextReviewAt <= now`, sorted by urgency (most overdue first)
- `record_review_result(user_id, language, term, quality)` → DynamoDB update
  - Quality: 0-5 (0=fail, 3=correct with difficulty, 5=perfect)
  - SM-2 intervals: `[0, 1, 3, 7, 14, 30, 60, 120]` days
  - Ease factor: `max(1.3, ef + 0.1 - (5-q) * (0.08 + (5-q) * 0.02))`
  - Quality < 3 → reset repetition to 0

### Voice — `voice.py`
- `text_to_speech(text, language)` → Amazon Polly
  - 10 languages with neural voices (Lucia/Spanish, Lea/French, Vicki/German, etc.)
  - Returns: `{ audio_base64, format: "mp3", language, voice, text }`
- `speech_to_text(audio_base64, language)` → Amazon Transcribe
  - Uploads audio to S3 (`AUDIO_BUCKET/audio-uploads/`)
  - Starts transcription job, polls for completion (30s timeout)
  - Returns: `{ transcription, confidence, language }`
  - Cleans up S3 object and transcription job after completion

---

## Branch 6: Memory — `src/memory.py`

### `MemoryManager` class
- Uses `boto3` AgentCore data plane client (`bedrock-agentcore`)
- Memory ID from `MEMORY_ID` env var
- Graceful degradation: if no memory ID, all operations return False/empty

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

## Branch 7: Container — `Dockerfile` + `requirements.txt`

- Base: `python:3.13-slim`
- Platform: `linux/arm64`
- Non-root user (`appuser:appgroup`, UID/GID 1000)
- Health check: `curl http://localhost:8080/health` (30s interval)
- Port: 8080
- Python dependencies:
  - `bedrock-agentcore>=0.1.0` — AgentCore app wrapper
  - `strands-agents>=0.1.0` — agent framework + tool decorators
  - `boto3>=1.35.0` — AWS SDK
  - `opensearch-py>=2.4.0` — OpenSearch client (for RAG)
  - `python-dotenv>=1.0.0` — env var loading

---

## Branch 8: Environment Variables (injected by CDK)

| Variable | Source | Purpose |
|---|---|---|
| `MODEL_ID` | CDK config | Bedrock model for all agents |
| `AGENT_TYPE` | CDK config (`orchestrator`) | Which agent to load as primary |
| `KNOWLEDGE_BASE_ID` | SSM → CDK | Bedrock KB for RAG search |
| `MEMORY_ID` | SSM → CDK | AgentCore Memory store |
| `AURORA_CLUSTER_ENDPOINT` | SSM → CDK | Aurora connection |
| `AURORA_DATABASE_NAME` | SSM → CDK | Database name |
| `AURORA_VECTOR_TABLE_NAME` | SSM → CDK | Vector table |
| `AURORA_SECRET_ARN` | SSM → CDK | DB credentials |
| `PROGRESS_TABLE` | CDK hardcoded | `AgentCoreTemplate-LearnerProgress` |
| `REVIEW_TABLE` | CDK hardcoded | `AgentCoreTemplate-LearnerReviews` |
| `AUDIO_BUCKET` | CDK (created in stack) | S3 bucket for voice audio |
| `AWS_REGION` | CDK env | AWS region |

---

## Data Flow Diagram

```
                    ┌──────────────────────────────────────┐
                    │         AgentCore Runtime             │
                    │                                      │
  JSON payload ───► │  main.py (entrypoint)                │
                    │    │                                  │
                    │    ▼                                  │
                    │  AgentRegistry.get("orchestrator")    │
                    │    │                                  │
                    │    ▼                                  │
                    │  Orchestrator Agent (Claude Sonnet 4) │
                    │    │                                  │
                    │    ├── tool: get_learner_profile ──► DynamoDB (Progress)
                    │    │                                  │
                    │    ├── tool: teach_grammar ──────────┐│
                    │    │   Grammar Agent ◄───────────────┘│
                    │    │   ├── search_knowledge_base ──► Bedrock KB → Aurora
                    │    │   └── add_review_items ──────► DynamoDB (Reviews)
                    │    │                                  │
                    │    ├── tool: teach_vocabulary ───────┐│
                    │    │   Vocabulary Agent ◄────────────┘│
                    │    │   ├── search_knowledge_base ──► Bedrock KB → Aurora
                    │    │   ├── text_to_speech ─────────► Amazon Polly
                    │    │   └── add_review_items ──────► DynamoDB (Reviews)
                    │    │                                  │
                    │    ├── tool: practice_conversation ──┐│
                    │    │   Conversation Agent ◄─────────┘│
                    │    │   ├── text_to_speech ─────────► Amazon Polly
                    │    │   └── speech_to_text ─────────► S3 → Transcribe
                    │    │                                  │
                    │    ├── tool: generate_content ───────┐│
                    │    │   Content Agent ◄───────────────┘│
                    │    │   └── search_knowledge_base ──► Bedrock KB → Aurora
                    │    │                                  │
                    │    ├── tool: text_to_speech ────────► Amazon Polly
                    │    ├── tool: get_due_reviews ───────► DynamoDB (Reviews)
                    │    ├── tool: record_review_result ──► DynamoDB (Reviews)
                    │    ├── tool: search_knowledge_base ─► Bedrock KB → Aurora
                    │    └── tool: update_learner_progress► DynamoDB (Progress)
                    │    │                                  │
                    │    ▼                                  │
                    │  Final response text                  │
                    │    │                                  │
                    │  MemoryManager.store_interaction()    │
                    │    └──────────────────────────────► AgentCore Memory
                    │                                      │
                    └──────────────────────────────────────┘
                         │
                    JSON response ───► Chat Lambda ───► API Gateway ───► Client
```

---

## Agent Interaction Pattern

```
Orchestrator                    Sub-Agent (e.g. Grammar)
     │                                │
     │  teach_grammar(request)        │
     │ ──────────────────────────►    │
     │                                │
     │                          Agent.__call__(request)
     │                                │
     │                          ┌─────┴─────┐
     │                          │ Claude LLM │
     │                          │ + tools    │
     │                          └─────┬─────┘
     │                                │
     │                          search_knowledge_base()
     │                          add_review_items()
     │                                │
     │  ◄──── text response ──────────│
     │                                │
     │  (incorporates into own reply) │
     ▼                                │
  Final response to user
```

---

## Color Coding (for Miro)
- 🟣 Purple: AgentCore services (Runtime, Memory)
- 🔵 Blue: Bedrock services (Models, Knowledge Base)
- 🟢 Green: Agent code (Python — orchestrator, sub-agents, tools)
- 🟡 Yellow: Data stores (Aurora pgvector, DynamoDB)
- 🟠 Orange: AWS AI services (Polly, Transcribe)
