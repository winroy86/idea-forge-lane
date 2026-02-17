# Provider API key encryption runbook

This project supports versioned envelope encryption for provider API keys using two server-side env vars:

- `CURRENT_KEY_VERSION`: active key version used for all new writes.
- `ENCRYPTION_KEYS_JSON`: JSON object mapping key version -> key material.

Example:

```bash
export CURRENT_KEY_VERSION="2026-02"
export ENCRYPTION_KEYS_JSON='{"2025-12":"<old-base64-32-byte-key>","2026-02":"<new-base64-32-byte-key>"}'
```

## 1) Deploy schema migration

Run the migration that adds encrypted payload metadata to `providers`:

- `supabase/migrations/202602170001_provider_keyring.sql`

Fields added include `key_version`, `encryption_algorithm`, and encrypted payload parts (`api_key_encrypted`, `api_key_iv`, `api_key_tag`).

## 2) Deploy app/server with keyring config

1. Set `CURRENT_KEY_VERSION` to your new version.
2. Keep **both** new and historical versions in `ENCRYPTION_KEYS_JSON` until rotation is complete.
3. Deploy services/functions.

Behavior after deploy:

- New writes encrypt with `CURRENT_KEY_VERSION`.
- Reads decrypt by looking up each row's `key_version`.
- If an old key is missing, decrypt fails with an actionable error that tells you which version to restore.

## 3) Rotate historical rows

Use the built-in rotation command:

```bash
CURRENT_KEY_VERSION="2026-02" \
ENCRYPTION_KEYS_JSON='{"2025-12":"...","2026-02":"..."}' \
SUPABASE_URL="https://<project>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service-role>" \
node scripts/rotate-provider-keys.mjs
```

This re-encrypts all non-null provider secrets whose `key_version` is not equal to `CURRENT_KEY_VERSION`.

## 4) Backup + restore guidance

- Back up `ENCRYPTION_KEYS_JSON` in your secret manager before any rotation.
- Keep at least one offline escrow copy of retired keys until every row is rotated and verified.
- During restore/disaster recovery, restore both DB backup **and** the matching keyring versions.
- Do not remove historical versions from `ENCRYPTION_KEYS_JSON` until rotation command reports 0 pending rows and read paths are validated.
