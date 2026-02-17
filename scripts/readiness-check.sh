#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FOUNDATION=()
PENDING=()
WARNINGS=()

check_file_contains() {
  local file="$1"
  local pattern="$2"
  if [[ -f "$file" ]] && rg -q "$pattern" "$file"; then
    return 0
  fi
  return 1
}

server_file="$ROOT_DIR/server/index.js"
storage_adapter_file="$ROOT_DIR/src/lib/storageAdapter.ts"
llm_file="$ROOT_DIR/src/lib/llm.ts"

# Backend providers endpoint presence
if check_file_contains "$server_file" '/api/providers'; then
  FOUNDATION+=("Backend providers route found: /api/providers in server/index.js")
else
  PENDING+=("Missing backend providers route (/api/providers) in server/index.js")
fi

# Encrypted provider storage conventions
if check_file_contains "$server_file" 'encryptText' && check_file_contains "$server_file" 'decryptText' && check_file_contains "$server_file" 'api_key_encrypted'; then
  FOUNDATION+=("Encrypted provider secret flow found (encryptText/decryptText + api_key_encrypted)")
else
  PENDING+=("Encrypted provider secret flow not fully implemented in server/index.js (need encryptText/decryptText + api_key_encrypted)")
fi

# Frontend/backend provider sync hooks
if check_file_contains "$storage_adapter_file" 'providers'; then
  FOUNDATION+=("Provider storage adapter hooks detected in src/lib/storageAdapter.ts")
else
  PENDING+=("Provider backend sync hooks missing in src/lib/storageAdapter.ts")
fi

# Warning-only check: backend mode should not depend on client-side provider secrets
if [[ -f "$llm_file" ]]; then
  if ! rg -q "isBackendModeEnabled && agent.config.provider !== 'lovable'" "$llm_file"; then
    WARNINGS+=("src/lib/llm.ts may bypass backend inference mode for non-Lovable providers. Verify backend secret resolution path is enforced when VITE_API_BASE_URL is set.")
  fi
else
  WARNINGS+=("src/lib/llm.ts not found; could not evaluate client-stored secret dependency warning.")
fi

printf '\n=== Foundation present ===\n'
if ((${#FOUNDATION[@]} == 0)); then
  printf '%s\n' '- none detected'
else
  for item in "${FOUNDATION[@]}"; do
    printf '✅ %s\n' "$item"
  done
fi

printf '\n=== Production-hardening pending ===\n'
if ((${#PENDING[@]} == 0)); then
  printf '%s\n' '- none detected'
else
  for item in "${PENDING[@]}"; do
    printf '⚠️ %s\n' "$item"
  done
fi

if ((${#WARNINGS[@]} > 0)); then
  printf '\n=== Warnings ===\n'
  for item in "${WARNINGS[@]}"; do
    printf '⚠️ %s\n' "$item"
  done
fi
