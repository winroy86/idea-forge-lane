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

function decodeHTML(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// Wikipedia search — always works, no rate limits
async function searchWikipedia(query: string): Promise<{ snippets: string[]; sources: string[] }> {
  try {
    // Search for pages
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return { snippets: [], sources: [] };

    const searchData = await searchRes.json();
    const results = searchData.query?.search || [];
    if (results.length === 0) return { snippets: [], sources: [] };

    const snippets: string[] = [];
    const sources: string[] = [];

    // Get full extracts for the top results
    const titles = results.map((r: any) => r.title).join("|");
    const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=extracts&exintro=1&explaintext=1&exlimit=3&format=json&origin=*`;
    const extractRes = await fetch(extractUrl);

    if (extractRes.ok) {
      const extractData = await extractRes.json();
      const pages = extractData.query?.pages || {};
      for (const pageId of Object.keys(pages)) {
        const page = pages[pageId];
        if (page.extract) {
          const extract = page.extract.substring(0, 500);
          snippets.push(`[${page.title}]: ${extract}`);
          sources.push(`https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`);
        }
      }
    } else {
      // Fallback to search snippets
      for (const r of results) {
        const snippet = r.snippet?.replace(/<[^>]+>/g, "").trim() || "";
        snippets.push(`[${r.title}]: ${decodeHTML(snippet)}`);
        sources.push(`https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`);
      }
    }

    console.log(`🔎 Wikipedia returned ${snippets.length} results for: "${query}"`);
    return { snippets, sources };
  } catch (err) {
    console.error("Wikipedia error:", err);
    return { snippets: [], sources: [] };
  }
}

// Google search via HTML scraping
async function searchGoogle(query: string): Promise<{ snippets: string[]; sources: string[] }> {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&num=5`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) {
      console.log(`Google returned ${res.status}`);
      return { snippets: [], sources: [] };
    }

    const html = await res.text();
    const snippets: string[] = [];
    const sources: string[] = [];

    // Extract href="/url?q=URL" patterns with h3 titles
    let match;
    const pattern = /href="\/url\?q=(https?:\/\/[^&"]+)&[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/gi;
    while ((match = pattern.exec(html)) !== null && snippets.length < 5) {
      const resultUrl = decodeURIComponent(match[1]);
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      if (!resultUrl.includes("google.com") && title) {
        snippets.push(`[${decodeHTML(title)}]: (web result)`);
        sources.push(resultUrl);
      }
    }

    // Also try direct URL pattern
    if (snippets.length === 0) {
      const directPattern = /<a[^>]*href="(https?:\/\/(?!www\.google)[^"]+)"[^>]*><h3[^>]*>([\s\S]*?)<\/h3>/gi;
      while ((match = directPattern.exec(html)) !== null && snippets.length < 5) {
        const title = match[2].replace(/<[^>]+>/g, "").trim();
        if (title) {
          snippets.push(`[${decodeHTML(title)}]: (web result)`);
          sources.push(match[1]);
        }
      }
    }

    console.log(`🔎 Google returned ${snippets.length} results for: "${query}"`);
    return { snippets, sources };
  } catch (err) {
    console.log(`Google search failed: ${err instanceof Error ? err.message : err}`);
    return { snippets: [], sources: [] };
  }
}

async function performWebSearch(query: string, apiKey: string): Promise<{ result: string; sources: string[] }> {
  // Try Google first, then Wikipedia
  let { snippets, sources } = await searchGoogle(query);

  if (snippets.length === 0) {
    console.log("Google failed, falling back to Wikipedia");
    ({ snippets, sources } = await searchWikipedia(query));
  }

  // If both fail, use the LLM's own knowledge but be honest about it
  if (snippets.length === 0) {
    // Use LLM knowledge but clearly state it's from training data
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Answer the query factually based on your training knowledge. Start with "Based on available knowledge:" and be specific with facts and data. If unsure, say so.`,
          },
          { role: "user", content: query },
        ],
        temperature: 0.2,
        max_tokens: 1000,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        result: data.choices?.[0]?.message?.content || "No information available.",
        sources: [],
      };
    }
    return { result: `Could not retrieve information for "${query}".`, sources: [] };
  }

  // Synthesize with LLM
  const searchContext = snippets.join("\n\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content: `Synthesize the web search results into a clear, factual summary. Reference source numbers [1], [2], etc. Do NOT make up information.`,
        },
        {
          role: "user",
          content: `Query: "${query}"\n\nResults:\n${searchContext}\n\nSources:\n${sources.map((s, i) => `[${i + 1}] ${s}`).join("\n")}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    }),
  });

  if (!res.ok) {
    return { result: `Search results:\n\n${searchContext}`, sources };
  }

  const data = await res.json();
  return { result: data.choices?.[0]?.message?.content || searchContext, sources };
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
