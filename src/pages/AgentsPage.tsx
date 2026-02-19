import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Download, Upload, Copy, ChevronDown, ChevronUp, Loader2, Sparkles, Search, User, Server, RefreshCw, X, Code, Globe, Plug, Brain, Puzzle, ShieldAlert } from 'lucide-react';
import { Agent, AgentConfig, LLMProvider, McpServerConfig, McpAuthType } from '@/types';
import { getAgents, upsertAgent, deleteAgent, generateId, getProviders } from '@/lib/store';
import { waitForProviderHydration } from '@/lib/providerHydration';
import { getAgentMemories } from '@/lib/agentMemory';
import { detectOllamaModels, OllamaModel } from '@/lib/ollama';
import { getSkills } from '@/lib/skillStore';
import { syncAgent } from '@/lib/usageSync';
import AgentMemoryPanel from '@/components/AgentMemoryPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { supabase, hasSupabaseConfig } from '@/integrations/supabase/client';
import { DEFAULT_MODELS, getDefaultLlmSelection } from '@/lib/providerSelection';
import { fetchModelPolicy, filterModelsByPolicy, AllowedModel } from '@/lib/modelPolicy';
import { useAdminRole } from '@/lib/useAdminRole';

const FAMOUS_SUGGESTIONS = [
  'Elon Musk', 'Steve Jobs', 'Albert Einstein', 'Nikola Tesla',
  'Marie Curie', 'Socrates', 'Sun Tzu', 'Warren Buffett',
  'Leonardo da Vinci', 'Cleopatra', 'Marcus Aurelius', 'Ada Lovelace',
  'Richard Feynman', 'Oprah Winfrey', 'Machiavelli', 'Carl Sagan',
];

function getDefaultConfig(): AgentConfig {
  const selection = getDefaultLlmSelection();
  return {
    provider: selection.provider,
    model: selection.model,
    temperature: 0.7,
    topP: 1,
    maxTokens: 2048,
    presencePenalty: 0,
    frequencyPenalty: 0,
    ...(selection.baseUrl ? { baseUrl: selection.baseUrl } : {}),
  };
}

const LOVABLE_MODELS = [
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (Fast)' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (Powerful)' },
  { value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro' },
  { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano (Fast)' },
  { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'openai/gpt-5', label: 'GPT-5 (Powerful)' },
];

// Preset model lists for providers that have well-known models
const PROVIDER_PRESET_MODELS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { value: 'o1', label: 'o1 (Reasoning)' },
    { value: 'o1-mini', label: 'o1 Mini' },
    { value: 'o3-mini', label: 'o3 Mini' },
  ],
  anthropic: [
    { value: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (Fast)' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-haiku-3-20240307', label: 'Claude Haiku 3 (Fast)' },
  ],
  gemini: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ],
  azure: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-35-turbo', label: 'GPT-3.5 Turbo' },
  ],
};

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  lovable: '⚡ Lovable AI',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  azure: 'Azure OpenAI',
  ollama: 'Ollama',
  custom: 'Custom',
};

// Returns [lovable entry] + all user-configured active providers
function getConfiguredProviderOptions() {
  const configured = getProviders().filter(p => p.isActive);
  return [
    { id: '__lovable__', provider: 'lovable' as LLMProvider, label: '⚡ Lovable AI', baseUrl: undefined, apiKey: undefined },
    ...configured.map(p => ({
      id: p.id,
      provider: p.provider,
      label: p.label || PROVIDER_DISPLAY_NAMES[p.provider] || p.provider,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
    })),
  ];
}

