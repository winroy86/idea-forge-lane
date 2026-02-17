 <<<<<<< codex/update-provider-selection-compatibility-logic
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
=======
import { ProviderConfig, LLMProvider } from '@/types';
import { getProviders } from '@/lib/store';

export interface LlmSelection {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  lovable: 'google/gemini-3-flash-preview',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  gemini: 'gemini-2.0-flash',
  azure: 'gpt-4o-mini',
  ollama: 'llama3.1:8b',
  custom: 'gpt-4o-mini',
};

function rankProvider(p: ProviderConfig): number {
  if (!p.isActive) return -1;
  if (p.provider === 'ollama') return 5;
  if (p.provider === 'custom') return 4;
  if (p.provider === 'openai' || p.provider === 'azure') return 3;
  if (p.provider === 'anthropic' || p.provider === 'gemini') return 2;
  return 1;
}

export function getDefaultLlmSelection(preferredModel?: string): LlmSelection {
  const providers = getProviders().filter(p => p.isActive).sort((a, b) => rankProvider(b) - rankProvider(a));
  const selected = providers[0];

  if (!selected) {
    return {
      provider: 'lovable',
      model: preferredModel || DEFAULT_MODELS.lovable,
    };
  >>>>>>> main
  }

  return {
    provider: selected.provider,
    <<<<<<< codex/update-provider-selection-compatibility-logic
    model: DEFAULT_MODELS[selected.provider],
=======
    model: preferredModel || DEFAULT_MODELS[selected.provider],
    apiKey: selected.apiKey || undefined,
    baseUrl: selected.baseUrl || undefined,
      >>>>>>> main
  };
}
