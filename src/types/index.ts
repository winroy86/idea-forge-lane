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

export type McpAuthType = 'none' | 'bearer' | 'api-key';

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  tools: string[]; // discovered tool names
  enabled: boolean;
  authType: McpAuthType;
  authToken?: string; // bearer token or API key value
  authHeader?: string; // custom header name for api-key auth (default: 'Authorization')
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
  researchLoops: number; // 0-5, number of private research iterations before public response
  memoryScopeDefault: 'global' | 'local' | 'both';
  skills: string[];
  mcpServers: McpServerConfig[];
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
  meetings: MeetingSession[];
  activeMeetingId?: string;
  /** Per-room summarizer override. If not set, falls back to global AppSettings.summarizer. */
  summarizer?: SummarizerSettings;
  createdAt: string;
  updatedAt: string;
}

export type OrchestrationType = 'manual' | 'sequence' | 'loop' | 'auto';

export interface CodeBlockMeta {
  code: string;
  language: string;
  output?: string;
  label?: string;
  context: 'public' | 'inner';
}

export interface Message {
  id: string;
  roomId: string;
  agentId: string | null; // null = user or system
  role: 'user' | 'agent' | 'system' | 'summarizer';
  content: string;
  innerThoughts?: string; // agent's private reasoning (visible to user, not to other agents)
  codeBlocks?: CodeBlockMeta[]; // structured code execution results
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
  apiKey?: string;
  baseUrl?: string;
  isActive: boolean;
  secretStored?: boolean;
}

export type MeetingStatus = 'scheduled' | 'active' | 'wrap-up' | 'ended';

export interface MeetingSession {
  id: string;
  roomId: string;
  topic: string;
  goals: string;
  additionalInfo: string;
  documents: RoomDocument[];
  startTime: string; // ISO
  durationMinutes: number;
  status: MeetingStatus;
  createdAt: string;
}

export interface SummarizerSettings {
  provider: LLMProvider;
  model: string;
  baseUrl?: string;
}

export interface AppSettings {
  summarizer: SummarizerSettings;
}

export interface MeetingContext {
  topic: string;
  goals: string;
  additionalInfo: string;
  timeRemainingMinutes: number;
  totalDurationMinutes: number;
  phase: 'active' | 'wrap-up';
}

export type SummarizerAction = 'summarize' | 'decisions' | 'actionPlan' | 'updateMemory';

export type MemoryCategory = 'long-term' | 'short-term' | 'research' | 'task' | 'scratch';
export type MemoryScope = 'global' | string; // string = roomId

export interface AgentMemoryFile {
  id: string;
  agentId: string;
  scope: MemoryScope;
  filename: string;
  category: MemoryCategory;
  content: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Skills System ----

export type SkillToolHint = 'code_execution' | 'web_search' | 'memory_write' | 'memory_read' | 'mcp_call';
export type SkillPermission = 'webSearch' | 'codeExecution' | 'fileRead' | 'fileWrite';

export interface SkillStep {
  id: string;
  instruction: string;
  toolHint?: SkillToolHint;
  outputKey?: string; // name to store result for later steps
  code?: string; // embedded code to auto-execute
  codeLanguage?: 'javascript' | 'python'; // language of embedded code
  codeMode?: 'auto-execute' | 'reference'; // auto-execute = run and return output; reference = inject into prompt
}

export interface SkillCodeFile {
  filename: string;
  language: 'javascript' | 'python';
  content: string;
  description?: string;
}

export interface SkillInputField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'text';
  description: string;
  required: boolean;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  icon: string; // emoji
  category: string;
  triggers: string[]; // keywords/phrases that activate this skill
  requiredPermissions: SkillPermission[];
  inputSchema: SkillInputField[];
  steps: SkillStep[];
  codeFiles: SkillCodeFile[]; // standalone code files bundled with the skill
  outputFormat: string; // markdown template
  installedAt: string;
  isBuiltIn?: boolean;
}
