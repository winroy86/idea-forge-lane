import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

type LlmProvider = 'lovable' | 'openai' | 'anthropic' | 'gemini' | 'azure' | 'ollama' | 'custom';

interface LlmConfig {
  provider?: LlmProvider;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function resolveConfig(input?: LlmConfig): Required<Pick<LlmConfig, 'provider' | 'model'>> & Pick<LlmConfig, 'apiKey' | 'baseUrl'> {
  const provider = input?.provider || 'lovable';
  const model = input?.model || 'google/gemini-2.5-flash';
  const apiKey = input?.apiKey || undefined;
  const baseUrl = input?.baseUrl || undefined;
  return { provider, model, apiKey, baseUrl };
}

async function callProviderText(systemPrompt: string, userPrompt: string, cfg: ReturnType<typeof resolveConfig>): Promise<string> {
  if (cfg.provider === 'lovable') {
    const key = Deno.env.get('LOVABLE_API_KEY');
    if (!key) throw new Error('LOVABLE_API_KEY is not configured');
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });
    if (!res.ok) throw new Error(`Lovable gateway error (${res.status})`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (!cfg.apiKey) throw new Error(`Missing apiKey for provider ${cfg.provider}`);

  if (cfg.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: cfg.model,
        system: systemPrompt,
        max_tokens: 4096,
        temperature: 0.7,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error (${res.status})`);
    const data = await res.json();
    return data.content?.[0]?.text || '';
  }

  if (cfg.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini error (${res.status})`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  const baseUrl = cfg.provider === 'ollama'
    ? (cfg.baseUrl || 'http://localhost:11434/v1')
    : cfg.provider === 'azure'
    ? (cfg.baseUrl || 'https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT')
    : cfg.provider === 'custom'
    ? (cfg.baseUrl || '')
    : (cfg.baseUrl || 'https://api.openai.com/v1');

  if (!baseUrl) throw new Error('No base URL configured for custom provider.');

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI-compatible error (${res.status})`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { personName, description, llm } = await req.json();
    const cfg = resolveConfig(llm);

    const isCustom = !personName && description;
    const systemPrompt = `You are an expert persona architect.
Return STRICT JSON only with keys: name, role, domain, pointOfView, systemPrompt, styleVoice.`;

    const userPrompt = isCustom
      ? `Create a detailed AI agent persona based on this description: "${description}".

Rules:
- Output valid JSON only.
- systemPrompt must be 300-500 words.
- pointOfView should be short (2-6 words).`
      : `Research and create a deeply accurate AI clone persona of "${personName}"${description ? ` with focus on: ${description}` : ''}.

Analyze communication style, beliefs, expertise, mannerisms, tone, and debate style.
Output valid JSON only with the required keys.`;

    const raw = await callProviderText(systemPrompt, userPrompt, cfg);
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    const parsed = JSON.parse(jsonStart >= 0 && jsonEnd > jsonStart ? raw.slice(jsonStart, jsonEnd + 1) : raw);

    const required = ['name', 'role', 'domain', 'pointOfView', 'systemPrompt', 'styleVoice'];
    for (const key of required) {
      if (!parsed?.[key]) throw new Error(`Persona missing required field: ${key}`);
    }

    return new Response(JSON.stringify({ success: true, persona: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-persona error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
