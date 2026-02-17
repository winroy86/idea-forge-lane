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

echo "== Idea Forge Lane readiness audit =="

# PR1 signals
if has_file ".env.example"; then
  pass ".env.example present"
else
  warn ".env.example missing"
fi

if contains '"smoke:prod"' package.json; then
  pass "smoke:prod script configured"
else
  warn "smoke:prod script missing"
fi

if contains 'Capabilities:' src/components/AppLayout.tsx; then
  pass "Capabilities banner present"
else
  warn "Capabilities banner missing"
fi

if contains 'export const supabase = hasSupabaseConfig' src/integrations/supabase/client.ts; then
  pass "Supabase client is optional when env is absent"
else
  warn "Supabase client optional guard missing"
fi

# PR2/PR6 risk scans
if rg -n 'bg-\$\{|text-\$\{|border-\$\{' src >/dev/null 2>&1; then
  warn "Dynamic Tailwind class patterns detected (possible prod CSS mismatch)"
else
  pass "No risky dynamic Tailwind patterns detected"
fi

if rg -n 'new Function\(' supabase src >/dev/null 2>&1; then
  warn "Dynamic code execution usage detected (security risk)"
else
  pass "No dynamic code execution usage detected"
fi

# PR3/PR4/PR5/PR11 presence checks
if has_file "server/index.ts" || has_file "server/index.js"; then
  pass "Backend server entrypoint found"
else
  warn "No dedicated backend server entrypoint found"
fi

if contains 'localStorage' src/lib/store.ts; then
  warn "State storage currently browser-local (not shared backend persistence)"
else
  pass "State storage appears backend-driven"
fi

if has_file "playwright.config.ts"; then
  pass "Playwright config found"
else
  warn "Playwright config missing"
fi

if has_file "src/testIds.ts"; then
  pass "Centralized data-testid map found"
else
  warn "Centralized data-testid map missing"
fi

if has_file ".github/workflows/ci.yml" || has_file ".github/workflows/test.yml"; then
  pass "CI workflow found"
else
  warn "CI workflow missing"
fi

echo
printf 'Summary: %d pass, %d warning\n' "$pass_count" "$warn_count"

# Exit non-zero when there are warnings so CI can gate if desired
if [[ "$warn_count" -gt 0 ]]; then
  exit 1
fi
