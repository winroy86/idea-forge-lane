import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const CODE_EXECUTION_TOOL = {
  type: "function",
  function: {
    name: "code_execution",
    description: "Execute JavaScript/TypeScript code to perform calculations, data processing, or logic. Returns the result of the last expression or console output.",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "The JavaScript/TypeScript code to execute",
        },
        language: {
          type: "string",
          enum: ["javascript", "typescript"],
          description: "The language of the code (defaults to javascript)",
        },
      },
      required: ["code"],
      additionalProperties: false,
    },
  },
};

const MCP_CALL_TOOL = {
  type: "function",
  function: {
    name: "mcp_call",
    description: "Call a tool on a connected MCP server. Specify the server URL and tool name with arguments.",
    parameters: {
      type: "object",
      properties: {
        server_url: { type: "string", description: "The MCP server URL" },
        tool_name: { type: "string", description: "The tool name to call" },
        arguments: { type: "object", description: "Arguments to pass to the tool" },
      },
      required: ["server_url", "tool_name"],
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

async function performWebSearch(query: string, apiKey: string, synthesisModel: string): Promise<{ result: string; sources: string[] }> {
  // Try Google first, then Wikipedia
  let { snippets, sources } = await searchGoogle(query);

  if (snippets.length === 0) {
    console.log("Google failed, falling back to Wikipedia");
    ({ snippets, sources } = await searchWikipedia(query));
  }

  // Resolve API key and endpoint for synthesis
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  const synthApiKey = OPENAI_API_KEY || apiKey;
  const synthEndpoint = OPENAI_API_KEY
    ? "https://api.openai.com/v1/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";
  const synthModel = OPENAI_API_KEY ? "gpt-4o-mini" : synthesisModel;

  // If both fail, use the LLM's own knowledge but be honest about it
  if (snippets.length === 0) {
    const res = await fetch(synthEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${synthApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: synthModel,
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

  const res = await fetch(synthEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${synthApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: synthModel,
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

// Execute JavaScript code safely
function executeCode(code: string): string {
  try {
    // Create a sandboxed function with limited globals
    const logs: string[] = [];
    const mockConsole = {
      log: (...args: unknown[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
      error: (...args: unknown[]) => logs.push('ERROR: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
      warn: (...args: unknown[]) => logs.push('WARN: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
    };

    const fn = new Function('console', 'Math', 'Date', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp', 'Map', 'Set', `
      "use strict";
      ${code}
    `);

    const result = fn(mockConsole, Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Map, Set);
    
    const output = logs.length > 0 ? logs.join('\n') : '';
    if (result !== undefined) {
      const resultStr = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
      return output ? `${output}\n→ ${resultStr}` : `→ ${resultStr}`;
    }
    return output || '(no output)';
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// MCP session cache to avoid re-initializing every call
const mcpSessions = new Map<string, string | null>();

// Build auth headers for MCP servers
function getMcpAuthHeaders(serverConfig?: { authType?: string; authToken?: string; authHeader?: string }): Record<string, string> {
  if (!serverConfig?.authType || serverConfig.authType === 'none' || !serverConfig.authToken) return {};
  if (serverConfig.authType === 'bearer') {
    return { 'Authorization': `Bearer ${serverConfig.authToken}` };
  }
  if (serverConfig.authType === 'api-key') {
    const headerName = serverConfig.authHeader || 'Authorization';
    return { [headerName]: serverConfig.authToken };
  }
  return {};
}

// MCP auth config lookup
const mcpAuthConfigs = new Map<string, { authType?: string; authToken?: string; authHeader?: string }>();

async function initMcpSession(serverUrl: string): Promise<string | null> {
  if (mcpSessions.has(serverUrl)) return mcpSessions.get(serverUrl) || null;

  const authHeaders = getMcpAuthHeaders(mcpAuthConfigs.get(serverUrl));

  try {
    // Step 1: Initialize
    const initRes = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', ...authHeaders },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'AgentStudio-Edge', version: '1.0.0' },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!initRes.ok) {
      console.log(`MCP init failed (${initRes.status}) for ${serverUrl}`);
      mcpSessions.set(serverUrl, null);
      return null;
    }

    const sessionId = initRes.headers.get('mcp-session-id');
    await initRes.json().catch(() => initRes.text());

    // Step 2: Send initialized notification
    const notifHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...authHeaders };
    if (sessionId) notifHeaders['mcp-session-id'] = sessionId;
    await fetch(serverUrl, {
      method: 'POST',
      headers: notifHeaders,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});

    mcpSessions.set(serverUrl, sessionId);
    console.log(`✅ MCP session initialized for ${serverUrl} (session: ${sessionId || 'none'})`);
    return sessionId;
  } catch (err) {
    console.error(`MCP init error for ${serverUrl}:`, err);
    mcpSessions.set(serverUrl, null);
    return null;
  }
}

function parseMcpResponse(contentType: string, body: string): any {
  if (contentType.includes('text/event-stream')) {
    const lines = body.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try { return JSON.parse(line.slice(6)); } catch {}
      }
    }
    return null;
  }
  try { return JSON.parse(body); } catch { return null; }
}

// Call an MCP server tool with proper initialization
async function callMcpTool(serverUrl: string, toolName: string, args: Record<string, unknown> = {}): Promise<string> {
  try {
    const sessionId = await initMcpSession(serverUrl);
    const authHeaders = getMcpAuthHeaders(mcpAuthConfigs.get(serverUrl));

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...authHeaders,
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    const res = await fetch(serverUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      if (res.status === 404 || res.status === 400) {
        mcpSessions.delete(serverUrl);
        const newSessionId = await initMcpSession(serverUrl);
        const retryHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          ...authHeaders,
        };
        if (newSessionId) retryHeaders['mcp-session-id'] = newSessionId;
        const retryRes = await fetch(serverUrl, {
          method: 'POST',
          headers: retryHeaders,
          body: JSON.stringify({
            jsonrpc: '2.0', id: Date.now(),
            method: 'tools/call',
            params: { name: toolName, arguments: args },
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (!retryRes.ok) return `MCP error (${retryRes.status}): ${await retryRes.text()}`;
        const ct = retryRes.headers.get('content-type') || '';
        const data = parseMcpResponse(ct, await retryRes.text());
        if (data?.error) return `MCP error: ${data.error.message || JSON.stringify(data.error)}`;
        const content = data?.result?.content;
        if (Array.isArray(content)) return content.map((c: any) => c.text || JSON.stringify(c)).join('\n');
        return JSON.stringify(data?.result, null, 2);
      }
      return `MCP error (${res.status}): ${await res.text()}`;
    }

    const ct = res.headers.get('content-type') || '';
    const data = parseMcpResponse(ct, await res.text());
    if (!data) return 'MCP returned empty response';
    if (data.error) return `MCP error: ${data.error.message || JSON.stringify(data.error)}`;

    const content = data.result?.content;
    if (Array.isArray(content)) return content.map((c: any) => c.text || JSON.stringify(c)).join('\n');
    return JSON.stringify(data.result, null, 2);
  } catch (err) {
    return `MCP call failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}


function isOpenAICompatibleProvider(provider: string): boolean {
  return provider === 'lovable' || provider === 'openai' || provider === 'azure' || provider === 'ollama' || provider === 'custom';
}

function resolveOpenAICompatibleBaseUrl(provider: string, baseUrl?: string, hasOpenAIKey?: boolean): string {
  if (provider === 'lovable') return hasOpenAIKey ? 'https://api.openai.com/v1' : 'https://ai.gateway.lovable.dev/v1';
  if (provider === 'openai') return 'https://api.openai.com/v1';
  if (provider === 'ollama') return baseUrl || 'http://localhost:11434/v1';
  if (provider === 'azure') return baseUrl || 'https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT';
  if (provider === 'custom') return baseUrl || '';
  return baseUrl || '';
}

function buildProviderHeaders(provider: string, apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!apiKey) return headers;
  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

async function callOpenAICompatibleProvider(baseUrl: string, apiKey: string | undefined, body: Record<string, unknown>, provider: string): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  return fetch(url, {
    method: 'POST',
    headers: buildProviderHeaders(provider, apiKey),
    body: JSON.stringify(body),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider = 'lovable', api_key, base_url, messages, model, temperature, max_tokens, top_p, presence_penalty, frequency_penalty, tools_enabled, mcp_servers } = await req.json();

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    // Prefer OPENAI_API_KEY for lovable provider; fall back to LOVABLE_API_KEY
    const providerApiKey = provider === 'lovable'
      ? (OPENAI_API_KEY || LOVABLE_API_KEY)
      : api_key;
    if (!providerApiKey) {
      throw new Error(provider === 'lovable' ? 'No API key configured (OPENAI_API_KEY or LOVABLE_API_KEY required)' : `Missing API key for provider: ${provider}`);
    }

    // Populate MCP auth configs from incoming server data
    mcpAuthConfigs.clear();
    if (Array.isArray(mcp_servers)) {
      for (const s of mcp_servers) {
        if (s.url && s.authType && s.authType !== 'none') {
          mcpAuthConfigs.set(s.url, { authType: s.authType, authToken: s.authToken, authHeader: s.authHeader });
        }
      }
    }

    // Build tools list based on enabled tools
    const tools: any[] = [];
    const enabledSet = new Set(Array.isArray(tools_enabled) ? tools_enabled : []);
    
    if (enabledSet.has("web_search")) tools.push(WEB_SEARCH_TOOL);
    if (enabledSet.has("code_execution")) tools.push(CODE_EXECUTION_TOOL);
    if (enabledSet.has("mcp_call") && Array.isArray(mcp_servers) && mcp_servers.length > 0) {
      // Add individual MCP tools with server context
      for (const server of mcp_servers) {
        if (!server.enabled) continue;
        for (const toolName of (server.tools || [])) {
          tools.push({
            type: "function",
            function: {
              name: `mcp_${toolName}`,
              description: `[MCP: ${server.name}] Call the "${toolName}" tool on ${server.name} server.`,
              parameters: {
                type: "object",
                properties: {
                  arguments: { type: "object", description: "Arguments to pass to the tool" },
                },
                additionalProperties: false,
              },
            },
          });
        }
        // If no tools discovered, add generic mcp_call
        if (!server.tools || server.tools.length === 0) {
          tools.push(MCP_CALL_TOOL);
        }
      }
    }

    const OPENAI_API_KEY_ENV = Deno.env.get("OPENAI_API_KEY");
    // When provider is 'lovable' and OPENAI_API_KEY is set, use gpt-4o-mini as default
    const resolvedModel = (provider === 'lovable' && OPENAI_API_KEY_ENV && !model)
      ? "gpt-4o-mini"
      : (model || (provider === 'lovable' ? "google/gemini-3-flash-preview" : "gpt-4o-mini"));

    const body: Record<string, unknown> = {
      model: resolvedModel,
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 2048,
      top_p: top_p ?? 1,
      presence_penalty: presence_penalty ?? 0,
      frequency_penalty: frequency_penalty ?? 0,
    };

    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const targetBaseUrl = resolveOpenAICompatibleBaseUrl(provider, base_url, !!OPENAI_API_KEY_ENV);
    if (isOpenAICompatibleProvider(provider) && !targetBaseUrl) {
      throw new Error(`No base URL configured for provider: ${provider}`);
    }

    let response = isOpenAICompatibleProvider(provider)
      ? await callOpenAICompatibleProvider(targetBaseUrl, providerApiKey, body, provider)
      : null;

    if (!response) {
      if (provider === 'anthropic') {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: buildProviderHeaders(provider, providerApiKey),
          body: JSON.stringify({
            model: model || 'claude-sonnet-4-20250514',
            max_tokens: max_tokens ?? 2048,
            temperature: temperature ?? 0.7,
            top_p: top_p ?? 1,
            system: (messages?.find((m: any) => m.role === 'system')?.content) || '',
            messages: (messages || []).filter((m: any) => m.role !== 'system').map((m: any) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content,
            })),
          }),
        });
      } else if (provider === 'gemini') {
        const geminiModel = model || 'gemini-2.0-flash';
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${providerApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: (messages?.find((m: any) => m.role === 'system')?.content) || '' }] },
            contents: (messages || []).filter((m: any) => m.role !== 'system').map((m: any) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }],
            })),
            generationConfig: {
              temperature: temperature ?? 0.7,
              topP: top_p ?? 1,
              maxOutputTokens: max_tokens ?? 2048,
            },
          }),
        });
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }
    }

    // If gateway returns 500 with tools, retry without tools as fallback
    if (response.status === 500 && tools.length > 0) {
      console.warn("AI gateway 500 with tools — retrying without tools");
      const bodyNoTools = { ...body };
      delete bodyNoTools.tools;
      delete bodyNoTools.tool_choice;
      response = await callOpenAICompatibleProvider(targetBaseUrl, providerApiKey, bodyNoTools, provider);
    }

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

    if (!isOpenAICompatibleProvider(provider)) {
      if (provider === 'anthropic') {
        data = {
          choices: [{ message: { content: data.content?.[0]?.text || 'No response' } }],
          usage: data.usage,
        };
      } else if (provider === 'gemini') {
        data = {
          choices: [{ message: { content: data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response' } }],
        };
      }
    }

    const toolCallsMade: Array<{ tool: string; query: string; result: string; sources: string[] }> = [];

    // Build MCP server lookup
    const mcpServerMap = new Map<string, { url: string; name: string }>();
    if (Array.isArray(mcp_servers)) {
      for (const s of mcp_servers) {
        if (!s.enabled) continue;
        for (const t of (s.tools || [])) {
          mcpServerMap.set(`mcp_${t}`, { url: s.url, name: s.name });
        }
      }
    }

    let iterations = 0;
    while (isOpenAICompatibleProvider(provider) && iterations < 5) {
      const choice = data.choices?.[0];
      if (!choice?.message?.tool_calls || choice.message.tool_calls.length === 0) break;

      const toolCalls = choice.message.tool_calls;
      const updatedMessages = [...(body.messages as any[]), choice.message];

      for (const tc of toolCalls) {
        const fnName = tc.function?.name || "";
        const args = JSON.parse(tc.function?.arguments || "{}");
        let toolResult = "";

        if (fnName === "web_search") {
          const query: string = args.query || "";
          console.log(`🔍 Agent searching: "${query}"`);
          const searchModel = typeof model === "string" && model ? model : "google/gemini-3-flash-preview";
          const searchResult = await performWebSearch(query, LOVABLE_API_KEY, searchModel);
          toolCallsMade.push({ tool: "web_search", query, result: searchResult.result, sources: searchResult.sources });
          toolResult = searchResult.result;
        } else if (fnName === "code_execution") {
          const code = args.code || "";
          console.log(`💻 Agent executing code (${(args.language || 'js')}): ${code.slice(0, 100)}...`);
          toolResult = executeCode(code);
          toolCallsMade.push({ tool: "code_execution", query: code.slice(0, 200), result: toolResult, sources: [] });
        } else if (fnName === "mcp_call") {
          const serverUrl = args.server_url || "";
          const toolName = args.tool_name || "";
          console.log(`🔌 Agent calling MCP tool: ${toolName} on ${serverUrl}`);
          toolResult = await callMcpTool(serverUrl, toolName, args.arguments || {});
          toolCallsMade.push({ tool: `mcp:${toolName}`, query: `${toolName}(${JSON.stringify(args.arguments || {})})`, result: toolResult, sources: [serverUrl] });
        } else if (fnName.startsWith("mcp_")) {
          // Named MCP tool
          const actualToolName = fnName.slice(4);
          const serverInfo = mcpServerMap.get(fnName);
          if (serverInfo) {
            console.log(`🔌 Agent calling MCP tool: ${actualToolName} on ${serverInfo.name}`);
            toolResult = await callMcpTool(serverInfo.url, actualToolName, args.arguments || {});
            toolCallsMade.push({ tool: `mcp:${actualToolName}`, query: `${actualToolName}(${JSON.stringify(args.arguments || {})})`, result: toolResult, sources: [serverInfo.url] });
          } else {
            toolResult = `MCP server not found for tool: ${actualToolName}`;
          }
        }

        updatedMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: toolResult,
        });
      }

      body.messages = updatedMessages;
      const followUp = await callOpenAICompatibleProvider(targetBaseUrl, providerApiKey, body, provider);

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

    const normalized = {
      content: data.choices?.[0]?.message?.content || "",
      usage: data.usage,
      toolCallsMade,
      raw: data,
    };

    return new Response(JSON.stringify(normalized), {
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
