import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase, hasSupabaseConfig } from '@/integrations/supabase/client';
import { login } from '@/lib/auth';
import { testIds } from '@/testIds';
import { resetHydration, hydrateProvidersFromServer } from '@/lib/providerHydration';

type AuthMode = 'signin' | 'signup' | 'reset';

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const redirectTo = new URLSearchParams(location.search).get('redirect') || '/';

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (hasSupabaseConfig && supabase) {
        if (mode === 'reset') {
          const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
          });
          if (resetError) throw resetError;
          setMessage('Password reset email sent. Check your inbox.');
          setLoading(false);
          return;
        }

        if (mode === 'signup') {
          const { error: signupError } = await supabase.auth.signUp({
            email,
            password,
          });
          if (signupError) throw signupError;
          setMessage('Account created! Check your email to confirm, then sign in.');
          setMode('signin');
          setLoading(false);
          return;
        }

        // Sign in
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;

        // Re-hydrate providers with the new user session
        resetHydration();
        await hydrateProvidersFromServer();
        navigate(redirectTo, { replace: true });
      } else {
        // Local fallback auth (no Supabase config)
        await login(email, password);
        navigate(redirectTo, { replace: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      setError(msg === 'Invalid login credentials' ? 'Invalid email or password.' : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid={testIds.auth.loginPage} className="min-h-screen flex items-center justify-center p-4 bg-background">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-lg border bg-card p-6 space-y-4 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-card-foreground">
            {mode === 'signin' && 'Sign in'}
            {mode === 'signup' && 'Create account'}
            {mode === 'reset' && 'Reset password'}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {hasSupabaseConfig
              ? 'Use your email and password to access the app.'
              : 'Local mode: use admin / password.'}
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="email">{hasSupabaseConfig ? 'Email' : 'Username'}</Label>
          <Input
            id="email"
            type={hasSupabaseConfig ? 'email' : 'text'}
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={hasSupabaseConfig ? 'you@example.com' : 'admin'}
            required
            data-testid={testIds.auth.loginUsernameInput}
          />
        </div>

        {mode !== 'reset' && (
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              data-testid={testIds.auth.loginPasswordInput}
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" data-testid={testIds.auth.loginError}>
            {error}
          </p>
        )}
        {message && (
          <p className="text-sm text-primary">{message}</p>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={loading}
          data-testid={testIds.auth.loginSubmitButton}
        >
          {loading
            ? 'Please wait...'
            : mode === 'signin'
            ? 'Sign in'
            : mode === 'signup'
            ? 'Create account'
            : 'Send reset email'}
        </Button>

        {hasSupabaseConfig && (
          <div className="text-center space-y-1 text-sm">
            {mode === 'signin' && (
              <>
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setError(''); setMessage(''); }}
                  className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline block mx-auto"
                >
                  Don't have an account? Sign up
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('reset'); setError(''); setMessage(''); }}
                  className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline block mx-auto"
                >
                  Forgot password?
                </button>
              </>
            )}
            {(mode === 'signup' || mode === 'reset') && (
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(''); setMessage(''); }}
                className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              >
                Back to sign in
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
