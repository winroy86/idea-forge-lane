export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export async function detectOllamaModels(baseUrl = 'http://localhost:11434'): Promise<OllamaModel[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.models || [];
  } catch {
    return [];
  }
}

export function formatModelSize(bytes: number): string {
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(1)}GB`;
  return `${(bytes / 1e6).toFixed(0)}MB`;
}
