import { Shield, HardDrive } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export default function SettingsPage() {
  const [authEnabled, setAuthEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const { toast } = useToast();

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

        {/* Data */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-3 mb-4">
            <HardDrive className="h-5 w-5 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Data Management</h2>
          </div>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              All data is currently stored in your browser's localStorage. In the Docker deployment, data will be persisted to a mounted volume at <code className="font-mono bg-muted px-1 rounded">/data</code>.
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
