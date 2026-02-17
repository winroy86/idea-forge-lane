

## Skills System Implementation

This plan adds a Claude-like skill system where skills are structured workflow manifests that agents can load and execute using their existing capabilities (code execution, memory, web search, MCP tools).

### Core Concept

A **Skill** is a JSON manifest that defines:
- What the skill does (name, description, trigger conditions)
- What tools/permissions it requires
- A step-by-step workflow the agent follows during its inner reasoning
- Input/output schemas

Agents don't need new capabilities -- skills are injected into the agent's system prompt when relevant, and the agent uses its existing tools (code execution, memory, web search, file read/write via memory) to follow the workflow. The inner thoughts phase is where the agent plans and executes skill steps.

### What Changes

**1. New types (`src/types/index.ts`)**

Add `Skill` and `SkillStep` interfaces:

```text
SkillStep {
  id, instruction, toolHint (optional: 'code_execution' | 'web_search' | 'memory_write' | 'mcp_call'),
  outputKey (optional: name to store result for later steps)
}

Skill {
  id, name, description, version, author,
  icon (emoji), category,
  triggers: string[] (keywords/phrases that activate this skill),
  requiredPermissions: ('webSearch' | 'codeExecution' | 'fileRead' | 'fileWrite')[],
  inputSchema: { name, type, description, required }[],
  steps: SkillStep[],
  outputFormat: string (markdown template),
  installedAt: string
}
```

**2. Skill store (`src/lib/skillStore.ts`)**

localStorage-based CRUD for skills, plus:
- `getSkills()`, `getSkill(id)`, `upsertSkill()`, `deleteSkill()`
- `getAgentSkills(agent)` -- returns full Skill objects for an agent's `skills: string[]` array
- `importSkillFromJSON(json)` -- parse and validate a skill manifest
- A set of **built-in starter skills** bundled as defaults (e.g., "Deep Research", "Code Analyzer", "Fact Checker", "SWOT Analysis")

**3. Skills Page UI (`src/pages/SkillsPage.tsx`)**

Replace the "Coming Soon" placeholder with:
- Grid of installed skills (icon, name, description, category, required permissions badge)
- "Install Skill" button opening a dialog with options:
  - Paste JSON manifest
  - Load from URL
- Skill detail view (click to expand: see steps, input schema, output format)
- Delete button per skill
- "Starter Skills" section with one-click install for built-in templates

**4. Agent editor skill assignment (`src/pages/AgentsPage.tsx`)**

In the agent editor's Advanced Settings section, add:
- A multi-select checklist of installed skills
- Each skill shows an icon + name + required permissions warning if the agent lacks them
- Selecting a skill adds its ID to `agent.skills[]`

**5. Skill injection into agent reasoning (`src/lib/llm.ts`)**

In `buildSystemMessage()`:
- Look up the agent's assigned skills via `getAgentSkills(agent)`
- For each skill, check if any trigger keywords appear in the latest user message
- If triggered (or if the agent has the skill and the context is relevant), append a structured "AVAILABLE SKILLS" block to the system prompt:

```text
--- AVAILABLE SKILLS ---
[Skill: Deep Research]
Triggers: "research", "investigate", "deep dive"
Steps:
  1. Define research questions (use memory to store plan)
  2. Search for information (use web_search)
  3. Analyze and cross-reference findings (use code_execution if needed)
  4. Write consolidated report to memory
Output: ## Research Report ...
---
```

The agent's inner thinking phase naturally picks up these instructions and follows them. No changes to the edge function are needed -- the agent already has code execution, web search, and memory tools.

**6. Built-in Starter Skills**

Four pre-packaged skills:

- **Deep Research**: Multi-step web search, cross-reference, synthesize findings
- **Code Analyzer**: Read code from documents, analyze patterns, suggest improvements
- **Fact Checker**: Verify claims using web search, rate confidence
- **SWOT Analysis**: Structured strengths/weaknesses/opportunities/threats framework

### Technical Details

**File changes:**

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `Skill`, `SkillStep` interfaces |
| `src/lib/skillStore.ts` | New file -- skill CRUD + built-in skills + import |
| `src/pages/SkillsPage.tsx` | Full rewrite -- skill grid, install dialog, detail view |
| `src/pages/AgentsPage.tsx` | Add skill assignment multi-select in agent editor |
| `src/lib/llm.ts` | Inject active skills into `buildSystemMessage()` |

**No edge function changes needed** -- skills are prompt-level workflows that use existing tool infrastructure.

**No database changes needed** -- skills stored in localStorage alongside agents and rooms.

### Why This Works Simply

- Skills are "structured prompt injection" -- the agent's LLM already knows how to follow step-by-step instructions
- The inner thoughts phase is where skill execution happens naturally
- Research loops amplify skill effectiveness (more steps = more thorough skill execution)
- Memory system stores intermediate skill results between steps
- Existing permissions gate what tools a skill can actually use

