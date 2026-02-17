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
 <<<<<<< codex/verify-local-setup-and-agent-capabilities
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
=======
    const modelsToTry = [
      "google/gemini-2.5-flash",
      "google/gemini-2.5-flash-lite",
      "openai/gpt-5-mini",
    ];

    const requestBody = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
      tools: [
        {
          type: "function",
          function: {
            name: "create_persona",
            description: "Create a detailed agent persona with all required fields.",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Display name for the agent (use real name for famous people, creative name for custom)" },
                role: { type: "string", description: "Short role title, e.g. 'Entrepreneur & Innovator', 'Theoretical Physicist'" },
                domain: { type: "string", description: "Primary expertise domain" },
                pointOfView: { type: "string", description: "Their philosophical or ideological stance, 2-4 words" },
                systemPrompt: { type: "string", description: "Detailed system prompt (300-500 words) that captures their personality, communication style, beliefs, knowledge, and how they engage in discussion. Include specific mannerisms, phrases they'd use, and how they'd approach different topics." },
                styleVoice: { type: "string", description: "Brief style description, e.g. 'Bold, provocative, uses analogies from engineering'" },
              },
              required: ["name", "role", "domain", "pointOfView", "systemPrompt", "styleVoice"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "create_persona" } },
    };

    let data: any = null;
    let lastError = "";

    for (const model of modelsToTry) {
      console.log(`Trying model: ${model}`);
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...requestBody, model }),
      });

      if (response.ok) {
        data = await response.json();
        break;
      }

      if (response.status === 429 || response.status === 402) {
        console.log(`Model ${model} returned ${response.status}, trying next...`);
        lastError = `${response.status}`;
        continue;
      }

      // For 500 errors with tools, retry without tools
      if (response.status === 500) {
        console.log(`Model ${model} returned 500, retrying without tools...`);
        const { tools: _t, tool_choice: _tc, ...bodyWithoutTools } = requestBody;
        const retryRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...bodyWithoutTools, model }),
        });
        if (retryRes.ok) {
          data = await retryRes.json();
          break;
        }
        lastError = `${retryRes.status}`;
        continue;
      }

      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error (${response.status})`);
    }

    if (!data) {
      throw new Error(`All AI models failed (last: ${lastError})`);
    }

    // Extract tool call result or parse from content
    let persona;
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall && toolCall.function.name === "create_persona") {
      persona = JSON.parse(toolCall.function.arguments);
    } else {
      // Try parsing from message content (fallback when tools weren't used)
      const content = data.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        persona = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("AI did not return expected persona format");
      }
    }

    return new Response(JSON.stringify({ success: true, persona }), {
      >>>>>>> main
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