function AgentEditor({ agent, onSave, onClose, policy, isAdmin }: { agent: Agent | null; onSave: (a: Agent) => void; onClose: () => void; policy: AllowedModel[]; isAdmin: boolean }) {
  const [form, setForm] = useState<Agent>(
    agent || {
      id: generateId(),
      name: '',
      role: '',
      domain: '',
      pointOfView: '',
      systemPrompt: '',
      styleVoice: '',
      config: { ...getDefaultConfig() },
      colorIndex: Math.floor(Math.random() * 6),
      memoryEnabled: true,
      researchLoops: 0,
      memoryScopeDefault: 'both',
      skills: [],
      mcpServers: [],
      permissions: { webSearch: false, fileRead: false, fileWrite: false, codeExecution: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpDiscovering, setMcpDiscovering] = useState(false);
  const [mcpAuthType, setMcpAuthType] = useState<McpAuthType>('none');
  const [mcpAuthToken, setMcpAuthToken] = useState('');
  const [mcpAuthHeader, setMcpAuthHeader] = useState('');
  const [configuredProviders, setConfiguredProviders] = useState(() => getConfiguredProviderOptions());

  // Filter preset models by policy (admins bypass)
  const getFilteredPresetModels = (provider: string, models: { value: string; label: string }[]) => {
    if (isAdmin) return models;
    return filterModelsByPolicy(models, provider, policy);
  };

  // Preset models for the selected provider (null = use text input)
  const presetModels = form.config.provider !== 'lovable' && form.config.provider !== 'ollama'
    ? getFilteredPresetModels(form.config.provider, PROVIDER_PRESET_MODELS[form.config.provider] ?? null)
    : null;

  useEffect(() => {
    let cancelled = false;

    const loadOllamaModels = async () => {
      if (form.config.provider !== 'ollama') {
        setOllamaModels([]);
        return;
      }

      setOllamaLoading(true);
      await waitForProviderHydration();

      const providers = getProviders();
      const ollamaProvider = providers.find(p => p.provider === 'ollama' && p.isActive);
      const baseUrl = form.config.baseUrl || ollamaProvider?.baseUrl || 'http://localhost:11434';
      const models = await detectOllamaModels(baseUrl);

      if (!cancelled) {
        setOllamaModels(models);
        setOllamaLoading(false);
      }
    };

    loadOllamaModels().catch(() => {
      if (!cancelled) {
        setOllamaModels([]);
        setOllamaLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [form.config.provider, form.config.baseUrl]);

  const update = (patch: Partial<Agent>) => setForm(prev => ({ ...prev, ...patch }));
  const updateConfig = (patch: Partial<AgentConfig>) =>
    setForm(prev => ({ ...prev, config: { ...prev.config, ...patch } }));

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave({ ...form, updatedAt: new Date().toISOString() });
  };

  return (
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{agent ? 'Edit Agent' : 'Create Agent'}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 pt-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={e => update({ name: e.target.value })} placeholder="Dr. Strategy" />
          </div>
          <div>
            <Label>Role</Label>
            <Input value={form.role} onChange={e => update({ role: e.target.value })} placeholder="Strategic Advisor" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Domain</Label>
            <Input value={form.domain} onChange={e => update({ domain: e.target.value })} placeholder="Business Strategy" />
          </div>
          <div>
            <Label>Point of View</Label>
            <Input value={form.pointOfView} onChange={e => update({ pointOfView: e.target.value })} placeholder="Conservative" />
          </div>
        </div>
        <div>
          <Label>System Prompt</Label>
          <Textarea value={form.systemPrompt} onChange={e => update({ systemPrompt: e.target.value })} rows={4} placeholder="You are a strategic advisor who..." />
        </div>
        <div>
          <Label>Style / Voice</Label>
          <Input value={form.styleVoice} onChange={e => update({ styleVoice: e.target.value })} placeholder="Formal, analytical, data-driven" />
        </div>

        {/* LLM Config */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Model Configuration</p>
            {!isAdmin && policy.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-destructive/80 bg-destructive/10 border border-destructive/20 rounded px-1.5 py-0.5">
                <ShieldAlert className="h-2.5 w-2.5" /> Admin-restricted
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Provider</Label>
              <Select
                value={
                  form.config.provider === 'lovable'
                    ? '__lovable__'
                    : configuredProviders.find(p => p.provider === form.config.provider && (p.baseUrl === form.config.baseUrl || !p.baseUrl))?.id || form.config.provider
                }
                onValueChange={v => {
                  if (v === '__lovable__') {
                    updateConfig({ provider: 'lovable', model: LOVABLE_MODELS[0].value, baseUrl: undefined });
                  } else {
                    const picked = configuredProviders.find(p => p.id === v);
                    if (!picked) return;
                    const defaultModel = DEFAULT_MODELS[picked.provider] || '';
                    updateConfig({ provider: picked.provider, model: defaultModel, baseUrl: picked.baseUrl });
                  }
                  setConfiguredProviders(getConfiguredProviderOptions());
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {configuredProviders.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Model</Label>
              {form.config.provider === 'lovable' ? (
                <Select value={form.config.model} onValueChange={v => updateConfig({ model: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a model" /></SelectTrigger>
                  <SelectContent>
                    {getFilteredPresetModels('lovable', LOVABLE_MODELS).map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : form.config.provider === 'ollama' && ollamaLoading ? (
                <div className="flex items-center gap-2 h-10 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Detecting models...
                </div>
              ) : form.config.provider === 'ollama' && ollamaModels.length > 0 ? (
                <Select value={form.config.model} onValueChange={v => updateConfig({ model: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a model" /></SelectTrigger>
                  <SelectContent>
                    {ollamaModels.map(m => (
                      <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : presetModels ? (
                <Select
                  value={form.config.model}
                  onValueChange={v => updateConfig({ model: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select a model" /></SelectTrigger>
                  <SelectContent>
                    {presetModels.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                    {/* Allow custom entry if the current model isn't in the list */}
                    {form.config.model && !presetModels.find(m => m.value === form.config.model) && (
                      <SelectItem value={form.config.model}>{form.config.model} (custom)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={form.config.model} onChange={e => updateConfig({ model: e.target.value })} placeholder="e.g. gpt-4o-mini" />
              )}
            </div>
          </div>
          {(form.config.provider === 'custom' || form.config.provider === 'ollama') && (
            <div className="mt-3">
              <Label>Base URL</Label>
              <Input value={form.config.baseUrl || ''} onChange={e => updateConfig({ baseUrl: e.target.value })} placeholder="http://localhost:11434" />
            </div>
          )}
          <div className="mt-3">
            <Label>Temperature: {form.config.temperature.toFixed(2)}</Label>
            <Slider value={[form.config.temperature]} onValueChange={([v]) => updateConfig({ temperature: v })} min={0} max={2} step={0.01} />
          </div>
          <div className="mt-3">
            <Label>Max Tokens: {form.config.maxTokens}</Label>
            <Slider value={[form.config.maxTokens]} onValueChange={([v]) => updateConfig({ maxTokens: v })} min={64} max={16384} step={64} />
          </div>
        </div>

        {/* Advanced */}
        <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Advanced Settings
        </button>
        {showAdvanced && (
          <div className="space-y-3 border border-border rounded-md p-3">
            <div>
              <Label>Top P: {form.config.topP.toFixed(2)}</Label>
              <Slider value={[form.config.topP]} onValueChange={([v]) => updateConfig({ topP: v })} min={0} max={1} step={0.01} />
            </div>
            <div>
              <Label>Presence Penalty: {form.config.presencePenalty.toFixed(2)}</Label>
              <Slider value={[form.config.presencePenalty]} onValueChange={([v]) => updateConfig({ presencePenalty: v })} min={-2} max={2} step={0.01} />
            </div>
            <div>
              <Label>Frequency Penalty: {form.config.frequencyPenalty.toFixed(2)}</Label>
              <Slider value={[form.config.frequencyPenalty]} onValueChange={([v]) => updateConfig({ frequencyPenalty: v })} min={-2} max={2} step={0.01} />
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Permissions</p>
              <div className="space-y-2">
                {(['webSearch', 'fileRead', 'fileWrite', 'codeExecution'] as const).map(perm => (
                  <div key={perm} className="flex items-center justify-between">
                    <Label className="text-xs capitalize">{perm.replace(/([A-Z])/g, ' $1')}</Label>
                    <Switch
                      checked={form.permissions[perm]}
                      onCheckedChange={v => update({ permissions: { ...form.permissions, [perm]: v } })}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <Label className="text-xs">Long-term Memory</Label>
              <Switch checked={form.memoryEnabled} onCheckedChange={v => update({ memoryEnabled: v })} />
            </div>
            {form.memoryEnabled && (
              <>
                <div className="mt-2">
                  <Label className="text-xs">Research Loops: {form.researchLoops || 0}</Label>
                  <p className="text-[10px] text-muted-foreground mb-1">Private research iterations before each public response</p>
                  <Slider value={[form.researchLoops || 0]} onValueChange={([v]) => update({ researchLoops: v })} min={0} max={5} step={1} />
                </div>
                <div className="mt-2">
                  <Label className="text-xs">Memory Scope Default</Label>
                  <Select value={form.memoryScopeDefault || 'both'} onValueChange={v => update({ memoryScopeDefault: v as any })}>
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global (carry across rooms)</SelectItem>
                      <SelectItem value="local">Local (fresh per room)</SelectItem>
                      <SelectItem value="both">Both (global + local)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* MCP Servers */}
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Server className="h-3 w-3" /> MCP Servers
              </p>
              <p className="text-[10px] text-muted-foreground mb-2">Connect external tool servers via Model Context Protocol</p>
              
              {(form.mcpServers || []).map((mcp) => (
                <div key={mcp.id} className="mb-2 rounded border border-border p-2 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{mcp.name || mcp.url}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{mcp.url}</p>
                      {mcp.tools.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {mcp.tools.map(t => (
                            <span key={t} className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] text-accent">{t}</span>
                          ))}
                        </div>
                      )}
                      {mcp.authType && mcp.authType !== 'none' && (
                        <p className="text-[9px] text-muted-foreground mt-1">🔑 {mcp.authType === 'bearer' ? 'Bearer Token' : `API Key (${mcp.authHeader || 'Authorization'})`}</p>
                      )}
                    </div>
                    <Switch
                      checked={mcp.enabled}
                      onCheckedChange={v => {
                        const servers = (form.mcpServers || []).map(s => s.id === mcp.id ? { ...s, enabled: v } : s);
                        update({ mcpServers: servers });
                      }}
                    />
                    <button
                      onClick={() => update({ mcpServers: (form.mcpServers || []).filter(s => s.id !== mcp.id) })}
                      className="text-muted-foreground hover:text-destructive p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={mcpUrl}
                    onChange={e => setMcpUrl(e.target.value)}
                    placeholder="https://mcp-server.example.com/mcp"
                    className="h-7 text-xs flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={!mcpUrl.trim() || mcpDiscovering}
                    onClick={async () => {
                      setMcpDiscovering(true);
                      try {
                        const toolNames: string[] = [];
                        let serverName = new URL(mcpUrl).hostname;

                        // Build auth headers based on selected auth type
                        const authHeaders: Record<string, string> = {};
                        if (mcpAuthType === 'bearer' && mcpAuthToken) {
                          authHeaders['Authorization'] = `Bearer ${mcpAuthToken}`;
                        } else if (mcpAuthType === 'api-key' && mcpAuthToken) {
                          const headerName = mcpAuthHeader || 'Authorization';
                          authHeaders[headerName] = mcpAuthToken;
                        }

                        try {
                          const baseHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', ...authHeaders };
                          const initRes = await fetch(mcpUrl, {
                            method: 'POST',
                            headers: baseHeaders,
                            body: JSON.stringify({
                              jsonrpc: '2.0', id: 1, method: 'initialize',
                              params: {
                                protocolVersion: '2025-03-26',
                                capabilities: {},
                                clientInfo: { name: 'AgentStudio', version: '1.0.0' },
                              },
                            }),
                            signal: AbortSignal.timeout(10000),
                          });

                          let sessionId: string | null = null;
                          if (initRes.ok) {
                            sessionId = initRes.headers.get('mcp-session-id');
                            const initData = await initRes.json();
                            if (initData.result?.serverInfo?.name) {
                              serverName = initData.result.serverInfo.name;
                            }

                            const notifHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...authHeaders };
                            if (sessionId) notifHeaders['mcp-session-id'] = sessionId;
                            await fetch(mcpUrl, {
                              method: 'POST',
                              headers: notifHeaders,
                              body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
                              signal: AbortSignal.timeout(5000),
                            }).catch(() => {});

                            const listHeaders: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', ...authHeaders };
                            if (sessionId) listHeaders['mcp-session-id'] = sessionId;
                            const res = await fetch(mcpUrl, {
                              method: 'POST',
                              headers: listHeaders,
                              body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
                              signal: AbortSignal.timeout(10000),
                            });
                            if (res.ok) {
                              const contentType = res.headers.get('content-type') || '';
                              let data: any;
                              if (contentType.includes('text/event-stream')) {
                                const text = await res.text();
                                const lines = text.split('\n');
                                for (const line of lines) {
                                  if (line.startsWith('data: ')) {
                                    try { data = JSON.parse(line.slice(6)); } catch {}
                                  }
                                }
                              } else {
                                data = await res.json();
                              }
                              if (data?.result?.tools) {
                                for (const t of data.result.tools) {
                                  toolNames.push(t.name);
                                }
                              }
                            }
                          }
                        } catch {
                          // Discovery failed, still add the server
                        }
                        const newServer: McpServerConfig = {
                          id: generateId(),
                          name: serverName,
                          url: mcpUrl.trim(),
                          tools: toolNames,
                          enabled: true,
                          authType: mcpAuthType,
                          authToken: mcpAuthToken || undefined,
                          authHeader: mcpAuthType === 'api-key' && mcpAuthHeader ? mcpAuthHeader : undefined,
                        };
                        update({ mcpServers: [...(form.mcpServers || []), newServer] });
                        setMcpUrl('');
                        setMcpAuthType('none');
                        setMcpAuthToken('');
                        setMcpAuthHeader('');
                      } catch {
                        // Invalid URL
                      } finally {
                        setMcpDiscovering(false);
                      }
                    }}
                  >
                    {mcpDiscovering ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    Add
                  </Button>
                </div>

                {/* Auth configuration */}
                <div className="flex gap-2 items-center">
                  <Select value={mcpAuthType} onValueChange={v => setMcpAuthType(v as McpAuthType)}>
                    <SelectTrigger className="h-7 text-[10px] w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Auth</SelectItem>
                      <SelectItem value="bearer">Bearer Token</SelectItem>
                      <SelectItem value="api-key">API Key</SelectItem>
                    </SelectContent>
                  </Select>
                  {mcpAuthType !== 'none' && (
                    <Input
                      value={mcpAuthToken}
                      onChange={e => setMcpAuthToken(e.target.value)}
                      type="password"
                      placeholder={mcpAuthType === 'bearer' ? 'Bearer token…' : 'API key value…'}
                      className="h-7 text-xs flex-1"
                    />
                  )}
                  {mcpAuthType === 'api-key' && (
                    <Input
                      value={mcpAuthHeader}
                      onChange={e => setMcpAuthHeader(e.target.value)}
                      placeholder="Header (default: Authorization)"
                      className="h-7 text-xs w-36"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Skills Assignment */}
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Puzzle className="h-3 w-3" /> Skills
              </p>
              <p className="text-[10px] text-muted-foreground mb-2">Assign workflow skills to this agent</p>
              {(() => {
                const allSkills = getSkills();
                if (allSkills.length === 0) return (
                  <p className="text-[10px] text-muted-foreground italic">No skills installed. Go to Skills page to add some.</p>
                );
                return (
                  <div className="space-y-1.5">
                    {allSkills.map(skill => {
                      const isAssigned = (form.skills || []).includes(skill.id);
                      const missingPerms = skill.requiredPermissions.filter(p => !form.permissions[p]);
                      return (
                        <label key={skill.id} className="flex items-center gap-2 rounded p-1.5 hover:bg-muted/30 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isAssigned}
                            onChange={e => {
                              const skills = e.target.checked
                                ? [...(form.skills || []), skill.id]
                                : (form.skills || []).filter(s => s !== skill.id);
                              update({ skills });
                            }}
                            className="rounded border-border"
                          />
                          <span className="text-sm">{skill.icon}</span>
                          <span className="text-xs text-foreground flex-1">{skill.name}</span>
                          {missingPerms.length > 0 && (
                            <span className="text-[9px] text-muted-foreground" title={`Missing: ${missingPerms.join(', ')}`}>
                              ⚠️ needs {missingPerms.join(', ')}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} className="flex-1" disabled={!form.name.trim()}>Save Agent</Button>
        </div>
      </div>
    </DialogContent>
  );
}

function PersonaGenerator({ onGenerated, onClose, policy, isAdmin }: { onGenerated: (agent: Agent) => void; onClose: () => void; policy: AllowedModel[]; isAdmin: boolean }) {
  const [mode, setMode] = useState<'famous' | 'custom'>('famous');
  const [personName, setPersonName] = useState('');
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [personaProviders] = useState(() => getConfiguredProviderOptions());
  // Default to first configured non-lovable provider, or lovable
  const [selectedProviderId, setSelectedProviderId] = useState<string>(() => {
    const opts = getConfiguredProviderOptions();
    const nonLovable = opts.find(p => p.id !== '__lovable__');
    return nonLovable?.id || '__lovable__';
  });
  const [personaModel, setPersonaModel] = useState<string>(() => {
    const opts = getConfiguredProviderOptions();
    const nonLovable = opts.find(p => p.id !== '__lovable__');
    return nonLovable ? (DEFAULT_MODELS[nonLovable.provider] || '') : LOVABLE_MODELS[0].value;
  });
  const { toast } = useToast();

  const selectedProviderObj = personaProviders.find(p => p.id === selectedProviderId);

  const filteredSuggestions = FAMOUS_SUGGESTIONS.filter(name =>
    name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const generate = async () => {
    if (mode === 'famous' && !personName.trim()) return;
    if (mode === 'custom' && !description.trim()) return;

    if (!supabase || !hasSupabaseConfig) {
      toast({
        title: 'Persona generation unavailable',
        description: 'Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to enable this feature.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    try {
      // Build llm selection from chosen provider
      let llm: { provider: string; model: string; apiKey?: string; baseUrl?: string };
      if (selectedProviderId === '__lovable__' || !selectedProviderObj) {
        llm = { provider: 'lovable', model: personaModel || LOVABLE_MODELS[0].value };
      } else {
        llm = {
          provider: selectedProviderObj.provider,
          model: personaModel || DEFAULT_MODELS[selectedProviderObj.provider] || '',
          baseUrl: selectedProviderObj.baseUrl,
        };
      }

      const { data, error } = await supabase.functions.invoke('generate-persona', {
        body: mode === 'famous'
          ? { personName: personName.trim(), description: description.trim(), llm }
          : { description: description.trim(), llm },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const persona = data.persona;
      const agent: Agent = {
        id: generateId(),
        name: persona.name,
        role: persona.role,
        domain: persona.domain,
        pointOfView: persona.pointOfView,
        systemPrompt: persona.systemPrompt,
        styleVoice: persona.styleVoice,
        config: { ...getDefaultConfig() },
        colorIndex: Math.floor(Math.random() * 6),
        memoryEnabled: true,
        researchLoops: 0,
        memoryScopeDefault: 'both',
        skills: [],
        mcpServers: [],
        permissions: { webSearch: false, fileRead: false, fileWrite: false, codeExecution: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      onGenerated(agent);
      toast({ title: `✨ ${persona.name} persona created!` });
    } catch (err: any) {
      toast({ title: 'Generation failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          Auto Persona Generator
        </DialogTitle>
        <DialogDescription>
          Clone a famous person or generate a custom persona using AI deep research.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 pt-2">
        {/* Mode tabs */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setMode('famous')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              mode === 'famous' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="h-4 w-4" /> Clone Famous Person
          </button>
          <button
            onClick={() => setMode('custom')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              mode === 'custom' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="h-4 w-4" /> Custom Persona
          </button>
        </div>

        {mode === 'famous' ? (
          <>
            <div>
              <Label>Person Name</Label>
              <Input
                value={personName}
                onChange={e => setPersonName(e.target.value)}
                placeholder="e.g. Elon Musk, Socrates, Marie Curie..."
              />
            </div>

            {/* Quick suggestions */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Label className="text-xs text-muted-foreground">Quick picks</Label>
                <Input
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                  placeholder="Filter..."
                  className="h-6 text-xs w-32"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {filteredSuggestions.map(name => (
                  <button
                    key={name}
                    onClick={() => setPersonName(name)}
                    className={`rounded-full px-2.5 py-1 text-xs border transition-colors ${
                      personName === name
                        ? 'bg-accent text-accent-foreground border-accent'
                        : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Focus area <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. their views on AI, their leadership style..."
              />
            </div>
          </>
        ) : (
          <div>
            <Label>Describe your persona</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="e.g. A cynical venture capitalist who's seen every pitch fail, speaks in startup jargon but is secretly a poet..."
            />
          </div>
        )}

        {/* Provider & Model selection */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">AI Provider for generation</p>
            {!isAdmin && policy.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-destructive/80 bg-destructive/10 border border-destructive/20 rounded px-1.5 py-0.5">
                <ShieldAlert className="h-2.5 w-2.5" /> Admin-restricted
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">Provider</Label>
              <Select
                value={selectedProviderId}
                onValueChange={v => {
                  setSelectedProviderId(v);
                  const picked = personaProviders.find(p => p.id === v);
                  if (picked) {
                    setPersonaModel(
                      picked.id === '__lovable__'
                        ? LOVABLE_MODELS[0].value
                        : DEFAULT_MODELS[picked.provider] || ''
                    );
                  }
                }}
              >
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {personaProviders.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Model</Label>
              {selectedProviderId === '__lovable__' ? (
                <Select value={personaModel} onValueChange={setPersonaModel}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(isAdmin ? LOVABLE_MODELS : filterModelsByPolicy(LOVABLE_MODELS, 'lovable', policy)).map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (['ollama', 'custom'].includes(selectedProviderObj?.provider || '')) ? (
                <Input
                  className="mt-1 h-8 text-xs"
                  value={personaModel}
                  onChange={e => setPersonaModel(e.target.value)}
                  placeholder={DEFAULT_MODELS[selectedProviderObj?.provider || 'openai'] || 'model name'}
                />
              ) : (
                <Select value={personaModel} onValueChange={setPersonaModel}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(isAdmin
                      ? (PROVIDER_PRESET_MODELS[selectedProviderObj?.provider || ''] || [])
                      : filterModelsByPolicy(PROVIDER_PRESET_MODELS[selectedProviderObj?.provider || ''] || [], selectedProviderObj?.provider || '', policy)
                    ).map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>

        {/* Generate animation */}
        {isGenerating && (
          <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {mode === 'famous' ? `Researching ${personName}...` : 'Generating persona...'}
              </p>
              <p className="text-xs text-muted-foreground">AI is analyzing communication style, beliefs, and expertise</p>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            onClick={generate}
            className="flex-1 gap-1.5"
            disabled={isGenerating || (mode === 'famous' ? !personName.trim() : !description.trim())}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isGenerating ? 'Generating...' : 'Generate Persona'}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editAgent, setEditAgent] = useState<Agent | null | undefined>(undefined);
  const [showGenerator, setShowGenerator] = useState(false);
  const [memoryPanelAgent, setMemoryPanelAgent] = useState<Agent | null>(null);
  const [modelPolicy, setModelPolicy] = useState<AllowedModel[]>([]);
  const { isAdmin } = useAdminRole();
  const { toast } = useToast();

  const refresh = () => setAgents(getAgents());
  useEffect(refresh, []);

  useEffect(() => {
    fetchModelPolicy().then(setModelPolicy).catch(() => {});
  }, []);

  const handleSave = (agent: Agent) => {
    upsertAgent(agent);
    setEditAgent(undefined);
    refresh();
    syncAgent(agent);
  };

  const handleDelete = (id: string) => {
    deleteAgent(id);
    refresh();
  };

  const handleExport = () => {
    const json = JSON.stringify(agents, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brainstorm-agents.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target?.result as string) as Agent[];
          imported.forEach(a => upsertAgent({ ...a, id: generateId() }));
          refresh();
          toast({ title: `Imported ${imported.length} agents` });
        } catch {
          toast({ title: 'Invalid JSON file', variant: 'destructive' });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="animate-fade-in p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Agent Library</h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage your brainstorming personas.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleImport} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Import
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5" disabled={agents.length === 0}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowGenerator(true)} className="gap-1.5 border-accent/40 text-accent hover:bg-accent/10">
            <Sparkles className="h-3.5 w-3.5" /> Auto Generate
          </Button>
          <Button size="sm" onClick={() => setEditAgent(null)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Agent
          </Button>
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Plus className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium text-foreground mb-1">No agents yet</h2>
          <p className="text-sm text-muted-foreground mb-6">Create your first agent persona to get started.</p>
          <Button onClick={() => setEditAgent(null)}>Create Agent</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {agents.map((agent) => (
            <div key={agent.id} className="group rounded-lg border border-border bg-card p-4 shadow-soft">
              <div className="flex items-start gap-3">
                <div className={`h-8 w-8 rounded-full bg-agent-${(agent.colorIndex % 6) + 1} flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0`}>
                  {agent.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground">{agent.name}</h3>
                  <p className="text-xs text-muted-foreground">{agent.role}</p>
                  {agent.domain && <p className="text-[10px] text-muted-foreground mt-0.5">{agent.domain} · {agent.pointOfView}</p>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setEditAgent(agent)} className="rounded p-1 text-muted-foreground hover:bg-muted">
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(agent.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground font-mono">
                  {agent.config.provider}/{agent.config.model}
                </span>
                <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  t={agent.config.temperature}
                </span>
                {agent.permissions?.codeExecution && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                    <Code className="h-2.5 w-2.5" /> Code
                  </span>
                )}
                {agent.permissions?.webSearch && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                    <Globe className="h-2.5 w-2.5" /> Web
                  </span>
                )}
                {(agent.mcpServers?.filter(s => s.enabled).length || 0) > 0 && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                    <Plug className="h-2.5 w-2.5" /> MCP ({agent.mcpServers.filter(s => s.enabled).length})
                  </span>
                )}
                {(agent.skills?.length || 0) > 0 && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                    <Puzzle className="h-2.5 w-2.5" /> {agent.skills.length} skill{agent.skills.length > 1 ? 's' : ''}
                  </span>
                )}
                {agent.memoryEnabled && (() => {
                  const allMem = getAgentMemories(agent.id);
                  const st = allMem.filter(f => f.category === 'short-term' || f.category === 'research' || f.category === 'scratch').length;
                  const lt = allMem.filter(f => f.category === 'long-term' || f.category === 'task').length;
                  return (
                    <button
                      onClick={(e) => { e.stopPropagation(); setMemoryPanelAgent(agent); }}
                      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                        st + lt > 0 ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      <Brain className="h-2.5 w-2.5" /> {st + lt > 0 ? `${st}s / ${lt}l` : 'Memory'}
                    </button>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editAgent !== undefined} onOpenChange={(open) => !open && setEditAgent(undefined)}>
        {editAgent !== undefined && (
          <AgentEditor agent={editAgent} onSave={handleSave} onClose={() => setEditAgent(undefined)} policy={modelPolicy} isAdmin={isAdmin} />
        )}
      </Dialog>

      <Dialog open={showGenerator} onOpenChange={setShowGenerator}>
        {showGenerator && (
        <PersonaGenerator
            onGenerated={(agent) => {
              upsertAgent(agent);
              setShowGenerator(false);
              refresh();
            }}
            onClose={() => setShowGenerator(false)}
            policy={modelPolicy}
            isAdmin={isAdmin}
          />
        )}
      </Dialog>

      {/* Memory Panel */}
      {memoryPanelAgent && (
        <AgentMemoryPanel
          agentId={memoryPanelAgent.id}
          agentName={memoryPanelAgent.name}
          onClose={() => { setMemoryPanelAgent(null); refresh(); }}
        />
      )}
    </div>
  );
}
