import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, mcp-session-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SERVER_INFO = {
  name: "test-tools-server",
  version: "1.0.0",
};

const TOOLS = [
  {
    name: "get_weather",
    description: "Get the current weather for a city. Returns temperature, conditions, and humidity.",
    inputSchema: {
      type: "object",
      properties: {
        city: { type: "string", description: "The city name (e.g. 'London', 'Tokyo')" },
      },
      required: ["city"],
    },
  },
  {
    name: "calculate",
    description: "Evaluate a mathematical expression and return the result.",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "A math expression like '2 + 2' or 'sqrt(144)'" },
      },
      required: ["expression"],
    },
  },
  {
    name: "random_fact",
    description: "Get a random fun fact about a topic.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "The topic to get a fact about (e.g. 'space', 'history', 'animals')" },
      },
      required: ["topic"],
    },
  },
];

// Simulated tool implementations
function getWeather(city: string): string {
  const weathers = [
    { temp: 22, condition: "Sunny", humidity: 45 },
    { temp: 15, condition: "Cloudy", humidity: 72 },
    { temp: 28, condition: "Partly cloudy", humidity: 55 },
    { temp: 8, condition: "Rainy", humidity: 90 },
    { temp: -3, condition: "Snowy", humidity: 80 },
  ];
  const hash = city.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const w = weathers[hash % weathers.length];
  return `Weather in ${city}: ${w.temp}°C, ${w.condition}, Humidity: ${w.humidity}%`;
}

function tokenizeMath(expression: string): string[] {
  const sanitized = expression.replace(/\^/g, '**').replace(/\s+/g, '');
  if (!/^[0-9+\-*/().%]*$/.test(sanitized)) return [];
  const tokens: string[] = [];
  let i = 0;
  while (i < sanitized.length) {
    const ch = sanitized[i];
    if (!ch) break;
    if ('+-*/()%'.includes(ch)) {
      tokens.push(ch);
      i += 1;
      continue;
    }
    if (ch === '*') {
      if (sanitized[i + 1] === '*') {
        tokens.push('**');
        i += 2;
        continue;
      }
      tokens.push('*');
      i += 1;
      continue;
    }
    let j = i;
    while (j < sanitized.length && /[0-9.]/.test(sanitized[j] || '')) j += 1;
    tokens.push(sanitized.slice(i, j));
    i = j;
  }
  return tokens;
}

function evaluateMath(expression: string): number {
  const tokens = tokenizeMath(expression);
  if (tokens.length === 0) throw new Error('Invalid expression');

  const output: (number | string)[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '**': 3 };
  const rightAssoc = new Set(['**']);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] || '';
    if (/^\d+(\.\d+)?$/.test(t)) {
      output.push(Number(t));
      continue;
    }
    if (t === '(') { ops.push(t); continue; }
    if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') output.push(ops.pop() as string);
      if (ops[ops.length - 1] === '(') ops.pop();
      continue;
    }
    const isUnaryMinus = t === '-' && (i === 0 || ['(', '+', '-', '*', '/', '%', '**'].includes(tokens[i - 1] || ''));
    if (isUnaryMinus) {
      output.push(0);
    }
    while (ops.length) {
      const top = ops[ops.length - 1] || '';
      if (top === '(') break;
      const shouldPop = rightAssoc.has(t) ? prec[t] < prec[top] : prec[t] <= prec[top];
      if (!shouldPop) break;
      output.push(ops.pop() as string);
    }
    ops.push(t);
  }
  while (ops.length) output.push(ops.pop() as string);

  const stack: number[] = [];
  for (const item of output) {
    if (typeof item === 'number') {
      stack.push(item);
      continue;
    }
    const b = stack.pop();
    const a = stack.pop();
    if (a === undefined || b === undefined) throw new Error('Invalid expression');
    switch (item) {
      case '+': stack.push(a + b); break;
      case '-': stack.push(a - b); break;
      case '*': stack.push(a * b); break;
      case '/': stack.push(a / b); break;
      case '%': stack.push(a % b); break;
      case '**': stack.push(a ** b); break;
      default: throw new Error('Invalid operator');
    }
  }
  if (stack.length !== 1) throw new Error('Invalid expression');
  return stack[0] || 0;
}

function calculate(expression: string): string {
  try {
    const result = evaluateMath(expression);
    return `${expression} = ${result}`;
  } catch {
    return `Could not evaluate: ${expression}`;
  }
}

function randomFact(topic: string): string {
  const facts: Record<string, string[]> = {
    space: [
      "A day on Venus is longer than a year on Venus.",
      "Neutron stars can spin up to 600 times per second.",
      "There are more stars in the universe than grains of sand on Earth.",
    ],
    history: [
      "Cleopatra lived closer in time to the Moon landing than to the construction of the Great Pyramid.",
      "Oxford University is older than the Aztec Empire.",
      "The shortest war in history lasted 38 minutes (Anglo-Zanzibar War).",
    ],
    animals: [
      "Octopuses have three hearts and blue blood.",
      "A group of flamingos is called a 'flamboyance'.",
      "Dolphins sleep with one eye open.",
    ],
  };
  const topicFacts = facts[topic.toLowerCase()] || facts.space || [];
  const idx = Math.floor(Math.random() * topicFacts.length);
  return topicFacts[idx] || `Fun fact about ${topic}: it's fascinating!`;
}

function handleToolCall(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "get_weather": return getWeather(String(args.city || "Unknown"));
    case "calculate": return calculate(String(args.expression || "0"));
    case "random_fact": return randomFact(String(args.topic || "space"));
    default: return `Unknown tool: ${name}`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only handle POST for JSON-RPC
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { jsonrpc, id, method, params } = body;

    console.log(`MCP request: method=${method}, id=${id}`);

    // Handle notifications (no id)
    if (!id && method === "notifications/initialized") {
      return new Response("", { status: 202, headers: corsHeaders });
    }

    let result: unknown;

    switch (method) {
      case "initialize":
        result = {
          protocolVersion: "2025-03-26",
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        };
        break;

      case "tools/list":
        result = { tools: TOOLS };
        break;

      case "tools/call": {
        const toolName = params?.name || "";
        const toolArgs = params?.arguments || {};
        console.log(`Tool call: ${toolName}(${JSON.stringify(toolArgs)})`);
        const output = handleToolCall(toolName, toolArgs);
        result = {
          content: [{ type: "text", text: output }],
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const response = { jsonrpc: "2.0", id, result };
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("MCP test server error:", err);
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
