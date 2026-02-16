export type LLMProvider = 'lovable' | 'openai' | 'anthropic' | 'gemini' | 'azure' | 'ollama' | 'custom';

export interface AgentConfig {
  provider: LLMProvider;
  model: string;
  baseUrl?: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  presencePenalty: number;
  frequencyPenalty: number;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  domain: string;
  pointOfView: string;
  systemPrompt: string;
  styleVoice: string;
  config: AgentConfig;
  colorIndex: number;
  memoryEnabled: boolean;
  skills: string[];
  permissions: {
    webSearch: boolean;
    fileRead: boolean;
    fileWrite: boolean;
    codeExecution: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface RoomDocument {
  id: string;
  name: string;
  content: string; // text content extracted from the file
  addedAt: string;
}

export interface Room {
  id: string;
  title: string;
  goal: string;
  constraints: string;
  audience: string;
  successCriteria: string;
  agentIds: string[];
  orchestration: OrchestrationType;
  sequenceOrder?: string[];
  loopCount?: number;
  balanceSlider: number; // 0 = realistic debate, 100 = equal participation
  documents: RoomDocument[];
  createdAt: string;
  updatedAt: string;
}

export type OrchestrationType = 'manual' | 'sequence' | 'loop' | 'auto';

export interface Message {
  id: string;
  roomId: string;
  agentId: string | null; // null = user or system
  role: 'user' | 'agent' | 'system' | 'summarizer';
  content: string;
  innerThoughts?: string; // agent's private reasoning (visible to user, not to other agents)
  timestamp: string;
  parentId?: string; // for branching
  metadata?: {
    tokensUsed?: number;
    latencyMs?: number;
    model?: string;
    provider?: string;
  };
}

export interface ProviderConfig {
  id: string;
  provider: LLMProvider;
  label: string;
  apiKey: string;
  baseUrl?: string;
  isActive: boolean;
}

export type SummarizerAction = 'summarize' | 'decisions' | 'actionPlan' | 'updateMemory';
