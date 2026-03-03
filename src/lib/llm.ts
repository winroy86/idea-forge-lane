import { Agent, Message, ProviderConfig, RoomDocument, SummarizerAction, SummarizerSettings, CodeBlockMeta, MeetingContext } from '@/types';
import { parseAndApplyTaskActions, getTasksForRoom } from '@/lib/taskStore';
import { getProviders } from '@/lib/store';
import { getAgentMemories, writeMemoryFile, getMemorySummaryForPrompt } from '@/lib/agentMemory';
import { buildSkillsPromptBlock } from '@/lib/skillStore';
import { waitForProviderHydration } from '@/lib/providerHydration';
import { getDefaultLlmSelection } from '@/lib/providerSelection';

interface LLMResponse {
  content: string;
  innerThoughts?: string;
  codeBlocks?: CodeBlockMeta[];
  tokensUsed?: number;
  latencyMs: number;
  model: string;
  provider: string;
}

const backendApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const isBackendModeEnabled = backendApiBaseUrl.length > 0;

function findProvider(providerType: string, baseUrl?: string): ProviderConfig | null {
  const providers = getProviders();
  // Try exact match with baseUrl first
  if (baseUrl) {
    const match = providers.find(p => p.provider === providerType && p.baseUrl === baseUrl && p.isActive);
    if (match) return match;
  }
  // Fallback to any active provider of that type
  return providers.find(p => p.provider === providerType && p.isActive) || null;
}

async function callProviderViaBackend(
  provider: string,
  model: string,
  system: string,
  history: { role: string; content: string }[],
  agent: Agent,
): Promise<{ content: string; usage?: { total_tokens?: number } }> {
  if (!isBackendModeEnabled) {
    throw new Error('Backend mode is not enabled. Set VITE_API_BASE_URL.');
  }

  const response = await fetch(`${backendApiBaseUrl}/api/llm/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent: {
        provider,
        model,
        baseUrl: agent.config.baseUrl,
        config: {
          temperature: agent.config.temperature,
          maxTokens: agent.config.maxTokens,
          topP: agent.config.topP,
          presencePenalty: agent.config.presencePenalty,
          frequencyPenalty: agent.config.frequencyPenalty,
        },
      },
      model,
      system,
      history,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Backend inference error (${response.status}): ${err}`);
  }

  return response.json();
}

function buildSystemMessage(agent: Agent, documents: RoomDocument[] = [], roomId?: string, meetingContext?: MeetingContext): string {
  let prompt = agent.systemPrompt || `You are ${agent.name}, a ${agent.role}.`;
  if (agent.domain) prompt += `\nYour area of expertise is: ${agent.domain}.`;
  if (agent.pointOfView) prompt += `\nYour perspective/point of view: ${agent.pointOfView}.`;
  if (agent.styleVoice) prompt += `\nYour communication style: ${agent.styleVoice}.`;
  if (documents.length > 0) {
    prompt += `\n\n--- REFERENCE DOCUMENTS ---\nYou have been provided the following documents to inform your responses:\n`;
    documents.forEach((doc, i) => {
      prompt += `\n[Document ${i + 1}: "${doc.name}"]\n${doc.content}\n`;
    });
    prompt += `\n--- END DOCUMENTS ---\n`;
  }
  // Inject meeting context if active
  if (meetingContext) {
    prompt += `\n\n--- MEETING CONTEXT ---`;
    prompt += `\nTopic: ${meetingContext.topic}`;
    prompt += `\nGoals: ${meetingContext.goals}`;
    if (meetingContext.additionalInfo) prompt += `\nAdditional Info: ${meetingContext.additionalInfo}`;
    prompt += `\nTime Remaining: ${Math.round(meetingContext.timeRemainingMinutes)} minutes of ${meetingContext.totalDurationMinutes} total`;
    prompt += `\nPhase: ${meetingContext.phase}`;
    prompt += `\n--- END MEETING CONTEXT ---`;
    if (meetingContext.phase === 'active') {
      prompt += `\n\nYou have ${Math.round(meetingContext.timeRemainingMinutes)} minutes remaining. Structure your arguments accordingly — be thorough but mindful of time.`;
    } else {
      prompt += `\n\nThe meeting ends in ${Math.round(meetingContext.timeRemainingMinutes)} minutes. Focus on summarizing your position and key takeaways rather than introducing new arguments.`;
    }
  }
  // Inject agent memories if memory is enabled
  if (agent.memoryEnabled) {
    const memoryContext = getMemorySummaryForPrompt(agent.id, roomId);
    if (memoryContext) prompt += memoryContext;
  }
  // Work style directive
  const workStyle = agent.workStyle || 'proactive';
  if (workStyle === 'proactive') {
    prompt += `\n\nYou are an autonomous expert. Do NOT just agree or suggest what others should do.
Instead:
- Take ownership of problems — investigate, analyze, and deliver concrete findings
- Break complex questions into sub-tasks and work through them systematically
- Provide evidence, data, calculations, or code — not just opinions
- Challenge assumptions and present alternative viewpoints with reasoning
- When you lack information, use your tools (web search, code execution) to find answers
- End with specific, actionable next steps YOU will take, not vague recommendations
- Never say "we should consider" — instead say "I will do X" or "Here is what I found"`;
  } else if (workStyle === 'critical') {
    prompt += `\n\nYou are a rigorous critical analyst. Your role is to stress-test ideas and find weaknesses.
- Challenge every assumption — demand evidence and reasoning
- Play devil's advocate: argue the strongest counter-position, even if you agree
- Identify risks, edge cases, and failure modes others miss
- Rate confidence levels on claims (high/medium/low) with justification
- When others agree too quickly, push back and explore alternatives
- Provide your own analysis with evidence, not just criticism`;
  } else {
    prompt += `\n\nYou are a collaborative team member who builds on others' ideas.
- Listen carefully and synthesize different viewpoints into stronger proposals
- Add concrete details, examples, and evidence to evolving ideas
- Identify connections between different perspectives
- When you agree, explain WHY and add substance — never just say "I agree"
- Propose specific improvements and refinements with reasoning`;
  }

  return prompt;
}

