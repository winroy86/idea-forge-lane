# Idea Forge Lane

A local-first multi-agent brainstorming studio built with React + Vite + Supabase Edge Functions.

## What this project does

- Create and manage AI agents with different roles, prompts, model settings, permissions, memories, and MCP server attachments.
- Run multi-agent room conversations with orchestration modes (manual/sequence/loop/auto).
- Install/import skills (JSON/ZIP) that inject structured workflows into agent prompts.
- Use optional tools in agent responses: web search, JS code execution, MCP tool calls.
- Persist room/agent/message/provider data in browser localStorage.

## Local setup

### 1) Prerequisites

- Node.js 18+
- npm
- (optional) Python 3, if you want Python execution through local MCP tools
- (optional) Supabase CLI for local edge function runtime

### 2) Install + run frontend

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

### 3) Run local health/capability checks

```bash
npm run doctor:local
```

This verifies local runtime prerequisites (Node/npm/Python/Supabase CLI), outgoing web access, and checks MCP connectivity if `LOCAL_MCP_URL` is set.

## Agent capability matrix (what works locally)

| Capability | Status | Notes |
|---|---|---|
| Web search | ✅ | Implemented in `supabase/functions/agent-chat` via Google/Wikipedia + summary synthesis. |
| JavaScript code execution | ✅ | Implemented in `agent-chat` (`code_execution` tool). |
| TypeScript code execution | ⚠️ | Parameter accepts it, but execution path is JS runtime; TS syntax requiring transpilation is not supported. |
| Python execution | ⚠️ | Not native in `agent-chat`; use MCP local tools server (`run_python`). |
| Local file read/write | ⚠️ | Not native in `agent-chat`; use MCP local tools server (`read_file`, `write_file`). |
| MCP integrations | ✅ | Agents can discover tools and call MCP servers (with optional bearer/api-key auth). |
| Skills | ✅ | Built-in + importable skills, prompt-injected based on triggers/permissions. |

## Enabling Python + local filesystem access through MCP

Start bundled local MCP server:

```bash
npm run mcp:local
```

Defaults:
- URL: `http://localhost:8787`
- Root folder scope: current working directory

Optional environment variables:
- `LOCAL_MCP_PORT` (default `8787`)
- `LOCAL_MCP_ROOT` (default current directory)
- `LOCAL_MCP_TOKEN` (optional bearer token)

Then in the app:
1. Open **Agents**.
2. Add an MCP server pointing to your local URL.
3. Discover tools and enable that server for the agent.

The included MCP server exposes:
- `read_file`
- `write_file`
- `run_javascript`
- `run_python`


## Provider wiring for edge functions

The following Supabase edge functions now accept an `llm` object in the request body so they are not tied to a hard-coded provider/model:
- `generate-persona`
- `extract-document`

The frontend sends this `llm` object using the active provider settings configured in **Providers** (API key/base URL/provider type) plus a default model per provider.

## Running tests and checks

```bash
npm run lint
npm run test
npm run build
```

## Security notes

- The local MCP server can read/write files inside `LOCAL_MCP_ROOT`; scope it carefully.
- If you expose MCP over a network, set `LOCAL_MCP_TOKEN` and use HTTPS/reverse proxy.
- Current app auth in settings is UI-level only and not a hardened production auth system.
