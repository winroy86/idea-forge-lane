

# Memory & Prompt Optimization Plan

## Problems Identified

After reviewing `src/lib/llm.ts` and `src/lib/agentMemory.ts`, here are the root causes of agent degradation over time:

1. **Memory bloat in context window**: `getMemorySummaryForPrompt` dumps ALL memory files' full content into the system prompt. After a few rounds, this can consume 10-20K tokens of context, leaving little room for actual reasoning.

2. **Research loop token cap too low (1500)**: Line 531 caps research loop output at 1500 tokens. Agents can't produce substantive analysis in that budget, leading to shallow "I'll look into X" outputs instead of real findings.

3. **No conversation history pruning**: `buildChatMessages` sends ALL messages. After 10+ exchanges, the history alone can exceed the context window, pushing out the system prompt and memories.

4. **Redundant inner-thoughts pass after research**: After completing research loops (which already produce private analysis), there's a SECOND "thinking" pass (lines 591-613) that wastes tokens repeating what was already analyzed.

5. **Memory injected twice in research loops**: The base `system` prompt already includes memories (via `buildSystemMessage` line 103), then the research prompt injects them AGAIN at line 486. Double the tokens for the same content.

6. **Long-term summary grows unbounded**: The `running-summary.md` just appends text, keeping stale content from early conversations at the top while newer, more relevant content gets truncated.

7. **No relevance filtering**: All memories are injected regardless of whether they relate to the current topic. An agent researching "EV markets" gets memories about a previous "blockchain" conversation too.

## Plan

### 1. Smart memory injection with budget and relevance (`src/lib/agentMemory.ts`)

- Add a `MEMORY_TOKEN_BUDGET` constant (default 2000 chars ~500 tokens)
- New function `getCompactMemorySummary(agentId, roomId, currentTopic?)` that:
  - Prioritizes room-local memories over global
  - Prioritizes research > long-term > short-term
  - For each memory file, includes only the first 300 chars + a "..." truncation marker
  - Stops adding memories when the budget is reached
  - Optionally filters by simple keyword overlap with `currentTopic`

### 2. Conversation history sliding window (`src/lib/llm.ts`)

- In `buildChatMessages`, keep only the last N messages (e.g., 20) plus always include the first 2 messages (for context setup)
- Add a `MAX_HISTORY_MESSAGES = 20` constant
- This prevents context window overflow in long conversations

### 3. Increase research loop token cap (`src/lib/llm.ts`)

- Change line 531 from `maxTokens: Math.min(agent.config.maxTokens, 1500)` to `Math.min(agent.config.maxTokens, 3000)`
- Gives agents enough room to produce real analysis in each research step

### 4. Skip redundant thinking pass when research loops ran (`src/lib/llm.ts`)

- When `researchLoops > 0`, skip the "Pass 1: Inner reasoning" block (lines 591-613) entirely
- The research loops already produced thorough private analysis — doing it twice wastes 1000+ tokens and dilutes focus

### 5. Fix double memory injection in research loops (`src/lib/llm.ts`)

- Remove the memory injection from the research `researchSystem` prompt (line 486) since it's already in the base `system` prompt from `buildSystemMessage`
- OR: remove it from `buildSystemMessage` during research mode and only inject the freshest version in each loop iteration (preferred — ensures each loop sees updated memories)

### 6. Smarter long-term memory consolidation (`src/lib/llm.ts`)

- Replace the append-only `running-summary.md` strategy (lines 710-728) with a rolling window: keep only the last 3 update blocks instead of trimming by character count
- This ensures the most recent and relevant context is preserved

### 7. Stronger "don't quit" directive in research prompts (`src/lib/llm.ts`)

- Add explicit anti-patterns to the research loop prompt: "Do NOT end with 'I'll investigate further' or 'More research needed' — deliver what you have NOW"
- Add to the final response prompt: "Do NOT say 'I have completed my analysis' — instead present your findings directly"

### Files to modify
- `src/lib/agentMemory.ts` — add compact memory summary with budget
- `src/lib/llm.ts` — history pruning, skip redundant thinking pass, fix double injection, increase research token cap, better prompts, smarter consolidation

