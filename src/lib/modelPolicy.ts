import { supabase } from '@/integrations/supabase/client';

export interface AllowedModel {
  id: string;
  provider: string;
  model_id: string;
  label: string;
  is_allowed: boolean;
}

let policyCache: AllowedModel[] | null = null;
let fetchPromise: Promise<AllowedModel[]> | null = null;

async function doFetch(): Promise<AllowedModel[]> {
  if (!supabase) return [];
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return [];

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const res = await fetch(`${supabaseUrl}/functions/v1/model-policy`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.models ?? []) as AllowedModel[];
}

/** Fetch allowed models (cached per session). Pass force=true to bust cache. */
export async function fetchModelPolicy(force = false): Promise<AllowedModel[]> {
  if (!force && policyCache !== null) return policyCache;
  if (!fetchPromise) {
    fetchPromise = doFetch().then(models => {
      policyCache = models;
      fetchPromise = null;
      return models;
    }).catch(() => {
      fetchPromise = null;
      return [];
    });
  }
  return fetchPromise;
}

export function resetModelPolicyCache() {
  policyCache = null;
  fetchPromise = null;
}

/**
 * Given a list of model options and a provider, filter down to only allowed models.
 * If no policy entries exist for this provider, ALL models are allowed (open).
 */
export function filterModelsByPolicy(
  models: { value: string; label: string }[],
  provider: string,
  policy: AllowedModel[]
): { value: string; label: string }[] {
  const providerPolicy = policy.filter(p => p.provider === provider && p.is_allowed);
  if (providerPolicy.length === 0) return models; // no restrictions
  const allowed = new Set(providerPolicy.map(p => p.model_id));
  return models.filter(m => allowed.has(m.value));
}
