-- Add encrypted storage columns to user_provider_credentials
-- These store AES-256-GCM encrypted API keys; the plain-text api_key column
-- is nulled out after migration so it never holds secrets in cleartext.

ALTER TABLE public.user_provider_credentials
  ADD COLUMN IF NOT EXISTS api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS api_key_iv        TEXT,
  ADD COLUMN IF NOT EXISTS api_key_tag       TEXT,
  ADD COLUMN IF NOT EXISTS key_version       TEXT,
  ADD COLUMN IF NOT EXISTS encryption_algorithm TEXT;
