import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Download, Upload, Copy, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Agent, AgentConfig, LLMProvider } from '@/types';
import { getAgents, upsertAgent, deleteAgent, generateId, getProviders } from '@/lib/store';
import { detectOllamaModels, OllamaModel } from '@/lib/ollama';
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

const DEFAULT_CONFIG: AgentConfig = {
  provider: 'openai',
  model: 'gpt-4',
  temperature: 0.7,
  topP: 1,
  maxTokens: 2048,
  presencePenalty: 0,
  frequencyPenalty: 0,
};

const PROVIDERS: { value: LLMProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'azure', label: 'Azure OpenAI' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'custom', label: 'Custom Endpoint' },
];

function AgentEditor({ agent, onSave, onClose }: { agent: Agent | null; onSave: (a: Agent) => void; onClose: () => void }) {
  const [form, setForm] = useState<Agent>(
    agent || {
      id: generateId(),
      name: '',
      role: '',
      domain: '',
      pointOfView: '',
      systemPrompt: '',
      styleVoice: '',
      config: { ...DEFAULT_CONFIG },
      colorIndex: Math.floor(Math.random() * 6),
      memoryEnabled: true,
      skills: [],
      permissions: { webSearch: false, fileRead: false, fileWrite: false, codeExecution: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);

  useEffect(() => {
    if (form.config.provider === 'ollama') {
      setOllamaLoading(true);
      const providers = getProviders();
      const ollamaProvider = providers.find(p => p.provider === 'ollama' && p.isActive);
      const baseUrl = form.config.baseUrl || ollamaProvider?.baseUrl || 'http://localhost:11434';
      detectOllamaModels(baseUrl).then(models => {
        setOllamaModels(models);
        setOllamaLoading(false);
      });
    } else {
      setOllamaModels([]);
    }
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
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Model Configuration</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Provider</Label>
              <Select value={form.config.provider} onValueChange={v => updateConfig({ provider: v as LLMProvider })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Model</Label>
              {form.config.provider === 'ollama' && ollamaModels.length > 0 ? (
                <Select value={form.config.model} onValueChange={v => updateConfig({ model: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {ollamaModels.map(m => (
                      <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : form.config.provider === 'ollama' && ollamaLoading ? (
                <div className="flex items-center gap-2 h-10 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Detecting models...
                </div>
              ) : (
                <Input value={form.config.model} onChange={e => updateConfig({ model: e.target.value })} placeholder="gpt-4" />
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

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editAgent, setEditAgent] = useState<Agent | null | undefined>(undefined); // undefined = closed
  const { toast } = useToast();

  const refresh = () => setAgents(getAgents());
  useEffect(refresh, []);

  const handleSave = (agent: Agent) => {
    upsertAgent(agent);
    setEditAgent(undefined);
    refresh();
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
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editAgent !== undefined} onOpenChange={(open) => !open && setEditAgent(undefined)}>
        {editAgent !== undefined && (
          <AgentEditor agent={editAgent} onSave={handleSave} onClose={() => setEditAgent(undefined)} />
        )}
      </Dialog>
    </div>
  );
}
