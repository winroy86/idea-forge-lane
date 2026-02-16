import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { personName, description } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error (${response.status})`);
    }

    const data = await response.json();
    
    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "create_persona") {
      throw new Error("AI did not return expected persona format");
    }

    const persona = JSON.parse(toolCall.function.arguments);

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
