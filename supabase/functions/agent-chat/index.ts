import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the internet for current information, facts, news, or any topic. Use this when the user asks about recent events, specific data, or anything you're unsure about.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to look up on the internet",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

async function performWebSearch(query: string, apiKey: string): Promise<{ result: string; sources: string[] }> {
  // Use Lovable AI to perform a research-style search
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are a web research assistant. Answer the query with factual, up-to-date information.
IMPORTANT RULES:
- Provide specific facts, data, and details
- Include source URLs where possible (real, verifiable URLs)
- If you reference a website, article, or study, provide its URL
- Format sources as a list at the end under "Sources:"
- Be thorough but concise
- If you're unsure about something, say so`,
        },
        { role: "user", content: query },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Web search AI error:", res.status, errText);
    return { result: `Search failed (${res.status}). Could not retrieve results.`, sources: [] };
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "No results found.";

  // Extract URLs from the response
  const urlRegex = /https?:\/\/[^\s)\]>"',]+/g;
  const sources = [...new Set(content.match(urlRegex) || [])];

  return { result: content, sources };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, model, temperature, max_tokens, top_p, presence_penalty, frequency_penalty, tools_enabled } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const useTools = Array.isArray(tools_enabled) && tools_enabled.includes("web_search");
    const tools = useTools ? [WEB_SEARCH_TOOL] : undefined;

    const body: Record<string, unknown> = {
      model: model || "google/gemini-3-flash-preview",
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 2048,
      top_p: top_p ?? 1,
      presence_penalty: presence_penalty ?? 0,
      frequency_penalty: frequency_penalty ?? 0,
    };

    if (tools) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
          JSON.stringify({ error: "AI usage limit reached. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: `AI gateway error (${response.status})` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let data = await response.json();
    const toolCallsMade: Array<{ tool: string; query: string; result: string; sources: string[] }> = [];

    // Handle tool calling loop (max 3 iterations to prevent infinite loops)
    let iterations = 0;
    while (iterations < 3) {
      const choice = data.choices?.[0];
      if (!choice?.message?.tool_calls || choice.message.tool_calls.length === 0) break;

      const toolCalls = choice.message.tool_calls;
      const updatedMessages = [...(body.messages as any[]), choice.message];

      for (const tc of toolCalls) {
        if (tc.function?.name === "web_search") {
          const args = JSON.parse(tc.function.arguments || "{}");
          const query = args.query || "";
          console.log(`🔍 Agent searching: "${query}"`);

          const searchResult = await performWebSearch(query, LOVABLE_API_KEY);
          toolCallsMade.push({
            tool: "web_search",
            query,
            result: searchResult.result,
            sources: searchResult.sources,
          });

          updatedMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: searchResult.result,
          });
        }
      }

      // Make follow-up call with tool results
      body.messages = updatedMessages;
      const followUp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!followUp.ok) {
        const errText = await followUp.text();
        console.error("Follow-up AI error:", followUp.status, errText);
        break;
      }

      data = await followUp.json();
      iterations++;
    }

    // Add tool calls info to the response
    if (toolCallsMade.length > 0) {
      data._toolCallsMade = toolCallsMade;
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("agent-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
