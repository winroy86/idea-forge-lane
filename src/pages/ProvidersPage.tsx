import { useState, useEffect } from 'react';
import { Plus, Trash2, Eye, EyeOff, ExternalLink, Loader2, CheckCircle2, XCircle, RefreshCw, Sparkles } from 'lucide-react';
import { ProviderConfig, LLMProvider } from '@/types';
import { getProviders, upsertProvider, deleteProvider, generateId, getLocalDevMode, setLocalDevMode } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import { detectOllamaModels, formatModelSize, OllamaModel } from '@/lib/ollama';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PROVIDERS: { value: LLMProvider; label: string; hint: string }[] = [
  { value: 'lovable', label: '⚡ Lovable AI (Built-in)', hint: 'No API key needed' },
  { value: 'openai', label: 'OpenAI', hint: 'sk-...' },
  { value: 'anthropic', label: 'Anthropic', hint: 'sk-ant-...' },
  { value: 'gemini', label: 'Google Gemini', hint: 'AIza...' },
  { value: 'azure', label: 'Azure OpenAI', hint: 'Endpoint key' },
  { value: 'ollama', label: 'Ollama', hint: 'Usually no key needed' },
  { value: 'custom', label: 'Custom', hint: 'API key' },
];

export default function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [open, setOpen] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [newProvider, setNewProvider] = useState<LLMProvider>('openai');
  const [newLabel, setNewLabel] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaDetecting, setOllamaDetecting] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'found' | 'notfound'>('idle');
  const [localDevMode, setLocalDevModeState] = useState<boolean>(getLocalDevMode());

  

  const getEdgeBase = () => import.meta.env.VITE_SUPABASE_URL;

  const getAuthToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  };

  const loadRemoteProviders = async () => {
    const supabaseUrl = getEdgeBase();
    if (!supabaseUrl) return;
    const token = await getAuthToken();
    if (!token) return;
    const res = await fetch(`${supabaseUrl}/functions/v1/provider-secrets`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const mapped = (data.providers || []).map((r: any) => ({
      id: r.id, provider: r.provider, label: r.label, baseUrl: r.base_url || undefined, isActive: r.is_active, secretStored: true,
    }));
    setProviders(mapped);
    mapped.forEach((p: ProviderConfig) => upsertProvider(p));
  };
const detectOllama = async (url?: string) => {
    setOllamaDetecting(true);
    setOllamaStatus('idle');
    const models = await detectOllamaModels(url || newBaseUrl || 'http://localhost:11434');
    setOllamaModels(models);
    setOllamaStatus(models.length > 0 ? 'found' : 'notfound');
    setOllamaDetecting(false);
  };

  useEffect(() => {
    if (newProvider === 'ollama' && open) {
      setNewBaseUrl('http://localhost:11434');
      detectOllama('http://localhost:11434');
    } else {
      setOllamaModels([]);
      setOllamaStatus('idle');
    }
  }, [newProvider, open]);

  const refresh = () => setProviders(getProviders());
  useEffect(() => {
    refresh();
    if (!localDevMode) loadRemoteProviders();
  }, [localDevMode]);

  const handleCreate = async () => {
    const p: ProviderConfig = {
      id: generateId(),
      provider: newProvider,
      label: newLabel.trim() || PROVIDERS.find(p => p.value === newProvider)!.label,
      apiKey: localDevMode ? newKey : undefined,
      secretStored: !localDevMode || undefined,
      baseUrl: newBaseUrl || undefined,
      isActive: true,
    };
    if (!localDevMode && newProvider !== "lovable") {
      const supabaseUrl = getEdgeBase();
      const token = await getAuthToken();
      if (supabaseUrl && token) {
        await fetch(`${supabaseUrl}/functions/v1/provider-secrets`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: p.id, provider: p.provider, label: p.label, baseUrl: p.baseUrl, apiKey: newKey, isActive: true }),
        });
      }
    }
    upsertProvider(p);
    setOpen(false);
    setNewKey('');
    setNewLabel('');
    setNewBaseUrl('');
    refresh();
  };

  return (
    <div className="animate-fade-in p-4 md:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Providers</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage provider references and endpoints. Secrets are server-side unless local-dev mode is enabled.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Local-dev mode</Label>
          <Switch checked={localDevMode} onCheckedChange={(v) => { setLocalDevModeState(v); setLocalDevMode(v); }} />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Provider</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Provider</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Provider</Label>
                <Select value={newProvider} onValueChange={v => setNewProvider(v as LLMProvider)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {newProvider === 'lovable' ? (
                <div className="rounded-md border border-accent/20 bg-accent/5 p-3">
                  <p className="text-xs text-foreground font-medium mb-1">⚡ No API key needed</p>
                  <p className="text-xs text-muted-foreground">Lovable AI is built-in and ready to use. Just create an agent with "Lovable AI" as the provider and start chatting.</p>
                </div>
              ) : (
                <>
                  <div>
                    <Label>Label (optional)</Label>
                    <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="My OpenAI Key" />
                  </div>
                  <div>
                    <Label>{localDevMode ? "API Key (stored in browser)" : "API Key (stored on server)"}</Label>
                    <Input type="password" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder={PROVIDERS.find(p => p.value === newProvider)?.hint} />
                  </div>
                </>
              )}
              {(newProvider === 'custom' || newProvider === 'ollama' || newProvider === 'azure') && (
                <div>
                  <Label>Base URL</Label>
                  <div className="flex gap-2">
                    <Input value={newBaseUrl} onChange={e => setNewBaseUrl(e.target.value)} placeholder="http://localhost:11434" />
                    {newProvider === 'ollama' && (
                      <Button variant="outline" size="icon" onClick={() => detectOllama()} disabled={ollamaDetecting}>
                        {ollamaDetecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {newProvider === 'ollama' && (
                <div>
                  {ollamaDetecting && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Detecting Ollama...
                    </div>
                  )}
                  {ollamaStatus === 'found' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Ollama detected — {ollamaModels.length} model{ollamaModels.length !== 1 ? 's' : ''} available
                      </div>
                      <div className="rounded-md border border-border bg-muted/50 p-2 space-y-1 max-h-40 overflow-y-auto">
                        {ollamaModels.map(m => (
                          <div key={m.name} className="flex items-center justify-between text-xs">
                            <span className="font-mono text-foreground">{m.name}</span>
                            <span className="text-muted-foreground">{formatModelSize(m.size)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {ollamaStatus === 'notfound' && !ollamaDetecting && (
                    <div className="flex items-center gap-1.5 text-xs text-destructive">
                      <XCircle className="h-3.5 w-3.5" /> Could not reach Ollama at {newBaseUrl || 'http://localhost:11434'}
                    </div>
                  )}
                </div>
              )}
              {newProvider === 'lovable' ? (
                <Button onClick={() => setOpen(false)} className="w-full">Got it</Button>
              ) : (
                <Button onClick={handleCreate} className="w-full">Save Provider</Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Lovable AI banner */}
      <div className="rounded-lg border border-accent/20 bg-accent/5 p-4 mb-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-accent shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">⚡ Lovable AI is ready to use</p>
          <p className="text-xs text-muted-foreground mt-0.5">No API key needed. When creating an agent, select "Lovable AI" as the provider to use built-in models like Gemini 3 Flash and GPT-5.</p>
        </div>
      </div>

      <div className="space-y-3">
        {providers.length === 0 && (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No additional providers configured. You can already use Lovable AI without any keys.
          </div>
        )}
        {providers.map(p => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-soft">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{p.label}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{p.provider}</span>
              </div>
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground font-mono">
                {localDevMode ? (showKeys[p.id] ? (p.apiKey || '') : '•'.repeat(Math.min((p.apiKey || '').length, 24))) : (p.secretStored ? 'Stored server-side' : 'No secret')}
                <button onClick={() => setShowKeys(prev => ({ ...prev, [p.id]: !prev[p.id] }))} className="p-0.5 hover:text-foreground">
                  {showKeys[p.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
              </div>
              {p.baseUrl && <div className="text-[10px] text-muted-foreground mt-0.5">{p.baseUrl}</div>}
            </div>
            <Switch checked={p.isActive} onCheckedChange={async v => {
              upsertProvider({ ...p, isActive: v });
              if (!localDevMode) {
                const supabaseUrl = getEdgeBase();
                const token = await getAuthToken();
                if (supabaseUrl && token) {
                  await fetch(`${supabaseUrl}/functions/v1/provider-secrets`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ id: p.id, provider: p.provider, label: p.label, baseUrl: p.baseUrl, apiKey: newKey || "unchanged", isActive: v }),
                  });
                }
              }
              refresh();
            }} />
            <button onClick={async () => { deleteProvider(p.id); if (!localDevMode) { const supabaseUrl = getEdgeBase(); const token = await getAuthToken(); if (supabaseUrl && token) { await fetch(`${supabaseUrl}/functions/v1/provider-secrets`, { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: p.id }) }); } } refresh(); }} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-border bg-muted/50 p-4">
        <p className="text-xs text-muted-foreground">
          <strong>Note:</strong> In default mode, provider secrets are stored server-side and the frontend keeps only provider references. Enable Local-dev mode only for local testing where browser-stored keys are acceptable.
        </p>
      </div>
    </div>
  );
}