function buildSystemMessageWithSkills(agent: Agent, documents: RoomDocument[] = [], roomId?: string, meetingContext?: MeetingContext, latestUserMessage?: string): string {
  let prompt = buildSystemMessage(agent, documents, roomId, meetingContext);
  const skillsBlock = buildSkillsPromptBlock(agent, latestUserMessage);
  if (skillsBlock) prompt += skillsBlock;
  return prompt;
}

function buildChatMessages(agent: Agent, messages: Message[], allAgents: Agent[], documents: RoomDocument[] = [], roomId?: string, meetingContext?: MeetingContext) {
  const latestUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content;
  const system = buildSystemMessageWithSkills(agent, documents, roomId, meetingContext, latestUserMsg);
  // Only include public content - inner thoughts are private and not shared
  const history = messages.map(m => {
    if (m.role === 'user') {
      return { role: 'user' as const, content: m.content };
    }
    if (m.role === 'summarizer') {
      return { role: 'assistant' as const, content: `[Summarizer]: ${m.content}` };
    }
    const msgAgent = allAgents.find(a => a.id === m.agentId);
    const name = msgAgent?.name || 'Unknown';
    if (m.agentId === agent.id) {
      return { role: 'assistant' as const, content: m.content };
    }
    // Only share the public content, never the innerThoughts
    return { role: 'user' as const, content: `[${name} (${msgAgent?.role || ''})]: ${m.content}` };
  });
  return { system, history };
}

// ---- OpenAI-compatible (OpenAI, Azure, Ollama, Custom) ----

async function callOpenAICompatible(
  apiKey: string,
  baseUrl: string,
  model: string,
  system: string,
  history: { role: string; content: string }[],
  agent: Agent,
): Promise<{ content: string; usage?: { total_tokens?: number } }> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        ...history,
      ],
      temperature: agent.config.temperature,
      max_tokens: agent.config.maxTokens,
      top_p: agent.config.topP,
      presence_penalty: agent.config.presencePenalty,
      frequency_penalty: agent.config.frequencyPenalty,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error (${res.status}): ${err}`);
  }
  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content || 'No response',
    usage: data.usage,
  };
}

// ---- Anthropic ----

async function callAnthropic(
  apiKey: string,
  model: string,
  system: string,
  history: { role: string; content: string }[],
  agent: Agent,
): Promise<{ content: string; usage?: { input_tokens?: number; output_tokens?: number } }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: agent.config.maxTokens,
      temperature: agent.config.temperature,
      top_p: agent.config.topP,
      system,
      messages: history.map(m => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      })),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic error (${res.status}): ${err}`);
  }
  const data = await res.json();
  return {
    content: data.content?.[0]?.text || 'No response',
    usage: data.usage,
  };
}

// ---- Gemini ----

