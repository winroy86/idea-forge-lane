import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { login } from '@/lib/auth';
import { testIds } from '@/testIds';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const redirectTo = new URLSearchParams(location.search).get('redirect') || '/';

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate(redirectTo, { replace: true });
    } catch {
      setError('Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid={testIds.auth.loginPage} className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-lg border bg-card p-6 space-y-4 shadow-soft">
        <div>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="text-xs text-muted-foreground mt-1">Use admin / password for local auth fallback.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            data-testid={testIds.auth.loginUsernameInput}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            data-testid={testIds.auth.loginPasswordInput}
          />
        </div>
        {error && (
          <p className="text-sm text-destructive" data-testid={testIds.auth.loginError}>
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading} data-testid={testIds.auth.loginSubmitButton}>
          {loading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
