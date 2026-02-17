export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload && typeof (payload as { error: string }).error === 'string'
        ? (payload as { error: string }).error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}
