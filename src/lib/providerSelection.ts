import { ProviderConfig, LLMProvider } from '@/types';
import { getProviders } from '@/lib/store';

export interface LlmSelection {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

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

function rankProvider(p: ProviderConfig): number {
  if (!p.isActive) return -1;
  if (p.provider === 'ollama') return 5;
  if (p.provider === 'custom') return 4;
  if (p.provider === 'openai' || p.provider === 'azure') return 3;
  if (p.provider === 'anthropic' || p.provider === 'gemini') return 2;
  return 1;
}

export function getDefaultLlmSelection(input?: string | { provider: LLMProvider; preferredModel?: string }): LlmSelection {
  if (typeof input === 'object' && input !== null) {
    const preferredModel = input.preferredModel?.trim();

    if (preferredModel && isModelCompatible(input.provider, preferredModel)) {
      return { provider: input.provider, model: preferredModel };
    }

    return {
      provider: input.provider,
      model: DEFAULT_MODELS[input.provider],
    };
  }

  const preferredModel = input?.trim();
  const providers = getProviders().filter(p => p.isActive).sort((a, b) => rankProvider(b) - rankProvider(a));
  const selected = providers[0];

  if (!selected) {
    const model = preferredModel && isModelCompatible('lovable', preferredModel)
      ? preferredModel
      : DEFAULT_MODELS.lovable;
    return {
      provider: 'lovable',
      model,
    };
  }

  const model = preferredModel && isModelCompatible(selected.provider, preferredModel)
    ? preferredModel
    : DEFAULT_MODELS[selected.provider];

  return {
    provider: selected.provider,
    model,
    apiKey: selected.apiKey || undefined,
    baseUrl: selected.baseUrl || undefined,
  };
}
