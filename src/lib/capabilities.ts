const hasSupabaseUrl = Boolean(import.meta.env.VITE_SUPABASE_URL);
const hasSupabaseKey = Boolean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export const capabilities = {
  supabase: hasSupabaseUrl && hasSupabaseKey,
  personaGeneration: hasSupabaseUrl && hasSupabaseKey,
  documentExtraction: hasSupabaseUrl && hasSupabaseKey,
};

export const capabilityLabel = (enabled: boolean) => (enabled ? 'enabled' : 'disabled');
