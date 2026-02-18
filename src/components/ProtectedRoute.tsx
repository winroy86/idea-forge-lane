import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase, hasSupabaseConfig } from '@/integrations/supabase/client';
import { getSession, isAuthEnabled } from '@/lib/auth';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [checking, setChecking] = useState(hasSupabaseConfig);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setChecking(false);
      return;
    }

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(!!session);
      setChecking(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // While we check the Supabase session, render nothing (avoid flash)
  if (checking) return null;

  if (hasSupabaseConfig) {
    if (!authenticated) {
      return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
    }
    return <>{children}</>;
  }

  // Fallback: local auth mode
  if (!isAuthEnabled()) return <>{children}</>;
  if (!getSession()) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}
