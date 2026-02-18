import { hasSupabaseConfig, supabase } from '@/integrations/supabase/client';
import { LLMProvider, ProviderConfig } from '@/types';
import { saveProviders } from '@/lib/store';

const providersEndpoint = import.meta.env.VITE_PROVIDERS_ENDPOINT;

let hydrationPromise: Promise<void> | null = null;
let hydrationComplete = !hasSupabaseConfig;

function normalizeProvider(input: Partial<ProviderConfig> & { base_url?: string; is_active?: boolean }, index: number): ProviderConfig | null {
  if (!input.provider) return null;
  return {
    id: input.id || `hydrated-${input.provider}-${index}`,
    provider: input.provider as LLMProvider,
    label: input.label || `${input.provider}`,
    apiKey: input.apiKey,
    baseUrl: input.baseUrl || input.base_url,
    isActive: input.isActive ?? input.is_active ?? true,
    secretStored: input.secretStored ?? true,
  };
}

async function fetchProvidersFromServer(): Promise<ProviderConfig[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl || !supabase) return [];

  // Get the actual user session token, not the anon key
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return [];

  const endpoint = providersEndpoint || `${supabaseUrl}/functions/v1/provider-secrets`;
  const res = await fetch(endpoint, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to hydrate providers (${res.status}).`);
  }

  const data = await res.json();
  const rawProviders = Array.isArray(data) ? data : data?.providers;
  if (!Array.isArray(rawProviders)) return [];

  return rawProviders
    .map((provider, index) => normalizeProvider(provider, index))
    .filter((provider): provider is ProviderConfig => Boolean(provider));
}

export function isProviderHydrationComplete() {
  return hydrationComplete;
}

export async function hydrateProvidersFromServer() {
  if (hydrationPromise) return hydrationPromise;

  if (!hasSupabaseConfig) {
    hydrationComplete = true;
    return;
  }

  hydrationPromise = (async () => {
    try {
      const providers = await fetchProvidersFromServer();
      if (providers.length > 0) {
        saveProviders(providers);
      }
    } catch (error) {
      console.warn('Provider hydration failed:', error);
    } finally {
      hydrationComplete = true;
    }
  })();

  return hydrationPromise;
}

export async function waitForProviderHydration() {
  if (hydrationComplete) return;
  await hydrateProvidersFromServer();
}
