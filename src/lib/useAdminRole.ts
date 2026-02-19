import { useState, useEffect } from 'react';
import { hasSupabaseConfig, supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

interface UseAdminRoleResult {
  isAdmin: boolean;
  loading: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as unknown as SupabaseClient<any>;

export function useAdminRole(): UseAdminRoleResult {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!cancelled) { setIsAdmin(false); setLoading(false); }
        return;
      }

      try {
        const { data } = await db()
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (!cancelled) {
          setIsAdmin(!!data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setIsAdmin(false); setLoading(false); }
      }
    });

    return () => { cancelled = true; };
  }, []);

  return { isAdmin, loading };
}
