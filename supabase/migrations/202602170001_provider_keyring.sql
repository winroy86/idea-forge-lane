-- Adds key metadata to provider secrets and backfills rows for versioned encryption.

alter table if exists public.providers
  add column if not exists api_key_encrypted text,
  add column if not exists api_key_iv text,
  add column if not exists api_key_tag text,
  add column if not exists key_version text,
  add column if not exists encryption_algorithm text default 'AES-256-GCM',
  add column if not exists encrypted_at timestamptz;

comment on column public.providers.key_version is
  'Version from CURRENT_KEY_VERSION used to encrypt the row, looked up in ENCRYPTION_KEYS_JSON during decrypt.';

comment on column public.providers.encryption_algorithm is
  'Cipher metadata for forward compatibility. Current writes use AES-256-GCM.';

-- Optional compatibility backfill: if a plaintext api_key column exists and is still populated,
-- preserve traceability while external rotation command rewrites encrypted fields.
update public.providers
set encrypted_at = coalesce(encrypted_at, now())
where encrypted_at is null
  and (
    api_key_encrypted is not null
    or (
      key_version is not null
      and key_version <> ''
    )
  );
