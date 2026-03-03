

## Problem

The agents currently behave passively: they agree, suggest what "should" be done, and give surface-level answers without actually doing investigative work. The root causes are:

1. **Weak system prompts** -- the base prompt says "Keep your responses concise and focused. You are participating in a multi-agent brainstorming session." This encourages short, agreeable answers rather than deep autonomous work.

2. **Research loop prompts lack action bias** -- while research loops exist (steps 1-5), the prompts focus on memory writing and note-taking rather than proactive investigation, task decomposition, and delivering concrete artifacts.

3. **No task/action framework** -- agents have no structured way to define tasks, track progress, or commit to deliverables. They just "think and write notes."

4. **Public response prompt encourages brevity** -- "Be direct and concise" steers agents away from substantive, detailed contributions.

## Plan

### 1. Overhaul base system prompt to enforce proactive behavior

In `buildSystemMessage()` (src/lib/llm.ts ~line 105), replace the passive closing instruction with an agentic directive:

```
You are an autonomous expert. Do NOT just agree or suggest what others should do.
Instead:
- Take ownership of problems — investigate, analyze, and deliver concrete findings
- Break complex questions into sub-tasks and work through them systematically
- Provide evidence, data, calculations, or code — not just opinions
- Challenge assumptions and present alternative viewpoints with reasoning
- When you lack information, use your tools (web search, code execution) to find answers
- End with specific, actionable next steps YOU will take, not vague recommendations
```

### 2. Enhance research loop prompts for deeper autonomous work

In the research loop system prompt (lines 425-470), add:

- **Task decomposition**: Require agents to break the problem into concrete sub-tasks in step 1, not just a vague "strategy"
- **Action-oriented steps**: Each loop should produce a tangible output (analysis, data, code result, verified fact) rather than just notes
- **Self-critique**: Before final step, agents must evaluate what gaps remain and what they still need to verify
- **Deliverable focus**: Final loop must produce a structured deliverable (findings report, recommendation with evidence, action plan with owners)

### 3. Upgrade public response prompt to demand substance

In the public response injection (line 567), change from "Be direct and concise" to requiring:

- Concrete findings from research (not restating what was discussed)
- Evidence or sources backing claims
- A clear position with reasoning, not hedged agreement
- Specific action items or deliverables, not "we should consider..."

### 4. Add "agent work style" field to Agent type

Add an optional `workStyle` field to the Agent interface (`src/types/index.ts`) with presets:
- `proactive` (default for new agents) -- autonomous investigator, takes initiative
- `collaborative` -- discussion-oriented, builds on others' ideas  
- `critical` -- devil's advocate, challenges everything

This gets injected into the system prompt to shape behavior. The AgentEditor gets a simple dropdown for this.

### 5. Update AgentEditor with work style selector

In `src/pages/AgentsPage.tsx`, add a "Work Style" dropdown in the agent configuration section with the three presets above, plus a tooltip explaining each mode.

### Files changed

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `workStyle` field to `Agent` interface |
| `src/lib/llm.ts` | Rewrite `buildSystemMessage` closing, research loop prompt, and public response prompt |
| `src/pages/AgentsPage.tsx` | Add work style dropdown in AgentEditor |