async function callGemini(
  apiKey: string,
  model: string,
  system: string,
  history: { role: string; content: string }[],
  agent: Agent,
): Promise<{ content: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const contents = history.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        temperature: agent.config.temperature,
        topP: agent.config.topP,
        maxOutputTokens: agent.config.maxTokens,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error (${res.status}): ${err}`);
  }
  const data = await res.json();
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response',
  };
}

// ---- Cloud edge function proxy (Lovable AI + user providers via server-side key lookup) ----

async function callViaEdgeFunction(
  provider: string,
  model: string,
  system: string,
  history: { role: string; content: string }[],
  agent: Agent,
  toolsEnabled?: string[],
  mcpServers?: Array<{ id: string; name: string; url: string; tools: string[]; enabled: boolean }>,
  baseUrl?: string,
  apiKey?: string,
): Promise<{ content: string; usage?: { total_tokens?: number }; toolCallsMade?: Array<{ tool: string; query: string; result: string; sources: string[] }> }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Cloud provider is disabled. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
  }

  // Use the user's session JWT so the edge function can look up their stored API keys.
  // Fall back to the anon key only when no session exists (e.g. local/demo mode).
  let authToken = supabaseKey;
  try {
    const { supabase: supabaseClient } = await import('@/integrations/supabase/client');
    if (supabaseClient) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session?.access_token) {
        authToken = session.access_token;
      }
    }
  } catch {
    // ignore — fall back to anon key
  }

  const bodyPayload: Record<string, unknown> = {
    provider,
    model: model || (provider === 'lovable' ? 'google/gemini-3-flash-preview' : 'gpt-4o-mini'),
    messages: [
      { role: 'system', content: system },
      ...history,
    ],
    temperature: agent.config.temperature,
    max_tokens: agent.config.maxTokens,
    top_p: agent.config.topP,
    presence_penalty: agent.config.presencePenalty,
    frequency_penalty: agent.config.frequencyPenalty,
    tools_enabled: toolsEnabled,
  };

  if (baseUrl) bodyPayload.base_url = baseUrl;
  // Only send api_key if provided (local dev mode); otherwise edge function fetches from server
  if (apiKey) bodyPayload.api_key = apiKey;

  if (mcpServers && mcpServers.length > 0) {
    bodyPayload.mcp_servers = mcpServers;
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/agent-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!res.ok) {
    const err = await res.text();
    try {
      const parsed = JSON.parse(err);
      throw new Error(parsed.error || `AI provider error (${res.status})`);
    } catch (e) {
      if (e instanceof Error && e.message !== `Unexpected token`) throw e;
      throw new Error(`AI provider error (${res.status}): ${err}`);
    }
  }

  const data = await res.json();
  return {
    content: data.content || data.choices?.[0]?.message?.content || 'No response',
    usage: data.usage,
    toolCallsMade: data.toolCallsMade,
  };
}

// Convenience wrapper for Lovable AI
async function callLovableAI(
  model: string,
  system: string,
  history: { role: string; content: string }[],
  agent: Agent,
  toolsEnabled?: string[],
  mcpServers?: Array<{ id: string; name: string; url: string; tools: string[]; enabled: boolean }>,
): Promise<{ content: string; usage?: { total_tokens?: number }; toolCallsMade?: Array<{ tool: string; query: string; result: string; sources: string[] }> }> {
  return callViaEdgeFunction('lovable', model, system, history, agent, toolsEnabled, mcpServers);
}

// ---- Main entry point ----

export interface ResearchLoopDetail {
  loopNumber: number;
  thoughts: string[];
  filesWritten: { filename: string; scope: string; category: string }[];
  searches: { query: string; sources: string[] }[];
  status: 'running' | 'done';
}

export interface ResearchLoopProgress {
  currentLoop: number;
  totalLoops: number;
  activity: string;
  completedLoops: ResearchLoopDetail[];
}

export async function callAgent(
  agent: Agent,
  messages: Message[],
  allAgents: Agent[],
  documents: RoomDocument[] = [],
  roomId?: string,
  onLoopProgress?: (progress: ResearchLoopProgress) => void,
  meetingContext?: MeetingContext,
): Promise<LLMResponse> {
  await waitForProviderHydration();
  const hasCloudBackend = !!import.meta.env.VITE_SUPABASE_URL;
  if (agent.config.provider !== 'lovable' && !isBackendModeEnabled && !hasCloudBackend) {
    const provider = findProvider(agent.config.provider, agent.config.baseUrl);
    if (!provider) {
      throw new Error(`No active provider configured for "${agent.config.provider}". Go to Providers to add an API key.`);
    }
  }

  const { system, history } = buildChatMessages(agent, messages, allAgents, documents, roomId, meetingContext);
  const start = performance.now();

  // Determine which tools are enabled for this agent
  const toolsEnabled: string[] = [];
  if (agent.permissions?.webSearch) {
    toolsEnabled.push('web_search');
  }
  if (agent.permissions?.codeExecution) {
    toolsEnabled.push('code_execution');
  }
  const mcpServers = (agent.mcpServers || []).filter(s => s.enabled);
  if (mcpServers.length > 0) {
    toolsEnabled.push('mcp_call');
  }

  let innerThoughts = '';
  let tokensUsed: number | undefined;

  const researchLoops = agent.researchLoops || 0;

  // --- Research Loops (private iterations) ---
  if (researchLoops > 0 && agent.memoryEnabled) {
    const completedLoops: ResearchLoopDetail[] = [];

    for (let loop = 1; loop <= researchLoops; loop++) {
      const currentDetail: ResearchLoopDetail = {
        loopNumber: loop,
        thoughts: [],
        filesWritten: [],
        searches: [],
        status: 'running',
      };
      completedLoops.push(currentDetail);
      onLoopProgress?.({ currentLoop: loop, totalLoops: researchLoops, activity: 'Researching...', completedLoops: [...completedLoops] });

      const memoryContext = getMemorySummaryForPrompt(agent.id, roomId);
      const researchSystem = `${system}

YOU ARE IN PRIVATE RESEARCH MODE (Step ${loop} of ${researchLoops} available research steps). No one can see this.

YOUR MISSION: Produce tangible, concrete outputs — not vague notes. Each step must deliver a specific artifact (analysis, verified fact, data, code result, or structured finding).

=== TASK PLANNING ===
You have exactly ${researchLoops} research step(s) total. You are currently on step ${loop}.
${researchLoops - loop} step(s) remain after this one.

${loop === 1 ? `FIRST STEP: Decompose the problem into CONCRETE SUB-TASKS you will execute across your ${researchLoops} step(s).

For each sub-task, define:
1. What specific question or problem it addresses
2. What tool or method you'll use (web search, code execution, analysis, reasoning)
3. What the expected deliverable is (a finding, a data point, a code result, a verified claim)

Allocate sub-tasks to steps:
- 1 step: Do the single highest-impact investigation and deliver findings
- 2-3 steps: Step 1 = investigate & gather evidence, Step 2 = analyze & verify, Step 3 = synthesize deliverable
- 4-5 steps: Deep exploration → cross-reference → analyze → self-critique → final deliverable

Write your task plan to short-term memory as "strategy.md".` : `Review your task plan from "strategy.md" and execute the next planned sub-task.
Steps completed: ${loop - 1}/${researchLoops}. Steps remaining after this: ${researchLoops - loop}.

${loop === researchLoops ? `⚠️ THIS IS YOUR FINAL RESEARCH STEP.
REQUIRED: Before producing your final output, perform a SELF-CRITIQUE:
- What gaps remain in your research?
- What claims are you making without sufficient evidence?
- What counter-arguments haven't you addressed?
Then produce a STRUCTURED DELIVERABLE: a findings report with evidence, confidence levels, and specific recommendations.` : `REQUIRED OUTPUT for this step: At least one concrete artifact — a verified fact, a calculation result, an analysis with evidence, or a code output. Do NOT just write "I need to look into X" — actually do it.`}`}

${memoryContext ? `Your current memories:\n${memoryContext}` : 'You have no memories yet.'}

${(() => { const tasks = roomId ? getTasksForRoom(roomId) : []; if (tasks.length === 0) return ''; const userTasks = tasks.filter(t => t.createdByAgentId === 'user' && t.status !== 'done'); const taskLines = tasks.map(t => `- [${t.status}] "${t.title}" (id: ${t.id}, priority: ${t.priority}${t.assigneeAgentId === agent.id ? ', assigned to YOU' : ''}${t.createdByAgentId === 'user' ? ', created by USER' : ''})`).join('\n'); let block = `=== CURRENT TASKS ===\n${taskLines}\nUpdate task status as you work on them using TASK_UPDATE.`; if (userTasks.length > 0) { block += `\n\n⚡ USER-CREATED TASKS: ${userTasks.length} task(s) were created by the user. These represent explicit requests — prioritize picking them up. If a user task is assigned to you or unassigned, claim it by updating its status to "in-progress" and work on it.`; } return block; })()}

=== MEMORY GUIDELINES ===
Use SHORT-TERM memory for step-by-step working notes (auto-pruned, limited count).
Use LONG-TERM memory sparingly — only for durable insights that will matter across conversations.
Do NOT dump everything into long-term memory. Be selective.

INSTRUCTIONS:
1. Review the conversation and your task plan
2. Execute the current sub-task — produce a TANGIBLE OUTPUT (not just notes about what you plan to do)
3. Write concrete findings to SHORT-TERM memory files (include evidence, data, sources)
${loop === researchLoops ? '4. Perform self-critique, then consolidate into a structured findings report in short-term memory' : ''}
${toolsEnabled.includes('web_search') ? `${loop === researchLoops ? '5' : '4'}. Use web search to verify claims and gather current data — don't just theorize` : ''}

OUTPUT FORMAT - respond with structured actions:
THINK: [your reasoning about what to do in this step]
WRITE_MEMORY|[scope]|[filename]|[category]|[content]
  - scope: "global" or "local" 
  - filename: descriptive name like "research-findings.md"
  - category: short-term (working notes) or research (findings for this task)
  - content: markdown content to write
  NOTE: Do NOT write to long-term memory during research loops. That happens automatically after your response.

TASK_CREATE|[title]|[description]|[priority]|[assignee_agent_id]
  - title: Short task name (max 60 chars)
  - description: What needs to be done
  - priority: low, medium, or high
  - assignee_agent_id: (optional) agent ID to assign to. Omit to self-assign.

TASK_UPDATE|[task_id]|[new_status]|[deliverable]
  - task_id: ID of the task to update
  - new_status: todo, in-progress, done, or blocked
  - deliverable: (optional) result text when marking done

Create tasks to track your sub-tasks and mark them done as you complete them. This makes your work visible to the team.

Example:
THINK: Step 1 of 3 — I need to define my research strategy and start gathering key information.
TASK_CREATE|Investigate market size data|Find reliable sources for market sizing|high
TASK_CREATE|Cross-reference competitor claims|Verify competitor feature claims against documentation|medium
WRITE_MEMORY|local|strategy.md|short-term|## Research Strategy\n1. Identify key claims\n2. Verify with web search\n3. Synthesize findings
WRITE_MEMORY|local|initial-findings.md|research|## First Pass Notes\n- Key point 1\n- Key point 2`;

      const loopAgent = { ...agent, config: { ...agent.config, maxTokens: Math.min(agent.config.maxTokens, 1500) } };
      const loopResult = await callProviderRaw(loopAgent, researchSystem, history, toolsEnabled.length > 0 ? toolsEnabled : undefined);
      tokensUsed = (tokensUsed || 0) + (loopResult.tokensUsed || 0);

      // Parse and execute memory actions
      const lines = loopResult.content.split('\n');
      let loopSummary = `**🔄 Research Step ${loop}/${researchLoops}:**\n`;

      for (const line of lines) {
        if (line.startsWith('THINK:')) {
          const thought = line.slice(6).trim();
          currentDetail.thoughts.push(thought);
          loopSummary += `💭 ${thought}\n`;
        } else if (line.startsWith('WRITE_MEMORY|')) {
          const parts = line.split('|');
          if (parts.length >= 5) {
            const memScope = parts[1] === 'global' ? 'global' : (roomId || 'global');
            const filename = parts[2];
            // Force research loop writes to short-term or research only
            let category = parts[3] as any;
            if (category === 'long-term') category = 'short-term';
            const content = parts.slice(4).join('|').replace(/\\n/g, '\n');
            writeMemoryFile(agent.id, memScope, filename, content, category);
            currentDetail.filesWritten.push({ filename, scope: memScope, category });
            onLoopProgress?.({ currentLoop: loop, totalLoops: researchLoops, activity: `Writing ${filename}...`, completedLoops: [...completedLoops] });
            loopSummary += `📝 Wrote: ${filename} (${memScope}, ${category})\n`;
          }
        } else if (line.startsWith('TASK_CREATE|') || line.startsWith('TASK_UPDATE|')) {
          const allAgentIds = allAgents.map(a => a.id);
          const { tasksCreated, tasksUpdated } = parseAndApplyTaskActions(line, roomId || 'global', agent.id, allAgentIds);
          for (const t of tasksCreated) {
            loopSummary += `📋 Task created: "${t.title}" (${t.priority})\n`;
            onLoopProgress?.({ currentLoop: loop, totalLoops: researchLoops, activity: `Created task: ${t.title}`, completedLoops: [...completedLoops] });
          }
          for (const tid of tasksUpdated) {
            loopSummary += `✅ Task updated: ${tid}\n`;
          }
        }
      }

      // Track tool calls from research loop
      if (loopResult.toolCallsMade && loopResult.toolCallsMade.length > 0) {
        for (const tc of loopResult.toolCallsMade) {
          currentDetail.searches.push({ query: tc.query, sources: tc.sources });
          loopSummary += `🔍 Searched: "${tc.query}"\n`;
          if (tc.sources.length > 0) {
            loopSummary += `📎 Sources: ${tc.sources.slice(0, 3).join(', ')}\n`;
          }
        }
      }

      currentDetail.status = 'done';
      innerThoughts += loopSummary + '\n';
      onLoopProgress?.({ currentLoop: loop, totalLoops: researchLoops, activity: 'Done', completedLoops: [...completedLoops] });
    }

    onLoopProgress?.({ currentLoop: researchLoops, totalLoops: researchLoops, activity: 'Preparing response...', completedLoops });
  }

  // --- Pass 1: Inner reasoning (chain of thought) ---
  if (messages.length > 0 || documents.length > 0) {
    const updatedMemoryContext = agent.memoryEnabled ? getMemorySummaryForPrompt(agent.id, roomId) : '';
    const thinkingSystem = `${system}
${updatedMemoryContext}

IMPORTANT: You are now in your PRIVATE THINKING mode. The other agents CANNOT see this.
Analyze the conversation so far and any reference documents.
Think through:
1. What are the key points being discussed?
2. What's your unique perspective given your expertise?
3. What are the strengths and weaknesses of other agents' arguments?
4. What insights from the documents (if any) are relevant?
5. What's your strategy for your response?
${agent.memoryEnabled ? '6. What relevant information do you have in your memories?' : ''}
${toolsEnabled.includes('web_search') ? '7. Do you need to search the internet for any information? If so, what queries would help?' : ''}

Be honest and analytical in your thinking. This is your private space.`;

    const thinkingAgent = { ...agent, config: { ...agent.config, maxTokens: Math.min(agent.config.maxTokens, 1024) } };
    const thinkResult = await callProviderRaw(thinkingAgent, thinkingSystem, history);
    innerThoughts += thinkResult.content;
    tokensUsed = (tokensUsed || 0) + (thinkResult.tokensUsed || 0);
  }

  // --- Pass 2: Public response ---
  const toolDescriptions: string[] = [];
  if (toolsEnabled.includes('web_search')) toolDescriptions.push('- web_search: Search the internet for current information.');
  if (toolsEnabled.includes('code_execution')) toolDescriptions.push('- code_execution: Execute JavaScript code for calculations and data processing. When you use code execution, include the code and results in your response using markdown code blocks so the group can see your work.');
  if (toolsEnabled.includes('mcp_call')) {
    const mcpNames = (agent.mcpServers || []).filter(s => s.enabled).map(s => `${s.name} (${s.tools.join(', ') || 'generic'})`);
    toolDescriptions.push(`- MCP tools: ${mcpNames.join('; ')}`);
  }

  const responseSystem = toolDescriptions.length > 0
    ? `${system}\n\nYou have access to the following tools:\n${toolDescriptions.join('\n')}\n\nWhen you use a tool, the results will be provided to you automatically.\n\nIMPORTANT: When you execute code, ALWAYS include the code you ran and the output in your public response using markdown code blocks. The group should be able to see and verify your calculations.`
    : system;

  // Build history for Pass 2 (public response).
  // We inject the private analysis as a system-level note rather than an assistant turn
  // to prevent models from echoing the analytical style in the public response.
  const responseHistory = innerThoughts
    ? [
        ...history,
        {
          role: 'user' as const,
          content: `[PRIVATE CONTEXT — do NOT repeat or reference this in your reply]\n${innerThoughts}\n[END PRIVATE CONTEXT]\n\nNow write your PUBLIC response to the group. This is what everyone will see.\n\nRULES FOR YOUR RESPONSE:\n- Lead with your concrete findings, analysis, or deliverables — not a restatement of the question\n- Back claims with evidence, data, or sources from your research\n- Take a clear position with reasoning — do not hedge with "it depends" or "we should consider"\n- Include specific action items or deliverables, not vague suggestions\n- If you executed code or ran searches, show the key results\n- If you disagree with others, explain WHY with evidence\n- Do NOT mention "private analysis", "inner thoughts", or any meta-commentary about your reasoning process\n\nSimply respond as ${agent.name} with substance and conviction.`,
        },
      ]
    : history;

  const publicResult = await callProviderRaw(agent, responseSystem, responseHistory, toolsEnabled.length > 0 ? toolsEnabled : undefined);
  tokensUsed = (tokensUsed || 0) + (publicResult.tokensUsed || 0);

  // Guard: strip any leaked private-analysis markers from the public content
  let publicContent = publicResult.content;
  // Remove any lines starting with [PRIVATE CONTEXT], [My private analysis], or similar
  publicContent = publicContent
    .replace(/^\[(?:PRIVATE CONTEXT|My private analysis)[^\]]*\][\s\S]*?\[END PRIVATE CONTEXT\]\s*/im, '')
    .replace(/^\[(?:PRIVATE CONTEXT|My private analysis)[^\]]*\].*\n?/im, '')
    .trim();
  // If the model prefixed with "As [agent name]," or "PUBLIC RESPONSE:" strip it
  publicContent = publicContent
    .replace(/^PUBLIC RESPONSE:\s*/i, '')
    .replace(/^\*?\*?PUBLIC RESPONSE:\*?\*?\s*/i, '')
    .trim();

  // Build structured code blocks from tool calls
  const codeBlocks: CodeBlockMeta[] = [];

  // Inner thought code blocks (from tool calls made during public response)
  if (publicResult.toolCallsMade && publicResult.toolCallsMade.length > 0) {
    innerThoughts += '\n\n---\n**🔧 Tools Used:**\n';
    for (const tc of publicResult.toolCallsMade) {
      const icon = tc.tool === 'web_search' ? '🔍' : tc.tool === 'code_execution' ? '💻' : '🔌';
      const label = tc.tool === 'web_search' ? 'Web Search' : tc.tool === 'code_execution' ? 'Code Execution' : tc.tool;
      innerThoughts += `\n**${icon} ${label}:** "${tc.query}"\n`;
      if (tc.sources.length > 0) {
        innerThoughts += `**📎 References:**\n`;
        tc.sources.forEach((src, i) => {
          innerThoughts += `${i + 1}. ${src}\n`;
        });
      }
      innerThoughts += `**📄 Result:** ${tc.result.slice(0, 500)}${tc.result.length > 500 ? '...' : ''}\n`;

      // Add inner code blocks for code execution tool calls
      if (tc.tool === 'code_execution') {
        codeBlocks.push({
          code: tc.query, // the code that was executed
          language: 'javascript',
          output: tc.result,
          label: 'Executed Code',
          context: 'inner',
        });
      }
    }
  }

  // Extract public code blocks from the agent's response content (markdown ```blocks```)
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockRegex.exec(publicContent)) !== null) {
    const lang = match[1] || 'javascript';
    const code = match[2].trim();
    if (code.length > 0) {
      codeBlocks.push({
        code,
        language: lang,
        label: `Shared Code (${lang})`,
        context: 'public',
      });
    }
  }

  // Auto-manage memory (does NOT count as a research loop)
  if (agent.memoryEnabled && roomId) {
    // 1. Save current response as short-term working note
    const shortTermContent = `## Response at ${new Date().toISOString()}\n**Topic:** ${messages[messages.length - 1]?.content?.slice(0, 100) || 'conversation'}\n**Key points from my response:** ${publicContent.slice(0, 500)}`;
    writeMemoryFile(agent.id, roomId, `response-${Date.now()}.md`, shortTermContent, 'short-term');

    // 2. Auto-consolidate: update long-term memory with a running summary
    const existingLongTerm = getAgentMemories(agent.id, 'global')
      .filter(f => f.category === 'long-term' && f.filename === 'running-summary.md');
    const previousSummary = existingLongTerm.length > 0 ? existingLongTerm[0].content : '';
    
    // Build a compact long-term update from recent short-term memories
    const recentShortTerm = getAgentMemories(agent.id, roomId)
      .filter(f => f.category === 'short-term' || f.category === 'research')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5)
      .map(f => f.content.slice(0, 200))
      .join('\n');

    const updatedSummary = previousSummary
      ? `${previousSummary.slice(0, 3000)}\n\n### Update (${new Date().toISOString().slice(0, 16)})\n${publicContent.slice(0, 300)}`
      : `## ${agent.name} — Running Summary\n### ${new Date().toISOString().slice(0, 16)}\n${publicContent.slice(0, 500)}`;

    // Keep long-term summary under size limit by trimming oldest entries
    writeMemoryFile(agent.id, 'global', 'running-summary.md', updatedSummary.slice(0, 8000), 'long-term');
  }

  const latencyMs = Math.round(performance.now() - start);

  return {
    content: publicContent,
    innerThoughts: innerThoughts || undefined,
    codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
    tokensUsed,
    latencyMs,
    model: agent.config.model,
    provider: agent.config.provider,
  };
}

