import { Shield, HardDrive } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/apiFetch';

type AuthSettingsResponse = {
  enabled: boolean;
  hasPassword: boolean;
  updatedAt?: string;
  sessionActive: boolean;
};

type SaveAuthResponse = {
  success: boolean;
  enabled: boolean;
  hasPassword: boolean;
  message: string;
  sessionToken?: string;
};

const AUTH_SESSION_KEY = 'authSessionToken';

export default function SettingsPage() {
  const [authEnabled, setAuthEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const { toast } = useToast();

  const getAuthHeaders = () => {
    const token = localStorage.getItem(AUTH_SESSION_KEY);
    return token ? { 'x-auth-session': token } : {};
  };

  const fetchAuthConfig = async () => {
    setLoadingAuth(true);
    try {
      const config = await apiFetch<AuthSettingsResponse>('/api/settings/auth', {
        headers: getAuthHeaders(),
      });
      setAuthEnabled(config.enabled);
      setHasPassword(config.hasPassword);
      setSessionActive(config.sessionActive);
      if (!config.sessionActive) {
        localStorage.removeItem(AUTH_SESSION_KEY);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load authentication settings.';
      toast({ title: 'Error loading auth settings', description: message, variant: 'destructive' });
    } finally {
      setLoadingAuth(false);
    }
  };

  useEffect(() => {
    void fetchAuthConfig();
  }, []);

  const handleClearData = () => {
    if (confirm('This will delete ALL rooms, agents, messages, and provider settings. Continue?')) {
      localStorage.clear();
      toast({ title: 'All data cleared' });
      window.location.reload();
    }
  };

  const handleAuthenticate = async () => {
    if (!password.trim()) {
      toast({ title: 'Password required', description: 'Enter your current password to authenticate this session.', variant: 'destructive' });
      return;
    }

    setAuthenticating(true);
    try {
      const response = await apiFetch<{ sessionToken: string; success: boolean }>('/api/settings/auth/session', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      localStorage.setItem(AUTH_SESSION_KEY, response.sessionToken);
      setSessionActive(true);
      toast({ title: 'Authenticated', description: 'Session authenticated for sensitive settings updates.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed.';
      toast({ title: 'Authentication failed', description: message, variant: 'destructive' });
    } finally {
      setAuthenticating(false);
    }
  };

  const handleSaveAuth = async () => {
    setSaving(true);
    try {
      const response = await apiFetch<SaveAuthResponse>('/api/settings/auth', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          enabled: authEnabled,
          password: password.trim() || undefined,
        }),
      });

      if (response.sessionToken) {
        localStorage.setItem(AUTH_SESSION_KEY, response.sessionToken);
      }

      if (!response.enabled) {
        localStorage.removeItem(AUTH_SESSION_KEY);
      }

      setAuthEnabled(response.enabled);
      setHasPassword(response.hasPassword);
      setSessionActive(response.enabled ? true : false);
      setPassword('');
      toast({ title: 'Authentication settings saved', description: response.message });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save authentication settings.';
      toast({ title: 'Failed to save auth settings', description: message, variant: 'destructive' });
      await fetchAuthConfig();
    } finally {
      setSaving(false);
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
              <Switch checked={authEnabled} onCheckedChange={setAuthEnabled} disabled={loadingAuth || saving} />
            </div>
            {authEnabled && (
              <div>
                <Label className="text-xs text-muted-foreground">Admin Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={hasPassword ? 'Enter new or current admin password' : 'Set admin password'}
                  disabled={loadingAuth || saving || authenticating}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Password must be at least 10 characters with upper/lowercase letters, numbers, and symbols.
                </p>
              </div>
            )}
            {!authEnabled && (
              <p className="text-xs text-muted-foreground">
                ⚠️ No authentication is configured. Anyone on your network can access this app.
              </p>
            )}
            {authEnabled && hasPassword && !sessionActive && (
              <div className="rounded border border-border bg-muted p-2 text-xs text-muted-foreground space-y-2">
                <p>This session is not authenticated. Authenticate before updating or disabling auth settings.</p>
                <Button size="sm" variant="secondary" onClick={handleAuthenticate} disabled={authenticating || saving || loadingAuth}>
                  {authenticating ? 'Authenticating...' : 'Authenticate Session'}
                </Button>
              </div>
            )}
            <Button onClick={handleSaveAuth} disabled={loadingAuth || saving || authenticating} size="sm">
              {saving ? 'Saving...' : 'Save Authentication Settings'}
            </Button>
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
