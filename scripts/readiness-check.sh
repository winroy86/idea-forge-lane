#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

pass_count=0
warn_count=0

pass() {
  echo "✅ $1"
  pass_count=$((pass_count + 1))
}

warn() {
  echo "⚠️  $1"
  warn_count=$((warn_count + 1))
}

has_file() {
  [[ -f "$1" ]]
}

contains() {
  local pattern="$1"
  local file="$2"
  rg -n --no-heading --fixed-strings "$pattern" "$file" >/dev/null 2>&1
}

echo "== Idea Forge Lane local capability & readiness audit =="

# 1) Core local boot/config
if has_file ".env.example"; then pass "Environment template exists (.env.example)"; else warn ".env.example missing"; fi
if contains '"smoke:prod"' package.json; then pass "Production smoke script exists"; else warn "smoke:prod script missing"; fi
if contains 'Capabilities:' src/components/AppLayout.tsx; then pass "Runtime capabilities indicator exists"; else warn "Capabilities indicator missing"; fi
if contains 'export const supabase = hasSupabaseConfig' src/integrations/supabase/client.ts; then pass "Supabase client is optional (no hard crash if env absent)"; else warn "Supabase optional guard missing"; fi

# 2) Provider/model pipeline
if rg -n "export type LLMProvider = 'openai' \| 'anthropic' \| 'gemini' \| 'azure' \| 'ollama' \| 'custom'" src/types/index.ts >/dev/null 2>&1; then
  pass "Provider list is local/self-managed (no built-in Lovable provider)"
else
  warn "Provider list does not match expected local/self-managed set"
fi
if contains "switch (agent.config.provider)" src/lib/llm.ts; then pass "Per-provider LLM router exists"; else warn "Provider routing missing"; fi
if contains "case 'ollama':" src/lib/llm.ts; then pass "Ollama path available"; else warn "Ollama path missing"; fi
if contains "case 'azure':" src/lib/llm.ts; then pass "Azure path available"; else warn "Azure path missing"; fi

# 3) MCP, tools, and file/memory features
if contains "mcpServers" src/lib/llm.ts && contains "mcp_call" src/lib/llm.ts; then pass "MCP tool wiring present in agent runtime"; else warn "MCP tool wiring appears incomplete"; fi
if contains "permissions: {" src/types/index.ts && contains "fileRead" src/types/index.ts && contains "fileWrite" src/types/index.ts && contains "codeExecution" src/types/index.ts; then
  pass "Agent permission model includes file read/write and code execution flags"
else
  warn "Agent permission model incomplete for file/code capabilities"
fi
if contains "writeMemoryFile" src/lib/llm.ts && contains "getAgentMemories" src/lib/agentMemory.ts; then pass "Local memory read/write plumbing exists"; else warn "Memory read/write plumbing not fully detected"; fi

# 4) Local-only / no Lovable service coupling
if rg -n "lovable|ai\.gateway\.lovable|LOVABLE_API_KEY|lovable\.dev|provider: 'lovable'" README.md src supabase package.json >/dev/null 2>&1; then
  warn "Lovable-specific references still detected"
else
  pass "No Lovable-specific references detected in app/docs/functions"
fi
if contains 'const AI_BASE_URL = Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1";' supabase/functions/agent-chat/index.ts; then
  pass "Edge functions use configurable AI_BASE_URL (default OpenAI-compatible)"
else
  warn "Edge function AI base URL is not configurable"
fi

# 5) Known gaps that block full end-to-end confidence
if rg -n 'bg-\$\{|text-\$\{|border-\$\{' src >/dev/null 2>&1; then warn "Dynamic Tailwind class patterns detected (possible prod CSS mismatch)"; else pass "No risky dynamic Tailwind class patterns detected"; fi
if rg -n 'new Function\(' supabase src >/dev/null 2>&1; then warn "Dynamic code execution usage detected (security risk)"; else pass "No dynamic code execution usage detected"; fi
if has_file "playwright.config.ts"; then pass "Playwright config found"; else warn "Playwright config missing"; fi
if has_file "src/testIds.ts"; then pass "Centralized data-testid map found"; else warn "Centralized data-testid map missing"; fi
if has_file ".github/workflows/ci.yml" || has_file ".github/workflows/test.yml"; then pass "CI workflow found"; else warn "CI workflow missing"; fi

echo
printf 'Summary: %d pass, %d warning\n' "$pass_count" "$warn_count"

if [[ "$warn_count" -gt 0 ]]; then
  exit 1
fi
