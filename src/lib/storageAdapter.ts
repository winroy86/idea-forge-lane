import { ProviderConfig } from '@/types';

const backendApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function isBackendStorageEnabled(): boolean {
  return backendApiBaseUrl.length > 0;
}

export async function fetchBackendProviders(): Promise<ProviderConfig[]> {
  if (!isBackendStorageEnabled()) return [];

  const res = await fetch(`${backendApiBaseUrl}/api/providers`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch providers (${res.status})`);
  }

  const data = await res.json();
  return Array.isArray(data?.providers) ? data.providers : [];
}

export async function saveBackendProvider(provider: ProviderConfig): Promise<void> {
  if (!isBackendStorageEnabled()) return;

  const res = await fetch(`${backendApiBaseUrl}/api/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: provider.id,
      provider: provider.provider,
      label: provider.label,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      isActive: provider.isActive,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to save provider (${res.status}): ${err}`);
  }
}
