import { useState, useEffect } from 'react';
import { Plus, Trash2, Eye, EyeOff, ExternalLink, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { ProviderConfig, LLMProvider } from '@/types';
import { getProviders, upsertProvider, deleteProvider, generateId } from '@/lib/store';
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
  useEffect(refresh, []);

  const handleCreate = () => {
    const p: ProviderConfig = {
      id: generateId(),
      provider: newProvider,
      label: newLabel.trim() || PROVIDERS.find(p => p.value === newProvider)!.label,
      apiKey: newKey,
      baseUrl: newBaseUrl || undefined,
      isActive: true,
    };
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
          <p className="text-sm text-muted-foreground mt-1">Manage API keys and endpoints for LLM providers.</p>
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
              <div>
                <Label>Label (optional)</Label>
                <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="My OpenAI Key" />
              </div>
              <div>
                <Label>API Key</Label>
                <Input type="password" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder={PROVIDERS.find(p => p.value === newProvider)?.hint} />
              </div>
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
              <Button onClick={handleCreate} className="w-full">Save Provider</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {providers.length === 0 && (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No providers configured. Add an API key to enable real LLM calls.
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
                {showKeys[p.id] ? p.apiKey : '•'.repeat(Math.min(p.apiKey.length, 24))}
                <button onClick={() => setShowKeys(prev => ({ ...prev, [p.id]: !prev[p.id] }))} className="p-0.5 hover:text-foreground">
                  {showKeys[p.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
              </div>
              {p.baseUrl && <div className="text-[10px] text-muted-foreground mt-0.5">{p.baseUrl}</div>}
            </div>
            <Switch checked={p.isActive} onCheckedChange={v => { upsertProvider({ ...p, isActive: v }); refresh(); }} />
            <button onClick={() => { deleteProvider(p.id); refresh(); }} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-border bg-muted/50 p-4">
        <p className="text-xs text-muted-foreground">
          <strong>Note:</strong> API keys are stored in your browser's localStorage. In a production setup, these would be encrypted and stored in Docker secrets or a .env file. This frontend is designed to be connected to a self-hosted backend.
        </p>
      </div>
    </div>
  );
}
