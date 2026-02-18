import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};


function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { personName, description, llm } = await req.json();

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Honor the client-provided llm settings (from Settings page / global config)
    // llm = { provider, model, apiKey?, baseUrl? }
    let apiKey: string;
    let chatCompletionsUrl: string;
    let modelsToTry: string[];

    if (llm?.provider && llm.provider !== 'lovable' && llm?.model) {
      // Use the user-configured provider from settings
      const providerType: string = llm.provider;
      const userModel: string = llm.model;

      if (providerType === 'openai') {
        const key = llm.apiKey || OPENAI_API_KEY || "";
        apiKey = key;
        chatCompletionsUrl = (llm.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "") + "/chat/completions";
        modelsToTry = [userModel];
      } else if (providerType === 'anthropic') {
        // Anthropic doesn't support OpenAI-compat tool_choice via this path; fall through to Lovable gateway
        apiKey = LOVABLE_API_KEY || "";
        chatCompletionsUrl = (Deno.env.get("OPENAI_COMPAT_BASE_URL") || "https://ai.gateway.lovable.dev/v1").replace(/\/$/, "") + "/chat/completions";
        modelsToTry = ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite", "openai/gpt-5-mini"];
      } else if (providerType === 'gemini') {
        // Gemini via Lovable gateway (OpenAI-compat)
        apiKey = LOVABLE_API_KEY || "";
        chatCompletionsUrl = (Deno.env.get("OPENAI_COMPAT_BASE_URL") || "https://ai.gateway.lovable.dev/v1").replace(/\/$/, "") + "/chat/completions";
        modelsToTry = [userModel.startsWith("google/") ? userModel : `google/${userModel}`, "google/gemini-2.5-flash"];
      } else {
        // ollama / azure / custom — use provided baseUrl
        apiKey = llm.apiKey || "";
        chatCompletionsUrl = (llm.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "") + "/chat/completions";
        modelsToTry = [userModel];
      }
    } else {
      // Default: prefer OpenAI directly; fall back to Lovable gateway
      apiKey = OPENAI_API_KEY || LOVABLE_API_KEY || "";
      chatCompletionsUrl = OPENAI_API_KEY
        ? "https://api.openai.com/v1/chat/completions"
        : (Deno.env.get("OPENAI_COMPAT_BASE_URL") || "https://ai.gateway.lovable.dev/v1").replace(/\/$/, "") + "/chat/completions";
      modelsToTry = OPENAI_API_KEY
        ? ["gpt-4o-mini", "gpt-4o"]
        : ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite", "openai/gpt-5-mini"];
    }

    if (!apiKey) {
      throw new Error("No API key configured (OPENAI_API_KEY or LOVABLE_API_KEY required)");
    }

    const isCustom = !personName && description;

    const systemPrompt = `You are an expert persona architect. Your job is to create rich, detailed AI agent personas.

You MUST respond with a JSON object using this EXACT tool call. No other text.`;

    const userPrompt = isCustom
      ? `Create a detailed AI agent persona based on this description: "${description}".`
      : `Research and create a deeply accurate AI clone persona of "${personName}"${description ? ` with focus on: ${description}` : ''}.

Analyze their:
- Communication style, vocabulary, and rhetorical patterns
- Core beliefs, values, and philosophical positions  
- Areas of expertise and knowledge domains
- Notable quotes, catchphrases, and mannerisms
- How they approach debate, disagreement, and persuasion
- Their typical emotional tone and energy

Create a persona that would make someone feel like they're actually talking to this person.`;

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
      const response = await fetch(chatCompletionsUrl, {
        method: "POST",
        headers: buildHeaders(apiKey),
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
        const retryRes = await fetch(chatCompletionsUrl, {
          method: "POST",
          headers: buildHeaders(apiKey),
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
