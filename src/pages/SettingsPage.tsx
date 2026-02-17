import { Shield, HardDrive } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getAppSettings, saveAppSettings } from '@/lib/store';
import { LLMProvider } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function SettingsPage() {
  const [authEnabled, setAuthEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [summarizerSettings, setSummarizerSettings] = useState(() => getAppSettings().summarizer);
  const { toast } = useToast();


  const updateSummarizerSetting = (patch: Partial<typeof summarizerSettings>) => {
    const next = { ...summarizerSettings, ...patch };
    setSummarizerSettings(next);
    saveAppSettings({ ...getAppSettings(), summarizer: next });
  };

  const handleClearData = () => {
    if (confirm('This will delete ALL rooms, agents, messages, and provider settings. Continue?')) {
      localStorage.clear();
      toast({ title: 'All data cleared' });
      window.location.reload();
    }
  };

  return (
    <div className="animate-fade-in p-4 md:p-6 lg:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Settings</h1>

      <div className="space-y-6">
        {/* Auth */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="h-5 w-5 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Authentication</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Require password</Label>
              <Switch checked={authEnabled} onCheckedChange={setAuthEnabled} />
            </div>
            {authEnabled && (
              <div>
                <Label className="text-xs text-muted-foreground">Admin Password</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Set admin password" />
              </div>
            )}
            {!authEnabled && (
              <p className="text-xs text-muted-foreground">
                ⚠️ No authentication is configured. Anyone on your network can access this app.
              </p>
            )}
          </div>
        </div>


        {/* Summarizer */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
          <h2 className="text-sm font-semibold text-foreground mb-3">Summarizer</h2>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Provider</Label>
              <Select value={summarizerSettings.provider} onValueChange={(value) => updateSummarizerSetting({ provider: value as LLMProvider })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lovable">Lovable AI</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="azure">Azure OpenAI</SelectItem>
                  <SelectItem value="ollama">Ollama</SelectItem>
                  <SelectItem value="custom">Custom OpenAI-compatible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Model</Label>
              <Input className="mt-1" value={summarizerSettings.model} onChange={e => updateSummarizerSetting({ model: e.target.value })} placeholder="e.g. gpt-4o-mini" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Base URL (optional)</Label>
              <Input className="mt-1" value={summarizerSettings.baseUrl || ''} onChange={e => updateSummarizerSetting({ baseUrl: e.target.value || undefined })} placeholder="Needed for custom/azure/ollama as applicable" />
            </div>
          </div>
        </div>

        {/* Data */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-3 mb-4">
            <HardDrive className="h-5 w-5 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Data Management</h2>
          </div>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Most app data is currently stored in your browser's localStorage. Provider API secrets are server-side by default unless Local-dev mode is enabled.
            </p>
            <Button variant="destructive" size="sm" onClick={handleClearData}>
              Clear All Data
            </Button>
          </div>
        </div>

        {/* LAN info */}
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <h3 className="text-sm font-medium text-foreground mb-2">Docker & LAN Access</h3>
          <div className="text-xs text-muted-foreground space-y-2 font-mono">
            <p># docker-compose.yml</p>
            <pre className="bg-card rounded p-2 overflow-x-auto">{`version: '3.8'
services:
  brainstorm-room:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      - HOST=0.0.0.0
      - PORT=3000`}</pre>
            <p className="font-sans">Access from any device on your network at <code>http://YOUR_IP:3000</code></p>
          </div>
        </div>
      </div>
    </div>
  );
}