// Raw provider call (single pass)
async function callProviderRaw(
  agent: Agent,
  system: string,
  history: { role: string; content: string }[],
  toolsEnabled?: string[],
): Promise<{ content: string; tokensUsed?: number; toolCallsMade?: Array<{ tool: string; query: string; result: string; sources: string[] }> }> {
  let content = '';
  let tokensUsed: number | undefined;
  let toolCallsMade: Array<{ tool: string; query: string; result: string; sources: string[] }> | undefined;

  const mcpServers = (agent.mcpServers || []).filter(s => s.enabled);

  if (isBackendModeEnabled && agent.config.provider !== 'lovable') {
    const backendResult = await callProviderViaBackend(agent.config.provider, agent.config.model, system, history, agent);
    return {
      content: backendResult.content,
      tokensUsed: backendResult.usage?.total_tokens,
    };
  }

  const hasCloudBackend = !!import.meta.env.VITE_SUPABASE_URL;

  switch (agent.config.provider) {
    case 'lovable': {
      const result = await callLovableAI(agent.config.model, system, history, agent, toolsEnabled, mcpServers.length > 0 ? mcpServers : undefined);
      content = result.content;
      tokensUsed = result.usage?.total_tokens;
      toolCallsMade = result.toolCallsMade;
      break;
    }
    case 'anthropic': {
      const provider = findProvider('anthropic');
      // If no local API key (server-side stored), route through edge function
      if (!provider?.apiKey && hasCloudBackend) {
        const result = await callViaEdgeFunction('anthropic', agent.config.model, system, history, agent, toolsEnabled, mcpServers.length > 0 ? mcpServers : undefined);
        content = result.content;
        tokensUsed = result.usage?.total_tokens;
        toolCallsMade = result.toolCallsMade;
      } else {
        if (!provider?.apiKey) throw new Error('No Anthropic API key configured. Add it in the Providers page.');
        const result = await callAnthropic(provider.apiKey, agent.config.model, system, history, agent);
        content = result.content;
        tokensUsed = result.usage ? (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0) : undefined;
      }
      break;
    }
    case 'gemini': {
      const provider = findProvider('gemini');
      if (!provider?.apiKey && hasCloudBackend) {
        const result = await callViaEdgeFunction('gemini', agent.config.model, system, history, agent, toolsEnabled, mcpServers.length > 0 ? mcpServers : undefined);
        content = result.content;
        tokensUsed = result.usage?.total_tokens;
        toolCallsMade = result.toolCallsMade;
      } else {
        if (!provider?.apiKey) throw new Error('No Gemini API key configured. Add it in the Providers page.');
        const result = await callGemini(provider.apiKey, agent.config.model, system, history, agent);
        content = result.content;
      }
      break;
    }
    case 'openai':
    case 'azure':
    case 'ollama':
    case 'custom':
    default: {
      const provider = findProvider(agent.config.provider, agent.config.baseUrl);
      const baseUrl =
        agent.config.provider === 'ollama'
          ? (provider?.baseUrl || agent.config.baseUrl || 'http://localhost:11434/v1')
          : agent.config.provider === 'azure'
          ? (provider?.baseUrl || agent.config.baseUrl || '')
          : agent.config.provider === 'custom'
          ? (provider?.baseUrl || agent.config.baseUrl || '')
          : 'https://api.openai.com/v1';

      // If no local API key (server-side stored), route through edge function
      if (!provider?.apiKey && hasCloudBackend) {
        const result = await callViaEdgeFunction(
          agent.config.provider,
          agent.config.model,
          system,
          history,
          agent,
          toolsEnabled,
          mcpServers.length > 0 ? mcpServers : undefined,
          baseUrl || undefined,
        );
        content = result.content;
        tokensUsed = result.usage?.total_tokens;
        toolCallsMade = result.toolCallsMade;
      } else {
        if (!provider?.apiKey && agent.config.provider !== 'ollama') {
          throw new Error(`No API key configured for "${agent.config.provider}". Add it in the Providers page.`);
        }
        if (!baseUrl) throw new Error('No base URL configured for custom provider.');
        const result = await callOpenAICompatible(provider?.apiKey || '', baseUrl, agent.config.model, system, history, agent);
        content = result.content;
        tokensUsed = result.usage?.total_tokens;
      }
      break;
    }
  }

  return { content, tokensUsed, toolCallsMade };
}

