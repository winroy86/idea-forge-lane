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

const VISION_SUPPORTED_MIMES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];

function resolveConfig(input?: LlmConfig): Required<Pick<LlmConfig, 'provider' | 'model'>> & Pick<LlmConfig, 'apiKey' | 'baseUrl'> {
  const provider = input?.provider || 'lovable';
  const model = input?.model || 'google/gemini-2.5-flash';
  return { provider, model, apiKey: input?.apiKey, baseUrl: input?.baseUrl };
}

function openAiBaseUrl(cfg: ReturnType<typeof resolveConfig>): string {
  if (cfg.provider === 'ollama') return cfg.baseUrl || 'http://localhost:11434/v1';
  if (cfg.provider === 'azure') return cfg.baseUrl || 'https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT';
  if (cfg.provider === 'custom') return cfg.baseUrl || '';
  return cfg.baseUrl || 'https://api.openai.com/v1';
}

async function callProviderText(prompt: string, cfg: ReturnType<typeof resolveConfig>): Promise<string> {
  if (cfg.provider === 'lovable') {
    const key = Deno.env.get('LOVABLE_API_KEY');
    if (!key) throw new Error('LOVABLE_API_KEY is not configured');
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 8192 }),
    });
    if (!response.ok) throw new Error(`Lovable text extraction failed (${response.status})`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (cfg.provider === 'anthropic') {
    if (!cfg.apiKey) throw new Error('Missing apiKey for Anthropic');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 8192,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic text extraction failed (${response.status})`);
    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  if (cfg.provider === 'gemini') {
    if (!cfg.apiKey) throw new Error('Missing apiKey for Gemini');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    });
    if (!response.ok) throw new Error(`Gemini text extraction failed (${response.status})`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (!cfg.apiKey) throw new Error(`Missing apiKey for provider ${cfg.provider}`);
  const baseUrl = openAiBaseUrl(cfg);
  if (!baseUrl) throw new Error('No base URL configured for custom provider.');

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 8192,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI-compatible text extraction failed (${response.status})`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callProviderVision(fileBase64: string, mimeType: string, fileName: string, cfg: ReturnType<typeof resolveConfig>): Promise<string> {
  const instruction = `Extract ALL text content from this document (${fileName}). Return ONLY extracted text preserving structure (headings, paragraphs, lists, tables).`;

  if (cfg.provider === 'lovable') {
    const key = Deno.env.get('LOVABLE_API_KEY');
    if (!key) throw new Error('LOVABLE_API_KEY is not configured');
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: instruction },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
          ],
        }],
        temperature: 0.1,
        max_tokens: 8192,
      }),
    });
    if (!response.ok) throw new Error(`Vision extraction failed (${response.status})`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // OpenAI-compatible providers (OpenAI/Azure/Ollama/Custom) can support image_url payloads.
  if (cfg.provider === 'openai' || cfg.provider === 'azure' || cfg.provider === 'ollama' || cfg.provider === 'custom') {
    if (!cfg.apiKey) throw new Error(`Missing apiKey for provider ${cfg.provider}`);
    const baseUrl = openAiBaseUrl(cfg);
    if (!baseUrl) throw new Error('No base URL configured for custom provider.');
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: instruction },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
          ],
        }],
        temperature: 0.1,
        max_tokens: 8192,
      }),
    });
    if (!response.ok) throw new Error(`Vision extraction failed (${response.status})`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  throw new Error(`Vision input is not currently supported for provider ${cfg.provider}. Use Lovable/OpenAI-compatible for PDF/image extraction.`);
}

function extractRawText(fileBase64: string): string {
  try {
    const binaryStr = atob(fileBase64);
    const textSegments: string[] = [];
    let current = "";
    for (let i = 0; i < binaryStr.length; i++) {
      const code = binaryStr.charCodeAt(i);
      if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9) current += binaryStr[i];
      else {
        if (current.trim().length > 3) textSegments.push(current.trim());
        current = "";
      }
    }
    if (current.trim().length > 3) textSegments.push(current.trim());

    const fullText = textSegments.join(" ");
    const xmlTextMatches = fullText.match(/<[wa]:t[^>]*>([^<]+)<\/[wa]:t>/g);
    if (xmlTextMatches && xmlTextMatches.length > 0) {
      return xmlTextMatches.map(m => m.replace(/<[^>]+>/g, "")).join(" ").replace(/\s+/g, " ").trim();
    }

    return textSegments.filter(s => s.length > 10 && /[a-zA-Z]{3,}/.test(s)).join(" ").replace(/\s+/g, " ").trim();
  } catch (e) {
    console.error("Raw text extraction error:", e);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileBase64, fileName, mimeType, llm } = await req.json();
    if (!fileBase64) {
      return new Response(JSON.stringify({ error: "No file data provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cfg = resolveConfig(llm);
    const effectiveMime = mimeType || "application/pdf";
    const isVisionSupported = VISION_SUPPORTED_MIMES.some(m => effectiveMime.startsWith(m));

    let extractedText = "";
    if (isVisionSupported) {
      extractedText = await callProviderVision(fileBase64, effectiveMime, fileName, cfg);
    } else {
      const rawText = extractRawText(fileBase64);
      if (rawText.length > 50) {
        extractedText = rawText;
      } else {
        extractedText = await callProviderText(
          `I have a file named "${fileName}" (${effectiveMime}). I extracted some raw text but it may be noisy. Clean and return structured text only. If too garbled, say \"Could not extract meaningful text from this file format.\"\n\nRaw text:\n${rawText.slice(0, 10000)}`,
          cfg,
        );
      }
    }

    return new Response(JSON.stringify({ text: extractedText, charCount: extractedText.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
