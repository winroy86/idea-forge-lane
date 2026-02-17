import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/authContext';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, authEnabled, authenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  useEffect(() => {
    if (!authEnabled || authenticated) {
      navigate(location.state?.from || '/', { replace: true });
    }
  }, [authEnabled, authenticated, location.state, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(password);
      navigate(location.state?.from || '/', { replace: true });
    } catch {
      setError('Invalid password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-border bg-card p-6 space-y-4">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <div>
          <Label>Password</Label>
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter admin password" />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting || !password.trim()}>
          {submitting ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
