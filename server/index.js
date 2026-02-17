import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { decryptText } from './lib/crypto.js';

const PORT = Number(process.env.PORT || 8787);

const PROVIDERS_TABLE = process.env.PROVIDERS_TABLE_NAME || 'providers';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[llm-server] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for provider lookup.');
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function safeJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  });
  res.end(JSON.stringify(body));
}

function redactSecrets(value, secrets = []) {
  if (typeof value !== 'string') return value;
  return secrets.reduce((acc, secret) => {
    if (!secret || typeof secret !== 'string') return acc;
    return acc.split(secret).join('[REDACTED]');
  }, value)
    .replace(/(api[_-]?key\s*[:=]\s*["']?)[^\s"']+/ig, '$1[REDACTED]')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/ig, '$1[REDACTED]');
}

function safeErrorMessage(error, secrets = []) {
  if (error instanceof Error) {
    return redactSecrets(error.message, secrets);
  }
  return redactSecrets(String(error), secrets);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function resolveBaseUrl(providerType, configuredBaseUrl) {
  if (configuredBaseUrl) return configuredBaseUrl;
  if (providerType === 'openai') return 'https://api.openai.com/v1';
  if (providerType === 'ollama') return 'http://localhost:11434/v1';
  return '';
}

async function getProviderRecord(providerType, baseUrl) {
  if (!supabase) throw new Error('Provider database is not configured on server.');
  let query = supabase
    .from(PROVIDERS_TABLE)
    .select('*')
    .eq('provider', providerType)
    .eq('is_active', true)
    .limit(5);

  const normalizedBaseUrl = baseUrl?.trim();
  if (normalizedBaseUrl) {
    query = query.eq('base_url', normalizedBaseUrl);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Unable to resolve provider credentials: ${error.message}`);

  if (!data || data.length === 0) {
    throw new Error(`No active provider credentials found for "${providerType}".`);
  }
  return data[0];
}

async function callOpenAICompatible(apiKey, baseUrl, model, system, history, agentConfig, headers = {}) {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...headers,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...history],
      temperature: agentConfig.temperature,
      max_tokens: agentConfig.maxTokens,
      top_p: agentConfig.topP,
      presence_penalty: agentConfig.presencePenalty,
      frequency_penalty: agentConfig.frequencyPenalty,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Provider request failed (${res.status}): ${text}`);
  const data = JSON.parse(text);
  return {
    content: data.choices?.[0]?.message?.content || 'No response',
    usage: data.usage,
  };
}

async function callAnthropic(apiKey, model, system, history, agentConfig) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: agentConfig.maxTokens,
      temperature: agentConfig.temperature,
      top_p: agentConfig.topP,
      system,
      messages: history.map((m) => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content })),
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Anthropic request failed (${res.status}): ${text}`);
  const data = JSON.parse(text);
  return { content: data.content?.[0]?.text || 'No response', usage: data.usage };
}

async function callGemini(apiKey, model, system, history, agentConfig) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: {
        temperature: agentConfig.temperature,
        topP: agentConfig.topP,
        maxOutputTokens: agentConfig.maxTokens,
      },
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Gemini request failed (${res.status}): ${text}`);
  const data = JSON.parse(text);
  return { content: data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response' };
}

async function runInference(payload) {
  const { agent, model, prompt, system, history = [] } = payload;
  const providerType = agent?.provider;
  if (!providerType) throw new Error('provider is required');

  const providerRecord = await getProviderRecord(providerType, agent?.baseUrl);
  const encryptedKey = providerRecord.encrypted_api_key ?? providerRecord.api_key_encrypted ?? providerRecord.api_key ?? '';
  const apiKey = encryptedKey ? decryptText(encryptedKey) : '';
  const secrets = [apiKey, encryptedKey].filter(Boolean);

  try {
    const effectiveModel = model || agent?.model;
    const effectiveSystem = system || '';
    const effectiveHistory = history.length > 0
      ? history
      : prompt
      ? [{ role: 'user', content: prompt }]
      : [];
    const agentConfig = agent?.config || {
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1,
      presencePenalty: 0,
      frequencyPenalty: 0,
    };

    switch (providerType) {
      case 'anthropic':
        return await callAnthropic(apiKey, effectiveModel, effectiveSystem, effectiveHistory, agentConfig);
      case 'gemini':
        return await callGemini(apiKey, effectiveModel, effectiveSystem, effectiveHistory, agentConfig);
      case 'azure': {
        const baseUrl = resolveBaseUrl(providerType, providerRecord.base_url || agent?.baseUrl);
        if (!baseUrl) throw new Error('Azure base URL is required.');
        return await callOpenAICompatible(apiKey, baseUrl, effectiveModel, effectiveSystem, effectiveHistory, agentConfig, { 'api-key': apiKey });
      }
      case 'openai':
      case 'ollama':
      case 'custom':
      default: {
        const baseUrl = resolveBaseUrl(providerType, providerRecord.base_url || agent?.baseUrl);
        if (!baseUrl) throw new Error(`Base URL is required for ${providerType}.`);
        return await callOpenAICompatible(apiKey, baseUrl, effectiveModel, effectiveSystem, effectiveHistory, agentConfig);
      }
    }
  } catch (error) {
    throw new Error(safeErrorMessage(error, secrets));
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    safeJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    safeJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/llm/chat') {
    try {
      const payload = await readJson(req);
      const result = await runInference(payload);
      safeJson(res, 200, result);
    } catch (error) {
      const message = safeErrorMessage(error);
      console.error('[llm-server] request failed:', message);
      safeJson(res, 500, { error: message });
    }
    return;
  }

  safeJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[llm-server] listening on :${PORT}`);
});
