

# Agent Memory System and Personal Research Loops

## Overview

This plan adds two major capabilities to the agent system:

1. **Agent Memory and File System** - Each agent gets persistent memory (short-term and long-term) and a personal file system for notes, research, and task tracking
2. **Personal Research Loops** - Before responding in a debate, an agent can run X iterations of private "thinking loops" where they research, take notes, update their memory, and prepare a deeper response

The memories travel with the agent (global scope) but can also be scoped locally to a specific room.

---

## What You Will See

- A new **Memory** tab in the Agent editor showing the agent's global memory files
- In the Room view, a new **"Deep Research"** toggle per agent that lets them run personal loops before responding
- Inner thoughts will show the agent's research process: what they looked up, what notes they wrote, what memories they consulted
- When loading an agent into a new room, you can choose to use their **global memories** (carry knowledge across rooms) or start with **local-only memories** (fresh for this room)

---

## How It Works (User Perspective)

1. Create an agent and enable memory
2. Add the agent to a room
3. When it is the agent's turn, optionally set "research loops" (e.g., 3 loops)
4. The agent will privately: read its memories, search the web, write notes to itself, then respond
5. Move the agent to another room -- their global memories persist, giving them accumulated knowledge

---

## Technical Details

### 1. New Data Types

Add to `src/types/index.ts`:

- `AgentMemoryFile` -- represents a single memory/note file with id, agentId, scope (global or roomId), filename, content, category (memory/research/task/note), timestamps
- Update `Agent` type to include `researchLoops: number` (default 0) and `memoryScope` preference

### 2. Memory Storage Layer

Add `src/lib/agentMemory.ts`:

- Store memory files in localStorage under `br_agent_memory` key
- CRUD operations: `getAgentMemories(agentId, scope)`, `writeMemoryFile(...)`, `readMemoryFile(...)`, `deleteMemoryFile(...)`
- Scope filtering: "global" files belong to the agent everywhere; room-scoped files are specific to one room
- Categories: `long-term-memory`, `short-term-memory`, `research-notes`, `task-status`, `scratch-pad`

### 3. Personal Research Loop (in `src/lib/llm.ts`)

Modify `callAgent` to support multiple private loops before the public response:

```text
For each loop iteration (1 to N):
  1. Read agent's existing memories (global + room-local)
  2. Call LLM with special "research mode" system prompt
  3. LLM returns structured actions: WRITE_MEMORY, READ_MEMORY, SEARCH_WEB, THINK
  4. Execute actions (write notes, do searches, update task files)
  5. Append iteration summary to innerThoughts
After all loops:
  6. Final public response pass (existing Pass 2) with all accumulated context
```

The research loop prompt instructs the agent to:
- Review what it knows and identify gaps
- Use web search if permitted
- Write findings to memory files
- Update task/status tracking files
- Prepare structured notes for the final response

### 4. Memory-Aware System Prompts

Update `buildSystemMessage` in `src/lib/llm.ts`:
- Inject agent's relevant memories into the system prompt context
- Add instructions for the agent about available memory operations
- Include memory file listing so the agent knows what notes it has

### 5. UI Changes

**Agent Editor (`src/pages/AgentsPage.tsx`)**:
- Add "Research Loops" slider (0-5) in advanced settings
- Add "Memory Scope Default" selector: Global / Local / Both
- Add a "View Memories" button that opens a panel showing all the agent's memory files with ability to view/delete

**Room View (`src/pages/RoomView.tsx`)**:
- Add per-agent "loops" indicator next to the "Speak now" button
- Show a progress indicator during research loops ("Loop 2/3: Researching...")
- Enhanced inner thoughts display showing each loop's activity with clear labels
- Add memory scope toggle in the room's agent panel: "Use global memories" checkbox per agent

**New Component: `src/components/AgentMemoryPanel.tsx`**:
- Displays memory files organized by category
- Shows file content in a collapsible view
- Allows manual editing/deletion of memory files
- Filter by scope (global vs room-local)

### 6. Memory File Format

Each memory file stored as:

```text
{
  id: string,
  agentId: string,
  scope: "global" | roomId,
  filename: string,          // e.g. "long-term-memory.md"
  category: "long-term" | "short-term" | "research" | "task" | "scratch",
  content: string,           // markdown content
  createdAt: string,
  updatedAt: string
}
```

### 7. Implementation Order

1. Types and memory storage layer (`types/index.ts`, `lib/agentMemory.ts`)
2. Research loop logic in `lib/llm.ts`
3. Agent editor UI updates for loop config and memory viewer
4. Room view UI updates for loop progress and memory scope
5. AgentMemoryPanel component

### 8. Edge Cases Handled

- Agent with 0 loops: behaves exactly as today (no change to existing flow)
- Empty memories: agent starts fresh, first loop creates initial notes
- Room-local vs global: merges both scopes, clearly labeled in context
- Loop interruption: if auto-run is stopped mid-loop, partial notes are still saved
- Memory size: individual files capped at 10,000 chars; old short-term memories auto-pruned when exceeding 20 files

