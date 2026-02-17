import { LLMProvider } from '@/types';

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  lovable: 'google/gemini-3-flash-preview',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.0-flash',
  azure: 'gpt-4o-mini',
  ollama: 'llama3.2',
  custom: 'gpt-4o-mini',
};

const PROVIDER_MODEL_PREFIXES: Record<LLMProvider, string[]> = {
  lovable: ['google/', 'openai/'],
  openai: ['gpt-', 'o1', 'o3', 'o4'],
  anthropic: ['claude-'],
  gemini: ['gemini-', 'models/'],
  azure: ['gpt-', 'o1', 'o3', 'o4'],
  ollama: [],
  custom: [],
};

export function isModelCompatible(provider: LLMProvider, model?: string): boolean {
  if (!model) return false;

  const normalizedModel = model.trim().toLowerCase();
  if (!normalizedModel) return false;

  if (provider === 'ollama' || provider === 'custom') return true;

  const allowedPrefixes = PROVIDER_MODEL_PREFIXES[provider];
  return allowedPrefixes.some(prefix => normalizedModel.startsWith(prefix));
}

export function getDefaultLlmSelection(selected: { provider: LLMProvider; preferredModel?: string }) {
  const preferredModel = selected.preferredModel?.trim();

  if (preferredModel && isModelCompatible(selected.provider, preferredModel)) {
    return { provider: selected.provider, model: preferredModel };
  }

  return {
    provider: selected.provider,
    model: DEFAULT_MODELS[selected.provider],
  };
}
