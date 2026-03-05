

# Product Requirements Document (PRD)
## Idea Forge Lane — Multi-Agent Brainstorming Platform

---

## 1. Product Overview

Idea Forge Lane is a local-first, multi-agent AI brainstorming platform where users create "rooms" populated with independently configured AI agents that debate, research, and collaborate on topics. Data persists in browser localStorage with optional cloud sync via Lovable Cloud. The platform supports timed meetings, autonomous research loops, persistent agent memory, modular skills, tool use (web search, code execution, MCP), and a task management system.

---

## 2. Core Entities & Data Model

### 2.1 Agents (`Agent`)
- **Identity**: name, role, domain, point of view, system prompt, style/voice
- **LLM Config** (`AgentConfig`): provider, model, baseUrl, temperature, topP, maxTokens, presencePenalty, frequencyPenalty
- **Work Style**: `proactive` (autonomous expert), `collaborative` (builds on ideas), `critical` (devil's advocate) — each injects distinct system prompt directives
- **Permissions**: webSearch, fileRead, fileWrite, codeExecution (boolean flags)
- **Memory**: enabled/disabled, scope default (global/local/both), `memoryTokenBudget` (500-8000 chars), `historyWindowSize` (5-50 messages)
- **Research Loops**: 0-5 private iterations before public response
- **Skills**: array of skill IDs attached to the agent
- **MCP Servers**: array of `McpServerConfig` (id, name, url, tools[], enabled, authType, authToken, authHeader)
- **Color Index**: for UI avatar coloring

### 2.2 Rooms (`Room`)
- **Metadata**: title, goal, constraints, audience, successCriteria
- **Agent Assignment**: agentIds[]
- **Orchestration**: `manual` | `sequence` | `loop` | `auto`
  - sequence: ordered agent turns via `sequenceOrder[]`
  - loop: repeated rounds via `loopCount`
  - auto: AI-driven turn selection
- **Balance Slider**: 0 (realistic debate) to 100 (equal participation)
- **Documents**: uploaded reference documents (`RoomDocument[]`) with extracted text content
- **Meetings**: `MeetingSession[]` with active meeting tracking
- **Summarizer Override**: per-room summarizer provider/model settings

### 2.3 Messages (`Message`)
- roomId, agentId (null for user/system), role (user/agent/system/summarizer)
- `innerThoughts`: private reasoning visible to user but not to other agents
- `codeBlocks`: structured code execution results with language, output, label, context (public/inner)
- Metadata: tokensUsed, latencyMs, model, provider
- parentId for branching support

### 2.4 Meeting Sessions (`MeetingSession`)
- Topic, goals, additionalInfo, documents
- Duration (minutes), status: scheduled → active → wrap-up → ended
- **Templates**: Brainstorm, Sprint Retro, Design Review, Strategy, Debate, Decision — each with preset topic, goals, and duration

### 2.5 Provider Config (`ProviderConfig`)
- Supported providers: Lovable AI (built-in, no key), OpenAI, Anthropic, Gemini, Azure, Ollama, Custom
- API key, base URL, active/inactive toggle
- `secretStored` flag for server-side key storage

### 2.6 Skills (`Skill`)
- name, description, version, author, icon (emoji), category
- **Triggers**: keywords/phrases that activate the skill
- **Required Permissions**: webSearch, codeExecution, fileRead, fileWrite
- **Input Schema**: typed fields (string, number, boolean, text)
- **Steps** (`SkillStep[]`): ordered instructions with optional toolHint, outputKey, embedded code (JS/Python), codeMode (auto-execute/reference)
- **Code Files** (`SkillCodeFile[]`): standalone code bundled with the skill
- **Output Format**: markdown template
- **Built-in Skills**: 4 starter skills seeded on first load
- **Import**: JSON manifest or ZIP (manifest.json + code files)

### 2.7 Agent Memory (`AgentMemoryFile`)
- **Scopes**: `global` (cross-room) or room-specific (string = roomId)
- **Categories**: long-term, short-term (auto-pruned, max 20), research, task, scratch
- **Priority hierarchy**: research (3) > long-term/task (2) > short-term (1) > scratch (0)
- **Budget-aware injection**: `getCompactMemorySummary()` with configurable `memoryTokenBudget`, keyword-based relevance scoring, truncation per file (300 chars)
- **Auto-consolidation**: rolling `running-summary.md` (last 3 blocks) in global long-term memory
- **Auto-pruning**: short-term files capped at 20 per agent

### 2.8 Tasks (`AgentTask`)
- roomId, title, description, status (todo/in-progress/done/blocked), priority (low/medium/high)
- assigneeAgentId, createdByAgentId
- deliverable field for completed tasks
- Agents create/update tasks via structured commands: `TASK_CREATE|` and `TASK_UPDATE|`

---

## 3. LLM Integration & Inference Pipeline

### 3.1 Provider Routing
- **Lovable AI**: routed through edge function (`agent-chat`), no API key needed
- **OpenAI/Azure/Ollama/Custom**: OpenAI-compatible API calls (direct or via edge function if key stored server-side)
- **Anthropic**: native API with `anthropic-dangerous-direct-browser-access` header
- **Gemini**: native Generative Language API
- **Backend mode**: optional Node.js proxy server (`server/index.js`) for local deployments
- **Edge function proxy**: `supabase/functions/agent-chat` handles tool-calling loop, provider key resolution from `user_provider_credentials` table

### 3.2 System Prompt Construction (`buildSystemMessage`)
1. Base identity: name, role, domain, POV, style
2. Reference documents injection (full text)
3. Meeting context injection (topic, goals, time remaining, phase)
4. Memory injection via `getCompactMemorySummary()` (budget-aware, relevance-filtered)
5. Work style directive (proactive/collaborative/critical)
6. Skills prompt block via `buildSkillsPromptBlock()` (matched by triggers and permissions)

### 3.3 Conversation History (`buildChatMessages`)
- Sliding window: first 2 messages (context setup) + last N messages (default 20, configurable per agent)
- Other agents' messages formatted as `[Name (Role)]: content`
- Inner thoughts are NEVER shared between agents
- Summarizer messages prefixed with `[Summarizer]:`

### 3.4 Research Loops (Private Iterations)
- 0-5 configurable loops per agent before public response
- Each loop: structured prompt with task planning, memory guidelines, anti-pattern directives
- **Step 1**: decompose into sub-tasks, write strategy to memory
- **Subsequent steps**: execute planned sub-tasks, produce artifacts
- **Final step**: self-critique + structured findings report
- Token cap: 3000 per loop iteration
- Memory writes forced to short-term/research only (no long-term during research)
- Tool calls (web search, code execution, MCP) available during research
- Task management commands available during research
- Progress reporting via `onLoopProgress` callback

### 3.5 Inner Reasoning (Chain of Thought)
- **Only runs when research loops = 0** (skip if research already happened)
- Private thinking pass analyzing key points, unique perspective, strategy
- Capped at 1024 tokens
- Injected as `[PRIVATE CONTEXT]` in Pass 2 history

### 3.6 Public Response (Pass 2)
- Tool descriptions injected if enabled
- Anti-leak guard: strips any `[PRIVATE CONTEXT]` markers from output
- Strips model artifacts like `PUBLIC RESPONSE:` prefixes
- Code blocks extracted from markdown for structured display

### 3.7 Post-Response Memory Management
- Auto-save current response as short-term working note
- Auto-consolidate rolling long-term summary (last 3 blocks, max 4000 chars)

### 3.8 Summarizer
- 4 actions: `summarize`, `decisions`, `actionPlan`, `updateMemory`
- Uses room-level or global summarizer settings, falls back to Lovable AI
- Temperature: 0.3, maxTokens: 2048

---

## 4. Tool Capabilities

### 4.1 Web Search
- Wikipedia and Google search (via edge function)
- AI-synthesized results using agent's provider
- Sources tracked and displayed

### 4.2 Code Execution
- JavaScript execution in sandboxed environment (edge function)
- Code and output displayed as structured `CodeBlockMeta`
- Results included in public response markdown

### 4.3 MCP (Model Context Protocol)
- Per-agent MCP server configuration
- Auth types: none, bearer token, API key (custom header)
- Session initialization + tool discovery + tool calling
- Built-in test server (`mcp-test-server`) with getWeather, calculate, randomFact
- Local MCP server (`tools-local-mcp-server.mjs`) with read_file, write_file, run_javascript, run_python
- JSON RPC protocol support

---

## 5. Pages & UI

### 5.1 Dashboard (`/`)
- Room cards with title, goal, agent count, orchestration type, active meeting indicator
- Create/delete room dialogs
- Meeting history navigation

### 5.2 Room View (`/room/:id`) — "Pare" Aesthetic
- **Header**: app name left, room title center, leave/settings/orchestration buttons right
- **Left Sidebar** (tabs):
  - **Agents**: large circular avatars with earth-tone colored backgrounds, name, role subtitle
  - **Summary**: meeting notes textarea, document management, task board, meeting history, balance slider, agent memory panels
- **Meeting Status Bar**: "Round X of Y · Time Remaining", "Next Argument: [agent] is currently constructing..."
- **Chat Area**: warm cream background, earth-tone colored speech bubbles (`rounded-2xl`), agent name above bubble
- **Summarizer Actions**: Summarize, Decisions, Action Plan, Update Memory buttons
- **Bottom Bar**: "Interact with the board..." input, send button, conclude/summarize actions
- **Context Window Indicator**: color-coded breakdown (system prompt, memory, history) with token estimates

### 5.3 Agents Page (`/agents`)
- Agent cards with create/edit/delete
- Full agent editor: identity, LLM config, permissions, work style, memory settings (token budget slider 500-8000, history window slider 5-50), skills, MCP servers, research loops

### 5.4 Skills Page (`/skills`)
- Skill cards with expandable details (steps, code files, permissions, triggers)
- 4-step creation wizard: Basics → Steps → Code Files → Output
- JSON install dialog + ZIP import
- Export as JSON

### 5.5 Providers Page (`/providers`)
- Add/edit/delete provider configurations
- Lovable AI (built-in), OpenAI, Anthropic, Gemini, Azure, Ollama, Custom
- API key management (show/hide, server-side storage)
- Ollama auto-detection
- Local dev mode toggle

### 5.6 Settings Page (`/settings`)
- Authentication toggle (password-based session auth for local server)
- Chat bubble mode toggle

### 5.7 Admin Page (`/admin`) — admin role required
- Tabs: Rooms, Agents, Users, Models
- Room/meeting/agent snapshot tables from cloud
- User role management (admin/user)
- Model policy: toggle allowed models per provider

### 5.8 Meeting History (`/room/:id/history`)
- Timeline of past meetings with contribution analysis
- Markdown and PDF export

### 5.9 Login Page (`/login`)
- Supabase Auth email/password login

---

## 6. Backend Services (Lovable Cloud / Supabase Edge Functions)

| Function | Purpose |
|---|---|
| `agent-chat` | LLM proxy with tool-calling loop (web search, code exec, MCP) |
| `provider-secrets` | CRUD for encrypted user provider credentials |
| `generate-persona` | AI-generated agent persona from description |
| `extract-document` | Text extraction from uploaded documents (vision + AI cleanup) |
| `admin-users` | User listing and role management (service role) |
| `model-policy` | Allowed model whitelist per provider |
| `mcp-test-server` | Demo MCP server for testing |

---

## 7. Data Persistence

- **Primary**: browser localStorage (rooms, agents, messages, providers, meetings, settings, memories, skills, tasks)
- **Cloud sync**: fire-and-forget snapshots to Supabase tables (`room_snapshots`, `meeting_snapshots`, `agent_snapshots`)
- **Credentials**: encrypted server-side storage in `user_provider_credentials`
- **Admin data**: `user_roles` table with RLS + `has_role()` security definer function

---

## 8. Authentication & Authorization

- **Supabase Auth**: email/password signup/login with JWT
- **Protected routes**: `ProtectedRoute` component wraps all non-login routes
- **Admin role**: checked via `user_roles` table, `useAdminRole()` hook
- **Edge function auth**: manual JWT verification using session access tokens
- **Local server auth**: optional password-based session with encrypted storage
- **Model policy**: admin-managed whitelist of allowed models per provider

---

## 9. Orchestration Modes

| Mode | Behavior |
|---|---|
| `manual` | User triggers each agent response individually |
| `sequence` | Agents respond in defined order (`sequenceOrder[]`) |
| `loop` | Repeated rounds through all agents (`loopCount` times) |
| `auto` | AI-driven turn selection based on conversation flow |

---

## 10. Future: GraphRAG Expert Memory (Planned)

The current memory system (localStorage, category-based, keyword relevance) provides the foundation for a future **GraphRAG-based expert memory** system. Key integration points:

- **Memory categories** (research, long-term, short-term, task, scratch) map to graph node types
- **Scope system** (global vs room-local) maps to graph partitioning
- **Relevance scoring** (keyword overlap) will be replaced by vector similarity + graph traversal
- **Budget-aware injection** (`getCompactMemorySummary`) provides the interface that GraphRAG will implement
- **Rolling summary consolidation** will be enhanced with entity extraction and relationship linking
- **Skills system** can include GraphRAG query skills for specialized knowledge retrieval
- **MCP integration** can expose GraphRAG as an external tool server

The `AgentMemoryFile` interface, `writeMemoryFile()`, and `getCompactMemorySummary()` functions are the primary integration surfaces for replacing localStorage with a graph-backed store.