// ---- Summarizer (uses first available provider) ----

export async function callSummarizer(
  action: SummarizerAction,
  messages: Message[],
  allAgents: Agent[],
  /** Optional per-room summarizer override. Falls back to Lovable AI / first active provider. */
  summarizerOverride?: SummarizerSettings,
): Promise<LLMResponse> {
  await waitForProviderHydration();

  const hasLovableCloud = !!import.meta.env.VITE_SUPABASE_URL;
  const providers = getProviders().filter(p => p.isActive);

  if (!hasLovableCloud && !isBackendModeEnabled && providers.length === 0) {
    throw new Error('No active providers configured. Go to Providers to add an API key.');
  }

  const actionPrompts: Record<SummarizerAction, string> = {
    summarize: 'Provide a clear, structured summary of the conversation so far. Include key points, themes, and areas of agreement/disagreement.',
    decisions: 'Extract all decisions made and open questions remaining from this conversation. Use checkmarks for decisions and question marks for open items.',
    actionPlan: 'Create a structured action plan based on this conversation. Include phases, tasks, and owners where identifiable.',
    updateMemory: 'Extract the key learnings, insights, and important facts from this conversation that each agent should remember for future conversations. Format as structured notes per agent.',
  };

  const system = `You are a conversation summarizer. ${actionPrompts[action]}`;
  const history = messages.map(m => {
    const agent = allAgents.find(a => a.id === m.agentId);
    const prefix = m.role === 'user' ? '[User]' : m.role === 'summarizer' ? '[Summarizer]' : `[${agent?.name || 'Unknown'}]`;
    return { role: 'user' as const, content: `${prefix}: ${m.content}` };
  });

  const start = performance.now();
  let content = '';
  let usedModel = '';
  let usedProvider = '';

  // If an explicit override is set (room-level or global settings), use it
  if (summarizerOverride && summarizerOverride.provider && summarizerOverride.model) {
    const { provider: providerType, model, baseUrl: overrideBaseUrl } = summarizerOverride;

    const tempAgent = {
      config: {
        provider: providerType,
        model,
        baseUrl: overrideBaseUrl,
        temperature: 0.3,
        topP: 1,
        maxTokens: 2048,
        presencePenalty: 0,
        frequencyPenalty: 0,
      },
    } as Agent;

    if (providerType === 'lovable') {
      const result = await callLovableAI(model, system, history, tempAgent);
      content = result.content;
    } else if (hasCloudBackendForProvider(providerType)) {
      // Route through edge function (user keys stored server-side)
      const baseUrl = overrideBaseUrl || getDefaultBaseUrl(providerType);
      const result = await callViaEdgeFunction(providerType, model, system, history, tempAgent, undefined, undefined, baseUrl || undefined);
      content = result.content;
    } else {
      const provider = findProvider(providerType, overrideBaseUrl);
      if (providerType === 'anthropic') {
        if (!provider?.apiKey) throw new Error('No Anthropic API key configured.');
        const result = await callAnthropic(provider.apiKey, model, system, history, tempAgent);
        content = result.content;
      } else if (providerType === 'gemini') {
        if (!provider?.apiKey) throw new Error('No Gemini API key configured.');
        const result = await callGemini(provider.apiKey, model, system, history, tempAgent);
        content = result.content;
      } else {
        const baseUrl = overrideBaseUrl || getDefaultBaseUrl(providerType) || '';
        if (!baseUrl) throw new Error(`No base URL configured for provider "${providerType}".`);
        const result = await callOpenAICompatible(provider?.apiKey || '', baseUrl, model, system, history, tempAgent);
        content = result.content;
      }
    }
    usedModel = model;
    usedProvider = providerType;
  } else {
    // Default: use first active configured provider, fall back to Lovable AI
    const sel = getDefaultLlmSelection();
    const tempAgent = {
      config: {
        provider: sel.provider,
        model: sel.model,
        baseUrl: sel.baseUrl,
        temperature: 0.3,
        topP: 1,
        maxTokens: 2048,
        presencePenalty: 0,
        frequencyPenalty: 0,
      },
    } as Agent;

    if (sel.provider === 'lovable') {
      const result = await callLovableAI(sel.model, system, history, tempAgent);
      content = result.content;
    } else if (hasCloudBackendForProvider(sel.provider)) {
      const baseUrl = sel.baseUrl || getDefaultBaseUrl(sel.provider);
      const result = await callViaEdgeFunction(sel.provider, sel.model, system, history, tempAgent, undefined, undefined, baseUrl || undefined);
      content = result.content;
    } else if (sel.provider === 'anthropic') {
      const provider = findProvider('anthropic', sel.baseUrl);
      if (!provider?.apiKey) throw new Error('No Anthropic API key configured.');
      const result = await callAnthropic(provider.apiKey, sel.model, system, history, tempAgent);
      content = result.content;
    } else if (sel.provider === 'gemini') {
      const provider = findProvider('gemini', sel.baseUrl);
      if (!provider?.apiKey) throw new Error('No Gemini API key configured.');
      const result = await callGemini(provider.apiKey, sel.model, system, history, tempAgent);
      content = result.content;
    } else {
      const baseUrl = sel.baseUrl || getDefaultBaseUrl(sel.provider) || '';
      const provider = findProvider(sel.provider, baseUrl);
      const result = await callOpenAICompatible(provider?.apiKey || '', baseUrl, sel.model, system, history, tempAgent);
      content = result.content;
    }
    usedModel = sel.model;
    usedProvider = sel.provider;
  }

  return {
    content,
    latencyMs: Math.round(performance.now() - start),
    model: usedModel,
    provider: usedProvider,
  };
}

function hasCloudBackendForProvider(provider: string): boolean {
  return !!import.meta.env.VITE_SUPABASE_URL;
}

function getDefaultBaseUrl(provider: string): string {
  switch (provider) {
    case 'openai': return 'https://api.openai.com/v1';
    case 'ollama': return 'http://localhost:11434/v1';
    default: return '';
  }
}
