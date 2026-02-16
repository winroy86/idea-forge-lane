import { Agent, Message, ProviderConfig, RoomDocument, SummarizerAction } from '@/types';
import { getProviders } from '@/lib/store';

interface LLMResponse {
  content: string;
  innerThoughts?: string;
  tokensUsed?: number;
  latencyMs: number;
  model: string;
  provider: string;
}

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

function buildSystemMessage(agent: Agent, documents: RoomDocument[] = []): string {
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
  prompt += `\nKeep your responses concise and focused. You are participating in a multi-agent brainstorming session.`;
  return prompt;
}

function buildChatMessages(agent: Agent, messages: Message[], allAgents: Agent[], documents: RoomDocument[] = []) {
  const system = buildSystemMessage(agent, documents);
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

// ---- Lovable AI (via edge function) ----

async function callLovableAI(
  model: string,
  system: string,
  history: { role: string; content: string }[],
  agent: Agent,
): Promise<{ content: string; usage?: { total_tokens?: number } }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Cloud not configured. Please check your setup.');

  const res = await fetch(`${supabaseUrl}/functions/v1/agent-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      model: model || 'google/gemini-3-flash-preview',
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
    try {
      const parsed = JSON.parse(err);
      throw new Error(parsed.error || `Lovable AI error (${res.status})`);
    } catch (e) {
      if (e instanceof Error && e.message !== `Unexpected token`) throw e;
      throw new Error(`Lovable AI error (${res.status}): ${err}`);
    }
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content || 'No response',
    usage: data.usage,
  };
}

// ---- Main entry point ----

export async function callAgent(
  agent: Agent,
  messages: Message[],
  allAgents: Agent[],
  documents: RoomDocument[] = [],
): Promise<LLMResponse> {
  if (agent.config.provider !== 'lovable') {
    const provider = findProvider(agent.config.provider, agent.config.baseUrl);
    if (!provider) {
      throw new Error(`No active provider configured for "${agent.config.provider}". Go to Providers to add an API key.`);
    }
  }

  const { system, history } = buildChatMessages(agent, messages, allAgents, documents);
  const start = performance.now();

  // --- Pass 1: Inner reasoning (chain of thought) ---
  const thinkingSystem = `${system}

IMPORTANT: You are now in your PRIVATE THINKING mode. The other agents CANNOT see this.
Analyze the conversation so far and any reference documents.
Think through:
1. What are the key points being discussed?
2. What's your unique perspective given your expertise?
3. What are the strengths and weaknesses of other agents' arguments?
4. What insights from the documents (if any) are relevant?
5. What's your strategy for your response?

Be honest and analytical in your thinking. This is your private space.`;

  const thinkingAgent = { ...agent, config: { ...agent.config, maxTokens: Math.min(agent.config.maxTokens, 1024) } };

  let innerThoughts = '';
  let tokensUsed: number | undefined;

  // Only do inner thoughts if there's conversation context or documents
  if (messages.length > 0 || documents.length > 0) {
    const thinkResult = await callProviderRaw(thinkingAgent, thinkingSystem, history);
    innerThoughts = thinkResult.content;
    tokensUsed = thinkResult.tokensUsed;
  }

  // --- Pass 2: Public response (what the agent says to the group) ---
  const responseHistory = innerThoughts
    ? [
        ...history,
        { role: 'assistant' as const, content: `[My private analysis]: ${innerThoughts}` },
        { role: 'user' as const, content: 'Now provide your PUBLIC response to the group. Be concise and impactful. Do NOT reveal your private thinking process — just share your conclusion and arguments.' },
      ]
    : history;

  const publicResult = await callProviderRaw(agent, system, responseHistory);
  tokensUsed = (tokensUsed || 0) + (publicResult.tokensUsed || 0);

  const latencyMs = Math.round(performance.now() - start);

  return {
    content: publicResult.content,
    innerThoughts: innerThoughts || undefined,
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
): Promise<{ content: string; tokensUsed?: number }> {
  let content = '';
  let tokensUsed: number | undefined;

  switch (agent.config.provider) {
    case 'lovable': {
      const result = await callLovableAI(agent.config.model, system, history, agent);
      content = result.content;
      tokensUsed = result.usage?.total_tokens;
      break;
    }
    case 'anthropic': {
      const provider = findProvider('anthropic')!;
      const result = await callAnthropic(provider.apiKey, agent.config.model, system, history, agent);
      content = result.content;
      tokensUsed = result.usage
        ? (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0)
        : undefined;
      break;
    }
    case 'gemini': {
      const provider = findProvider('gemini')!;
      const result = await callGemini(provider.apiKey, agent.config.model, system, history, agent);
      content = result.content;
      break;
    }
    case 'openai':
    case 'azure':
    case 'ollama':
    case 'custom':
    default: {
      const provider = findProvider(agent.config.provider, agent.config.baseUrl)!;
      const baseUrl =
        agent.config.provider === 'ollama'
          ? (provider.baseUrl || agent.config.baseUrl || 'http://localhost:11434/v1')
          : agent.config.provider === 'azure'
          ? (provider.baseUrl || agent.config.baseUrl || 'https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT')
          : agent.config.provider === 'custom'
          ? (provider.baseUrl || agent.config.baseUrl || '')
          : 'https://api.openai.com/v1';

      if (!baseUrl) throw new Error('No base URL configured for custom provider.');

      const result = await callOpenAICompatible(provider.apiKey, baseUrl, agent.config.model, system, history, agent);
      content = result.content;
      tokensUsed = result.usage?.total_tokens;
      break;
    }
  }

  return { content, tokensUsed };
}

// ---- Summarizer (uses first available provider) ----

export async function callSummarizer(
  action: SummarizerAction,
  messages: Message[],
  allAgents: Agent[],
): Promise<LLMResponse> {
  // Prefer Lovable AI for summarizer (no API key needed)
  const hasLovableCloud = !!import.meta.env.VITE_SUPABASE_URL;
  const providers = getProviders().filter(p => p.isActive);

  if (!hasLovableCloud && providers.length === 0) {
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

  // Try Lovable AI first
  if (hasLovableCloud) {
    const tempAgent = {
      config: {
        provider: 'lovable' as const,
        model: 'google/gemini-3-flash-preview',
        temperature: 0.3,
        topP: 1,
        maxTokens: 2048,
        presencePenalty: 0,
        frequencyPenalty: 0,
      },
    } as Agent;
    const result = await callLovableAI('google/gemini-3-flash-preview', system, history, tempAgent);
    content = result.content;
    usedModel = 'google/gemini-3-flash-preview';
    usedProvider = 'lovable';
  } else {
    const provider = providers[0];
    const tempAgent = {
      config: {
        provider: provider.provider,
        model: provider.provider === 'anthropic' ? 'claude-sonnet-4-20250514' :
               provider.provider === 'gemini' ? 'gemini-2.0-flash' :
               provider.provider === 'openai' ? 'gpt-4o-mini' : 'gpt-4o-mini',
        temperature: 0.3,
        topP: 1,
        maxTokens: 2048,
        presencePenalty: 0,
        frequencyPenalty: 0,
      },
    } as Agent;

    switch (provider.provider) {
      case 'anthropic': {
        const result = await callAnthropic(provider.apiKey, tempAgent.config.model, system, history, tempAgent);
        content = result.content;
        break;
      }
      case 'gemini': {
        const result = await callGemini(provider.apiKey, tempAgent.config.model, system, history, tempAgent);
        content = result.content;
        break;
      }
      default: {
        const baseUrl = provider.provider === 'ollama'
          ? (provider.baseUrl || 'http://localhost:11434/v1')
          : provider.provider === 'custom'
          ? (provider.baseUrl || '')
          : 'https://api.openai.com/v1';
        const result = await callOpenAICompatible(provider.apiKey, baseUrl, tempAgent.config.model, system, history, tempAgent);
        content = result.content;
        break;
      }
    }
    usedModel = tempAgent.config.model;
    usedProvider = provider.provider;
  }

  return {
    content,
    latencyMs: Math.round(performance.now() - start),
    model: usedModel,
    provider: usedProvider,
  };
}
